import type { AppliesTo } from "./allocation";
import { settleUnit, type Charge } from "./data";
import { periodLabel, usd } from "./format";

type Part = { charge: Charge; cents: number; remaining: number };

const NEW_PAYMENT = -1;

/**
 * Cómo se reparte un pago de `cents` entre lo que el local debe, con la misma regla
 * del saldo: primero aquello a lo que se destinó, luego lo más antiguo. `excludeId`
 * deja fuera de la cuenta ese pago, para describir uno que ya quedó aprobado.
 */
function allocate(
  unitId: number, cents: number, target: { appliesTo: AppliesTo; chargeId: number | null }, excludeId = 0,
): { parts: Part[]; credit: number } {
  const { charges, settlement } = settleUnit(
    unitId, { id: NEW_PAYMENT, usdCents: cents, ...target }, excludeId,
  );
  const applied = settlement.applied.get(NEW_PAYMENT) ?? new Map<number, number>();
  const parts = charges
    .filter((c) => applied.has(c.id))
    .map((charge) => ({ charge, cents: applied.get(charge.id)!, remaining: settlement.pending.get(charge.id) ?? 0 }));
  const used = parts.reduce((n, p) => n + p.cents, 0);
  return { parts, credit: cents - used };
}

/** "la cuota de condominio de octubre de 2026", "«Multa por ruido» (cobro aparte)". */
function chargeName({ kind, concept, period }: Charge): string {
  const month = periodLabel(period).toLowerCase();
  if (kind === "condominio") return `la cuota de condominio de ${month}`;
  if (kind === "canon") return `el canon de arrendamiento de ${month}`;
  return `«${concept}» (cobro aparte de ${month})`;
}

function partText(p: Part, single: boolean): string {
  const owedNote = p.remaining > 0 ? ` (quedan ${usd(p.remaining)} por pagar)` : "";
  return single ? `${chargeName(p.charge)}${owedNote}` : `${usd(p.cents)} de ${chargeName(p.charge)}${owedNote}`;
}

function list(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} y ${items.at(-1)}`;
}

/** A qué se aplica el pago: "por la cuota de condominio de octubre de 2026. Quedan $5,00 a tu favor." */
export function paymentDetail(
  unitId: number, cents: number, target: { appliesTo: AppliesTo; chargeId: number | null },
  excludeId = 0, forAdmin = false,
): string {
  const { parts, credit } = allocate(unitId, cents, target, excludeId);
  const single = parts.length === 1 && credit === 0;
  const lead = forAdmin ? "para pagar" : "por";
  const covered = parts.length ? ` ${lead} ${list(parts.map((p) => partText(p, single)))}` : " como saldo a favor";
  const extra = parts.length && credit > 0 ? ` Quedan ${usd(credit)} a ${forAdmin ? "favor del local" : "tu favor"}.` : "";
  return `${covered}.${extra}`;
}
