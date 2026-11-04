// Reportes administrativos: pagos recibidos, cuentas por cobrar, cuotas extra e
// ingresos y gastos. Todos los montos en centavos de USD salvo que se diga otra cosa.
import { compareAddress } from "./address";
import { splitPending } from "./allocation";
import { all } from "./db";
import { settleAll, standing, unitBalances, type Standing } from "./data";
import { METHODS, shiftPeriod } from "./format";

// ─── Pagos recibidos ───

export type ReceivedPayment = {
  id: number;
  paidOn: string;
  unitCode: string;
  business: string | null;
  method: string;
  currency: "USD" | "VES";
  amountCents: number;
  rate: number | null;
  usdCents: number;
  reference: string | null;
  appliesTo: "mensual" | "cargo" | null;
  chargeConcept: string | null;
};

/** Pagos aprobados con fecha de pago en el mes, del más antiguo al más nuevo. */
export function paymentsReport(period: string) {
  const payments = all<ReceivedPayment>(
    `SELECT p.id, p.paid_on AS paidOn, u.code AS unitCode, u.business, p.method, p.currency,
       p.amount_cents AS amountCents, p.rate, p.usd_cents AS usdCents, p.reference,
       p.applies_to AS appliesTo, ch.concept AS chargeConcept
     FROM payments p JOIN units u ON u.id = p.unit_id LEFT JOIN charges ch ON ch.id = p.charge_id
     WHERE p.status = 'aprobado' AND substr(p.paid_on, 1, 7) = ?
     ORDER BY p.paid_on, p.id`,
    period,
  );
  const byMethod = Object.keys(METHODS)
    .map((key) => {
      const list = payments.filter((p) => p.method === key);
      return {
        method: key,
        count: list.length,
        usdCents: list.reduce((n, p) => n + p.usdCents, 0),
        // En la moneda en que se pagó: bolívares o dólares.
        originalCents: list.reduce((n, p) => n + p.amountCents, 0),
      };
    })
    .filter((m) => m.count > 0);
  const total = payments.reduce((n, p) => n + p.usdCents, 0);
  return { payments, byMethod, total };
}

// ─── Cuentas por cobrar ───

export type Receivable = {
  id: number;
  code: string;
  business: string | null;
  owner: string;
  /** Pendiente de cuotas de condominio y canon. */
  monthly: number;
  /** Pendiente de cuotas extra (cargos especiales). */
  extra: number;
  credit: number;
  balance: number;
  standing: Standing;
};

/** Cada local con lo que debe, separado en cuota mensual y cuotas extra. */
export function receivablesReport(): Receivable[] {
  const settlements = settleAll();
  return unitBalances().map((u) => {
    const s = settlements.get(u.id);
    const split = s ? splitPending(s.charges, s.settlement) : { monthly: 0, extra: 0 };
    return {
      id: u.id,
      code: u.code,
      business: u.business,
      owner: u.owner,
      monthly: split.monthly,
      extra: split.extra,
      credit: s?.settlement.credit ?? 0,
      balance: u.balance,
      standing: standing(u),
    };
  });
}

// ─── Cuotas extra ───

type ExtraCharge = {
  id: number;
  unitId: number;
  period: string;
  concept: string;
  amountCents: number;
  createdAt: string;
  code: string;
  business: string | null;
  owner: string;
  level: string | null;
  aisle: string | null;
  number: string | null;
};

export type ExtraStatus = "pagado" | "parcial" | "pendiente";

export type ExtraRow = ExtraCharge & { pending: number; paid: number; status: ExtraStatus };

export type ExtraGroup = {
  /** Id del primer cargo del grupo: identifica la cuota extra en el enlace. */
  id: number;
  concept: string;
  period: string;
  createdAt: string;
  rows: ExtraRow[];
  charged: number;
  collected: number;
  paidCount: number;
  partialCount: number;
  pendingCount: number;
};

/**
 * Cuotas extra: los cargos especiales agrupados como se crearon (mismo concepto, mes
 * y momento), con lo que pagó y lo que debe cada local. La más reciente primero.
 */
export function extrasReport(): ExtraGroup[] {
  const charges = all<ExtraCharge>(
    `SELECT c.id, c.unit_id AS unitId, c.period, c.concept, c.amount_cents AS amountCents,
       c.created_at AS createdAt, u.code, u.business, u.owner, u.level, u.aisle, u.number
     FROM charges c JOIN units u ON u.id = c.unit_id
     WHERE c.kind = 'especial' ORDER BY c.created_at DESC, c.id`,
  );
  const settlements = settleAll();
  const groups = new Map<string, ExtraGroup>();
  for (const c of charges) {
    const key = `${c.concept}\u0000${c.period}\u0000${c.createdAt}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        id: c.id, concept: c.concept, period: c.period, createdAt: c.createdAt, rows: [],
        charged: 0, collected: 0, paidCount: 0, partialCount: 0, pendingCount: 0,
      };
      groups.set(key, g);
    }
    const pending = settlements.get(c.unitId)?.settlement.pending.get(c.id) ?? c.amountCents;
    const paid = c.amountCents - pending;
    const status: ExtraStatus = pending === 0 ? "pagado" : paid > 0 ? "parcial" : "pendiente";
    g.id = Math.min(g.id, c.id);
    g.rows.push({ ...c, pending, paid, status });
    g.charged += c.amountCents;
    g.collected += paid;
    if (status === "pagado") g.paidCount++;
    else if (status === "parcial") g.partialCount++;
    else g.pendingCount++;
  }
  for (const g of groups.values()) g.rows.sort(compareAddress);
  return [...groups.values()];
}

// ─── Ingresos y gastos ───

export type MonthResult = { period: string; income: number; expenses: number; discounts: number; result: number };

/** Los últimos `months` meses hasta `period` incluido, del más reciente al más antiguo. */
export function incomeExpensesReport(period: string, months = 12) {
  const from = shiftPeriod(period, -(months - 1));
  const income = new Map(
    all<{ period: string; total: number }>(
      `SELECT substr(paid_on, 1, 7) AS period, SUM(usd_cents) AS total FROM payments
       WHERE status = 'aprobado' AND substr(paid_on, 1, 7) BETWEEN ? AND ? GROUP BY 1`,
      from, period,
    ).map((r) => [r.period, r.total]),
  );
  const spent = all<{ period: string; kind: string; total: number }>(
    `SELECT substr(spent_on, 1, 7) AS period, kind = 'descuento' AS kind, SUM(usd_cents) AS total FROM expenses
     WHERE substr(spent_on, 1, 7) BETWEEN ? AND ? GROUP BY 1, 2`,
    from, period,
  );
  const rows: MonthResult[] = [];
  for (let i = 0; i < months; i++) {
    const p = shiftPeriod(period, -i);
    const inc = income.get(p) ?? 0;
    const exp = spent.filter((s) => s.period === p && !Number(s.kind)).reduce((n, s) => n + s.total, 0);
    const disc = spent.filter((s) => s.period === p && Number(s.kind)).reduce((n, s) => n + s.total, 0);
    rows.push({ period: p, income: inc, expenses: exp, discounts: disc, result: inc + disc - exp });
  }
  const categories = all<{ category: string; total: number }>(
    `SELECT category, SUM(usd_cents) AS total FROM expenses
     WHERE kind != 'descuento' AND substr(spent_on, 1, 7) = ? GROUP BY category ORDER BY total DESC`,
    period,
  );
  return { rows, categories };
}
