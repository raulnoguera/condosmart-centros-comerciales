import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BalanceSummary, StatementCard, Statement } from "@/components/billing";
import { PaymentForm } from "@/components/payment-form";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { paymentTargets, unitBalance } from "@/lib/data";
import { today } from "@/lib/format";
import { currentRate } from "@/lib/rates";

export const metadata: Metadata = { title: "Estado de cuenta" };

export default async function UnitStatementPage({ params }: { params: Promise<{ unitId: string }> }) {
  await requireUser("admin");
  const unit = unitBalance(Number((await params).unitId) || 0);
  if (!unit) notFound();
  const rate = await currentRate();
  return (
    <>
      <PageHeader
        title={unit.code}
        subtitle={
          <Link href="/cobranza" className="text-brand hover:underline">
            ← Volver a cobranza
          </Link>
        }
      />
      <div className="grid gap-5">
        <BalanceSummary unit={unit} rate={rate} />
        <Card title="Registrar un pago de este local">
          <PaymentForm
            unitId={unit.id}
            balanceCents={unit.balance}
            targets={paymentTargets(unit.id)}
            rate={rate?.bsPerUsd ?? null}
            today={today()}
          />
        </Card>
        <StatementCard unit={unit} asAdmin />
        <Statement unitId={unit.id} historyHref={`/cobranza/historial?unidad=${unit.id}`} />
      </div>
    </>
  );
}
