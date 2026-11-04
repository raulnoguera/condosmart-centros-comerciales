import type { Metadata } from "next";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { notFound } from "next/navigation";
import { DueBadge } from "@/components/billing";
import { PdfButton } from "@/components/pdf-button";
import { StatementDetail } from "@/components/statement";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getSettings, pendingOf, unitBalance } from "@/lib/data";
import { aliquotLabel, bs, currentPeriod, dateLabel, isPeriod, periodLabel, rateLabel, usd } from "@/lib/format";
import { currentRate } from "@/lib/rates";
import { draftLines, getStatement, listStatements, statementTotals, unitCharge } from "@/lib/statements";

export const metadata: Metadata = { title: "Aviso de cobro" };

/**
 * El aviso de cobro de un mes. El comerciante ve el de su local; la administración,
 * el de cualquier local (?local=) o el general, y también el borrador de un mes
 * que todavía no se ha emitido.
 */
export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; local?: string }>;
}) {
  const user = await requireUser("admin", "comerciante");
  const params = await searchParams;
  const isAdmin = user.role === "admin";
  const issued = listStatements();
  const period = params.mes && isPeriod(params.mes) ? params.mes : (issued[0]?.period ?? currentPeriod());
  const settings = getSettings();

  const unitId = isAdmin ? Number(params.local) || null : user.unitId;
  const unit = unitId ? unitBalance(unitId) : null;
  if (!isAdmin && !unit) return <Empty>Tu usuario no está asociado a un local. Avisa a la administración.</Empty>;
  if (params.local && !unit) notFound();

  let statement = getStatement(period);
  const draft = !statement;
  if (!statement) {
    // Solo la administración ve el borrador: lo que saldría si se emitiera hoy.
    if (!isAdmin) return <Empty>Todavía no se ha emitido el aviso de cobro de {periodLabel(period)}.</Empty>;
    const rate = (await currentRate())?.bsPerUsd ?? 0;
    statement = { period, issuedOn: null, dueOn: null, rate, lines: draftLines(period, rate, settings.reservePercent) };
  }

  const charge = unit && !draft ? unitCharge(unit.id, period) : null;
  // Un borrador se calcula con la alícuota actual; un aviso emitido, con la de ese momento.
  const aliquot = unit ? (charge?.aliquot ?? unit.aliquot) : undefined;
  const totals = statementTotals(statement.lines, aliquot ?? 100);
  const totalUsd = charge?.usdCents ?? (statement.rate ? Math.round(totals.neto / statement.rate) : 0);
  // Lo que el local aún debe de este mes; null cuando se mira el aviso general.
  const pending = unit && !draft ? pendingOf(unit.id, period) : null;
  const query = (mes: string) => `/cobranza/aviso?mes=${mes}${isAdmin && unit ? `&local=${unit.id}` : ""}`;

  return (
    <>
      <PageHeader
        title="Aviso de cobro"
        subtitle={
          <Link href={isAdmin && unit ? `/cobranza/${unit.id}` : "/cobranza"} className="text-brand hover:underline">
            ← {isAdmin ? (unit ? unit.code : "Volver a cobranza") : "Volver a mi cuenta"}
          </Link>
        }
      />
      <div className="grid max-w-2xl gap-5">
        {issued.length > 1 && (
          <nav aria-label="Meses" className="flex flex-wrap gap-2">
            {issued.map((s) => (
              <Link
                key={s.period}
                href={query(s.period)}
                aria-current={s.period === period ? "true" : undefined}
                className={`flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
                  s.period === period ? "bg-ink text-white" : "bg-paper text-muted shadow-card hover:text-ink"
                }`}
              >
                {periodLabel(s.period)}
              </Link>
            ))}
          </nav>
        )}

        <div className="relative overflow-hidden hero rounded-[2rem] p-6 text-white">
          <span className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full bg-white/10" aria-hidden />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-white/70">
                Condominio del Centro Comercial {settings.name}
                <strong className="block font-display text-xl font-extrabold text-white">{periodLabel(period)}</strong>
              </p>
              {draft ? (
                <Badge>Borrador sin emitir</Badge>
              ) : pending === null ? (
                <Badge tone="warn">Vence el {dateLabel(statement.dueOn!)}</Badge>
              ) : (
                <DueBadge dueOn={statement.dueOn!} pending={pending} />
              )}
            </div>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-white/60">
              {unit ? (pending === 0 ? "Total del mes · ya pagado" : "Total a pagar en el mes") : "Total a repartir entre los locales"}
            </p>
            <p className="font-display text-4xl font-extrabold tabular-nums tracking-tight">{usd(totalUsd)}</p>
            <p className="mt-1 text-sm tabular-nums text-white/80">
              {bs(totals.neto)} a la tasa BCV de {rateLabel(statement.rate)}
              {statement.issuedOn && ` del ${dateLabel(statement.issuedOn)}`}
            </p>
            {unit && (
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl bg-white/15 p-3 text-sm">
                <div>
                  <dt className="text-xs text-white/60">Local</dt>
                  <dd className="font-semibold">{unit.business ?? "Desocupado"}</dd>
                  <dd className="text-xs text-white/70">{unit.code}</dd>
                </div>
                <div>
                  <dt className="text-xs text-white/60">Alícuota</dt>
                  <dd className="font-semibold tabular-nums">{aliquotLabel(aliquot ?? 0)}</dd>
                  <dd className="text-xs text-white/70">{unit.owner}</dd>
                </div>
              </dl>
            )}
          </div>
        </div>

        {statement.lines.length > 0 && (
          <PdfButton
            href={`/cobranza/aviso/pdf?mes=${period}${isAdmin && unit ? `&local=${unit.id}` : ""}`}
            filename={`aviso-${period}.pdf`}
            className="lift flex w-full items-center gap-3 rounded-3xl bg-paper p-4 shadow-card"
          >
            <span className="tile tile-clay grid size-12 shrink-0 place-items-center rounded-2xl">
              <FileDown className="size-6" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-bold leading-tight">Descargar en PDF</span>
              <span className="block text-sm text-muted">
                El aviso completo, con el mismo formato del recibo en papel
              </span>
            </span>
          </PdfButton>
        )}

        <Card title={unit ? "Tu parte de cada gasto" : "Gastos del mes"}>
          {statement.lines.length === 0 ? (
            <Empty>No hay gastos cargados en {periodLabel(period)}.</Empty>
          ) : (
            <StatementDetail lines={statement.lines} aliquot={aliquot} />
          )}
        </Card>

        {unit && !draft && (
          <Card title="Tu cuenta a hoy">
            <dl className="grid gap-2 text-sm tabular-nums">
              <div className="flex justify-between gap-3">
                <dt>Aviso de {periodLabel(period)}</dt>
                <dd className="font-semibold">{usd(totalUsd)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>Por pagar de este mes</dt>
                <dd className={`font-semibold ${pending ? "text-clay" : "text-good"}`}>
                  {pending ? usd(pending) : "Nada: está pagado"}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-line pt-2 font-display text-base font-extrabold">
                <dt>{unit.balance < 0 ? "Saldo a favor" : "Deuda total a hoy"}</dt>
                <dd>{usd(Math.abs(unit.balance))}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-muted">
              La deuda queda fijada en dólares. Si pagas en bolívares, se calcula a la tasa BCV del día del pago.
            </p>
            {!isAdmin && unit.balance > 0 && (
              <Link href="/cobranza#reportar" className="btn btn-primary mt-4 w-full">
                Reportar pago
              </Link>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
