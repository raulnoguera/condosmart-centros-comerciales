import type { Metadata } from "next";
import {
  Bell, CalendarDays, DoorOpen, Megaphone, MessageCircle, ReceiptText, Siren, Sparkles, Vote,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { markAllNotificationsRead, openNotification } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { PushToggle } from "@/components/push-toggle";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { notificationsOf } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { vapidKeys } from "@/lib/push";

export const metadata: Metadata = { title: "Notificaciones" };

const ICONS: Record<string, LucideIcon> = {
  pago: Wallet,
  cargo: ReceiptText,
  aviso: Megaphone,
  visita: DoorOpen,
  consulta: Vote,
  reserva: CalendarDays,
  mensaje: MessageCircle,
  alerta: Siren,
  sistema: Sparkles,
};

const TONES: Record<string, string> = {
  pago: "bg-brand-soft text-brand",
  cargo: "bg-brand-soft text-brand",
  aviso: "bg-gold-soft text-gold",
  visita: "bg-sky-soft text-sky",
  consulta: "bg-violet-soft text-violet",
  reserva: "bg-violet-soft text-violet",
  mensaje: "bg-gold-soft text-gold",
  alerta: "bg-clay-soft text-clay",
  sistema: "bg-line text-ink",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = notificationsOf(user.id);
  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title="Notificaciones"
        subtitle={unread ? `${unread} sin leer` : "Estás al día"}
      >
        {unread > 0 && (
          <ActionForm action={markAllNotificationsRead} compact>
            <Submit small variant="secondary">
              Marcar todo como leído
            </Submit>
          </ActionForm>
        )}
      </PageHeader>

      <div className="grid gap-4">
        <PushToggle publicKey={vapidKeys().publicKey} />

        {notifications.length === 0 && <Empty icon={Bell}>Aún no tienes notificaciones.</Empty>}
        <ul className="grid gap-2.5">
          {notifications.map((n) => {
            const Icon = ICONS[n.kind] ?? Bell;
            return (
              <li key={n.id}>
                <form action={openNotification}>
                  <input type="hidden" name="id" value={n.id} />
                  <button
                    className={`relative flex w-full cursor-pointer items-start gap-3 rounded-3xl bg-paper p-4 text-left shadow-card transition hover:shadow-pop ${
                      n.readAt ? "opacity-75" : ""
                    }`}
                  >
                    {!n.readAt && <span className="absolute right-4 top-4 size-2.5 rounded-full bg-clay" aria-hidden />}
                    <span
                      className={`grid size-12 shrink-0 place-items-center rounded-2xl ${TONES[n.kind] ?? "bg-cream text-muted"}`}
                    >
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={n.readAt ? "font-medium" : "font-semibold"}>
                          {!n.readAt && <span className="sr-only">Sin leer: </span>}
                          {n.title}
                        </span>
                        <span className={`shrink-0 text-xs text-muted ${n.readAt ? "" : "pr-5"}`}>{timeAgo(n.createdAt)}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-muted">{n.body}</span>
                    </span>
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
