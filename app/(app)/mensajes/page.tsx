import type { Metadata } from "next";
import Link from "next/link";
import { Thread } from "@/components/thread";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listThreads } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { can } from "@/lib/privileges";

export const metadata: Metadata = { title: "Mensajes" };

export default async function MessagesPage() {
  const user = await requireUser("admin", "comerciante");

  if (user.role === "comerciante") {
    if (!user.unitId) return <Empty>Tu usuario no está asociado a un local. Avisa a la administración.</Empty>;
    return (
      <>
        <PageHeader title="Mensajes" subtitle="Tu conversación con la administración." />
        <Thread unitId={user.unitId} asAdmin={false} canWrite={can(user, "escribir")} />
      </>
    );
  }

  const threads = listThreads();
  const active = threads.filter((t) => t.lastAt);
  const idle = threads.filter((t) => !t.lastAt);
  return (
    <>
      <PageHeader title="Mensajes" subtitle="Una conversación por local." />
      <div className="grid gap-6">
        {active.length === 0 && <Empty>Ningún local ha escrito todavía.</Empty>}
        <ul className="grid gap-2.5">
          {active.map((t) => (
            <li key={t.unitId}>
              <Link
                href={`/mensajes/${t.unitId}`}
                className={`flex items-center gap-3 rounded-3xl border p-4 shadow-card transition-colors hover:border-brand ${
                  t.unread ? "border-brand/30 bg-brand-soft/60" : "border-line bg-paper"
                }`}
              >
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-brand text-sm font-semibold text-white">
                  {t.number ?? "?"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={t.unread ? "font-semibold" : "font-medium"}>
                      {t.business ?? "Local desocupado"} · {t.unitCode}
                    </span>
                    <span className="shrink-0 text-xs text-muted">{timeAgo(t.lastAt!)}</span>
                  </span>
                  <span className="block truncate text-sm text-muted">
                    {t.lastFromAdmin ? "Tú: " : ""}
                    {t.lastBody}
                  </span>
                </span>
                {t.unread > 0 && (
                  <span className="min-w-6 rounded-full bg-clay px-1.5 text-center text-xs font-bold leading-6 text-white">
                    {t.unread}
                    <span className="sr-only"> sin leer</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
        {idle.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Escribir a otro local</h2>
            <ul className="flex flex-wrap gap-2">
              {idle.map((t) => (
                <li key={t.unitId}>
                  <Link href={`/mensajes/${t.unitId}`} className="btn btn-secondary btn-sm">
                    {t.unitCode}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
