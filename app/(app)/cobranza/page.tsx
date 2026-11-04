import type { Metadata } from "next";
import Link from "next/link";
import { addSpecialCharge, issueStatement } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { CalendarPlus, ChevronRight, FileText, History, Plus } from "lucide-react";
import {
  BalanceSummary, PendingPayments, RateNote, Statement, StatementCard, UnitGrid,
} from "@/components/billing";
import { PaymentForm } from "@/components/payment-form";
import { UnitOptions } from "@/components/unit-options";
import { Badge, Card, Empty, Field, PageHeader, STANDING_BADGE, Stat, Suspended } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  chargedIn, getSettings, incomeIn, pendingPayments, standing, unitBalance, unitBalances, paymentTargets, settleAll, targetsFrom,
} from "@/lib/data";
import { aisleLabel, groupByLevel, levelLabel } from "@/lib/address";
import { bs, currentPeriod, dateLabel, periodLabel, rateLabel, shiftPeriod, today, usd } from "@/lib/format";
import { can } from "@/lib/privileges";
import { currentRate } from "@/lib/rates";
import { draftLines, listStatements, statementTotals } from "@/lib/statements";

export const metadata: Metadata = { title: "Cobranza" };

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ nivel?: string }>;
}) {
  const user = await requireUser("admin", "comerciante");
  const settings = getSettings();
  const rate = await currentRate();

  if (user.role === "comerciante") {
    const unit = user.unitId ? unitBalance(user.unitId) : null;
    if (!unit) return <Empty>Tu usuario no está asociado a un local. Avisa a la administración.</Empty>;
    return (
      <>
        <PageHeader title="Mi cuenta" subtitle={`Último aviso de cobro: ${usd(unit.monthly)}`} />
        <div className="grid gap-5">
          <BalanceSummary unit={unit} rate={rate} />
          <Link
            href="/cobranza/avisos"
            className="lift flex items-center gap-3 rounded-3xl bg-paper p-4 shadow-card active:scale-[0.99]"
          >
            <span className="tile tile-clay grid size-12 shrink-0 place-items-center rounded-2xl">
              <FileText className="size-5.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug">Avisos de cobro</span>
              <span className="block text-sm text-muted">Todos tus avisos, cada uno con su PDF</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
          </Link>
          <Link
            href="/cobranza/historial"
            className="flex items-center gap-3 rounded-3xl bg-paper p-4 shadow-card transition hover:shadow-pop active:scale-[0.99]"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-soft text-brand">
              <History className="size-5.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug">Historial de pagos</span>
              <span className="block text-sm text-muted">Todos tus pagos, con su fecha, monto y estado</span>
            </span>
            <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />
          </Link>
          <div id="reportar" className="grid scroll-mt-20 gap-5 @3xl:grid-cols-5">
            <Card title="Reportar un pago" className="@3xl:col-span-3">
              {can(user, "pagar") ? (
                <PaymentForm
                  balanceCents={unit.balance}
                  targets={paymentTargets(unit.id)}
                  rate={rate?.bsPerUsd ?? null}
                  today={today()}
                />
              ) : (
                <Suspended privilege="pagar" />
              )}
            </Card>
            <Card title="Dónde pagar" className="@3xl:col-span-2">
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
                {settings.paymentInfo || "La administración aún no ha cargado los datos de pago."}
              </p>
            </Card>
          </div>
          <StatementCard unit={unit} />
          <Statement unitId={unit.id} historyHref="/cobranza/historial" />
        </div>
      </>
    );
  }

  const period = currentPeriod();
  const units = unitBalances();
  const settlements = settleAll();
  const unitsWithTargets = units.map((u) => {
    const s = settlements.get(u.id);
    return { ...u, targets: s ? targetsFrom(s.charges, s.settlement) : [] };
  });
  const lastPeriod = listStatements()[0]?.period ?? period;
  const charged = chargedIn(lastPeriod);
  const collected = incomeIn(period);
  const receivable = units.reduce((n, u) => n + Math.max(0, u.balance), 0);
  const upToDate = units.filter((u) => u.balance <= 0).length;
  const pending = pendingPayments();
  const levels = [...new Set(units.map((u) => u.level))];
  const { nivel } = await searchParams;
  const level = levels.find((st) => st === nivel) ?? null;
  const shown = level ? units.filter((u) => u.level === level) : units;

  // El próximo aviso por emitir: el del mes pasado si aún no salió; si no, el del mes en curso.
  const statements = listStatements();
  const isIssued = (p: string) => statements.some((s) => s.period === p);
  const nextPeriod = isIssued(shiftPeriod(period, -1)) ? period : shiftPeriod(period, -1);
  const draft = rate && !isIssued(nextPeriod)
    ? statementTotals(draftLines(nextPeriod, rate.bsPerUsd, settings.reservePercent))
    : null;
  const dueOn = `${shiftPeriod(nextPeriod, 1)}-${String(settings.dueDay).padStart(2, "0")}`;

  return (
    <>
      <PageHeader title="Cobranza" subtitle={<RateNote rate={rate} />}>
        <div className="flex gap-2">
          <a href="#emitir" className="btn btn-secondary">
            <CalendarPlus className="size-4" aria-hidden /> Emitir aviso de cobro
          </a>
          <a href="#registrar" className="btn btn-primary">
            <Plus className="size-4" aria-hidden /> Registrar pago
          </a>
        </div>
      </PageHeader>
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          <Stat label={`Aviso de ${periodLabel(lastPeriod)}`} value={usd(charged)} />
          <Stat
            label="Recaudado en el mes"
            value={usd(collected)}
            progress={charged ? collected / charged : undefined}
            hint={charged ? `${Math.round((collected / charged) * 100)}% de lo facturado` : undefined}
          />
          <Stat label="Por cobrar" value={usd(receivable)} tone={receivable ? "bad" : "good"} />
          <Stat label="Locales al día" value={`${upToDate} de ${units.length}`} />
        </div>

        <Card title="Pagos por verificar" aside={pending.length > 0 && <Badge tone="warn">{pending.length}</Badge>}>
          <PendingPayments payments={pending} />
        </Card>

        <Card title="Estado por local">
          {levels.length > 1 && (
            <nav aria-label="Niveles" className="mb-4 flex flex-wrap gap-2">
              {[null, ...levels.filter((st): st is string => st !== null)].map((st) => (
                <Link
                  key={st ?? "todas"}
                  href={st ? `/cobranza?nivel=${encodeURIComponent(st)}` : "/cobranza"}
                  aria-current={st === level ? "true" : undefined}
                  className={`flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
                    st === level ? "bg-ink text-white" : "bg-cream text-muted hover:text-ink"
                  }`}
                >
                  {st ? levelLabel(st) : "Todos los niveles"}
                </Link>
              ))}
            </nav>
          )}
          <UnitGrid units={shown} />
          <div className="-mx-5 mt-5 overflow-x-auto border-t border-line">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                  <th className="px-5 py-2 font-medium">Local</th>
                  <th className="hidden px-2 py-2 font-medium @xl:table-cell">Comercio</th>
                  <th className="px-2 py-2 text-right font-medium">Saldo</th>
                  <th className="px-5 py-2 text-right font-medium">Estado</th>
                </tr>
              </thead>
              {groupByLevel(shown).flatMap(({ level: groupLevel, aisles }) =>
                aisles.map(({ aisle, units: aisleUnits }) => {
                  const owed = aisleUnits.reduce((n, u) => n + Math.max(0, u.balance), 0);
                  return (
                    <tbody key={`${groupLevel}|${aisle}`} className="divide-y divide-line">
                      <tr className="bg-cream/70">
                        <th colSpan={4} scope="colgroup" className="px-5 py-1.5 text-left text-xs font-semibold">
                          <span className="flex justify-between gap-3">
                            <span>
                              {levelLabel(groupLevel)} · {aisleLabel(aisle)}
                            </span>
                            <span className="font-medium tabular-nums text-muted">{usd(owed)} por cobrar</span>
                          </span>
                        </th>
                      </tr>
                      {aisleUnits.map((u) => {
                        const badge = STANDING_BADGE[standing(u)];
                        return (
                          <tr key={u.id} className="hover:bg-cream/60">
                            <td className="px-5 py-2.5 font-semibold">
                              <Link href={`/cobranza/${u.id}`} className="text-brand hover:underline">
                                Local {u.number ?? "?"}
                              </Link>
                              <span className="block text-xs font-normal text-muted @xl:hidden">{u.business ?? "Desocupado"}</span>
                            </td>
                            <td className="hidden px-2 py-2.5 @xl:table-cell">
                              {u.business ?? <span className="text-muted">Desocupado</span>}
                              <span className="block text-xs text-muted">{u.owner}</span>
                            </td>
                            <td className="px-2 py-2.5 text-right font-semibold tabular-nums">
                              {u.balance < 0 ? `${usd(-u.balance)} a favor` : usd(u.balance)}
                            </td>
                            <td className="px-5 py-2.5 text-right">
                              <Badge tone={badge.tone}>{badge.label}</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  );
                }),
              )}
            </table>
          </div>
        </Card>

        <div className="grid gap-5 @3xl:grid-cols-2">
          <div id="registrar" className="scroll-mt-20">
            <Card title="Registrar un pago">
              <PaymentForm units={unitsWithTargets} rate={rate?.bsPerUsd ?? null} today={today()} />
            </Card>
          </div>
          <div className="grid content-start gap-5">
            <Card
              title="Emitir aviso de cobro"
              className="scroll-mt-20"
              id="emitir"
              aside={<Badge>{periodLabel(nextPeriod)}</Badge>}
            >
              {draft ? (
                <>
                  <dl className="grid gap-1.5 text-sm tabular-nums">
                    {(
                      [
                        ["Gastos fijos", draft.fijos],
                        ["Gastos eventuales", draft.eventuales],
                        [`Fondo de reserva y publicidad (${String(settings.reservePercent).replace(".", ",")} %)`, draft.reserva],
                      ] as [string, number][]
                    ).map(([label, cents]) => (
                      <div key={label} className="flex justify-between gap-3">
                        <dt className="text-muted">{label}</dt>
                        <dd>{bs(cents)}</dd>
                      </div>
                    ))}
                    {draft.descuentos > 0 && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted">Descuentos y aportes</dt>
                        <dd className="text-good">−{bs(draft.descuentos)}</dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
                      <dt>A repartir entre los locales</dt>
                      <dd>
                        {bs(draft.neto)}
                        <span className="block text-right text-xs font-normal text-muted">
                          {usd(Math.round(draft.neto / rate!.bsPerUsd))} a {rateLabel(rate!.bsPerUsd)}
                        </span>
                      </dd>
                    </div>
                  </dl>
                  <ActionForm action={issueStatement} className="mt-4 flex flex-wrap items-end gap-3">
                    <input type="hidden" name="period" value={nextPeriod} />
                    <Field label="Vence el" className="flex-1">
                      <input type="date" name="due_on" required defaultValue={dueOn < today() ? today() : dueOn} min={today()} className="input" />
                    </Field>
                    <Submit
                      confirm={`¿Emitir el aviso de cobro de ${periodLabel(nextPeriod)}?`}
                      confirmDetail="Cada local recibe su parte según su alícuota, fijada en dólares a la tasa BCV de hoy. Después no se puede cambiar."
                    >
                      Emitir
                    </Submit>
                    <p className="basis-full text-xs text-muted">
                      Sale de los gastos cargados en {periodLabel(nextPeriod)}.{" "}
                      <Link href={`/cobranza/aviso?mes=${nextPeriod}`} className="font-medium text-brand hover:underline">
                        Ver el borrador partida por partida
                      </Link>
                    </p>
                  </ActionForm>
                </>
              ) : (
                <p className="text-sm text-muted">
                  {rate
                    ? `El aviso de ${periodLabel(nextPeriod)} ya fue emitido.`
                    : "Carga primero la tasa BCV en Administración."}
                </p>
              )}
              {statements.length > 0 && (
                <ul className="mt-4 divide-y divide-line border-t border-line text-sm">
                  {statements.slice(0, 4).map((st) => (
                    <li key={st.period}>
                      <Link href={`/cobranza/aviso?mes=${st.period}`} className="flex items-center justify-between gap-3 py-2 hover:text-brand">
                        <span className="font-medium">{periodLabel(st.period)}</span>
                        <span className="text-xs text-muted">
                          Emitido el {dateLabel(st.issuedOn)} · tasa {rateLabel(st.rate)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {statements.length > 0 && (
                <Link href="/cobranza/avisos" className="mt-2 block text-center text-sm font-medium text-brand hover:underline">
                  Ver todos los avisos y sus PDF
                </Link>
              )}
            </Card>
            <Card title="Cargo especial">
              <ActionForm action={addSpecialCharge} className="grid gap-3 @xl:grid-cols-2">
                <Field label="Concepto" className="@xl:col-span-2">
                  <input name="concept" required placeholder="Ej. Impermeabilización del techo" className="input" />
                </Field>
                <Field label="Monto en USD">
                  <input name="amount" inputMode="decimal" required placeholder="0,00" className="input" />
                </Field>
                <Field label="Aplicar a">
                  <select name="unit_id" className="input" defaultValue="all">
                    <option value="all">Todos los locales</option>
                    <UnitOptions units={units} />
                  </select>
                </Field>
                <div className="@xl:col-span-2">
                  <Submit variant="secondary">Aplicar cargo</Submit>
                </div>
              </ActionForm>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
