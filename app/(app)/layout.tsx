import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AutoRefresh } from "@/components/auto-refresh";
import { Nav } from "@/components/nav";
import { NotificationAlert } from "@/components/notification-alert";
import { PushSync } from "@/components/push-session";
import { Scroller } from "@/components/scroller";
import { Toaster } from "@/components/toaster";
import { requireUser } from "@/lib/auth";
import { ALERT_KINDS } from "@/lib/alert-kinds";
import {
  getSettings, latestUnreadNotification, pendingPayments, unreadMessages, unreadNotifications, urgentAlert,
} from "@/lib/data";
import { rateLabel, timeAgo } from "@/lib/format";
import { shellFor } from "@/lib/nav";
import { currentRate } from "@/lib/rates";

const ROLE_LABEL = { admin: "Administración", comerciante: "Comerciante", vigilante: "Seguridad" };
const URGENT_HOURS = 12;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const rate = await currentRate();
  const app = shellFor(user.role) === "app";
  const settings = getSettings();
  const badges: Record<string, number> = {
    "/notificaciones": unreadNotifications(user.id),
    "/mensajes": unreadMessages(user),
    "/cobranza": user.role === "admin" ? pendingPayments().length : 0,
  };

  const nav = (
    <Nav
      role={user.role}
      userName={user.name}
      detail={user.unitBusiness ?? user.unitCode ?? ROLE_LABEL[user.role]}
      siteName={settings.name}
      logo={settings.logoMark || settings.logo}
      rateLabel={rate ? rateLabel(rate.bsPerUsd) : null}
      badges={badges}
    />
  );

  // Un reporte de seguridad o emergencia reciente se ve en todas las pantallas.
  const urgent = urgentAlert(user, new Date(Date.now() - URGENT_HOURS * 3_600_000).toISOString());
  const UrgentIcon = urgent ? ALERT_KINDS[urgent.kind].icon : null;
  const banner = urgent && UrgentIcon && (
    <Link
      href={`/reportes/${urgent.id}`}
      className="mx-4 mt-1 flex items-center gap-3 rounded-2xl bg-clay px-4 py-3 text-sm text-white shadow-card transition-opacity hover:opacity-90 lg:mx-8 lg:mt-6"
    >
      <UrgentIcon className="size-5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-white/80">
          Reporte de {ALERT_KINDS[urgent.kind].label.toLowerCase()} · {urgent.author} · {timeAgo(urgent.createdAt)}
        </span>
        <span className="block truncate font-semibold">{urgent.title}</span>
      </span>
      <ChevronRight className="size-5 shrink-0" aria-hidden />
    </Link>
  );

  return (
    <Toaster>
      <AutoRefresh seconds={15} />
      <NotificationAlert latest={latestUnreadNotification(user.id)} />
      <PushSync />
      {app ? (
        // Formato teléfono: una columna angosta también en pantallas grandes. La
        // columna mide lo que la pantalla y no se desplaza; solo lo hace el contenido,
        // entre la barra de arriba y la de abajo, que así no pueden moverse. El
        // recorte es "clip" y no "hidden": una caja "hidden" aún se desplaza por
        // código, y un enlace a una sección (#reportar) arrastraría las barras.
        <div className="h-dvh overflow-hidden bg-line [--bottom-bar:6.5rem] supports-[overflow:clip]:overflow-clip">
          <div className="bg-mesh relative mx-auto flex h-full max-w-md flex-col shadow-pop">
            {nav}
            <Scroller>
              {banner}
              <main id="contenido" className="@container px-4 pb-32 pt-3">
                {children}
              </main>
            </Scroller>
          </div>
        </div>
      ) : (
        <div className="relative flex h-dvh flex-col overflow-hidden [--bottom-bar:6.5rem] supports-[overflow:clip]:overflow-clip lg:[--bottom-bar:1.5rem]">
          {nav}
          <Scroller className="lg:pl-[16.75rem]">
            <main id="contenido">
              {banner}
              <div className="@container mx-auto max-w-5xl px-4 pb-32 pt-3 lg:px-8 lg:pb-12 lg:pt-10">{children}</div>
            </main>
          </Scroller>
        </div>
      )}
    </Toaster>
  );
}
