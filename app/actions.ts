"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSession, destroySession, getUser, homeFor, type Role, type User } from "@/lib/auth";
import { cleanAisle, cleanNumber, cleanLevel, unitLabel, type Audience } from "@/lib/address";
import { ACCESS_KINDS, isAccessKind } from "@/lib/access-kinds";
import { ALERT_KINDS, isAlertKind } from "@/lib/alert-kinds";
import { all, get, run, transaction } from "@/lib/db";
import { getSettings, listUnits, residentsOf } from "@/lib/data";
import type { FormState } from "@/lib/form";
import {
  EXPENSE_CATEGORIES, METHODS, SLOTS, currentPeriod, dateLabel, isDate, isPeriod, nowIso,
  parseAmount, parseDecimal, periodLabel, shiftPeriod, timeLabel, today, usd,
} from "@/lib/format";
import { notifyRole, notifyUnit, notifyUsers } from "@/lib/notify";
import { hashPassword, verifyPassword } from "@/lib/password";
import { PRIVILEGES, can, isPrivilege, type Privilege } from "@/lib/privileges";
import { pushSubject, sendPush } from "@/lib/push";
import { deletePhoto, savePhoto } from "@/lib/uploads";
import { currentRate, fetchBcvRate, rateOn, saveRate } from "@/lib/rates";
import { IS_DEMO } from "@/lib/brand";
import { DEMO_ACCOUNTS } from "@/lib/seed";
import { paymentDetail } from "@/lib/payment-text";
import { parseTarget } from "@/lib/allocation";
import { draftLines, statementTotals } from "@/lib/statements";

const fail = (error: string): FormState => ({ error });
const done = (ok: string): FormState => {
  revalidatePath("/", "layout");
  return { ok };
};
const DENIED = fail("No tienes permiso para hacer esto.");
const suspended = (privilege: Privilege) =>
  fail(`La administración suspendió la opción de ${PRIVILEGES[privilege].suspended} para tu local.`);

const text = (data: FormData, key: string, max = 200) =>
  String(data.get(key) ?? "").trim().slice(0, max);
const id = (data: FormData, key: string) => {
  const n = Number(data.get(key));
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Toda acción vuelve a comprobar la sesión: se pueden invocar con un POST directo. */
async function actor(...roles: Role[]): Promise<User | null> {
  const user = await getUser();
  if (!user) return null;
  return roles.length === 0 || roles.includes(user.role) ? user : null;
}

/** Unidad sobre la que actúa: la propia si es comerciante, la del formulario si es la administración. */
function targetUnit(user: User, data: FormData): number | null {
  if (user.role === "comerciante") return user.unitId;
  const unitId = id(data, "unit_id");
  return unitId && get("SELECT 1 FROM units WHERE id = ?", unitId) ? unitId : null;
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Tasa BCV del día indicado; para hoy intenta traer la publicada más reciente. */
async function rateFor(date: string) {
  return date === today() ? currentRate() : (rateOn(date) ?? currentRate());
}

// ───────────────────────── Sesión ─────────────────────────

export async function login(_: FormState, data: FormData): Promise<FormState> {
  const email = text(data, "email").toLowerCase();
  const password = String(data.get("password") ?? "");
  const row = get<{ id: number; password_hash: string; role: Role }>(
    "SELECT id, password_hash, role FROM users WHERE email = ? AND active = 1",
    email,
  );
  if (!row || !verifyPassword(password, row.password_hash)) {
    return fail("Correo o contraseña incorrectos.");
  }
  await createSession(row.id);
  redirect(homeFor(row.role));
}

/**
 * Entrada de un toque con una cuenta de demostración, para que un invitado pruebe
 * la app sin escribir contraseñas. Solo existe en el sitio de demostración.
 */
export async function demoLogin(data: FormData) {
  if (!IS_DEMO) redirect("/login");
  const email = text(data, "email").toLowerCase();
  if (!DEMO_ACCOUNTS.some((a) => a.email === email)) redirect("/login");
  const row = get<{ id: number; role: Role }>(
    "SELECT id, role FROM users WHERE email = ? AND active = 1",
    email,
  );
  if (!row) redirect("/login");
  await createSession(row.id);
  redirect(homeFor(row.role));
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export async function changePassword(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor();
  if (!user) return DENIED;
  const current = String(data.get("current") ?? "");
  const next = String(data.get("next") ?? "");
  const row = get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", user.id);
  if (!row || !verifyPassword(current, row.password_hash)) return fail("La contraseña actual no coincide.");
  if (next.length < 8) return fail("La nueva contraseña debe tener al menos 8 caracteres.");
  run("UPDATE users SET password_hash = ? WHERE id = ?", hashPassword(next), user.id);
  return done("Contraseña actualizada.");
}

// ───────────────────────── Cobranza ─────────────────────────

/**
 * Emite el aviso de cobro de un mes: reparte entre los locales, por alícuota, los
 * gastos cargados (más el fondo de reserva, menos los descuentos) y deja la deuda
 * fijada en dólares a la tasa BCV de hoy.
 */
export async function issueStatement(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const period = text(data, "period");
  const dueOn = text(data, "due_on");
  if (!isPeriod(period) || period > currentPeriod()) return fail("Elige un mes válido.");
  if (!isDate(dueOn) || dueOn < today()) return fail("La fecha de vencimiento no es válida.");
  if (get("SELECT 1 FROM statements WHERE period = ?", period)) {
    return fail(`El aviso de cobro de ${periodLabel(period)} ya fue emitido.`);
  }
  const rate = (await currentRate())?.bsPerUsd;
  if (!rate) return fail("No hay tasa BCV cargada. Regístrala en Administración.");
  const lines = draftLines(period, rate, getSettings().reservePercent);
  if (statementTotals(lines).neto <= 0) return fail("No hay gastos cargados en ese mes para repartir.");

  const now = nowIso();
  let billed = 0;
  transaction(() => {
    run(
      "INSERT INTO statements (period, issued_on, due_on, rate, created_at) VALUES (?, ?, ?, ?, ?)",
      period, today(), dueOn, rate, now,
    );
    for (const l of lines) {
      run(
        "INSERT INTO statement_lines (period, section, code, description, amount_cents, taxable) VALUES (?, ?, ?, ?, ?, ?)",
        period, l.section, l.code, l.description, l.amountCents, l.taxable,
      );
    }
    for (const unit of listUnits()) {
      const bs = statementTotals(lines, unit.aliquot).neto;
      const usdCents = Math.round(bs / rate);
      if (usdCents > 0) {
        run(
          `INSERT INTO charges (unit_id, period, kind, concept, amount_cents, aliquot, bs_cents, created_at)
           VALUES (?, ?, 'condominio', ?, ?, ?, ?, ?)`,
          unit.id, period, `Condominio ${periodLabel(period)}`, usdCents, unit.aliquot, bs, now,
        );
        billed++;
      }
      // El canon lo pagan solo los locales cuyo alquiler cobra la administración.
      if (unit.rentCents > 0) {
        run(
          `INSERT OR IGNORE INTO charges (unit_id, period, kind, concept, amount_cents, created_at)
           VALUES (?, ?, 'canon', ?, ?, ?)`,
          unit.id, period, `Canon de arrendamiento ${periodLabel(period)}`, unit.rentCents, now,
        );
      }
    }
  });
  notifyRole("comerciante", {
    kind: "cargo",
    title: `Aviso de cobro de ${periodLabel(period)}`,
    body: `Ya puedes ver el detalle y descargarlo en PDF. Vence el ${dateLabel(dueOn)}.`,
    href: `/cobranza/aviso?mes=${period}`,
  });
  return done(`Aviso de cobro de ${periodLabel(period)} emitido a ${billed} locales.`);
}

export async function addSpecialCharge(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const concept = text(data, "concept", 120);
  const amount = parseAmount(data.get("amount"));
  const target = text(data, "unit_id");
  if (!concept) return fail("Escribe el concepto del cargo.");
  if (!amount) return fail("Escribe un monto válido en USD.");
  const unitId = target === "all" ? null : id(data, "unit_id");
  if (target !== "all" && !unitId) return fail("Elige a quién se le cobra.");
  const { changes } = run(
    `INSERT INTO charges (unit_id, period, kind, concept, amount_cents, created_at)
     SELECT id, ?, 'especial', ?, ?, ? FROM units WHERE ? IS NULL OR id = ?`,
    currentPeriod(), concept, amount, nowIso(), unitId, unitId,
  );
  const charge = { kind: "cargo", title: "Nuevo cargo", body: `${concept}: ${usd(amount)}`, href: "/cobranza" } as const;
  if (unitId) notifyUnit(unitId, charge);
  else notifyRole("comerciante", charge);
  return done(`Cargo aplicado a ${changes} ${changes === 1 ? "local" : "locales"}.`);
}

/** Destino de un pago leído del formulario; un cargo que no es una cuota extra de ese local se ignora. */
function paymentTarget(data: FormData, unitId: number) {
  const target = parseTarget(text(data, "applies"));
  if (target.appliesTo === "cargo") {
    const ok = get("SELECT 1 FROM charges WHERE id = ? AND unit_id = ? AND kind = 'especial'", target.chargeId, unitId);
    if (!ok) return { appliesTo: null, chargeId: null };
  }
  return target;
}

export async function reportPayment(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin", "comerciante");
  if (!user) return DENIED;
  if (!can(user, "pagar")) return suspended("pagar");
  const unitId = targetUnit(user, data);
  if (!unitId) return fail("Elige el local que paga.");

  const methodKey = text(data, "method");
  const method = METHODS[methodKey];
  if (!method) return fail("Elige la forma de pago.");
  const amount = parseAmount(data.get("amount"));
  if (!amount) return fail("Escribe un monto válido.");
  const paidOn = text(data, "paid_on");
  if (!isDate(paidOn) || paidOn > today()) return fail("La fecha del pago no es válida.");
  const reference = text(data, "reference", 60);
  if (!reference && !methodKey.startsWith("efectivo")) {
    return fail("Escribe el número de referencia del pago.");
  }
  if (
    reference &&
    get(
      "SELECT 1 FROM payments WHERE method = ? AND reference = ? AND status != 'rechazado'",
      methodKey, reference,
    )
  ) {
    return fail("Ya hay un pago registrado con esa referencia.");
  }

  let rate: number | null = null;
  let usdCents = amount;
  if (method.currency === "VES") {
    // Se convierte a la tasa BCV del día en que se hizo el pago.
    rate = (await rateFor(paidOn))?.bsPerUsd ?? null;
    if (!rate) return fail("No hay tasa BCV cargada. Pide a la administración que la registre.");
    usdCents = Math.round(amount / rate);
    if (usdCents <= 0) return fail("El monto es demasiado pequeño.");
  }

  const byAdmin = user.role === "admin";
  const target = paymentTarget(data, unitId);
  // A qué se aplica, calculado antes de guardarlo: los pagos por verificar no cuentan.
  const detail = paymentDetail(unitId, usdCents, target, 0, !byAdmin);
  run(
    `INSERT INTO payments (unit_id, paid_on, method, currency, amount_cents, rate, usd_cents,
       reference, note, status, reported_by, reviewed_by, reviewed_at, created_at, applies_to, charge_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    unitId, paidOn, methodKey, method.currency, amount, rate, usdCents,
    reference || null, text(data, "note") || null,
    byAdmin ? "aprobado" : "pendiente",
    user.id, byAdmin ? user.id : null, byAdmin ? nowIso() : null, nowIso(),
    target.appliesTo, target.chargeId,
  );
  if (byAdmin) {
    notifyUnit(unitId, {
      kind: "pago",
      title: "Pago registrado",
      body: `La administración registró un pago de ${usd(usdCents)} a tu cuenta${detail}`,
      href: "/cobranza",
    });
  } else {
    notifyRole("admin", {
      kind: "pago",
      title: "Pago por verificar",
      body: `${user.unitBusiness ? `${user.unitBusiness} (${user.unitCode})` : user.unitCode} reportó ${usd(usdCents)} (${method.label}${reference ? `, ref. ${reference}` : ""})${detail}`,
      href: "/cobranza",
    });
  }
  return done(
    byAdmin ? "Pago registrado y aplicado." : "Pago reportado. La administración lo verificará pronto.",
  );
}

export async function reviewPayment(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin");
  if (!user) return DENIED;
  const status = data.get("decision") === "approve" ? "aprobado" : "rechazado";
  const paymentId = id(data, "id");
  // Al aprobar, la administración puede corregir a qué se aplica el pago.
  if (status === "aprobado" && paymentId && data.get("applies") !== null) {
    const unit = get<{ unitId: number }>("SELECT unit_id AS unitId FROM payments WHERE id = ? AND status = 'pendiente'", paymentId);
    if (unit) {
      const target = paymentTarget(data, unit.unitId);
      run("UPDATE payments SET applies_to = ?, charge_id = ? WHERE id = ?", target.appliesTo, target.chargeId, paymentId);
    }
  }
  const { changes } = run(
    `UPDATE payments SET status = ?, reviewed_by = ?, reviewed_at = ?
     WHERE id = ? AND status = 'pendiente'`,
    status, user.id, nowIso(), paymentId,
  );
  if (!changes) return fail("Ese pago ya fue revisado.");
  const payment = get<{ unitId: number; usdCents: number; appliesTo: "mensual" | "cargo" | null; chargeId: number | null }>(
    `SELECT unit_id AS unitId, usd_cents AS usdCents, applies_to AS appliesTo, charge_id AS chargeId
     FROM payments WHERE id = ?`,
    paymentId,
  );
  if (payment) {
    notifyUnit(payment.unitId, {
      kind: "pago",
      title: status === "aprobado" ? "Pago aprobado" : "Pago rechazado",
      body:
        status === "aprobado"
          ? `Se abonaron ${usd(payment.usdCents)} a tu cuenta${paymentDetail(payment.unitId, payment.usdCents, payment, paymentId ?? 0)}`
          : `Tu pago de ${usd(payment.usdCents)} no pudo verificarse. Escribe a la administración.`,
      href: "/cobranza",
    });
  }
  return done(status === "aprobado" ? "Pago aprobado." : "Pago rechazado.");
}

// ───────────────────────── Gastos ─────────────────────────

export async function addExpense(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin");
  if (!user) return DENIED;
  const spentOn = text(data, "spent_on");
  const category = text(data, "category");
  const description = text(data, "description");
  const kind = text(data, "kind");
  const currency = data.get("currency") === "VES" ? "VES" : "USD";
  const amount = parseAmount(data.get("amount"));
  if (!isDate(spentOn) || spentOn > today()) return fail("La fecha del gasto no es válida.");
  if (!["fijo", "eventual", "descuento"].includes(kind)) return fail("Elige el tipo de partida.");
  if (!EXPENSE_CATEGORIES.includes(category)) return fail("Elige una categoría.");
  if (monthIssued(spentOn.slice(0, 7))) {
    return fail(`El aviso de cobro de ${periodLabel(spentOn.slice(0, 7))} ya fue emitido: esa partida no entraría en él.`);
  }
  if (!description) return fail("Describe el gasto.");
  if (!amount) return fail("Escribe un monto válido.");

  let rate: number | null = null;
  let usdCents = amount;
  if (currency === "VES") {
    rate = (await rateFor(spentOn))?.bsPerUsd ?? null;
    if (!rate) return fail("No hay tasa BCV cargada para convertir el gasto.");
    usdCents = Math.max(1, Math.round(amount / rate));
  }
  run(
    `INSERT INTO expenses (spent_on, kind, code, taxable, category, description, supplier, currency,
       amount_cents, rate, usd_cents, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    spentOn, kind, text(data, "code", 12).toUpperCase() || null, data.get("taxable") ? 1 : 0, category,
    description, text(data, "supplier") || null, currency, amount, rate, usdCents, user.id, nowIso(),
  );
  return done(kind === "descuento" ? "Descuento registrado." : "Gasto registrado.");
}

const monthIssued = (period: string) => Boolean(get("SELECT 1 FROM statements WHERE period = ?", period));

export async function deleteExpense(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const expense = get<{ spentOn: string }>("SELECT spent_on AS spentOn FROM expenses WHERE id = ?", id(data, "id"));
  if (expense && monthIssued(expense.spentOn.slice(0, 7))) {
    return fail("El aviso de cobro de ese mes ya fue emitido: sus partidas no se pueden borrar.");
  }
  run("DELETE FROM expenses WHERE id = ?", id(data, "id"));
  return done("Partida eliminada.");
}

/** Corrige el monto de una partida ya cargada, mientras su mes no se haya cobrado. */
export async function updateExpenseAmount(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const expense = get<{ spentOn: string; currency: "USD" | "VES" }>(
    "SELECT spent_on AS spentOn, currency FROM expenses WHERE id = ?",
    id(data, "id"),
  );
  const amount = parseAmount(data.get("amount"));
  if (!expense) return fail("Esa partida ya no existe.");
  if (!amount) return fail("Escribe un monto válido.");
  if (monthIssued(expense.spentOn.slice(0, 7))) {
    return fail("El aviso de cobro de ese mes ya fue emitido: sus partidas no se pueden cambiar.");
  }
  let rate: number | null = null;
  let usdCents = amount;
  if (expense.currency === "VES") {
    rate = (await rateFor(expense.spentOn))?.bsPerUsd ?? null;
    if (!rate) return fail("No hay tasa BCV cargada para convertir el monto.");
    usdCents = Math.max(1, Math.round(amount / rate));
  }
  run("UPDATE expenses SET amount_cents = ?, rate = ?, usd_cents = ? WHERE id = ?", amount, rate, usdCents, id(data, "id"));
  return done("Monto actualizado.");
}

// ───────────────────────── Gastos fijos ─────────────────────────

type FixedItem = {
  code: string | null;
  description: string;
  category: string;
  supplier: string | null;
  currency: "USD" | "VES";
  amountCents: number;
  taxable: number;
};

/** Una partida ya está en una lista si coincide su código o, a falta de código, su descripción. */
const sameItem = (a: Pick<FixedItem, "code" | "description">, b: Pick<FixedItem, "code" | "description">) =>
  a.code && b.code ? a.code === b.code : a.description === b.description;

/** Fecha con que entra al mes un gasto cargado de una vez: hoy en el mes en curso; si no, su último día. */
function dateIn(period: string): string {
  if (period === currentPeriod()) return today();
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

const fixedOf = (period: string) =>
  all<FixedItem>(
    `SELECT code, description, category, supplier, currency, amount_cents AS amountCents, taxable
     FROM expenses WHERE kind = 'fijo' AND substr(spent_on, 1, 7) = ? ORDER BY id`,
    period,
  );

/**
 * Carga de una vez los gastos fijos de un mes, desde el maestro o copiando los del
 * mes anterior. No duplica los que ya estén cargados en ese mes.
 */
export async function loadFixedExpenses(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin");
  if (!user) return DENIED;
  const period = text(data, "period");
  const fromMaster = data.get("source") === "maestro";
  if (!isPeriod(period) || period > currentPeriod()) return fail("Elige un mes válido.");
  if (monthIssued(period)) return fail(`El aviso de cobro de ${periodLabel(period)} ya fue emitido.`);

  const before = shiftPeriod(period, -1);
  const items = fromMaster
    ? all<FixedItem>(
        `SELECT code, description, category, supplier, currency, amount_cents AS amountCents, taxable
         FROM fixed_expenses WHERE active = 1 ORDER BY code IS NULL, code, id`,
      )
    : fixedOf(before);
  if (items.length === 0) {
    return fail(
      fromMaster
        ? "El maestro de gastos fijos está vacío. Agrégale partidas primero."
        : `No hay gastos fijos cargados en ${periodLabel(before)}.`,
    );
  }

  const spentOn = dateIn(period);
  const rate = (await rateFor(spentOn))?.bsPerUsd ?? null;
  if (!rate && items.some((i) => i.currency === "VES")) return fail("No hay tasa BCV cargada para convertir los montos.");
  const loaded = fixedOf(period);
  const pending = items.filter((i) => !loaded.some((l) => sameItem(l, i)));
  transaction(() => {
    for (const i of pending) {
      const inBs = i.currency === "VES";
      run(
        `INSERT INTO expenses (spent_on, kind, code, taxable, category, description, supplier, currency,
           amount_cents, rate, usd_cents, created_by, created_at)
         VALUES (?, 'fijo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        spentOn, i.code, i.taxable, i.category, i.description, i.supplier, i.currency, i.amountCents,
        inBs ? rate : null, inBs ? Math.max(1, Math.round(i.amountCents / rate!)) : i.amountCents, user.id, nowIso(),
      );
    }
  });
  return done(
    pending.length === 0
      ? `Los gastos fijos de ${periodLabel(period)} ya estaban cargados.`
      : `Se cargaron ${pending.length} gastos fijos en ${periodLabel(period)}. Ajusta los montos que hayan cambiado.`,
  );
}

function fixedFrom(data: FormData) {
  return {
    code: text(data, "code", 12).toUpperCase() || null,
    description: text(data, "description"),
    category: text(data, "category"),
    supplier: text(data, "supplier") || null,
    currency: data.get("currency") === "USD" ? "USD" : "VES",
    amount: parseAmount(data.get("amount")),
    taxable: data.get("taxable") ? 1 : 0,
  };
}

/** Agrega una partida al maestro de gastos fijos o corrige una existente. */
export async function saveFixedExpense(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const fixedId = id(data, "id");
  const f = fixedFrom(data);
  if (!f.description) return fail("Describe el gasto.");
  if (!EXPENSE_CATEGORIES.includes(f.category)) return fail("Elige una categoría.");
  if (!f.amount) return fail("Escribe el monto habitual.");
  const clash = all<{ id: number; code: string | null; description: string }>(
    "SELECT id, code, description FROM fixed_expenses",
  ).find((other) => other.id !== fixedId && sameItem(other, f));
  if (clash) return fail("Ya hay una partida en el maestro con ese código o esa descripción.");
  if (fixedId) {
    run(
      `UPDATE fixed_expenses SET code = ?, description = ?, category = ?, supplier = ?, currency = ?,
         amount_cents = ?, taxable = ? WHERE id = ?`,
      f.code, f.description, f.category, f.supplier, f.currency, f.amount, f.taxable, fixedId,
    );
    return done("Gasto fijo actualizado.");
  }
  run(
    `INSERT INTO fixed_expenses (code, description, category, supplier, currency, amount_cents, taxable, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    f.code, f.description, f.category, f.supplier, f.currency, f.amount, f.taxable, nowIso(),
  );
  return done("Gasto fijo agregado al maestro.");
}

export async function toggleFixedExpense(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  run("UPDATE fixed_expenses SET active = 1 - active WHERE id = ?", id(data, "id"));
  return done("Gasto fijo actualizado.");
}

export async function deleteFixedExpense(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  run("DELETE FROM fixed_expenses WHERE id = ?", id(data, "id"));
  return done("Gasto fijo quitado del maestro.");
}

/**
 * Arma el maestro con los gastos fijos cargados en los últimos meses, tomando de
 * cada uno su monto más reciente. No repite los que ya estén en el maestro.
 */
export async function importFixedMaster(): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const recent = all<FixedItem>(
    `SELECT code, description, category, supplier, currency, amount_cents AS amountCents, taxable
     FROM expenses WHERE kind = 'fijo' AND spent_on >= ? ORDER BY spent_on DESC, id`,
    `${shiftPeriod(currentPeriod(), -3)}-01`,
  );
  if (recent.length === 0) return fail("No hay gastos fijos cargados en los últimos meses.");
  const master = all<{ code: string | null; description: string }>("SELECT code, description FROM fixed_expenses");
  const missing: FixedItem[] = [];
  for (const i of recent) {
    if (![...master, ...missing].some((m) => sameItem(m, i))) missing.push(i);
  }
  transaction(() => {
    for (const i of missing) {
      run(
        `INSERT INTO fixed_expenses (code, description, category, supplier, currency, amount_cents, taxable, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        i.code, i.description, i.category, i.supplier, i.currency, i.amountCents, i.taxable, nowIso(),
      );
    }
  });
  return done(
    missing.length === 0
      ? "El maestro ya tenía todos los gastos fijos de los últimos meses."
      : `Se agregaron ${missing.length} partidas al maestro, con su monto más reciente.`,
  );
}

// ───────────────────────── Tasa BCV ─────────────────────────

export async function setRateManually(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const rate = parseDecimal(data.get("rate"));
  if (!rate) return fail("Escribe una tasa válida.");
  saveRate(today(), rate, "manual");
  return done("Tasa de hoy guardada.");
}

export async function refreshRate(): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const value = await fetchBcvRate();
  if (!value) return fail("No se pudo consultar la tasa. Cárgala a mano.");
  saveRate(today(), value, "BCV");
  return done("Tasa actualizada desde el BCV.");
}

// ───────────────────────── Accesos ─────────────────────────

function newVisitCode(): string {
  for (;;) {
    const code = String(randomInt(100000, 1000000));
    if (!get("SELECT 1 FROM visits WHERE code = ? AND status IN ('autorizada', 'por_aprobar')", code)) return code;
  }
}

export async function authorizeVisit(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin", "comerciante");
  if (!user) return DENIED;
  if (!can(user, "accesos")) return suspended("accesos");
  const unitId = targetUnit(user, data);
  if (!unitId) return fail("Elige el local que recibe a la persona.");
  const kind = text(data, "kind");
  const name = text(data, "visitor_name", 80);
  const company = text(data, "company", 80);
  const expectedOn = text(data, "expected_on");
  const note = text(data, "note");
  if (!isAccessKind(kind)) return fail("Elige quién viene.");
  if (!name) return fail("Escribe el nombre de la persona que viene.");
  if (!isDate(expectedOn) || expectedOn < today()) return fail("La fecha no es válida.");
  // Un trabajo en el local necesita que la administración lo apruebe antes.
  const needsApproval = ACCESS_KINDS[kind].approval && user.role !== "admin";
  if (ACCESS_KINDS[kind].approval && !note) return fail("Describe el trabajo y el horario en que se hará.");
  const code = newVisitCode();
  run(
    `INSERT INTO visits (unit_id, kind, visitor_name, company, id_doc, plate, expected_on, code, note,
       status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    unitId, kind, name, company || null, text(data, "id_doc", 20) || null,
    text(data, "plate", 12).toUpperCase() || null, expectedOn, code, note || null,
    needsApproval ? "por_aprobar" : "autorizada", user.id, nowIso(),
  );
  const unitCode = get<{ code: string }>("SELECT code FROM units WHERE id = ?", unitId)?.code;
  const who = company ? `${name} (${company})` : name;
  if (needsApproval) {
    notifyRole("admin", {
      kind: "visita",
      title: "Trabajo por aprobar",
      body: `${unitCode} pide autorizar a ${who} el ${dateLabel(expectedOn)}.`,
      href: "/accesos",
    });
    return done("Solicitud enviada. La administración debe aprobar el trabajo.");
  }
  notifyRole("vigilante", {
    kind: "visita",
    title: `${ACCESS_KINDS[kind].label} autorizado`,
    body: `${who} va a ${unitCode} el ${dateLabel(expectedOn)}. Código ${code}.`,
    href: "/accesos",
  });
  return done(`Acceso autorizado. Código: ${code}`);
}

/** La administración aprueba o rechaza el trabajo de un contratista. */
export async function reviewAccess(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const approved = data.get("decision") === "approve";
  const visitId = id(data, "id");
  const { changes } = run(
    "UPDATE visits SET status = ? WHERE id = ? AND status = 'por_aprobar'",
    approved ? "autorizada" : "rechazada", visitId,
  );
  if (!changes) return fail("Esa solicitud ya fue revisada.");
  const visit = get<{ unitId: number; unitCode: string; name: string; company: string | null; expectedOn: string; code: string }>(
    `SELECT v.unit_id AS unitId, u.code AS unitCode, v.visitor_name AS name, v.company,
       v.expected_on AS expectedOn, v.code
     FROM visits v JOIN units u ON u.id = v.unit_id WHERE v.id = ?`,
    visitId,
  );
  if (visit) {
    const who = visit.company ? `${visit.name} (${visit.company})` : visit.name;
    notifyUnit(visit.unitId, {
      kind: "visita",
      title: approved ? "Trabajo aprobado" : "Trabajo no aprobado",
      body: approved
        ? `${who} puede entrar el ${dateLabel(visit.expectedOn)}. Código ${visit.code}.`
        : `La administración no aprobó el trabajo de ${who}. Escríbele para coordinar.`,
      href: "/accesos",
    });
    if (approved) {
      notifyRole("vigilante", {
        kind: "visita",
        title: "Contratista autorizado",
        body: `${who} va a ${visit.unitCode} el ${dateLabel(visit.expectedOn)}. Código ${visit.code}.`,
        href: "/accesos",
      });
    }
  }
  return done(approved ? "Trabajo aprobado." : "Trabajo rechazado.");
}

export async function cancelVisit(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin", "comerciante");
  if (!user) return DENIED;
  const { changes } = run(
    `UPDATE visits SET status = 'cancelada'
     WHERE id = ? AND status IN ('autorizada', 'por_aprobar') AND (? = 'admin' OR unit_id = ?)`,
    id(data, "id"), user.role, user.unitId,
  );
  return changes ? done("Acceso cancelado.") : fail("No se pudo cancelar ese acceso.");
}

/** Seguridad registra a quien llega sin estar anunciado. */
export async function registerWalkIn(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin", "vigilante");
  if (!user) return DENIED;
  const unitId = id(data, "unit_id");
  const kind = text(data, "kind");
  const name = text(data, "visitor_name", 80);
  const company = text(data, "company", 80);
  if (!unitId || !get("SELECT 1 FROM units WHERE id = ?", unitId)) return fail("Elige a qué local va.");
  if (!isAccessKind(kind)) return fail("Elige quién viene.");
  if (!name) return fail("Escribe el nombre de la persona.");
  run(
    `INSERT INTO visits (unit_id, kind, visitor_name, company, id_doc, plate, expected_on, code, note,
       status, entered_at, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Registrado por seguridad', 'adentro', ?, ?, ?)`,
    unitId, kind, name, company || null, text(data, "id_doc", 20) || null,
    text(data, "plate", 12).toUpperCase() || null, today(), newVisitCode(),
    nowIso(), user.id, nowIso(),
  );
  notifyUnit(unitId, {
    kind: "visita",
    title: "Entrada sin anunciar",
    body: `${company ? `${name} (${company})` : name} entró a las ${timeLabel(nowIso())}, registrado por seguridad.`,
    href: "/accesos",
  });
  return done("Entrada registrada.");
}

export async function markVisit(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin", "vigilante"))) return DENIED;
  const entering = data.get("move") === "in";
  const { changes } = entering
    ? run(
        "UPDATE visits SET status = 'adentro', entered_at = ? WHERE id = ? AND status = 'autorizada'",
        nowIso(), id(data, "id"),
      )
    : run(
        "UPDATE visits SET status = 'salio', exited_at = ? WHERE id = ? AND status = 'adentro'",
        nowIso(), id(data, "id"),
      );
  if (!changes) return fail("Ese acceso ya cambió de estado.");
  const visit = get<{ unitId: number; name: string }>(
    "SELECT unit_id AS unitId, visitor_name AS name FROM visits WHERE id = ?",
    id(data, "id"),
  );
  if (visit) {
    notifyUnit(visit.unitId, {
      kind: "visita",
      title: entering ? "Llegó a tu local" : "Salió del centro comercial",
      body: `${visit.name} ${entering ? "entró" : "salió"} a las ${timeLabel(nowIso())}.`,
      href: "/accesos",
    });
  }
  return done(entering ? "Entrada registrada." : "Salida registrada.");
}

// ───────────────────────── Comunidad ─────────────────────────

/** Nivel y pasillo elegidos en un formulario; vacíos = todo el centro comercial. */
function audienceFrom(data: FormData): Audience | { error: string } {
  const level = text(data, "audience_level", 40) || null;
  const aisle = level ? text(data, "audience_aisle", 20) || null : null;
  if (level && !get("SELECT 1 FROM units WHERE level = ? AND (? IS NULL OR aisle = ?)", level, aisle, aisle)) {
    return { error: "Ese nivel o pasillo no existe." };
  }
  return { level, aisle };
}

export async function postAnnouncement(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin");
  if (!user) return DENIED;
  const title = text(data, "title", 120);
  const body = text(data, "body", 2000);
  if (!title || !body) return fail("Escribe el título y el mensaje.");
  const audience = audienceFrom(data);
  if ("error" in audience) return fail(audience.error);
  run(
    `INSERT INTO announcements (title, body, pinned, created_by, created_at, audience_level, audience_aisle)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    title, body, data.get("pinned") ? 1 : 0, user.id, nowIso(), audience.level, audience.aisle,
  );
  const notice = { kind: "aviso", title, body: body.slice(0, 140), href: "/comunicados" } as const;
  const residents = residentsOf(audience.level, audience.aisle);
  notifyUsers(residents, notice);
  notifyRole("vigilante", notice);
  return done(
    audience.level
      ? `Aviso publicado para ${residents.length} ${residents.length === 1 ? "comerciante" : "comerciantes"} de esa zona.`
      : "Aviso publicado.",
  );
}

export async function deleteAnnouncement(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  run("DELETE FROM announcements WHERE id = ?", id(data, "id"));
  return done("Aviso eliminado.");
}

export async function createPoll(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const question = text(data, "question", 200);
  const closesOn = text(data, "closes_on");
  const options = text(data, "options", 1000).split("\n").map((o) => o.trim()).filter(Boolean);
  if (!question) return fail("Escribe la pregunta.");
  if (options.length < 2) return fail("Escribe al menos dos opciones, una por línea.");
  if (!isDate(closesOn) || closesOn < today()) return fail("Elige hasta cuándo se puede votar.");
  transaction(() => {
    const poll = run(
      "INSERT INTO polls (question, closes_on, created_at) VALUES (?, ?, ?)",
      question, closesOn, nowIso(),
    ).lastInsertRowid;
    for (const label of options) {
      run("INSERT INTO poll_options (poll_id, label) VALUES (?, ?)", poll, label.slice(0, 120));
    }
  });
  notifyRole("comerciante", {
    kind: "consulta",
    title: "Nueva consulta",
    body: `${question} Vota hasta el ${dateLabel(closesOn)}.`,
    href: "/comunicados",
  });
  return done("Consulta publicada.");
}

export async function deletePoll(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  run("DELETE FROM polls WHERE id = ?", id(data, "id"));
  return done("Consulta eliminada.");
}

export async function vote(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("comerciante");
  if (!user?.unitId) return fail("Solo los locales pueden votar.");
  const optionId = id(data, "option_id");
  const option = get<{ pollId: number; closesOn: string }>(
    `SELECT o.poll_id AS pollId, p.closes_on AS closesOn
     FROM poll_options o JOIN polls p ON p.id = o.poll_id WHERE o.id = ?`,
    optionId,
  );
  if (!option) return fail("Elige una opción.");
  if (option.closesOn < today()) return fail("Esta consulta ya cerró.");
  run(
    `INSERT INTO votes (poll_id, unit_id, option_id) VALUES (?, ?, ?)
     ON CONFLICT (poll_id, unit_id) DO UPDATE SET option_id = excluded.option_id`,
    option.pollId, user.unitId, optionId,
  );
  return done("Voto registrado.");
}

// ───────────────────────── Reservas ─────────────────────────

export async function reserve(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin", "comerciante");
  if (!user) return DENIED;
  if (!can(user, "reservar")) return suspended("reservar");
  const unitId = targetUnit(user, data);
  if (!unitId) return fail("Elige el local que reserva.");
  const amenityId = id(data, "amenity_id");
  const date = text(data, "date");
  const slot = text(data, "slot");
  if (!amenityId || !get("SELECT 1 FROM amenities WHERE id = ?", amenityId)) return fail("Elige un espacio.");
  if (!(slot in SLOTS)) return fail("Elige un turno.");
  if (!isDate(date) || date < today() || date > addDays(today(), 60)) {
    return fail("Solo se puede reservar desde hoy hasta 60 días en adelante.");
  }
  const { changes } = run(
    `INSERT OR IGNORE INTO reservations (amenity_id, unit_id, date, slot, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    amenityId, unitId, date, slot, text(data, "note", 120) || null, nowIso(),
  );
  if (!changes) return fail("Ese turno ya está reservado.");
  if (user.role === "admin") {
    const amenity = get<{ name: string }>("SELECT name FROM amenities WHERE id = ?", amenityId)?.name;
    notifyUnit(unitId, {
      kind: "reserva",
      title: "Reserva confirmada",
      body: `${amenity}, ${dateLabel(date)}, ${SLOTS[slot]}.`,
      href: "/reservas",
    });
  }
  return done("Reserva confirmada.");
}

export async function cancelReservation(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin", "comerciante");
  if (!user) return DENIED;
  const reservation = get<{ unitId: number; amenity: string; date: string }>(
    `SELECT r.unit_id AS unitId, a.name AS amenity, r.date
     FROM reservations r JOIN amenities a ON a.id = r.amenity_id WHERE r.id = ?`,
    id(data, "id"),
  );
  const { changes } = run(
    "DELETE FROM reservations WHERE id = ? AND (? = 'admin' OR unit_id = ?)",
    id(data, "id"), user.role, user.unitId,
  );
  if (!changes || !reservation) return fail("No se pudo cancelar esa reserva.");
  if (user.role === "admin") {
    notifyUnit(reservation.unitId, {
      kind: "reserva",
      title: "Reserva cancelada",
      body: `La administración canceló tu reserva de ${reservation.amenity} del ${dateLabel(reservation.date)}.`,
      href: "/reservas",
    });
  }
  return done("Reserva cancelada.");
}

// ───────────────────────── Administración ─────────────────────────

export async function saveSettings(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const name = text(data, "name", 60);
  const reserveRaw = text(data, "reserve_percent");
  const reserve = reserveRaw ? parseDecimal(reserveRaw) : 0;
  const dueDay = Number(text(data, "due_day"));
  if (!name) return fail("Escribe el nombre del centro comercial.");
  if (reserve === null || reserve > 100) return fail("El porcentaje del fondo de reserva no es válido.");
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28) return fail("El día de vencimiento debe estar entre 1 y 28.");
  const save = (key: string, value: string) =>
    run(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      key, value,
    );
  // Logo nuevo: reemplaza al anterior y a su emblema.
  const file = data.get("logo");
  if (file instanceof File && file.size > 0) {
    const saved = await savePhoto(file);
    if ("error" in saved) return fail(saved.error);
    const previous = getSettings();
    save("logo", saved.name);
    save("logo_mark", "");
    for (const old of [previous.logo, previous.logoMark]) if (old) await deletePhoto(old);
  }
  save("name", name);
  save("location", text(data, "location", 80));
  save("rif", text(data, "rif", 20).toUpperCase());
  save("reserve_percent", String(reserve));
  save("due_day", String(dueDay));
  save("payment_info", text(data, "payment_info", 600));
  return done("Configuración guardada.");
}

/** Lee y normaliza nivel, pasillo y número de un formulario. */
function addressFrom(data: FormData) {
  return {
    level: cleanLevel(text(data, "level", 40)),
    aisle: cleanAisle(text(data, "aisle", 20)),
    number: cleanNumber(text(data, "number", 10)),
  };
}

const addressTaken = (a: { level: string; aisle: string; number: string }, exceptId = 0) =>
  Boolean(
    get(
      "SELECT 1 FROM units WHERE level = ? AND aisle = ? AND number = ? AND id != ?",
      a.level, a.aisle, a.number, exceptId,
    ),
  );

/** Comercio, ocupación, alícuota, superficie y canon de un local, tal como vienen del formulario. */
function detailsFrom(data: FormData) {
  const occupancy = text(data, "occupancy");
  const business = occupancy === "desocupado" ? "" : text(data, "business", 80);
  const rentRaw = text(data, "rent");
  const areaRaw = text(data, "area");
  return {
    occupancy,
    business: business || null,
    aliquot: parseDecimal(data.get("aliquot")),
    area: areaRaw ? parseDecimal(areaRaw) : 0,
    rentCents: rentRaw ? parseAmount(rentRaw) : 0,
  };
}

function detailsError(d: ReturnType<typeof detailsFrom>): string | null {
  if (!["propietario", "alquilado", "desocupado"].includes(d.occupancy)) return "Elige si el local está alquilado.";
  if (d.occupancy !== "desocupado" && !d.business) return "Escribe el nombre del comercio.";
  if (!d.aliquot || d.aliquot > 100) return "Escribe la alícuota del local en porcentaje, por ejemplo 0,7245.";
  if (d.area === null) return "La superficie en m² no es válida. Déjala vacía si no la tienes.";
  if (d.rentCents === null) return "El canon no es válido. Déjalo vacío si no se cobra por aquí.";
  return null;
}

export async function addUnit(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const address = addressFrom(data);
  const owner = text(data, "owner", 80);
  const details = detailsFrom(data);
  if (!address.level || !address.aisle || !address.number) {
    return fail("Escribe el nivel, el pasillo y el número del local.");
  }
  if (!owner) return fail("Escribe el nombre del propietario.");
  const invalid = detailsError(details);
  if (invalid) return fail(invalid);
  if (addressTaken(address)) return fail("Ya existe un local con ese nivel, pasillo y número.");
  run(
    `INSERT INTO units (code, owner, phone, level, aisle, number, business, occupancy, aliquot, area_m2, rent_cents)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    unitLabel(address), owner, text(data, "phone", 30) || null, address.level, address.aisle, address.number,
    details.business, details.occupancy, details.aliquot, details.area, details.rentCents,
  );
  return done(`${unitLabel(address)} agregado.`);
}

/** Crea de una vez todos los locales de un pasillo, numerados de corrido. */
export async function addUnitRange(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const level = cleanLevel(text(data, "level", 40));
  const aisle = cleanAisle(text(data, "aisle", 20));
  const from = Number(text(data, "from"));
  const to = Number(text(data, "to"));
  const aliquot = parseDecimal(data.get("aliquot"));
  if (!level || !aisle) return fail("Escribe el nivel y el pasillo.");
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to - from >= 100) {
    return fail("Indica desde qué número hasta cuál (como máximo 100 locales a la vez).");
  }
  if (!aliquot || aliquot > 100) return fail("Escribe la alícuota en porcentaje. Después puedes ajustar la de cada local.");
  let created = 0;
  transaction(() => {
    for (let n = from; n <= to; n++) {
      const address = { level, aisle, number: String(n) };
      if (addressTaken(address)) continue;
      run(
        `INSERT INTO units (code, owner, level, aisle, number, occupancy, aliquot)
         VALUES (?, 'Por asignar', ?, ?, ?, 'desocupado', ?)`,
        unitLabel(address), level, aisle, address.number, aliquot,
      );
      created++;
    }
  });
  return done(
    created === 0
      ? "Esos locales ya existían."
      : `${created} ${created === 1 ? "local creado" : "locales creados"} en Nivel ${level}, Pasillo ${aisle}.`,
  );
}

export async function updateUnit(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const unitId = id(data, "id");
  const address = addressFrom(data);
  const owner = text(data, "owner", 80);
  const details = detailsFrom(data);
  if (!unitId || !get("SELECT 1 FROM units WHERE id = ?", unitId)) return fail("Ese local no existe.");
  if (!address.level || !address.aisle || !address.number) {
    return fail("Escribe el nivel, el pasillo y el número del local.");
  }
  if (!owner) return fail("Escribe el nombre del propietario.");
  const invalid = detailsError(details);
  if (invalid) return fail(invalid);
  if (addressTaken(address, unitId)) return fail("Ya existe otro local con ese nivel, pasillo y número.");
  run(
    `UPDATE units SET code = ?, owner = ?, phone = ?, level = ?, aisle = ?, number = ?,
       business = ?, occupancy = ?, aliquot = ?, area_m2 = ?, rent_cents = ? WHERE id = ?`,
    unitLabel(address), owner, text(data, "phone", 30) || null, address.level, address.aisle, address.number,
    details.business, details.occupancy, details.aliquot, details.area, details.rentCents, unitId,
  );
  return done(`${unitLabel(address)} actualizado.`);
}

export async function addUser(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const name = text(data, "name", 80);
  const email = text(data, "email", 120).toLowerCase();
  const role = text(data, "role") as Role;
  const password = String(data.get("password") ?? "");
  const unitId = role === "comerciante" ? id(data, "unit_id") : null;
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return fail("Escribe el nombre y un correo válido.");
  if (!["admin", "comerciante", "vigilante"].includes(role)) return fail("Elige un rol.");
  if (role === "comerciante" && !unitId) return fail("Un comerciante debe estar asociado a un local.");
  if (password.length < 8) return fail("La contraseña debe tener al menos 8 caracteres.");
  if (get("SELECT 1 FROM users WHERE email = ?", email)) return fail("Ya hay un usuario con ese correo.");
  run(
    "INSERT INTO users (name, email, password_hash, role, unit_id) VALUES (?, ?, ?, ?, ?)",
    name, email, hashPassword(password), role, unitId,
  );
  return done(`Usuario ${email} creado.`);
}

/** La administración suspende o devuelve una función a un local (a todos sus usuarios). */
export async function setPrivilege(unitId: number, privilege: string, allowed: boolean): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  if (!isPrivilege(privilege)) return fail("Ese permiso no existe.");
  const unit = get<{ code: string }>("SELECT code FROM units WHERE id = ?", unitId);
  if (!unit) return fail("Ese local no existe.");
  if (allowed) {
    run("DELETE FROM unit_restrictions WHERE unit_id = ? AND privilege = ?", unitId, privilege);
  } else {
    run("INSERT OR IGNORE INTO unit_restrictions (unit_id, privilege) VALUES (?, ?)", unitId, privilege);
  }
  const { label, suspended: what } = PRIVILEGES[privilege];
  notifyUnit(unitId, {
    kind: "aviso",
    title: allowed ? "Permiso restablecido" : "Permiso suspendido",
    body: allowed ? `Ya puedes volver a ${what}.` : `La administración suspendió la opción de ${what} para tu local.`,
    href: "/perfil",
  });
  return done(`${label}: ${allowed ? "permitido" : "suspendido"} para ${unit.code}.`);
}

/** Suspende o devuelve una función a todos los locales de una vez. */
export async function setPrivilegeForAll(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const privilege = text(data, "privilege");
  const allowed = data.get("allowed") === "1";
  if (!isPrivilege(privilege)) return fail("Ese permiso no existe.");

  // Solo cambian (y solo reciben aviso) los locales que no estaban ya en ese estado.
  const affected = all<{ id: number }>(
    `SELECT u.id FROM units u
     WHERE EXISTS (SELECT 1 FROM unit_restrictions r WHERE r.unit_id = u.id AND r.privilege = ?) = ?`,
    privilege, allowed ? 1 : 0,
  ).map((u) => u.id);
  const { label, suspended: what } = PRIVILEGES[privilege];
  if (affected.length === 0) {
    return done(`${label}: ya estaba ${allowed ? "permitido" : "suspendido"} para todos los locales.`);
  }

  transaction(() => {
    for (const unitId of affected) {
      if (allowed) run("DELETE FROM unit_restrictions WHERE unit_id = ? AND privilege = ?", unitId, privilege);
      else run("INSERT OR IGNORE INTO unit_restrictions (unit_id, privilege) VALUES (?, ?)", unitId, privilege);
    }
  });
  const residents = all<{ id: number }>(
    `SELECT id FROM users WHERE role = 'comerciante' AND active = 1
       AND unit_id IN (${affected.map(() => "?").join(",")})`,
    ...affected,
  ).map((u) => u.id);
  notifyUsers(residents, {
    kind: "aviso",
    title: allowed ? "Permiso restablecido" : "Permiso suspendido",
    body: allowed
      ? `Ya puedes volver a ${what}.`
      : `La administración suspendió la opción de ${what} para todos los locales.`,
    href: "/perfil",
  });
  const which = affected.length === 1 ? "1 local" : `${affected.length} locales`;
  return done(`${label}: ${allowed ? "permitido" : "suspendido"} para ${which}.`);
}

export async function toggleUser(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin");
  if (!user) return DENIED;
  const userId = id(data, "id");
  if (userId === user.id) return fail("No puedes desactivar tu propia cuenta.");
  run("UPDATE users SET active = 1 - active WHERE id = ?", userId);
  run("DELETE FROM sessions WHERE user_id = ?", userId);
  return done("Usuario actualizado.");
}

// ───────────────────────── Mensajes ─────────────────────────

export async function sendMessage(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin", "comerciante");
  if (!user) return DENIED;
  if (!can(user, "escribir")) return suspended("escribir");
  const unitId = targetUnit(user, data);
  if (!unitId) return fail("Elige con qué local quieres hablar.");
  const body = text(data, "body", 1000);
  if (!body) return fail("Escribe un mensaje.");
  const fromAdmin = user.role === "admin";
  run(
    "INSERT INTO messages (unit_id, sender_id, from_admin, body, created_at) VALUES (?, ?, ?, ?, ?)",
    unitId, user.id, fromAdmin ? 1 : 0, body, nowIso(),
  );
  const preview = body.length > 120 ? `${body.slice(0, 120)}…` : body;
  if (fromAdmin) {
    notifyUnit(unitId, { kind: "mensaje", title: "Mensaje de la administración", body: preview, href: "/mensajes" });
  } else {
    notifyRole("admin", {
      kind: "mensaje",
      title: `Mensaje de ${user.unitCode}`,
      body: preview,
      href: `/mensajes/${unitId}`,
    });
  }
  revalidatePath("/", "layout");
  return null;
}

/** Marca como leído lo que escribió la otra parte del hilo. */
export async function markThreadRead(unitId: number) {
  const user = await actor("admin", "comerciante");
  if (!user) return;
  const target = user.role === "admin" ? unitId : user.unitId;
  const { changes } = run(
    "UPDATE messages SET read_at = ? WHERE unit_id = ? AND from_admin = ? AND read_at IS NULL",
    nowIso(), target, user.role === "admin" ? 0 : 1,
  );
  if (changes) revalidatePath("/", "layout");
}

// ───────────────────────── Notificaciones ─────────────────────────

export async function openNotification(data: FormData) {
  const user = await actor();
  if (!user) redirect("/login");
  const row = get<{ href: string }>(
    "SELECT href FROM notifications WHERE id = ? AND user_id = ?",
    id(data, "id"), user.id,
  );
  if (!row) redirect("/notificaciones");
  run("UPDATE notifications SET read_at = COALESCE(read_at, ?) WHERE id = ?", nowIso(), id(data, "id"));
  redirect(row.href);
}

export async function markAllNotificationsRead(): Promise<FormState> {
  const user = await actor();
  if (!user) return DENIED;
  run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", nowIso(), user.id);
  return done("Todo marcado como leído.");
}

type PushSubscriptionInput = { endpoint?: string; keys?: { p256dh?: string; auth?: string } };

export async function savePushSubscription(sub: PushSubscriptionInput): Promise<boolean> {
  const user = await actor();
  const { endpoint, keys } = sub ?? {};
  if (!user || !endpoint?.startsWith("https://") || !keys?.p256dh || !keys.auth) return false;
  run(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    endpoint.slice(0, 1000), user.id, keys.p256dh.slice(0, 200), keys.auth.slice(0, 100), nowIso(),
  );
  return true;
}

export async function removePushSubscription(endpoint: string) {
  const user = await actor();
  if (user) run("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?", endpoint, user.id);
}

/** Envía un push solo a los dispositivos de quien lo pide. Devuelve cuántos lo recibieron. */
export async function sendTestPush(): Promise<number> {
  const user = await actor();
  if (!user) return 0;
  return sendPush(
    [user.id],
    {
      title: "Notificaciones activadas",
      body: "Así te avisaremos de pagos, accesos y mensajes de la administración.",
      href: "/notificaciones",
    },
    await pushSubject(),
  );
}

// ───────────────────────── Reportes ─────────────────────────

const ALERTS_PER_HOUR = 5;

export async function createAlert(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor();
  if (!user) return DENIED;
  if (!can(user, "reportes")) return suspended("reportes");
  const kind = text(data, "kind");
  const title = text(data, "title", 80);
  const body = text(data, "body", 600);
  if (!isAlertKind(kind)) return fail("Elige de qué tipo es el reporte.");
  if (!title) return fail("Cuenta en una frase qué está pasando.");

  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();
  const recent = get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM alerts WHERE user_id = ? AND created_at >= ?",
    user.id, hourAgo,
  );
  if ((recent?.n ?? 0) >= ALERTS_PER_HOUR) {
    return fail("Ya enviaste varios reportes en la última hora. Espera un poco o escribe a la administración.");
  }

  // Lo que se difunde puede limitarse al nivel o al pasillo del local. Las fallas
  // de mantenimiento y limpieza van solo a la administración y a la seguridad.
  const { broadcast, label } = ALERT_KINDS[kind];
  const scope = broadcast && user.role === "comerciante" ? text(data, "scope") : "";
  const audience: Audience = {
    level: scope === "nivel" || scope === "pasillo" ? user.unitLevel : null,
    aisle: scope === "pasillo" ? user.unitAisle : null,
  };
  if (scope === "pasillo" && !audience.aisle) audience.level = null;

  let photo: string | null = null;
  const file = data.get("photo");
  if (file instanceof File && file.size > 0) {
    const saved = await savePhoto(file);
    if ("error" in saved) return fail(saved.error);
    photo = saved.name;
  }

  const alertId = Number(
    run(
      `INSERT INTO alerts (user_id, unit_id, kind, title, body, photo, created_at, audience_level, audience_aisle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      user.id, user.unitId, kind, title, body, photo, nowIso(), audience.level, audience.aisle,
    ).lastInsertRowid,
  );

  const from = user.unitCode ?? (user.role === "admin" ? "Administración" : "Seguridad");
  const staff = all<{ id: number }>("SELECT id FROM users WHERE active = 1 AND role != 'comerciante'");
  const tenants = broadcast ? residentsOf(audience.level, audience.aisle) : [];
  const recipients = [...tenants, ...staff.map((u) => u.id)].filter((userId) => userId !== user.id);
  notifyUsers(recipients, {
    kind: "alerta",
    title: `${label}: ${title}`,
    body: body ? `${from} · ${body.slice(0, 120)}` : `Enviado por ${from}`,
    href: `/reportes/${alertId}`,
  });
  revalidatePath("/", "layout");
  redirect(`/reportes/${alertId}`);
}

/** La administración avisa que ya está atendiendo el reporte. */
export async function attendAlert(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor("admin");
  if (!user) return DENIED;
  const alertId = id(data, "id");
  const { changes } = run("UPDATE alerts SET status = 'en_proceso' WHERE id = ? AND status = 'activa'", alertId);
  if (!changes) return fail("Ese reporte ya cambió de estado.");
  const alert = get<{ userId: number; title: string }>("SELECT user_id AS userId, title FROM alerts WHERE id = ?", alertId);
  if (alert && alert.userId !== user.id) {
    notifyUsers([alert.userId], {
      kind: "alerta",
      title: `En proceso: ${alert.title}`,
      body: "La administración está atendiendo tu reporte.",
      href: `/reportes/${alertId}`,
    });
  }
  return done("Reporte marcado como en proceso.");
}

export async function resolveAlert(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor();
  if (!user) return DENIED;
  const alertId = id(data, "id");
  const { changes } = run(
    `UPDATE alerts SET status = 'resuelta', resolved_at = ?
     WHERE id = ? AND status != 'resuelta' AND (? = 'admin' OR user_id = ?)`,
    nowIso(), alertId, user.role, user.id,
  );
  if (!changes) return fail("No se pudo cerrar ese reporte.");
  const alert = get<{ userId: number; title: string }>("SELECT user_id AS userId, title FROM alerts WHERE id = ?", alertId);
  if (alert && alert.userId !== user.id) {
    notifyUsers([alert.userId], {
      kind: "alerta",
      title: `Resuelto: ${alert.title}`,
      body: "La administración marcó tu reporte como resuelto.",
      href: `/reportes/${alertId}`,
    });
  }
  return done("Reporte marcado como resuelto.");
}

export async function deleteAlert(_: FormState, data: FormData): Promise<FormState> {
  if (!(await actor("admin"))) return DENIED;
  const alert = get<{ photo: string | null }>("SELECT photo FROM alerts WHERE id = ?", id(data, "id"));
  if (!alert) return fail("Ese reporte ya no existe.");
  run("DELETE FROM alerts WHERE id = ?", id(data, "id"));
  if (alert.photo) await deletePhoto(alert.photo);
  revalidatePath("/", "layout");
  redirect("/reportes");
}

export async function commentAlert(_: FormState, data: FormData): Promise<FormState> {
  const user = await actor();
  if (!user) return DENIED;
  if (!can(user, "reportes")) return suspended("reportes");
  const alertId = id(data, "id");
  const body = text(data, "body", 400);
  const alert = get<{ userId: number; title: string }>(
    "SELECT user_id AS userId, title FROM alerts WHERE id = ?",
    alertId,
  );
  if (!alert) return fail("Ese reporte ya no existe.");
  if (!body) return fail("Escribe una respuesta.");
  run(
    "INSERT INTO alert_comments (alert_id, user_id, body, created_at) VALUES (?, ?, ?, ?)",
    alertId, user.id, body, nowIso(),
  );
  // Se avisa a quien creó el reporte y a quienes ya habían respondido.
  const others = all<{ id: number }>(
    `SELECT DISTINCT user_id AS id FROM alert_comments WHERE alert_id = ?
     UNION SELECT ? AS id`,
    alertId, alert.userId,
  );
  notifyUsers(others.map((o) => o.id).filter((uid) => uid !== user.id), {
    kind: "alerta",
    title: `Respuesta en: ${alert.title}`,
    body: `${user.unitCode ?? user.name} · ${body.slice(0, 120)}`,
    href: `/reportes/${alertId}`,
  });
  revalidatePath("/", "layout");
  return null;
}
