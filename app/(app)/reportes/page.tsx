import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Siren } from "lucide-react";
import { AlertCard } from "@/components/alert-card";
import { Empty, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listAlerts } from "@/lib/data";
import { can } from "@/lib/privileges";

export const metadata: Metadata = { title: "Reportes" };

export default async function AlertsPage() {
  const user = await requireUser();
  const alerts = listAlerts(user);
  const active = alerts.filter((a) => a.status !== "resuelta");
  const resolved = alerts.filter((a) => a.status === "resuelta");

  return (
    <>
      <PageHeader
        title={user.role === "admin" ? "Incidencias" : "Reportes"}
        subtitle={
          user.role === "comerciante"
            ? "Tus reportes y los avisos de seguridad de los demás locales."
            : "Fallas, incidentes de seguridad y avisos de los locales."
        }
      >
        {can(user, "reportes") && (
          <Link href="/reportes/nuevo" className="btn btn-primary">
            <Plus className="size-4" aria-hidden /> Nuevo reporte
          </Link>
        )}
      </PageHeader>

      <div className="grid gap-6">
        <section className="grid gap-2.5">
          {active.length === 0 && <Empty icon={Siren}>No hay reportes abiertos. Todo en orden.</Empty>}
          {active.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </section>
        {resolved.length > 0 && (
          <section className="grid gap-2.5">
            <h2 className="px-1 text-xs font-medium uppercase tracking-wide text-muted">Resueltos</h2>
            {resolved.map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </section>
        )}
      </div>
    </>
  );
}
