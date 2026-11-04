import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck, CircleDollarSign, Hourglass, Wallet } from "lucide-react";
import { Badge, Empty, PAYMENT_BADGE, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { paymentsOf, unitBalance, type Payment } from "@/lib/data";
import { METHODS, dateLabel, dayOf, money, periodLabel, rateLabel, today, usd } from "@/lib/format";

export const metadata: Metadata = { title: "Historial de pagos" };

const FILTERS = [
  { key: "", label: "Todos" },
  { key: "aprobado", label: "Aprobados" },
  { key: "pendiente", label: "Por verificar" },
  { key: "rechazado", label: "Rechazados" },
] as const;

/** Todos los pagos de un local. El comerciante ve los suyos; la administración, los del local que indique. */
export default async function PaymentHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ unidad?: string; estado?: string; anio?: string }>;
}) {
  const user = await requireUser("admin", "comerciante");
  const params = await searchParams;
  const isAdmin = user.role === "admin";
  const unitId = isAdmin ? Number(params.unidad) || 0 : user.unitId;
  const unit = unitId ? unitBalance(unitId) : null;
  if (!unit) {
    if (isAdmin) redirect("/cobranza");
    return <Empty>Tu usuario no está asociado a un local. Avisa a la administración.</Empty>;
  }

  const all = paymentsOf(unit.id);
  const years = [...new Set(all.map((p) => p.paidOn.slice(0, 4)))];
  const currentYear = today().slice(0, 4);
  const year = years.includes(params.anio ?? "") ? params.anio! : (years[0] ?? currentYear);
  const status = FILTERS.some((f) => f.key === params.estado) ? (params.estado ?? "") : "";

  const ofYear = all.filter((p) => p.paidOn.startsWith(year));
  const shown = ofYear.filter((p) => !status || p.status === status);
  const approved = ofYear.filter((p) => p.status === "aprobado");
  const paidInYear = approved.reduce((n, p) => n + p.usdCents, 0);
  const pending = all.filter((p) => p.status === "pendiente").length;
  const last = all.find((p) => p.status === "aprobado");

  // Agrupa por mes, conservando el orden (más reciente primero).
  const months = new Map<string, Payment[]>();
  for (const p of shown) {
    const month = p.paidOn.slice(0, 7);
    months.set(month, [...(months.get(month) ?? []), p]);
  }

  const link = (next: { estado?: string; anio?: string }) => {
    const query = new URLSearchParams();
    if (isAdmin) query.set("unidad", String(unit.id));
    const anio = next.anio ?? year;
    const estado = next.estado ?? status;
    if (anio !== (years[0] ?? currentYear)) query.set("anio", anio);
    if (estado) query.set("estado", estado);
    const text = query.toString();
    return `/cobranza/historial${text ? `?${text}` : ""}`;
  };
  const chip = (active: boolean) =>
    `flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors ${
      active ? "bg-ink text-white" : "bg-paper text-muted shadow-card hover:text-ink"
    }`;

  return (
    <>
      <PageHeader
        title="Historial de pagos"
        subtitle={
          <Link href={isAdmin ? `/cobranza/${unit.id}` : "/cobranza"} className="text-brand hover:underline">
            ← {isAdmin ? `${unit.business ?? "Local desocupado"} · ${unit.code}` : "Volver a mi cuenta"}
          </Link>
        }
      />

      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-3">
          <Stat
            icon={CircleDollarSign}
            label={`Pagado en ${year}`}
            value={usd(paidInYear)}
            hint={approved.length === 1 ? "1 pago aprobado" : `${approved.length} pagos aprobados`}
          />
          <Stat
            icon={CalendarCheck}
            label="Último pago aprobado"
            value={last ? usd(last.usdCents) : "—"}
            hint={last ? dateLabel(last.paidOn) : "Aún no hay ninguno"}
          />
          <div className="col-span-2 @3xl:col-span-1">
            <Stat
              icon={Hourglass}
              label="Por verificar"
              value={pending}
              hint={pending ? "La administración los está revisando" : "Nada pendiente"}
            />
          </div>
        </div>

        <nav aria-label="Filtros" className="grid gap-2">
          {years.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {years.map((y) => (
                <Link key={y} href={link({ anio: y })} aria-current={y === year ? "true" : undefined} className={chip(y === year)}>
                  {y}
                </Link>
              ))}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={link({ estado: f.key })}
                aria-current={f.key === status ? "true" : undefined}
                className={chip(f.key === status)}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </nav>

        {shown.length === 0 && (
          <Empty icon={Wallet}>
            {all.length === 0 ? "Aún no hay pagos registrados." : "No hay pagos con ese filtro."}
          </Empty>
        )}

        {[...months].map(([month, payments]) => {
          const total = payments.filter((p) => p.status === "aprobado").reduce((n, p) => n + p.usdCents, 0);
          return (
            <section key={month}>
              <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
                <h2 className="font-display text-lg font-bold">{periodLabel(month)}</h2>
                {total > 0 && <span className="text-sm font-semibold tabular-nums text-muted">{usd(total)} aprobados</span>}
              </div>
              <ul className="grid gap-2.5">
                {payments.map((p) => {
                  const inBs = p.currency === "VES";
                  const rejected = p.status === "rechazado";
                  return (
                    <li key={p.id} className={`rounded-3xl bg-paper p-4 shadow-card ${rejected ? "opacity-70" : ""}`}>
                      <div className="flex items-start gap-3">
                        <span
                          className={`grid size-12 shrink-0 place-items-center rounded-2xl text-sm font-bold ${
                            inBs ? "bg-sky-soft text-sky" : "bg-brand-soft text-brand"
                          }`}
                          aria-hidden
                        >
                          {inBs ? "Bs" : "$"}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold leading-snug">{METHODS[p.method]?.label ?? p.method}</p>
                            <p className={`font-display text-lg font-extrabold tabular-nums ${rejected ? "line-through" : ""}`}>
                              {usd(p.usdCents)}
                            </p>
                          </div>
                          <p className="text-sm text-muted">{dateLabel(p.paidOn)}</p>
                          {inBs && (
                            <p className="text-sm tabular-nums text-muted">
                              {money(p.amountCents, "VES")} · tasa {rateLabel(p.rate ?? 0)}
                            </p>
                          )}
                          {p.reference && <p className="break-words text-sm text-muted">Ref. {p.reference}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Badge tone={PAYMENT_BADGE[p.status].tone}>{PAYMENT_BADGE[p.status].label}</Badge>
                            {p.reviewedAt && (
                              <span className="text-xs text-muted">
                                {rejected ? "Rechazado" : "Aprobado"} el {dateLabel(dayOf(p.reviewedAt))}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </>
  );
}
