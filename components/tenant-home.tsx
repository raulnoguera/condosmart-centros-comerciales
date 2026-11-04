import type { ReactNode } from "react";
import Link from "next/link";
import {
  ArrowUpRight, CalendarCheck, ChatCircleDots, ClockCounterClockwise, Truck as TruckFill,
  Wallet as WalletFill, Wrench as WrenchFill,
} from "@phosphor-icons/react/dist/ssr";
import type { Icon as FilledIcon } from "@phosphor-icons/react";
import {
  ArrowRight, CalendarDays, ChevronRight, FileDown, Megaphone, MessageCircle, Pin,
  ReceiptText, Truck, Vote, type LucideIcon,
} from "lucide-react";
import { AlertCard } from "@/components/alert-card";
import { BalanceSummary } from "@/components/billing";
import { PdfButton } from "@/components/pdf-button";
import { Empty } from "@/components/ui";
import { ACCESS_KINDS } from "@/lib/access-kinds";
import type { User } from "@/lib/auth";
import {
  activeAlerts, expensesIn, incomeIn, listPolls, unitBalance, unreadMessages, upcomingReservations, visitsOfUnit,
  type Announcement,
} from "@/lib/data";
import { SLOTS, currentPeriod, dateLabel, longDate, periodLabel, timeAgo, today, usd } from "@/lib/format";
import { can, type Privilege } from "@/lib/privileges";
import type { Rate } from "@/lib/rates";
import { listStatements } from "@/lib/statements";

function Section({ title, href, children }: { title: string; href?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-display text-lg font-bold">{title}</h2>
        {href && (
          <Link href={href} className="text-sm font-medium text-brand hover:underline">
            Ver todo
          </Link>
        )}
      </div>
      <div className="grid gap-2.5">{children}</div>
    </section>
  );
}

/** Color de cada acceso rápido: una tarjeta entera de su color, con relieve (ver .tile en globals.css). */
const TILES = {
  brand: "tile-brand",
  sky: "tile-sky",
  violet: "tile-violet",
  gold: "tile-gold",
  clay: "tile-clay",
  slate: "tile-slate",
};

const TONES = {
  brand: "bg-brand-soft text-brand",
  sky: "bg-sky-soft text-sky",
  violet: "bg-violet-soft text-violet",
  gold: "bg-gold-soft text-gold",
  clay: "bg-clay-soft text-clay",
  slate: "bg-line text-ink",
};
type TileTone = keyof typeof TONES;

/** Tarjeta que se toca entera: icono de color, dos líneas de texto y un detalle a la derecha. */
function RowCard({
  href,
  icon: Icon,
  tone = "brand",
  title,
  detail,
  aside,
}: {
  href: string;
  icon: LucideIcon;
  tone?: TileTone;
  title: ReactNode;
  detail: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="lift flex items-center gap-3 rounded-3xl bg-paper p-4 shadow-card active:scale-[0.99]"
    >
      <span className={`grid size-12 shrink-0 place-items-center rounded-2xl shadow-[inset_0_1px_0_rgb(255_255_255/0.8),inset_0_-2px_0_rgb(0_0_0/0.08)] ${TONES[tone]}`}>
        <Icon className="size-5.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{title}</span>
        <span className="block text-sm text-muted">{detail}</span>
      </span>
      {aside ?? <ChevronRight className="size-5 shrink-0 text-muted" aria-hidden />}
    </Link>
  );
}

export function TenantHome({
  user,
  rate,
  announcements,
}: {
  user: User;
  rate: Rate | null;
  announcements: Announcement[];
}) {
  const unit = user.unitId ? unitBalance(user.unitId) : null;
  if (!unit) return <Empty>Tu usuario no está asociado a un local. Avisa a la administración.</Empty>;

  const visits = visitsOfUnit(unit.id, today()).filter(
    (v) => v.status === "autorizada" || v.status === "adentro" || v.status === "por_aprobar",
  );
  const reservations = upcomingReservations(today(), unit.id);
  const newMessages = unreadMessages(user);
  const openPoll = listPolls(unit.id).find((p) => p.closesOn >= today() && !p.myOptionId);
  const period = currentPeriod();
  const lastStatement = listStatements()[0];

  const allActions: {
    href: string;
    label: string;
    detail: string;
    icon: FilledIcon;
    tone: TileTone;
    /** Permiso que la administración puede suspender; sin él, el acceso siempre se muestra. */
    needs?: Privilege;
  }[] = [
    { href: "/cobranza#reportar", label: "Pagar", detail: "Reporta tu pago", icon: WalletFill, tone: "brand", needs: "pagar" },
    { href: "/cobranza/historial", label: "Mis pagos", detail: "Historial y estado", icon: ClockCounterClockwise, tone: "slate" },
    { href: "/accesos", label: "Accesos", detail: "Proveedores y contratistas", icon: TruckFill, tone: "sky", needs: "accesos" },
    { href: "/reservas", label: "Reservar", detail: "Andén, salón o plaza", icon: CalendarCheck, tone: "violet", needs: "reservar" },
    { href: "/mensajes", label: "Escribir", detail: "Habla con la administración", icon: ChatCircleDots, tone: "gold", needs: "escribir" },
    { href: "/reportes/nuevo", label: "Reportar", detail: "Falla, seguridad o aviso", icon: WrenchFill, tone: "clay", needs: "reportes" },
  ];
  // Solo se muestran las funciones que el local tiene permitidas; las demás
  // desaparecen y las que quedan se reacomodan.
  const actions = allActions.filter((a) => !a.needs || can(user, a.needs));
  const alerts = activeAlerts(user, 3);

  return (
    <div className="grid gap-6">
      <header className="px-1">
        <p className="text-sm text-muted first-letter:uppercase">{longDate()}</p>
        <h1 className="font-display text-[2.25rem] font-extrabold leading-none">Hola, {user.name.split(" ")[0]}</h1>
      </header>

      <BalanceSummary
        unit={unit}
        rate={rate}
        action={
          unit.balance > 0 &&
          can(user, "pagar") && (
            <Link href="/cobranza#reportar" className="btn w-full bg-white text-brand-dark hover:bg-cream">
              Reportar pago <ArrowRight className="size-4" aria-hidden />
            </Link>
          )
        }
      />

      {lastStatement && (
        // El aviso del mes en PDF, a un toque desde el inicio, y el historial al lado.
        <div className="rounded-3xl bg-paper p-4 shadow-card">
          <div className="flex items-center gap-3">
            <span className="tile tile-clay grid size-13 shrink-0 place-items-center rounded-2xl">
              <FileDown className="size-6.5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg font-extrabold leading-tight">Aviso de cobro</span>
              <span className="block text-sm text-muted">
                {periodLabel(lastStatement.period)} · vence el {dateLabel(lastStatement.dueOn)}
              </span>
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <PdfButton
              href={`/cobranza/aviso/pdf?mes=${lastStatement.period}`}
              filename={`aviso-${lastStatement.period}.pdf`}
              className="btn btn-primary"
            >
              <FileDown className="size-4" aria-hidden /> Descargar PDF
            </PdfButton>
            <Link href="/cobranza/avisos" className="btn btn-secondary">
              <ClockCounterClockwise weight="bold" className="size-4" aria-hidden /> Historial
            </Link>
          </div>
        </div>
      )}

      {actions.length > 0 && (
        <nav aria-label="Accesos rápidos" className="grid grid-cols-2 gap-3 [perspective:60rem]">
          {actions.map((a, i) => {
            // Si queda un número impar, la última tarjeta ocupa toda la fila.
            const wide = actions.length % 2 === 1 && i === actions.length - 1;
            return (
              <Link
                key={a.href}
                href={a.href}
                className={`tile tile-card group relative flex gap-3 overflow-hidden rounded-[1.75rem] p-4 ${TILES[a.tone]} ${
                  wide ? "col-span-2 items-center" : "min-h-36 flex-col justify-between"
                }`}
              >
                <span className="pointer-events-none absolute -right-7 -top-9 size-28 rounded-full bg-white/15" aria-hidden />
                <span className="pointer-events-none absolute -bottom-12 -left-8 size-28 rounded-full bg-black/10" aria-hidden />
                <span className="tile-icon relative grid size-13 shrink-0 place-items-center rounded-2xl">
                  <a.icon weight="fill" className="size-7 drop-shadow-sm" aria-hidden />
                </span>
                <span className="relative min-w-0 flex-1">
                  <span className="block font-display text-xl font-extrabold leading-tight tracking-tight">{a.label}</span>
                  <span className="mt-0.5 block text-xs font-medium text-white/85">{a.detail}</span>
                </span>
                <span
                  className={`grid size-8 shrink-0 place-items-center rounded-full bg-white/20 text-white transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 ${
                    wide ? "relative" : "absolute right-3 top-3"
                  }`}
                >
                  <ArrowUpRight weight="bold" className="size-4" aria-hidden />
                </span>
              </Link>
            );
          })}
        </nav>
      )}

      {alerts.length > 0 && (
        <Section title="Reportes abiertos" href="/reportes">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </Section>
      )}

      {(newMessages > 0 || openPoll) && (
        <Section title="Para ti">
          {newMessages > 0 && (
            <RowCard
              tone="gold"
              href="/mensajes"
              icon={MessageCircle}
              title={newMessages === 1 ? "Tienes un mensaje nuevo" : `Tienes ${newMessages} mensajes nuevos`}
              detail="De la administración"
            />
          )}
          {openPoll && (
            <RowCard
              tone="violet"
              href="/comunicados"
              icon={Vote}
              title={openPoll.question}
              detail={`Vota hasta el ${dateLabel(openPoll.closesOn)}`}
            />
          )}
        </Section>
      )}

      {visits.length + reservations.length > 0 && (
        <Section title="Lo que viene">
          {visits.map((v) => (
            <RowCard
              key={`v${v.id}`}
              href="/accesos"
              icon={Truck}
              tone="sky"
              title={v.company ?? v.visitorName}
              detail={
                v.status === "adentro"
                  ? "Ya está adentro"
                  : v.status === "por_aprobar"
                    ? "Contratista · esperando aprobación"
                    : `${ACCESS_KINDS[v.kind].label} · ${dateLabel(v.expectedOn)}`
              }
              aside={
                v.status === "autorizada" && (
                  <span className="rounded-lg bg-cream px-2.5 py-1.5 text-center">
                    <span className="block text-[10px] uppercase tracking-wide text-muted">Código</span>
                    <span className="block font-mono text-sm font-semibold tracking-widest">{v.code}</span>
                  </span>
                )
              }
            />
          ))}
          {reservations.map((r) => (
            <RowCard
              key={`r${r.id}`}
              href="/reservas"
              icon={CalendarDays}
              tone="violet"
              title={r.amenityName}
              detail={`Reserva · ${dateLabel(r.date)} · ${SLOTS[r.slot].split(" · ")[0]}`}
            />
          ))}
        </Section>
      )}

      <Section title="Avisos" href="/comunicados">
        {announcements.length === 0 && <Empty icon={Megaphone}>No hay avisos de la administración.</Empty>}
        {announcements.map((a) => (
          <Link
            key={a.id}
            href="/comunicados"
            className="rounded-3xl bg-paper p-4 shadow-card transition hover:shadow-pop"
          >
            <span className="flex items-start justify-between gap-3">
              <span className="flex items-center gap-1.5 font-semibold leading-snug">
                {a.pinned === 1 && <Pin className="size-4 shrink-0 text-clay" aria-label="Fijado" />}
                {a.title}
              </span>
              <span className="shrink-0 text-xs text-muted">{timeAgo(a.createdAt)}</span>
            </span>
            <span className="mt-1 line-clamp-2 text-sm text-muted">{a.body}</span>
          </Link>
        ))}
      </Section>

      <Section title="Tu centro comercial">
        <RowCard
          href="/gastos"
          icon={ReceiptText}
          title={`Gastos de ${periodLabel(period).split(" ")[0].toLowerCase()}: ${usd(expensesIn(period))}`}
          detail={`Se han recaudado ${usd(incomeIn(period))} este mes`}
        />
      </Section>
    </div>
  );
}
