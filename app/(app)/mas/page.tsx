import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, LogOut } from "lucide-react";
import { LogoutForm } from "@/components/push-session";
import { PageHeader } from "@/components/ui";
import { UpdateButton } from "@/components/update-watcher";
import { requireUser } from "@/lib/auth";
import { unreadMessages } from "@/lib/data";
import { navFor } from "@/lib/nav";

export const metadata: Metadata = { title: "Más" };

/** Destinos que no caben en la barra inferior del teléfono. */
export default async function MorePage() {
  const user = await requireUser();
  const { more } = navFor(user.role);
  const counts: Record<string, number> = { "/mensajes": unreadMessages(user) };
  return (
    <>
      <PageHeader title="Más" subtitle={user.name} />
      <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-paper shadow-card">
        {more.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex min-h-14 items-center gap-3 px-4 font-medium transition-colors hover:bg-cream/60"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">
                <item.icon className="size-5" aria-hidden />
              </span>
              {item.label}
              {counts[item.href] > 0 && (
                <span className="ml-auto min-w-6 rounded-full bg-clay px-1.5 text-center text-xs font-bold leading-6 text-white">
                  {counts[item.href]}
                  <span className="sr-only"> sin leer</span>
                </span>
              )}
              <ChevronRight className={`size-5 text-muted ${counts[item.href] > 0 ? "" : "ml-auto"}`} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <UpdateButton className="btn btn-secondary w-full" />
      </div>
      <LogoutForm className="mt-3">
        <button className="btn btn-secondary w-full text-clay">
          <LogOut className="size-4" aria-hidden /> Cerrar sesión
        </button>
      </LogoutForm>
    </>
  );
}
