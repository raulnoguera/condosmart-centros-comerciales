// Cómo se reparten los pagos de un local entre lo que se le cobró. Sin acceso a la
// base: recibe los cargos y los pagos y devuelve lo que queda pendiente de cada uno.

export type AllocCharge = { id: number; kind: "condominio" | "canon" | "especial"; amountCents: number };

/**
 * A qué se aplica un pago. null: a lo más antiguo. "mensual": a las cuotas de
 * condominio y al canon, de la más antigua a la más nueva. "cargo": a un cargo
 * especial (una cuota extra) en particular.
 */
export type AppliesTo = "mensual" | "cargo" | null;

export type AllocPayment = { id: number; usdCents: number; appliesTo: AppliesTo; chargeId: number | null };

export type Settlement = {
  /** Lo que falta por pagar de cada cargo, por id. */
  pending: Map<number, number>;
  /** Saldo a favor: lo pagado que no cubre ningún cargo. */
  credit: number;
  /** Cuánto cubrió cada pago de cada cargo: pago → (cargo → centavos). */
  applied: Map<number, Map<number, number>>;
};

/**
 * Reparte los pagos entre los cargos. Primero cada pago cubre aquello a lo que se
 * destinó; lo que sobra, y los pagos sin destino, cubren lo más antiguo. Así un local
 * puede estar al día con una cuota extra y deber la cuota mensual, o al revés.
 * `charges` va del más antiguo al más nuevo; `payments`, en el orden en que se hicieron.
 */
export function settle(charges: AllocCharge[], payments: AllocPayment[]): Settlement {
  const pending = new Map(charges.map((c) => [c.id, c.amountCents]));
  const applied = new Map<number, Map<number, number>>();

  const take = (paymentId: number, list: AllocCharge[], cents: number): number => {
    for (const c of list) {
      if (cents <= 0) break;
      const owed = pending.get(c.id) ?? 0;
      if (owed <= 0) continue;
      const part = Math.min(owed, cents);
      pending.set(c.id, owed - part);
      cents -= part;
      const row = applied.get(paymentId) ?? new Map<number, number>();
      row.set(c.id, (row.get(c.id) ?? 0) + part);
      applied.set(paymentId, row);
    }
    return cents;
  };

  const monthly = charges.filter((c) => c.kind !== "especial");
  const leftovers: { id: number; cents: number }[] = [];
  for (const p of payments) {
    let cents = p.usdCents;
    if (p.appliesTo === "cargo" && p.chargeId) {
      const target = charges.find((c) => c.id === p.chargeId);
      if (target) cents = take(p.id, [target], cents);
    } else if (p.appliesTo === "mensual") {
      cents = take(p.id, monthly, cents);
    }
    leftovers.push({ id: p.id, cents });
  }
  let credit = 0;
  for (const l of leftovers) credit += take(l.id, charges, l.cents);
  return { pending, credit, applied };
}

/** Lo pendiente de un local, separado en cuota mensual (condominio y canon) y cuotas extra. */
export function splitPending(charges: AllocCharge[], s: Settlement) {
  let monthly = 0;
  let extra = 0;
  for (const c of charges) {
    const owed = s.pending.get(c.id) ?? 0;
    if (c.kind === "especial") extra += owed;
    else monthly += owed;
  }
  return { monthly, extra };
}

/** Valor del campo "¿Qué pagas?" del formulario: "auto", "mensual" o "cargo:<id>". */
export function parseTarget(raw: string): { appliesTo: AppliesTo; chargeId: number | null } {
  if (raw === "mensual") return { appliesTo: "mensual", chargeId: null };
  const m = /^cargo:(\d+)$/.exec(raw);
  if (m) return { appliesTo: "cargo", chargeId: Number(m[1]) };
  return { appliesTo: null, chargeId: null };
}

export function targetValue(appliesTo: AppliesTo, chargeId: number | null): string {
  if (appliesTo === "mensual") return "mensual";
  if (appliesTo === "cargo" && chargeId) return `cargo:${chargeId}`;
  return "auto";
}

/** A qué destinó el local un pago, en pocas palabras. */
export function appliesLabel(p: { appliesTo: AppliesTo; chargeConcept: string | null }): string {
  if (p.appliesTo === "mensual") return "Cuota mensual";
  if (p.appliesTo === "cargo") return p.chargeConcept ?? "Cuota extra";
  return "Lo más antiguo";
}
