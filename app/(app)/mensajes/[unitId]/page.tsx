import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Thread } from "@/components/thread";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { unitBalance } from "@/lib/data";

export const metadata: Metadata = { title: "Conversación" };

export default async function UnitThreadPage({ params }: { params: Promise<{ unitId: string }> }) {
  await requireUser("admin");
  const unit = unitBalance(Number((await params).unitId) || 0);
  if (!unit) notFound();
  return (
    <>
      <PageHeader
        title={unit.business ?? unit.code}
        subtitle={
          <>
            {unit.code} ·{" "}
            <Link href="/mensajes" className="text-brand hover:underline">
              Todas las conversaciones
            </Link>
          </>
        }
      />
      <div className="max-w-2xl">
        <Thread unitId={unit.id} asAdmin />
      </div>
    </>
  );
}
