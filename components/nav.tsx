"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Ellipsis, LogOut } from "lucide-react";
import { Logo } from "@/components/logo";
import { LogoutForm } from "@/components/push-session";
import type { Role } from "@/lib/auth";
import { navFor, shellFor } from "@/lib/nav";

function Count({ n, className }: { n: number; className: string }) {
  if (!n) return null;
  return (
    <span className={className}>
      {n > 9 ? "9+" : n}
      <span className="sr-only"> sin leer</span>
    </span>
  );
}

function Brand({ siteName, detail, dark, logo }: { siteName: string; detail: string; dark?: boolean; logo?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element -- lo sirve la propia app
        <img
          src={`/logo?marca=1&${logo}`}
          alt=""
          className="size-11 shrink-0 rounded-2xl bg-white object-contain p-0.5 shadow-card"
        />
      ) : (
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white shadow-card">
          <Logo className="h-9 w-7" />
        </span>
      )}
      <div className="min-w-0">
        <p className="line-clamp-2 font-display text-base font-extrabold leading-[1.1] tracking-tight">{siteName}</p>
        <p className={`truncate text-xs ${dark ? "text-white/60" : "text-muted"}`}>{detail}</p>
      </div>
    </div>
  );
}

export function Nav({
  role,
  userName,
  detail,
  siteName,
  logo,
  rateLabel,
  badges,
}: {
  role: Role;
  userName: string;
  detail: string;
  siteName: string;
  /** Archivo del logo del centro comercial; vacío si no se ha cargado. */
  logo: string;
  /** Tasa BCV ya formateada, o null si no hay ninguna cargada. */
  rateLabel: string | null;
  /** Pendientes por sección, p. ej. { "/cobranza": 2 }. */
  badges: Record<string, number>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const app = shellFor(role) === "app";
  const { all, primary, more } = navFor(role);
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  const moreActive = pathname.startsWith("/mas") || more.some((i) => isActive(i.href));
  const moreBadge = more.reduce((n, i) => n + (badges[i.href] ?? 0), 0);
  const unread = badges["/notificaciones"] ?? 0;
  const home = role === "vigilante" ? "/accesos" : "/";

  const rate = rateLabel && (
    <span className="rounded-full bg-paper px-3 py-1.5 text-xs font-semibold tabular-nums text-ink shadow-card">
      <span className="font-medium text-muted">BCV</span> {rateLabel}
    </span>
  );

  return (
    <>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-paper focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:shadow-pop"
      >
        Saltar al contenido
      </a>

      {/* Formato escritorio (administración): barra lateral oscura */}
      {!app && (
        <aside className="sidebar fixed inset-y-3 left-3 hidden w-[15.25rem] flex-col rounded-[2rem] px-3 py-5 shadow-pop lg:flex">
          <div className="px-2">
            <Brand siteName={siteName} detail="Centro comercial" dark logo={logo} />
          </div>
          <nav aria-label="Principal" className="mt-7 flex flex-1 flex-col gap-1">
            {[...all.filter((i) => i.href !== "/perfil"), { href: "/notificaciones", label: "Notificaciones", icon: Bell }].map(
              (item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm transition ${
                      active
                        ? "tile tile-brand font-semibold"
                        : "font-medium text-white/65 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <item.icon className="size-5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                    {item.label}
                    <Count
                      n={badges[item.href] ?? 0}
                      className="ml-auto min-w-5 rounded-full bg-clay px-1.5 text-center text-xs font-bold leading-5 text-white shadow-[0_0_0_2px_rgb(255_255_255/0.2)]"
                    />
                  </Link>
                );
              },
            )}
          </nav>
          <div className="mb-3 px-2">{rate}</div>
          <Link
            href="/perfil"
            aria-current={isActive("/perfil") ? "page" : undefined}
            className="flex items-center gap-3 rounded-2xl px-2 py-2 transition-colors hover:bg-white/10"
          >
            <span className="tile tile-pink grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold">
              {userName.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold">{userName}</span>
              <span className="block truncate text-xs text-white/60">{detail}</span>
            </span>
          </Link>
          <LogoutForm className="mt-2 border-t border-white/15 pt-2">
            <button className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-white/65 transition-colors hover:bg-white/10 hover:text-white">
              <LogOut className="size-4" aria-hidden /> Cerrar sesión
            </button>
          </LogoutForm>
        </aside>
      )}

      {/* Formato teléfono: barra superior y barra inferior flotante. Ninguna es "fija" a la
          pantalla: están fuera de la zona que se desplaza (ver Scroller), así que no se mueven. */}
      <header
        className={`relative z-20 flex shrink-0 items-center justify-between gap-2 bg-cream/70 px-4 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] backdrop-blur-xl ${
          app ? "" : "lg:hidden"
        }`}
      >
        <Brand siteName={siteName} detail={detail} logo={logo} />
        <div className="flex shrink-0 items-center gap-2">
          {rate}
          {isActive("/notificaciones") ? (
            // Con las notificaciones abiertas, la campana las cierra y vuelve a donde estabas.
            <button
              type="button"
              aria-label="Cerrar notificaciones"
              aria-pressed="true"
              onClick={() => (window.history.length > 1 ? router.back() : router.push(home))}
              className="tile tile-brand relative grid size-11 cursor-pointer place-items-center rounded-full"
            >
              <Bell className="size-5" fill="currentColor" aria-hidden />
            </button>
          ) : (
            <Link
              href="/notificaciones"
              aria-label="Notificaciones"
              className="relative grid size-11 place-items-center rounded-full bg-paper text-ink shadow-card transition-colors hover:text-brand"
            >
              <Bell className="size-5" aria-hidden />
              <Count
                n={unread}
                className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-clay px-1 text-center text-[11px] font-bold leading-5 text-white ring-2 ring-cream"
              />
            </Link>
          )}
        </div>
      </header>
      <nav
        aria-label="Principal"
        className={`absolute bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-20 flex rounded-full border border-white/70 bg-paper/80 p-1.5 shadow-pop backdrop-blur-xl ${
          app ? "left-1/2 w-[calc(100%-1.5rem)] max-w-[26.5rem] -translate-x-1/2" : "inset-x-3 mx-auto max-w-lg lg:hidden"
        }`}
      >
        {[...primary, { href: "/mas", label: "Más", icon: Ellipsis }].map((item) => {
          const active = item.href === "/mas" ? moreActive : isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-13 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-full text-xs transition-colors ${
                active ? "tile tile-brand font-semibold" : "font-medium text-muted hover:text-ink"
              }`}
            >
              <span className="relative">
                <item.icon className="size-5.5" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                <Count
                  n={item.href === "/mas" ? moreBadge : (badges[item.href] ?? 0)}
                  className="absolute -right-2.5 -top-1.5 min-w-4 rounded-full bg-clay px-1 text-center text-[10px] font-bold leading-4 text-white ring-2 ring-paper"
                />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
