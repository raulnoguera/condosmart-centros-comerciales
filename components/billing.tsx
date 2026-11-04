import type { ReactNode } from "react";
import Link from "next/link";
import { Check, CircleCheck, Clock, FileDown, ReceiptText, TriangleAlert, Wallet } from "lucide-react";
import { reviewPayment } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { PdfButton } from "@/components/pdf-button";
import { Badge, Card, Empty, PAYMENT_BADGE, STANDING_BADGE } from "@/components/ui";
import {
  OCCUPANCY, chargesOf, paymentTargets, paymentsOf, pendingByCharge, pendingOf, standing,
  type Payment, type Standing, type UnitBalance,
} from "@/lib/data";
import { appliesLabel, targetValue } from "@/lib/allocation";
import { aisleLabel, groupByLevel, levelLabel } from "@/lib/address";
import {
  METHODS, aliquotLabel, areaLabel, bs, dateLabel, money, periodLabel, rateLabel, today, usd,
} from "@/lib/format";
import type { Rate } from "@/lib/rates";
import { listStatements, unitCharge } from "@/lib/statements";

export function RateNote({ rate }: { rate: Rate | null }) {
  if (!rate) return <span className="text-clay">Sin tasa BCV cargada</span>;
  return (
    <span>
      Tasa BCV: <strong className="tabular-nums">Bs. {rateLabel(rate.bsPerUsd)}</strong> por dólar
      {rate.date !== today() && ` (del ${dateLabel(rate.date)})`}
    </span>
  );
}

/** Saldo de un local en dólares y su equivalente en bolívares a la tasa de hoy. */
export function BalanceSummary({
  unit,
  rate,
  action,
}: {
  unit: UnitBalance;
  rate: Rate | null;
  /** Acción principal de la pantalla, p. ej. el enlace a reportar un pago. */
  action?: ReactNode;
}) {
  const badge = STANDING_BADGE[standing(unit)];
  const owes = unit.balance > 0;
  return (
    <div className="relative overflow-hidden hero rounded-[2rem] p-6 text-white">
      <span className="pointer-events-none absolute -right-12 -top-16 size-56 rounded-full bg-white/10" aria-hidden />
      <span className="pointer-events-none absolute -bottom-20 right-10 size-44 rounded-full bg-white/[0.07]" aria-hidden />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-white/70">
            <strong className="block text-base font-semibold text-white">{unit.business ?? "Local desocupado"}</strong>
            {unit.code}
          </p>
          <Badge tone={badge.tone}>{badge.label}</Badge>
        </div>
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-white/60">
          {owes ? "Saldo por pagar" : unit.balance < 0 ? "Saldo a favor" : "Saldo"}
        </p>
        <p className="font-display text-5xl font-extrabold tabular-nums tracking-tight">{usd(Math.abs(unit.balance))}</p>
        {owes && rate ? (
          <p className="mt-1 text-sm tabular-nums text-white/80">
            ≈ {bs(Math.round(unit.balance * rate.bsPerUsd))} a la tasa de hoy
          </p>
        ) : (
          !owes && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/80">
              <CircleCheck className="size-4" aria-hidden /> Sin cobros pendientes
            </p>
          )
        )}
        {unit.pendingPayments > 0 && (
          <p className="mt-4 flex items-center gap-2 rounded-2xl bg-white/15 px-3 py-2.5 text-sm">
            <Clock className="size-4 shrink-0" aria-hidden />
            {unit.pendingPayments === 1 ? "1 pago reportado" : `${unit.pendingPayments} pagos reportados`} por
            verificar; se descontará al aprobarse.
          </p>
        )}
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  );
}

const STANDING_TILE: Record<Standing, { className: string; icon: typeof Check }> = {
  al_dia: { className: "bg-good-soft text-good hover:ring-good", icon: Check },
  pendiente: { className: "bg-gold-soft text-gold hover:ring-gold", icon: Clock },
  moroso: { className: "bg-clay-soft text-clay hover:ring-clay", icon: TriangleAlert },
};

/**
 * Todos los locales de un vistazo, por nivel y pasillo: color e icono según su
 * estado de cuenta, con el resumen de cada nivel.
 */
export function UnitGrid({ units }: { units: UnitBalance[] }) {
  const counts: Record<Standing, number> = { al_dia: 0, pendiente: 0, moroso: 0 };
  for (const u of units) counts[standing(u)]++;
  return (
    <>
      <div className="grid gap-3 @3xl:grid-cols-2">
        {groupByLevel(units).map(({ level, aisles }) => {
          const houses = aisles.flatMap((b) => b.units);
          const owed = houses.reduce((n, u) => n + Math.max(0, u.balance), 0);
          const upToDate = houses.filter((u) => u.balance <= 0).length;
          return (
            <section key={level ?? "-"} className="rounded-2xl bg-cream p-3.5">
              <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="font-display font-bold">{levelLabel(level)}</h3>
                <p className="text-xs text-muted">
                  {upToDate} de {houses.length} al día · <span className="tabular-nums">{usd(owed)}</span> por cobrar
                </p>
              </div>
              <div className="grid gap-2">
                {aisles.map(({ aisle, units: aisleUnits }) => (
                  <div key={aisle ?? "-"} className="flex items-start gap-2.5">
                    <span className="w-6 shrink-0 pt-3 text-sm font-bold text-muted" title={aisleLabel(aisle)}>
                      {aisle ?? "–"}
                    </span>
                    <ul className="flex flex-1 flex-wrap gap-2">
                      {aisleUnits.map((u) => {
                        const state = standing(u);
                        const tile = STANDING_TILE[state];
                        return (
                          <li key={u.id}>
                            <Link
                              href={`/cobranza/${u.id}`}
                              title={`${u.code} · ${u.business ?? "Desocupado"} · ${STANDING_BADGE[state].label}`}
                              aria-label={`${u.code}, ${STANDING_BADGE[state].label}, saldo ${usd(u.balance)}`}
                              className={`flex size-11 flex-col items-center justify-center rounded-xl shadow-[inset_0_1px_0_rgb(255_255_255/0.8),inset_0_-2px_0_rgb(0_0_0/0.1)] ring-1 ring-transparent transition hover:-translate-y-0.5 ${tile.className}`}
                            >
                              <tile.icon className="size-3" aria-hidden />
                              <span className="text-sm font-semibold leading-tight tabular-nums">{u.number ?? "?"}</span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
        {(Object.keys(counts) as Standing[]).map((state) => {
          const Icon = STANDING_TILE[state].icon;
          return (
            <li key={state} className="flex items-center gap-1.5">
              <span className={`grid size-5 place-items-center rounded-md ${STANDING_TILE[state].className}`}>
                <Icon className="size-3" aria-hidden />
              </span>
              {STANDING_BADGE[state].label}: <strong className="text-ink">{counts[state]}</strong>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function PaymentAmount({ payment }: { payment: Payment }) {
  return (
    <span className="tabular-nums">
      <strong>{usd(payment.usdCents)}</strong>
      {payment.currency === "VES" && (
        <span className="block text-xs text-muted">
          {money(payment.amountCents, "VES")} a {rateLabel(payment.rate ?? 0)}
        </span>
      )}
    </span>
  );
}

/** Estado de un aviso para un local: pagado, por vencer o vencido. */
export function DueBadge({ dueOn, pending }: { dueOn: string; pending: number }) {
  if (pending <= 0) return <Badge tone="good">Pagado</Badge>;
  return dueOn < today() ? (
    <Badge tone="bad">Vencido el {dateLabel(dueOn)}</Badge>
  ) : (
    <Badge tone="warn">Vence el {dateLabel(dueOn)}</Badge>
  );
}

/** Resumen del último aviso de cobro del local, con el enlace a su detalle. */
export function StatementCard({ unit, asAdmin }: { unit: UnitBalance; asAdmin?: boolean }) {
  const latest = listStatements()[0];
  const charge = latest ? unitCharge(unit.id, latest.period) : null;
  const facts: [string, string][] = [
    ["Alícuota", aliquotLabel(unit.aliquot)],
    ["Ocupación", OCCUPANCY[unit.occupancy]],
    ["Propietario", unit.owner],
    ...(unit.areaM2 ? ([["Superficie", areaLabel(unit.areaM2)]] as [string, string][]) : []),
  ];
  return (
    <Card
      title={latest ? `Aviso de cobro · ${periodLabel(latest.period)}` : "Aviso de cobro"}
      aside={latest && <DueBadge dueOn={latest.dueOn} pending={pendingOf(unit.id, latest.period)} />}
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted">{label}</dt>
            <dd className="font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      {latest && charge ? (
        <>
          <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
            <li className="flex items-center justify-between gap-3 py-2.5">
              <span>
                Parte del local en los gastos del mes
                <span className="block text-xs tabular-nums text-muted">
                  {bs(charge.bsCents)} a la tasa de {rateLabel(latest.rate)}
                </span>
              </span>
              <strong className="font-display text-lg font-extrabold tabular-nums">{usd(charge.usdCents)}</strong>
            </li>
            {unit.rentCents > 0 && (
              <li className="flex items-center justify-between gap-3 py-2.5">
                Canon de arrendamiento
                <strong className="tabular-nums">{usd(unit.rentCents)}</strong>
              </li>
            )}
          </ul>
          <div className="mt-3 grid gap-2 @xl:grid-cols-2">
            <PdfButton
              href={`/cobranza/aviso/pdf?mes=${latest.period}${asAdmin ? `&local=${unit.id}` : ""}`}
              filename={`aviso-${latest.period}.pdf`}
              className="btn btn-primary"
            >
              <FileDown className="size-4" aria-hidden /> Descargar en PDF
            </PdfButton>
            <Link
              href={`/cobranza/aviso?mes=${latest.period}${asAdmin ? `&local=${unit.id}` : ""}`}
              className="btn btn-secondary"
            >
              <ReceiptText className="size-4" aria-hidden /> Ver el detalle
            </Link>
          </div>
          <Link
            href={`/cobranza/avisos${asAdmin ? `?local=${unit.id}` : ""}`}
            className="mt-3 block text-center text-sm font-medium text-brand hover:underline"
          >
            Ver todos los avisos anteriores
          </Link>
        </>
      ) : (
        <p className="mt-4 border-t border-line pt-3 text-sm text-muted">Todavía no se ha emitido ningún aviso de cobro.</p>
      )}
    </Card>
  );
}

const RECENT_PAYMENTS = 5;

export function Statement({ unitId, historyHref }: { unitId: number; historyHref: string }) {
  const charges = chargesOf(unitId);
  const allPayments = paymentsOf(unitId);
  const payments = allPayments.slice(0, RECENT_PAYMENTS);
  const owed = pendingByCharge(unitId);
  return (
    <div className="grid gap-5 @3xl:grid-cols-2">
      <Card title="Lo cobrado">
        {charges.length === 0 && <Empty icon={ReceiptText}>Aún no hay cargos.</Empty>}
        <ul className="divide-y divide-line">
          {charges.map((c) => {
            const pending = owed.get(c.id) ?? 0;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>
                  {c.concept}
                  {c.kind === "especial" && (
                    <span className="block text-xs text-muted">Cargo especial · {periodLabel(c.period)}</span>
                  )}
                  {pending > 0 && pending < c.amountCents && (
                    <span className="block text-xs text-gold">Abonado; faltan {usd(pending)}</span>
                  )}
                </span>
                <span className="flex items-center gap-3 text-right">
                  <strong className="tabular-nums">{usd(c.amountCents)}</strong>
                  <Badge tone={pending === 0 ? "good" : "warn"}>{pending === 0 ? "Pagado" : "Por pagar"}</Badge>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card
        title="Últimos pagos"
        aside={
          allPayments.length > 0 && (
            <Link href={historyHref} className="text-sm font-medium text-brand hover:underline">
              Ver historial
            </Link>
          )
        }
      >
        {payments.length === 0 && <Empty icon={Wallet}>Aún no hay pagos.</Empty>}
        <ul className="divide-y divide-line">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span>
                {METHODS[p.method]?.label ?? p.method}
                <span className="block text-xs text-muted">
                  {dateLabel(p.paidOn)}
                  {p.reference && ` · Ref. ${p.reference}`}
                  {p.appliesTo && ` · Para: ${appliesLabel(p)}`}
                </span>
              </span>
              <span className="flex items-center gap-3 text-right">
                <PaymentAmount payment={p} />
                <Badge tone={PAYMENT_BADGE[p.status].tone}>{PAYMENT_BADGE[p.status].label}</Badge>
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

export function PendingPayments({ payments }: { payments: Payment[] }) {
  if (payments.length === 0) return <Empty icon={CircleCheck}>No hay pagos por verificar.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {payments.map((p) => {
        const targets = paymentTargets(p.unitId);
        return (
        <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
          <span>
            <strong>{p.business ?? p.unitCode}</strong> · {METHODS[p.method]?.label ?? p.method}
            <span className="block text-xs text-muted">
              {p.business && `${p.unitCode} · `}
              {dateLabel(p.paidOn)}
              {p.reference && ` · Ref. ${p.reference}`}
            </span>
          </span>
          <span className="flex flex-wrap items-center gap-3">
            <PaymentAmount payment={p} />
            <ActionForm action={reviewPayment} compact className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={p.id} />
              {targets.length > 1 ? (
                <label className="flex items-center gap-1.5 text-xs text-muted">
                  Para
                  <select
                    name="applies"
                    defaultValue={targetValue(p.appliesTo, p.chargeId)}
                    aria-label={`A qué se aplica el pago de ${p.business ?? p.unitCode}`}
                    className="input min-h-11 w-52 py-1.5 text-sm"
                  >
                    {targets.map((x) => (
                      <option key={x.value} value={x.value}>
                        {x.label} · {usd(x.pendingCents)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <span className="text-xs text-muted">Para: {appliesLabel(p)}</span>
              )}
              <Submit small name="decision" value="approve">
                Aprobar
              </Submit>
              <Submit
                small
                variant="danger"
                name="decision"
                value="reject"
                confirm={`¿Rechazar el pago de ${p.business ?? p.unitCode}?`}
                confirmDetail="No se descontará del saldo y el comerciante tendrá que reportarlo de nuevo."
              >
                Rechazar
              </Submit>
            </ActionForm>
          </span>
        </li>
        );
      })}
    </ul>
  );
}
