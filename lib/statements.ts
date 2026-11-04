import { all, get } from "./db";
import { withReserve, type Statement, type StatementLine } from "./statement-math";

export * from "./statement-math";

type ExpenseRow = {
  kind: "fijo" | "eventual" | "descuento";
  code: string | null;
  description: string;
  currency: "USD" | "VES";
  amountCents: number;
  usdCents: number;
  taxable: number;
};

/**
 * Partidas de un mes tal como saldrían en el aviso, calculadas de los gastos
 * cargados: lo que la administración revisa antes de emitir.
 */
export function draftLines(period: string, rate: number, reservePercent: number): StatementLine[] {
  const lines: StatementLine[] = all<ExpenseRow>(
    `SELECT kind, code, description, currency, amount_cents AS amountCents, usd_cents AS usdCents, taxable
     FROM expenses WHERE substr(spent_on, 1, 7) = ?
     ORDER BY CASE kind WHEN 'fijo' THEN 0 WHEN 'eventual' THEN 1 ELSE 2 END, code IS NULL, code, id`,
    period,
  ).map((e) => ({
    section: e.kind,
    code: e.code,
    description: e.description,
    // Un gasto pagado en dólares entra al aviso en bolívares, a la tasa de cálculo.
    amountCents: e.currency === "VES" ? e.amountCents : Math.round(e.usdCents * rate),
    taxable: e.taxable,
  }));
  return withReserve(lines, reservePercent);
}

export function getStatement(period: string): Statement | null {
  const row = get<{ period: string; issuedOn: string; dueOn: string; rate: number }>(
    "SELECT period, issued_on AS issuedOn, due_on AS dueOn, rate FROM statements WHERE period = ?",
    period,
  );
  if (!row) return null;
  const lines = all<StatementLine>(
    `SELECT section, code, description, amount_cents AS amountCents, taxable
     FROM statement_lines WHERE period = ? ORDER BY id`,
    period,
  );
  return { ...row, lines };
}

export type StatementSummary = { period: string; issuedOn: string; dueOn: string; rate: number };

/** Avisos emitidos, el más reciente primero. */
export function listStatements(): StatementSummary[] {
  return all<StatementSummary>(
    "SELECT period, issued_on AS issuedOn, due_on AS dueOn, rate FROM statements ORDER BY period DESC",
  );
}

export type UnitCharge = { aliquot: number; bsCents: number; usdCents: number };

/** Lo que se le cobró a un local en un aviso, con la alícuota de ese momento. */
export function unitCharge(unitId: number, period: string): UnitCharge | null {
  return (
    get<UnitCharge>(
      `SELECT aliquot, bs_cents AS bsCents, amount_cents AS usdCents FROM charges
       WHERE unit_id = ? AND period = ? AND kind = 'condominio'`,
      unitId, period,
    ) ?? null
  );
}
