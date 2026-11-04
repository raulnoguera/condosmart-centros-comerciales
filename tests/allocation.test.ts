// Reparto de pagos entre la cuota mensual y las cuotas extra (lib/allocation.ts).
// Se corre con `npm test` (Node 24 ejecuta TypeScript sin compilar).
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTarget, settle, splitPending, targetValue, type AllocCharge, type AllocPayment } from "../lib/allocation.ts";

const charges: AllocCharge[] = [
  { id: 1, kind: "condominio", amountCents: 10000 }, // septiembre
  { id: 2, kind: "condominio", amountCents: 9000 }, // octubre
  { id: 3, kind: "especial", amountCents: 5000 }, // cuota extra
];

const run = (payments: AllocPayment[]) => {
  const s = settle(charges, payments);
  return { ...splitPending(charges, s), credit: s.credit, s };
};

test("pagar solo la cuota extra deja debiendo la mensual", () => {
  const r = run([{ id: 10, usdCents: 5000, appliesTo: "cargo", chargeId: 3 }]);
  assert.deepEqual([r.monthly, r.extra, r.credit], [19000, 0, 0]);
});

test("pagar la mensual deja pendiente la cuota extra", () => {
  const r = run([{ id: 10, usdCents: 19000, appliesTo: "mensual", chargeId: null }]);
  assert.deepEqual([r.monthly, r.extra], [0, 5000]);
});

test("sin destino, el pago cubre lo más antiguo", () => {
  const r = run([{ id: 10, usdCents: 12000, appliesTo: null, chargeId: null }]);
  assert.deepEqual([r.s.pending.get(1), r.s.pending.get(2), r.s.pending.get(3)], [0, 7000, 5000]);
});

test("lo que sobra de la cuota extra va a lo más antiguo", () => {
  const r = run([{ id: 10, usdCents: 7000, appliesTo: "cargo", chargeId: 3 }]);
  assert.deepEqual([r.s.pending.get(1), r.s.pending.get(3)], [8000, 0]);
  assert.deepEqual([...r.s.applied.get(10)!], [[3, 5000], [1, 2000]]);
});

test("un destino ya cubierto no se cobra dos veces", () => {
  const r = run([
    { id: 9, usdCents: 24000, appliesTo: null, chargeId: null },
    { id: 10, usdCents: 5000, appliesTo: "cargo", chargeId: 3 },
  ]);
  assert.deepEqual([r.monthly, r.extra, r.credit], [0, 0, 5000]);
});

test("lo pagado de más queda como saldo a favor", () => {
  const r = run([{ id: 10, usdCents: 30000, appliesTo: "mensual", chargeId: null }]);
  assert.deepEqual([r.monthly, r.extra, r.credit], [0, 0, 6000]);
});

test("el campo «¿Qué pagas?» ida y vuelta", () => {
  assert.deepEqual(parseTarget("auto"), { appliesTo: null, chargeId: null });
  assert.deepEqual(parseTarget("mensual"), { appliesTo: "mensual", chargeId: null });
  assert.deepEqual(parseTarget("cargo:42"), { appliesTo: "cargo", chargeId: 42 });
  assert.equal(targetValue("cargo", 42), "cargo:42");
  assert.equal(targetValue(null, null), "auto");
});
