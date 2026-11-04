import type { Metadata } from "next";
import Link from "next/link";
import {
  ChartNoAxesColumn, ChevronLeft, ChevronRight, CopyPlus, ListChecks, PiggyBank, ReceiptText, Repeat, Scale, TrendingUp,
} from "lucide-react";
import { addExpense, deleteExpense, loadFixedExpenses, updateExpenseAmount } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { Badge, Card, Empty, Field, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { cashBalance, expensesOf, getSettings, incomeIn, listFixedExpenses } from "@/lib/data";
import { draftLines, getStatement, statementTotals } from "@/lib/statements";
import {
  EXPENSE_CATEGORIES, bs, currentPeriod, dateLabel, isPeriod, money, periodLabel, rateLabel, shiftPeriod,
  today, usd,
} from "@/lib/format";
import { currentRate } from "@/lib/rates";

export const metadata: Metadata = { title: "Gastos" };

const KIND_LABEL = { fijo: "Gasto fijo", eventual: "Gasto eventual", descuento: "Descuento o aporte" };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const user = await requireUser("admin", "comerciante");
  const { mes } = await searchParams;
  const period = mes && isPeriod(mes) ? mes : currentPeriod();
  const items = expensesOf(period);
  // Los descuentos son ingresos del condominio (aportes, alquileres): no cuentan como gasto.
  const expenses = items.filter((e) => e.kind !== "descuento");
  const spent = expenses.reduce((n, e) => n + e.usdCents, 0);
  const income = incomeIn(period);
  const isAdmin = user.role === "admin";
  // Un mes ya cobrado queda cerrado: no se le agregan ni se le cambian partidas.
  const statement = getStatement(period);
  const open = !statement;
  const fixedLoaded = expenses.filter((e) => e.kind === "fijo").length;
  const master = isAdmin ? listFixedExpenses().filter((f) => f.active) : [];
  const result = income - spent;

  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.usdCents);
  const categories = [...byCategory].sort((a, b) => b[1] - a[1]);

  // Lo que pagan los locales entre todos, con la misma cuenta del aviso de cobro: si
  // el mes ya se emitió, el aviso tal como salió; si no, el borrador a la tasa de hoy.
  const settings = getSettings();
  const rate = statement ? statement.rate : (await currentRate())?.bsPerUsd ?? null;
  const toPay = statement
    ? statementTotals(statement.lines)
    : rate && items.length
      ? statementTotals(draftLines(period, rate, settings.reservePercent))
      : null;

  return (
    <>
      <PageHeader title="Gastos" subtitle="Las partidas del mes: son las que se reparten en el aviso de cobro.">
        <div className="flex items-center gap-1 rounded-xl border border-line bg-paper p-1">
          <Link
            href={`/gastos?mes=${shiftPeriod(period, -1)}`}
            aria-label="Mes anterior"
            className="grid size-11 place-items-center rounded-lg transition-colors hover:bg-cream"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </Link>
          <span className="min-w-36 text-center text-sm font-semibold">{periodLabel(period)}</span>
          {period < currentPeriod() ? (
            <Link
              href={`/gastos?mes=${shiftPeriod(period, 1)}`}
              aria-label="Mes siguiente"
              className="grid size-11 place-items-center rounded-lg transition-colors hover:bg-cream"
            >
              <ChevronRight className="size-5" aria-hidden />
            </Link>
          ) : (
            <span className="grid size-11 place-items-center text-line">
              <ChevronRight className="size-5" aria-hidden />
            </span>
          )}
        </div>
      </PageHeader>

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          <Stat icon={TrendingUp} label="Ingresos del mes" value={usd(income)} hint="Pagos aprobados" />
          <Stat icon={ReceiptText} label="Gastos del mes" value={usd(spent)} />
          <Stat
            icon={Scale}
            label="Resultado"
            value={usd(result)}
            hint={result < 0 ? "Se gastó más de lo cobrado" : "Ingresos menos gastos"}
            tone={result < 0 ? "bad" : "good"}
          />
          <Stat icon={PiggyBank} label="Disponible en caja" value={usd(cashBalance())} hint="Acumulado a hoy" />
        </div>

        {isAdmin && open && (
          <Card
            title="Gastos fijos del mes"
            aside={
              <Link href="/gastos/fijos" className="flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
                <ListChecks className="size-4" aria-hidden /> Maestro de gastos fijos
              </Link>
            }
          >
            <p className="mb-4 text-sm text-muted">
              {fixedLoaded === 0
                ? `Todavía no hay gastos fijos en ${periodLabel(period)}.`
                : `${periodLabel(period)} tiene ${fixedLoaded} ${fixedLoaded === 1 ? "gasto fijo cargado" : "gastos fijos cargados"}.`}{" "}
              Cárgalos de una vez y ajusta después los montos que hayan cambiado. Los que ya estén no se repiten.
            </p>
            <ActionForm action={loadFixedExpenses} compact className="flex flex-wrap gap-2">
              <input type="hidden" name="period" value={period} />
              <Submit name="source" value="maestro">
                <Repeat className="size-4" aria-hidden /> Cargar desde el maestro ({master.length})
              </Submit>
              <Submit variant="secondary" name="source" value="anterior">
                <CopyPlus className="size-4" aria-hidden /> Copiar los de {periodLabel(shiftPeriod(period, -1)).split(" ")[0].toLowerCase()}
              </Submit>
            </ActionForm>
          </Card>
        )}

        <div className="grid gap-5 @3xl:grid-cols-5">
          <Card title="Por categoría" className="@3xl:col-span-2">
            {categories.length === 0 && <Empty icon={ChartNoAxesColumn}>Sin gastos este mes.</Empty>}
            <ul className="space-y-3">
              {categories.map(([category, cents]) => (
                <li key={category}>
                  <div className="flex justify-between text-sm">
                    <span>{category}</span>
                    <span className="tabular-nums text-muted">
                      {usd(cents)} · {Math.round((cents / spent) * 100)}%
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-cream">
                    <div className="h-2 rounded-full bg-brand" style={{ width: `${(cents / spent) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
            {categories.length > 0 && (
              <p className="mt-3 flex justify-between border-t border-line pt-3 text-sm font-semibold">
                <span>Total de gastos</span>
                <span className="tabular-nums">{usd(spent)}</span>
              </p>
            )}
            {toPay && rate && (
              <div className="mt-4 rounded-2xl bg-brand-soft p-4">
                <p className="font-semibold text-brand-dark">Total a pagar por los locales</p>
                <dl className="mt-2 grid gap-1.5 text-sm tabular-nums">
                  {(
                    [
                      ["Gastos fijos", toPay.fijos],
                      ["Gastos eventuales", toPay.eventuales],
                      [`Fondo de reserva y publicidad (${String(settings.reservePercent).replace(".", ",")} %)`, toPay.reserva],
                    ] as [string, number][]
                  ).map(([label, cents]) => (
                    <div key={label} className="flex justify-between gap-3">
                      <dt className="text-muted">{label}</dt>
                      <dd>{bs(cents)}</dd>
                    </div>
                  ))}
                  {toPay.descuentos > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted">Descuentos y aportes</dt>
                      <dd className="text-good">−{bs(toPay.descuentos)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3 border-t border-brand/20 pt-2 text-base font-bold text-ink">
                    <dt>A repartir</dt>
                    <dd className="text-right">
                      {bs(toPay.neto)}
                      <span className="block text-xs font-normal text-muted">
                        {usd(Math.round(toPay.neto / rate))} a {rateLabel(rate)}
                      </span>
                    </dd>
                  </div>
                </dl>
                <p className="mt-2 text-xs text-muted">
                  {statement
                    ? `Es lo que se cobró en el aviso de ${periodLabel(period)}.`
                    : "Es el mismo monto que muestra Cobranza al emitir el aviso de cobro, calculado a la tasa de hoy."}
                </p>
              </div>
            )}
          </Card>

          <Card title="Detalle" className="@3xl:col-span-3">
            {items.length === 0 && <Empty icon={ReceiptText}>Sin gastos este mes.</Empty>}
            <ul className="divide-y divide-line">
              {items.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    {e.description}
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
                      <Badge tone={e.kind === "descuento" ? "good" : "neutral"}>{KIND_LABEL[e.kind]}</Badge>
                      {e.code && <span className="font-mono">{e.code}</span>}
                      <span>
                        {dateLabel(e.spentOn)} · {e.category}
                        {e.supplier && ` · ${e.supplier}`}
                        {e.taxable === 1 && " · con IVA"}
                      </span>
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-right tabular-nums">
                    <span>
                      <strong>{usd(e.usdCents)}</strong>
                      {e.currency === "VES" && (
                        <span className="block text-xs text-muted">{money(e.amountCents, "VES")}</span>
                      )}
                    </span>
                    {isAdmin && open && (
                      <details className="relative">
                        <summary className="btn btn-secondary btn-sm cursor-pointer list-none">Monto</summary>
                        <ActionForm
                          action={updateExpenseAmount}
                          compact
                          className="absolute right-0 z-10 mt-2 flex w-64 items-end gap-2 rounded-2xl bg-paper p-3 text-left shadow-pop"
                        >
                          <input type="hidden" name="id" value={e.id} />
                          <Field label={e.currency === "VES" ? "Monto en Bs" : "Monto en USD"} className="flex-1">
                            <input
                              name="amount"
                              inputMode="decimal"
                              required
                              defaultValue={(e.amountCents / 100).toFixed(2).replace(".", ",")}
                              className="input"
                            />
                          </Field>
                          <Submit small>Guardar</Submit>
                        </ActionForm>
                      </details>
                    )}
                    {isAdmin && open && (
                      <ActionForm action={deleteExpense} compact>
                        <input type="hidden" name="id" value={e.id} />
                        <Submit
                          small
                          variant="danger"
                          confirm="¿Borrar este gasto?"
                          confirmDetail={`${e.description} · ${usd(e.usdCents)}. Dejará de contarse en los totales del mes.`}
                        >
                          Borrar
                        </Submit>
                      </ActionForm>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {isAdmin && !open && (
          <p className="rounded-2xl bg-gold-soft px-4 py-3 text-sm text-gold">
            El aviso de cobro de {periodLabel(period)} ya fue emitido: sus partidas quedaron cerradas.
          </p>
        )}

        {isAdmin && open && (
          <Card title="Registrar una partida">
            <ActionForm action={addExpense} className="grid gap-3 @xl:grid-cols-2 @3xl:grid-cols-3">
              <Field label="Descripción" className="@xl:col-span-2 @3xl:col-span-3">
                <input name="description" required placeholder="Ej. Mantenimiento de ascensores" className="input" />
              </Field>
              <Field label="Tipo" hint="Los descuentos son aportes o ingresos que rebajan el aviso.">
                <select name="kind" required defaultValue="eventual" className="input">
                  <option value="fijo">{KIND_LABEL.fijo}</option>
                  <option value="eventual">{KIND_LABEL.eventual}</option>
                  <option value="descuento">{KIND_LABEL.descuento}</option>
                </select>
              </Field>
              <Field label="Código" optional>
                <input name="code" maxLength={12} autoCapitalize="characters" placeholder="Ej. G00002" className="input uppercase" />
              </Field>
              <Field label="Categoría">
                <select name="category" required className="input">
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Proveedor" optional>
                <input name="supplier" className="input" />
              </Field>
              <Field label="Fecha">
                <input type="date" name="spent_on" required defaultValue={today()} max={today()} className="input" />
              </Field>
              <Field label="Moneda">
                <select name="currency" className="input">
                  <option value="VES">Bolívares (Bs)</option>
                  <option value="USD">Dólares (USD)</option>
                </select>
              </Field>
              <Field label="Monto" hint="Los bolívares se convierten a la tasa BCV de la fecha.">
                <input name="amount" inputMode="decimal" required placeholder="0,00" className="input" />
              </Field>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm @xl:col-span-2 @3xl:col-span-3">
                <input type="checkbox" name="taxable" className="size-5 accent-brand" />
                El monto incluye IVA (se informa aparte en el aviso de cobro)
              </label>
              <div className="@xl:col-span-2 @3xl:col-span-3">
                <Submit>Registrar</Submit>
              </div>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
