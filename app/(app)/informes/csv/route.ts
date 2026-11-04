import { appliesLabel } from "@/lib/allocation";
import { requireUser } from "@/lib/auth";
import { METHODS, currentPeriod, isPeriod, periodLabel } from "@/lib/format";
import { extrasReport, incomeExpensesReport, paymentsReport, receivablesReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

const STANDING = { al_dia: "Al día", pendiente: "Pendiente", moroso: "Moroso" };
const EXTRA = { pagado: "Pagado", parcial: "Abonado", pendiente: "Debe" };

/** Monto con coma decimal y sin separador de miles: Excel en español lo lee como número. */
const amount = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Archivo separado por punto y coma, con BOM para que Excel respete las tildes. */
function csvResponse(name: string, rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: Request) {
  await requireUser("admin");
  const params = new URL(request.url).searchParams;
  const report = params.get("r");
  const mes = params.get("mes") ?? "";
  const period = isPeriod(mes) ? mes : currentPeriod();

  if (report === "cuentas") {
    const rows = receivablesReport();
    return csvResponse("cuentas-por-cobrar", [
      ["Local", "Comercio", "Propietario", "Cuota mensual pendiente (USD)", "Cuotas extra pendientes (USD)", "Saldo (USD)", "Estado"],
      ...rows.map((r) => [r.code, r.business ?? "Desocupado", r.owner, amount(r.monthly), amount(r.extra), amount(r.balance), STANDING[r.standing]]),
    ]);
  }

  if (report === "extras") {
    const groups = extrasReport();
    const id = Number(params.get("g")) || 0;
    const chosen = id ? groups.filter((g) => g.id === id) : groups;
    return csvResponse(id && chosen[0] ? `cuota-extra-${chosen[0].period}` : "cuotas-extra", [
      ["Cuota extra", "Mes", "Local", "Comercio", "Cuota (USD)", "Pagado (USD)", "Debe (USD)", "Estado"],
      ...chosen.flatMap((g) =>
        g.rows.map((x) => [g.concept, periodLabel(g.period), x.code, x.business ?? "Desocupado", amount(x.amountCents), amount(x.paid), amount(x.pending), EXTRA[x.status]]),
      ),
    ]);
  }

  if (report === "resultados") {
    const { rows } = incomeExpensesReport(period);
    return csvResponse(`ingresos-y-gastos-${period}`, [
      ["Mes", "Ingresos (USD)", "Aportes y descuentos (USD)", "Gastos (USD)", "Resultado (USD)"],
      ...rows.map((r) => [periodLabel(r.period), amount(r.income), amount(r.discounts), amount(r.expenses), amount(r.result)]),
    ]);
  }

  const { payments } = paymentsReport(period);
  return csvResponse(`pagos-${period}`, [
    ["Fecha", "Local", "Comercio", "Forma de pago", "Referencia", "Para", "Moneda", "Monto", "Tasa BCV", "Abonado (USD)"],
    ...payments.map((p) => [
      p.paidOn, p.unitCode, p.business ?? "Desocupado", METHODS[p.method]?.label ?? p.method, p.reference,
      appliesLabel(p), p.currency === "VES" ? "Bs" : "USD", amount(p.amountCents),
      p.rate ? String(p.rate).replace(".", ",") : null, amount(p.usdCents),
    ]),
  ]);
}
