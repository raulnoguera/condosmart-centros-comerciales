import Link from "next/link";
import { HandCoins, HardHat, Megaphone, PiggyBank, TriangleAlert, TrendingUp } from "lucide-react";
import { AlertCard } from "@/components/alert-card";
import { PendingPayments, RateNote } from "@/components/billing";
import { TenantHome } from "@/components/tenant-home";
import { Badge, Card, Empty, PageHeader, STANDING_BADGE, Stat } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  accessesToApprove, activeAlerts, cashBalance, chargedIn, incomeIn, listAnnouncements, pendingPayments, standing,
  unitBalances, type Announcement,
} from "@/lib/data";
import { currentPeriod, periodLabel, today, usd } from "@/lib/format";
import { currentRate, type Rate } from "@/lib/rates";
import { listStatements } from "@/lib/statements";

export default async function HomePage() {
  const user = await requireUser("admin", "comerciante");
  const rate = await currentRate();
  const announcements = listAnnouncements(user, 3);
  return user.role === "admin" ? (
    <AdminHome rate={rate} announcements={announcements} />
  ) : (
    <TenantHome user={user} rate={rate} announcements={announcements} />
  );
}

type HomeProps = { rate: Rate | null; announcements: Announcement[] };

function Announcements({ items }: { items: Announcement[] }) {
  return (
    <Card
      title="Avisos de la administración"
      aside={
        <Link href="/comunicados" className="text-sm font-medium text-brand hover:underline">
          Ver todos
        </Link>
      }
    >
      {items.length === 0 && <Empty icon={Megaphone}>No hay avisos.</Empty>}
      <ul className="space-y-4">
        {items.map((a) => (
          <li key={a.id}>
            <p className="font-semibold">{a.title}</p>
            <p className="line-clamp-2 text-sm text-muted">{a.body}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function AdminHome({ rate, announcements }: HomeProps) {
  const period = currentPeriod();
  const units = unitBalances();
  const debtors = units.filter((u) => u.balance > 0).sort((a, b) => b.balance - a.balance);
  const receivable = debtors.reduce((n, u) => n + u.balance, 0);
  const late = debtors.filter((u) => standing(u) === "moroso");
  // Lo que se cobra este mes es el último aviso emitido, que corresponde al mes anterior.
  const charged = chargedIn(listStatements()[0]?.period ?? period);
  const collected = incomeIn(period);
  const pending = pendingPayments();
  const alerts = activeAlerts({ role: "admin", unitId: null, unitLevel: null, unitAisle: null }, 4);
  const toApprove = accessesToApprove(today());
  return (
    <>
      <PageHeader title="Resumen" subtitle={<RateNote rate={rate} />} />
      <div className="grid gap-5">
        <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
          <Stat
            icon={TrendingUp}
            label={`Recaudado en ${periodLabel(period).split(" ")[0].toLowerCase()}`}
            value={usd(collected)}
            progress={charged ? collected / charged : undefined}
            hint={
              charged
                ? `${Math.round((collected / charged) * 100)}% de ${usd(charged)} facturados`
                : "Aún no se emite ningún aviso de cobro"
            }
          />
          <Stat
            icon={HandCoins}
            label="Por cobrar"
            value={usd(receivable)}
            hint={`${debtors.length} locales con saldo`}
          />
          <Stat
            icon={TriangleAlert}
            label="Morosos"
            value={late.length}
            hint="Deben más de un aviso"
            tone={late.length ? "bad" : "good"}
          />
          <Stat icon={PiggyBank} label="Disponible en caja" value={usd(cashBalance())} hint="Cobrado menos gastado" />
        </div>
        <Card title="Pagos por verificar" aside={pending.length > 0 && <Badge tone="warn">{pending.length}</Badge>}>
          <PendingPayments payments={pending} />
        </Card>
        {toApprove.length > 0 && (
          <Link
            href="/accesos"
            className="flex items-center gap-3 rounded-3xl bg-paper p-4 shadow-card transition hover:shadow-pop"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold-soft text-gold">
              <HardHat className="size-5.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold leading-snug">
                {toApprove.length === 1 ? "1 trabajo por aprobar" : `${toApprove.length} trabajos por aprobar`}
              </span>
              <span className="block truncate text-sm text-muted">
                {toApprove.map((v) => v.business ?? v.unitCode).join(" · ")}
              </span>
            </span>
            <span className="text-sm font-medium text-brand">Revisar</span>
          </Link>
        )}
        {alerts.length > 0 && (
          <section>
            <div className="mb-2.5 flex items-baseline justify-between px-1">
              <h2 className="font-display text-lg font-bold">Incidencias abiertas</h2>
              <Link href="/reportes" className="text-sm font-medium text-brand hover:underline">
                Ver todos
              </Link>
            </div>
            <div className="grid gap-2.5 @3xl:grid-cols-2">
              {alerts.map((a) => (
                <AlertCard key={a.id} alert={a} />
              ))}
            </div>
          </section>
        )}
        <div className="grid gap-5 @3xl:grid-cols-2">
          <Card
            title="Mayores saldos"
            aside={
              <Link href="/cobranza" className="text-sm font-medium text-brand hover:underline">
                Ver cobranza
              </Link>
            }
          >
            {debtors.length === 0 && <Empty>Todos los locales están al día.</Empty>}
            <ul className="divide-y divide-line text-sm">
              {debtors.slice(0, 5).map((u) => {
                const badge = STANDING_BADGE[standing(u)];
                return (
                  <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                    <Link href={`/cobranza/${u.id}`} className="hover:text-brand">
                      <strong>{u.business ?? "Local desocupado"}</strong>
                      <span className="block text-xs text-muted">{u.code}</span>
                    </Link>
                    <span className="flex items-center gap-3">
                      <strong className="tabular-nums">{usd(u.balance)}</strong>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
          <Announcements items={announcements} />
        </div>
      </div>
    </>
  );
}
