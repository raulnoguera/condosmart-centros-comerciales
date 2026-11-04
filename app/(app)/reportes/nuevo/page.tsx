import type { Metadata } from "next";
import Link from "next/link";
import { AlertForm } from "@/components/alert-form";
import { PageHeader, Suspended } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/privileges";

export const metadata: Metadata = { title: "Nuevo reporte" };

export default async function NewAlertPage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader
        title="Nuevo reporte"
        subtitle={
          <Link href="/reportes" className="text-brand hover:underline">
            ← Volver a reportes
          </Link>
        }
      />
      <div className="max-w-xl">
        {can(user, "reportes") ? (
          <AlertForm level={user.unitLevel} aisle={user.unitAisle} />
        ) : (
          <Suspended privilege="reportes" />
        )}
      </div>
    </>
  );
}
