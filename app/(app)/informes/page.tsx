import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, CircleCheck, Coins, Download, HandCoins, Layers, Scale, TrendingUp, Wallet } from "lucide-react";
import { appliesLabel } from "@/lib/allocation";
import { Badge, Card, Empty, PageHeader, STANDING_BADGE, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { METHODS, currentPeriod, dateLabel, isPeriod, money, periodLabel, shiftPeriod, usd } from "@/lib/format";
import {
  extrasReport, incomeExpensesReport, paymentsReport, receivablesReport, type ExtraStatus,
} from "@/lib/reports";

export const metadata: Metadata = { title: "Reportes" };

const TABS = [
  { key: "pagos", label: "Pagos recibidos" },
  { key: "cuentas", label: "Cuentas por cobrar" },
  { key: "extras", label: "Cuotas extra" },
  { key: "resultados", label: "Ingresos y gastos" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const EXTRA_BADGE: Record<ExtraStatus, { tone: "good" | "warn" | "bad"; label: string }> = {
  pagado: { tone: "good", label: "Pagado" },
  parcial: { tone: "warn", label: "Abonado" },
  pendiente: { tone: "bad", label: "Debe" },
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string; mes?: string; g?: string; todos?: string }>;
}) {
  await requireUser("admin");
  const { r, mes, g, todos } = await searchParams;
  const tab: Tab = TABS.find((t) => t.key === r)?.key ?? "pagos";
  const period = mes && isPeriod(mes) ? mes : currentPeriod();
  const href = (params: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])));
    return `/informes?${q}`;
  };
  const csv = (params: Record<string, string | undefined>) =>
    `/informes/csv?${new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1])))}`;
  const withMonth = tab === "pagos" || tab === "resultados";

  return (
    <>
      <PageHeader title="Reportes" subtitle="Pagos, deudas, cuotas extra y resultados del mes, listos para revisar o descargar.">
        {withMonth && <MonthPicker period={period} link={(p) => href({ r: tab, mes: p })} />}
      </PageHeader>

      <nav aria-label="Reportes" className="mb-5 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={href({ r: t.key, mes: t.key === "pagos" || t.key === "resultados" ? mes : undefined })}
            aria-current={t.key === tab ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
              t.key === tab ? "bg-ink text-white" : "border border-line bg-paper text-ink hover:border-brand hover:text-brand"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "pagos" && <PaymentsTab period={period} csvHref={csv({ r: "pagos", mes: period })} />}
      {tab === "cuentas" && (
        <ReceivablesTab
          all={todos === "1"}
          toggleHref={href({ r: "cuentas", todos: todos === "1" ? undefined : "1" })}
          csvHref={csv({ r: "cuentas" })}
        />
      )}
      {tab === "extras" && (
        <ExtrasTab
          groupId={Number(g) || 0}
          detailHref={(id) => href({ r: "extras", g: String(id) })}
          backHref={href({ r: "extras" })}
          csvHref={(id) => csv({ r: "extras", g: id ? String(id) : undefined })}
        />
      )}
      {tab === "resultados" && <ResultsTab period={period} csvHref={csv({ r: "resultados", mes: period })} />}
    </>
  );
}

function MonthPicker({ period, link }: { period: string; link: (p: string) => string }) {
  const next = period < currentPeriod();
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-paper p-1">
      <Link href={link(shiftPeriod(period, -1))} aria-label="Mes anterior" className="grid size-11 place-items-center rounded-lg transition-colors hover:bg-cream">
        <ChevronLeft className="size-5" aria-hidden />
      </Link>
      <span className="min-w-36 text-center text-sm font-semibold">{periodLabel(period)}</span>
      {next ? (
        <Link href={link(shiftPeriod(period, 1))} aria-label="Mes siguiente" className="grid size-11 place-items-center rounded-lg transition-colors hover:bg-cream">
          <ChevronRight className="size-5" aria-hidden />
        </Link>
      ) : (
        <span className="grid size-11 place-items-center text-line">
          <ChevronRight className="size-5" aria-hidden />
        </span>
      )}
    </div>
  );
}

function DownloadLink({ href }: { href: string }) {
  return (
    <a href={href} className="flex items-center gap-1.5 text-sm font-medium text-brand hover:underline">
      <Download className="size-4" aria-hidden /> Descargar para Excel
    </a>
  );
}

/** Tabla ancha con desplazamiento propio, para que no empuje la página en el teléfono. */
function Table({ head, children, foot }: { head: ReactNode; children: ReactNode; foot?: ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[40rem] text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">{head}</thead>
        <tbody className="divide-y divide-line">{children}</tbody>
        {foot && <tfoot className="border-t-2 border-line font-semibold">{foot}</tfoot>}
      </table>
    </div>
  );
}

const th = "px-2 py-2 font-semibold";
const td = "px-2 py-2.5 align-top";
const num = "text-right tabular-nums";

function PaymentsTab({ period, csvHref }: { period: string; csvHref: string }) {
  const { payments, byMethod, total } = paymentsReport(period);
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat icon={TrendingUp} label={`Cobrado en ${periodLabel(period).toLowerCase()}`} value={usd(total)} hint="Pagos aprobados" />
        <Stat icon={Wallet} label="Pagos" value={String(payments.length)} hint="Con fecha de pago en el mes" />
      </div>
      <Card title="Por forma de pago">
        {byMethod.length === 0 ? (
          <Empty icon={Wallet}>No hay pagos aprobados en {periodLabel(period).toLowerCase()}.</Empty>
        ) : (
          <Table
            head={
              <tr>
                <th className={th}>Forma de pago</th>
                <th className={`${th} ${num}`}>Pagos</th>
                <th className={`${th} ${num}`}>Monto recibido</th>
                <th className={`${th} ${num}`}>Abonado en USD</th>
              </tr>
            }
            foot={
              <tr>
                <td className={td}>Total</td>
                <td className={`${td} ${num}`}>{payments.length}</td>
                <td className={td} />
                <td className={`${td} ${num}`}>{usd(total)}</td>
              </tr>
            }
          >
            {byMethod.map((m) => (
              <tr key={m.method}>
                <td className={td}>{METHODS[m.method]?.label ?? m.method}</td>
                <td className={`${td} ${num}`}>{m.count}</td>
                <td className={`${td} ${num}`}>{money(m.originalCents, METHODS[m.method]?.currency ?? "USD")}</td>
                <td className={`${td} ${num}`}>{usd(m.usdCents)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title="Detalle de pagos" aside={payments.length > 0 && <DownloadLink href={csvHref} />}>
        {payments.length === 0 ? (
          <Empty icon={Wallet}>Sin pagos este mes.</Empty>
        ) : (
          <Table
            head={
              <tr>
                <th className={th}>Fecha</th>
                <th className={th}>Local</th>
                <th className={th}>Forma · referencia</th>
                <th className={th}>Para</th>
                <th className={`${th} ${num}`}>Monto</th>
                <th className={`${th} ${num}`}>USD</th>
              </tr>
            }
          >
            {payments.map((p) => (
              <tr key={p.id}>
                <td className={`${td} whitespace-nowrap`}>{dateLabel(p.paidOn)}</td>
                <td className={td}>
                  {p.business ?? "Desocupado"}
                  <span className="block text-xs text-muted">{p.unitCode}</span>
                </td>
                <td className={td}>
                  {METHODS[p.method]?.label ?? p.method}
                  {p.reference && <span className="block text-xs text-muted">Ref. {p.reference}</span>}
                </td>
                <td className={td}>{appliesLabel(p)}</td>
                <td className={`${td} ${num}`}>{money(p.amountCents, p.currency)}</td>
                <td className={`${td} ${num} font-semibold`}>{usd(p.usdCents)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function ReceivablesTab({ all, toggleHref, csvHref }: { all: boolean; toggleHref: string; csvHref: string }) {
  const rows = receivablesReport();
  const owing = rows.filter((r) => r.balance > 0);
  const shown = (all ? rows : owing).toSorted((a, b) => b.balance - a.balance);
  const sum = (key: "monthly" | "extra" | "balance") => owing.reduce((n, r) => n + r[key], 0);
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat icon={HandCoins} label="Por cobrar" value={usd(sum("balance"))} hint={`${owing.length} locales con deuda`} />
        <Stat icon={Coins} label="Cuota mensual" value={usd(sum("monthly"))} hint="Condominio y canon pendientes" />
        <Stat icon={Layers} label="Cuotas extra" value={usd(sum("extra"))} hint="Cargos especiales pendientes" />
        <Stat
          icon={Scale}
          label="Morosos"
          value={String(rows.filter((r) => r.standing === "moroso").length)}
          hint="Deben más del último aviso"
          tone="bad"
        />
      </div>
      <Card
        title={all ? "Todos los locales" : "Locales con deuda"}
        aside={
          <span className="flex flex-wrap items-center gap-4">
            <Link href={toggleHref} className="text-sm font-medium text-brand hover:underline">
              {all ? "Ver solo los que deben" : "Ver todos los locales"}
            </Link>
            <DownloadLink href={csvHref} />
          </span>
        }
      >
        {shown.length === 0 ? (
          <Empty icon={CircleCheck}>Ningún local tiene deuda.</Empty>
        ) : (
          <Table
            head={
              <tr>
                <th className={th}>Local</th>
                <th className={`${th} ${num}`}>Cuota mensual</th>
                <th className={`${th} ${num}`}>Cuotas extra</th>
                <th className={`${th} ${num}`}>Saldo</th>
                <th className={th}>Estado</th>
              </tr>
            }
          >
            {shown.map((r) => (
              <tr key={r.id}>
                <td className={td}>
                  <Link href={`/cobranza/${r.id}`} className="font-medium text-brand hover:underline">
                    {r.business ?? "Desocupado"}
                  </Link>
                  <span className="block text-xs text-muted">{r.code}</span>
                </td>
                <td className={`${td} ${num}`}>{r.monthly ? usd(r.monthly) : "—"}</td>
                <td className={`${td} ${num}`}>{r.extra ? usd(r.extra) : "—"}</td>
                <td className={`${td} ${num} font-semibold`}>
                  {usd(r.balance)}
                  {r.balance < 0 && <span className="block text-xs font-normal text-muted">a favor</span>}
                </td>
                <td className={td}>
                  <Badge tone={STANDING_BADGE[r.standing].tone}>{STANDING_BADGE[r.standing].label}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function ExtrasTab({
  groupId, detailHref, backHref, csvHref,
}: {
  groupId: number;
  detailHref: (id: number) => string;
  backHref: string;
  csvHref: (id?: number) => string;
}) {
  const groups = extrasReport();
  const group = groupId ? groups.find((x) => x.id === groupId) : null;

  if (group) {
    return (
      <div className="grid gap-5">
        <Link href={backHref} className="text-sm font-medium text-brand hover:underline">
          ← Todas las cuotas extra
        </Link>
        <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          <Stat icon={Layers} label="Cobrado a los locales" value={usd(group.charged)} hint={`${group.rows.length} locales · ${periodLabel(group.period)}`} />
          <Stat icon={TrendingUp} label="Recaudado" value={usd(group.collected)} hint={`${Math.round((group.collected / group.charged) * 100)} % del total`} tone="good" />
          <Stat icon={CircleCheck} label="Pagaron" value={String(group.paidCount)} hint={group.partialCount ? `${group.partialCount} abonaron una parte` : "Completo"} />
          <Stat icon={HandCoins} label="Deben" value={String(group.pendingCount + group.partialCount)} hint={usd(group.charged - group.collected)} tone={group.pendingCount ? "bad" : undefined} />
        </div>
        <Card title={group.concept} aside={<DownloadLink href={csvHref(group.id)} />}>
          <Table
            head={
              <tr>
                <th className={th}>Local</th>
                <th className={`${th} ${num}`}>Cuota</th>
                <th className={`${th} ${num}`}>Pagado</th>
                <th className={`${th} ${num}`}>Debe</th>
                <th className={th}>Estado</th>
              </tr>
            }
          >
            {group.rows.map((x) => (
              <tr key={x.id}>
                <td className={td}>
                  <Link href={`/cobranza/${x.unitId}`} className="font-medium text-brand hover:underline">
                    {x.business ?? "Desocupado"}
                  </Link>
                  <span className="block text-xs text-muted">{x.code}</span>
                </td>
                <td className={`${td} ${num}`}>{usd(x.amountCents)}</td>
                <td className={`${td} ${num}`}>{x.paid ? usd(x.paid) : "—"}</td>
                <td className={`${td} ${num} font-semibold`}>{x.pending ? usd(x.pending) : "—"}</td>
                <td className={td}>
                  <Badge tone={EXTRA_BADGE[x.status].tone}>{EXTRA_BADGE[x.status].label}</Badge>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    );
  }

  return (
    <Card
      title="Cuotas extra"
      aside={groups.length > 0 && <DownloadLink href={csvHref()} />}
    >
      <p className="mb-3 text-sm text-muted">
        Cada cargo especial que se cobró, con cuántos locales lo pagaron. Un local puede estar al día con una cuota extra y
        deber la cuota mensual, o al revés: cada pago se aplica a lo que el local eligió al reportarlo.
      </p>
      {groups.length === 0 ? (
        <Empty icon={Layers}>Todavía no se ha cobrado ninguna cuota extra. Se crean en Cobranza → Cargo especial.</Empty>
      ) : (
        <Table
          head={
            <tr>
              <th className={th}>Cuota extra</th>
              <th className={`${th} ${num}`}>Locales</th>
              <th className={`${th} ${num}`}>Pagaron</th>
              <th className={`${th} ${num}`}>Deben</th>
              <th className={`${th} ${num}`}>Recaudado</th>
            </tr>
          }
        >
          {groups.map((x) => (
            <tr key={x.id}>
              <td className={td}>
                <Link href={detailHref(x.id)} className="font-medium text-brand hover:underline">
                  {x.concept}
                </Link>
                <span className="block text-xs text-muted">
                  {periodLabel(x.period)} · {usd(x.rows[0]?.amountCents ?? 0)} por local
                  {x.rows.length === 1 && ` · ${x.rows[0].business ?? x.rows[0].code}`}
                </span>
              </td>
              <td className={`${td} ${num}`}>{x.rows.length}</td>
              <td className={`${td} ${num}`}>{x.paidCount}</td>
              <td className={`${td} ${num}`}>{x.pendingCount + x.partialCount}</td>
              <td className={`${td} ${num}`}>
                {usd(x.collected)}
                <span className="block text-xs text-muted">de {usd(x.charged)}</span>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function ResultsTab({ period, csvHref }: { period: string; csvHref: string }) {
  const { rows, categories } = incomeExpensesReport(period);
  const month = rows[0];
  const spent = categories.reduce((n, c) => n + c.total, 0);
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
        <Stat icon={TrendingUp} label="Ingresos" value={usd(month.income)} hint="Pagos aprobados" />
        <Stat icon={Wallet} label="Gastos" value={usd(month.expenses)} hint="Fijos y eventuales" />
        <Stat icon={Coins} label="Aportes y descuentos" value={usd(month.discounts)} hint="Hotel, feria, alquileres" />
        <Stat icon={Scale} label="Resultado" value={usd(month.result)} tone={month.result < 0 ? "bad" : "good"} hint="Ingresos y aportes menos gastos" />
      </div>
      <div className="grid gap-5 @3xl:grid-cols-5">
        <Card title="Últimos 12 meses" className="@3xl:col-span-3" aside={<DownloadLink href={csvHref} />}>
          <Table
            head={
              <tr>
                <th className={th}>Mes</th>
                <th className={`${th} ${num}`}>Ingresos</th>
                <th className={`${th} ${num}`}>Aportes</th>
                <th className={`${th} ${num}`}>Gastos</th>
                <th className={`${th} ${num}`}>Resultado</th>
              </tr>
            }
          >
            {rows.map((r) => (
              <tr key={r.period}>
                <td className={td}>{periodLabel(r.period)}</td>
                <td className={`${td} ${num}`}>{usd(r.income)}</td>
                <td className={`${td} ${num}`}>{r.discounts ? usd(r.discounts) : "—"}</td>
                <td className={`${td} ${num}`}>{usd(r.expenses)}</td>
                <td className={`${td} ${num} font-semibold ${r.result < 0 ? "text-clay" : ""}`}>{usd(r.result)}</td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title={`Gastos de ${periodLabel(period).toLowerCase()} por categoría`} className="@3xl:col-span-2">
          {categories.length === 0 ? (
            <Empty icon={Wallet}>Sin gastos este mes.</Empty>
          ) : (
            <ul className="space-y-2.5">
              {categories.map((c) => (
                <li key={c.category} className="flex justify-between gap-3 text-sm">
                  <span>{c.category}</span>
                  <span className="tabular-nums text-muted">
                    {usd(c.total)} · {Math.round((c.total / spent) * 100)} %
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-3 border-t border-line pt-2.5 text-sm font-semibold">
                <span>Total</span>
                <span className="tabular-nums">{usd(spent)}</span>
              </li>
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
