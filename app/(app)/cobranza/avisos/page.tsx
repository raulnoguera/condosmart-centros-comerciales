import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, FileText } from "lucide-react";
import { DueBadge } from "@/components/billing";
import { PdfButton } from "@/components/pdf-button";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { pendingOf, unitBalance } from "@/lib/data";
import { bs, dateLabel, periodLabel, rateLabel, usd } from "@/lib/format";
import { getStatement, listStatements, statementTotals, unitCharge } from "@/lib/statements";

export const metadata: Metadata = { title: "Avisos de cobro" };

/**
 * Todos los avisos de cobro emitidos, del más reciente al más antiguo, cada uno
 * con su PDF. El comerciante ve los de su local; la administración, los de un
 * local (?local=) o los generales.
 */
export default async function StatementsPage({ searchParams }: { searchParams: Promise<{ local?: string }> }) {
  const user = await requireUser("admin", "comerciante");
  const isAdmin = user.role === "admin";
  const local = (await searchParams).local;
  const unitId = isAdmin ? Number(local) || null : user.unitId;
  const unit = unitId ? unitBalance(unitId) : null;
  if (!isAdmin && !unit) return <Empty>Tu usuario no está asociado a un local. Avisa a la administración.</Empty>;
  if (local && !unit) notFound();

  const suffix = isAdmin && unit ? `&local=${unit.id}` : "";
  const statements = listStatements().map((s) => {
    const charge = unit ? unitCharge(unit.id, s.period) : null;
    // Sin local se muestra el total del mes; con local, lo que le tocó a ese local.
    const general = unit ? null : statementTotals(getStatement(s.period)?.lines ?? []).neto;
    return {
      ...s,
      bsCents: charge?.bsCents ?? general,
      usdCents: charge?.usdCents ?? (general === null ? null : Math.round(general / s.rate)),
      pending: unit ? pendingOf(unit.id, s.period) : null,
      // Un local creado después de un aviso no figura en él.
      missing: Boolean(unit) && !charge,
    };
  });

  return (
    <>
      <PageHeader
        title="Avisos de cobro"
        subtitle={
          <Link href={isAdmin && unit ? `/cobranza/${unit.id}` : "/cobranza"} className="text-brand hover:underline">
            ← {isAdmin ? (unit ? `${unit.business ?? "Local desocupado"} · ${unit.code}` : "Volver a cobranza") : "Volver a mi cuenta"}
          </Link>
        }
      />
      <div className="max-w-2xl">
        <Card title={unit ? "Historial de avisos" : "Avisos generales"} aside={<Badge>{statements.length}</Badge>}>
          <p className="mb-2 text-sm text-muted">
            {unit
              ? "Cada aviso queda guardado con su PDF, tal como se emitió."
              : "Los totales de cada mes. Para el aviso de un local, entra a ese local desde Cobranza."}
          </p>
          {statements.length === 0 && <Empty icon={FileText}>Todavía no se ha emitido ningún aviso de cobro.</Empty>}
          <ul className="divide-y divide-line">
            {statements.map((s) => (
              <li key={s.period} className="py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="tile tile-clay grid size-12 shrink-0 place-items-center rounded-2xl">
                      <FileText className="size-6" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="font-display text-lg font-extrabold leading-tight">{periodLabel(s.period)}</p>
                      <p className="text-xs text-muted">
                        Emitido el {dateLabel(s.issuedOn)} · tasa {rateLabel(s.rate)}
                      </p>
                    </div>
                  </div>
                  {s.pending === null ? (
                    <Badge>Vence el {dateLabel(s.dueOn)}</Badge>
                  ) : s.missing ? (
                    <Badge>No aplica</Badge>
                  ) : (
                    <DueBadge dueOn={s.dueOn} pending={s.pending} />
                  )}
                </div>
                {s.missing ? (
                  <p className="mt-3 text-sm text-muted">Este local no figura en ese aviso.</p>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="tabular-nums">
                      <strong className="font-display text-xl font-extrabold">{usd(s.usdCents ?? 0)}</strong>
                      <span className="ml-2 text-xs text-muted">{bs(s.bsCents ?? 0)}</span>
                    </p>
                    <div className="flex gap-2">
                      <Link href={`/cobranza/aviso?mes=${s.period}${suffix}`} className="btn btn-secondary btn-sm">
                        Ver
                      </Link>
                      <PdfButton
                        href={`/cobranza/aviso/pdf?mes=${s.period}${suffix}`}
                        filename={`aviso-${s.period}.pdf`}
                        className="btn btn-primary btn-sm"
                      >
                        <FileDown className="size-4" aria-hidden /> PDF
                      </PdfButton>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
