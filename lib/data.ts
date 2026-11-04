import { compareAddress } from "./address";
import { settle, splitPending, type AllocPayment, type AppliesTo, type Settlement } from "./allocation";
import { BROADCAST_KINDS, type AlertKind, type AlertStatus } from "./alert-kinds";
import { all, get } from "./db";
import { periodLabel } from "./format";

export type Settings = {
  name: string;
  /** RIF del condominio, para el encabezado del aviso de cobro. */
  rif: string;
  /** Ciudad y estado, p. ej. "Maracay, estado Aragua". */
  location: string;
  /** Archivo del logo y, opcional, de su emblema cuadrado; vacío si no se ha cargado. */
  logo: string;
  logoMark: string;
  /** Fondo de reserva y publicidad: porcentaje de los gastos del mes que se suma al aviso. */
  reservePercent: number;
  /** Día del mes siguiente en que vence el aviso de cobro. */
  dueDay: number;
  paymentInfo: string;
};

export function getSettings(): Settings {
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    name: map.name ?? "Centro comercial",
    rif: map.rif ?? "",
    location: map.location ?? "",
    logo: map.logo ?? "",
    logoMark: map.logo_mark ?? "",
    reservePercent: Number(map.reserve_percent ?? 0),
    dueDay: Number(map.due_day ?? 10),
    paymentInfo: map.payment_info ?? "",
  };
}

export type Occupancy = "propietario" | "alquilado" | "desocupado";

export const OCCUPANCY: Record<Occupancy, string> = {
  propietario: "Lo opera su dueño",
  alquilado: "Alquilado",
  desocupado: "Desocupado",
};

export type Unit = {
  id: number;
  /** Etiqueta completa: "Nivel 1 · Pasillo C · Local 3". */
  code: string;
  owner: string;
  phone: string | null;
  level: string | null;
  aisle: string | null;
  number: string | null;
  /** Comercio que opera en el local; null si está desocupado. */
  business: string | null;
  occupancy: Occupancy;
  /** Alícuota en porcentaje: 0,7245 significa 0,7245 % de los gastos del mes. */
  aliquot: number;
  areaM2: number;
  /** Canon mensual que cobra la administración; 0 si no aplica. */
  rentCents: number;
};

const UNIT_COLUMNS = `u.id, u.code, u.owner, u.phone, u.level, u.aisle, u.number, u.business,
    u.occupancy, u.aliquot, u.area_m2 AS areaM2, u.rent_cents AS rentCents`;

/** Locales en orden natural: por nivel, pasillo y número. */
export function listUnits(): Unit[] {
  return all<Unit>(`SELECT ${UNIT_COLUMNS} FROM units u`).sort(compareAddress);
}

/** Suma de las alícuotas cargadas: debería dar 100 %. */
export function totalAliquot(): number {
  return get<{ total: number | null }>("SELECT SUM(aliquot) AS total FROM units")?.total ?? 0;
}

/** A quién se le muestra un aviso o alerta de zona. La administración y seguridad ven todo. */
export type Viewer = {
  role: string;
  unitId: number | null;
  unitLevel: string | null;
  unitAisle: string | null;
};

/** Condición SQL (sobre el alias dado) que deja pasar lo que le corresponde ver a un comerciante. */
function audienceFilter(alias: string, viewer: Viewer): { sql: string; params: (string | null)[] } {
  if (viewer.role !== "comerciante") return { sql: "1 = 1", params: [] };
  return {
    sql: `(${alias}.audience_level IS NULL OR (${alias}.audience_level = ?
           AND (${alias}.audience_aisle IS NULL OR ${alias}.audience_aisle = ?)))`,
    params: [viewer.unitLevel, viewer.unitAisle],
  };
}

export type UnitBalance = Unit & {
  /** Lo que se le cobró en el último aviso emitido: la vara para decir quién es moroso. */
  monthly: number;
  charged: number;
  paid: number;
  /** Positivo: debe. Negativo: saldo a favor. Centavos de USD. */
  balance: number;
  pendingPayments: number;
};

const BALANCE_SQL = `
  SELECT ${UNIT_COLUMNS},
    COALESCE((SELECT SUM(amount_cents) FROM charges c
              WHERE c.unit_id = u.id AND c.kind != 'especial'
                AND c.period = (SELECT MAX(period) FROM statements)), 0) AS monthly,
    COALESCE((SELECT SUM(amount_cents) FROM charges c WHERE c.unit_id = u.id), 0) AS charged,
    COALESCE((SELECT SUM(usd_cents) FROM payments p
              WHERE p.unit_id = u.id AND p.status = 'aprobado'), 0) AS paid,
    (SELECT COUNT(*) FROM payments p
     WHERE p.unit_id = u.id AND p.status = 'pendiente') AS pendingPayments
  FROM units u`;

type BalanceRow = Omit<UnitBalance, "balance">;
const withBalance = (r: BalanceRow): UnitBalance => ({ ...r, balance: r.charged - r.paid });

export function unitBalances(): UnitBalance[] {
  return all<BalanceRow>(BALANCE_SQL).map(withBalance).sort(compareAddress);
}

export function unitBalance(unitId: number): UnitBalance | null {
  const row = get<BalanceRow>(`${BALANCE_SQL} WHERE u.id = ?`, unitId);
  return row ? withBalance(row) : null;
}

export type Standing = "al_dia" | "pendiente" | "moroso";

/** Moroso: debe más que el último aviso de cobro. Pendiente: debe, pero no más de un mes. */
export function standing({ balance, monthly }: { balance: number; monthly: number }): Standing {
  if (balance <= 0) return "al_dia";
  return balance > monthly ? "moroso" : "pendiente";
}

export type Charge = {
  id: number;
  period: string;
  kind: "condominio" | "canon" | "especial";
  concept: string;
  amountCents: number;
};

export function chargesOf(unitId: number): Charge[] {
  return all<Charge>(
    `SELECT id, period, kind, concept, amount_cents AS amountCents
     FROM charges WHERE unit_id = ? ORDER BY period DESC, id DESC`,
    unitId,
  );
}

const PAY_ALLOC_SQL = `SELECT id, unit_id AS unitId, usd_cents AS usdCents, applies_to AS appliesTo, charge_id AS chargeId
  FROM payments WHERE status = 'aprobado'`;

type AllocRow = AllocPayment & { unitId: number };

/** Cargos del más antiguo al más nuevo: el orden en que los cubren los pagos. */
const oldestFirst = (charges: Charge[]) => [...charges].reverse();

/**
 * Reparto de los pagos aprobados de un local entre sus cargos (ver lib/allocation.ts).
 * `extra` agrega un pago que aún no está aprobado, al final; `excludeId` deja uno fuera.
 */
export function settleUnit(unitId: number, extra?: AllocPayment, excludeId = 0): { charges: Charge[]; settlement: Settlement } {
  const charges = oldestFirst(chargesOf(unitId));
  const payments = all<AllocRow>(`${PAY_ALLOC_SQL} AND unit_id = ? AND id != ? ORDER BY paid_on, id`, unitId, excludeId);
  return { charges, settlement: settle(charges, extra ? [...payments, extra] : payments) };
}

/** El mismo reparto para todos los locales a la vez, con dos consultas: para los reportes. */
export function settleAll(): Map<number, { charges: Charge[]; settlement: Settlement }> {
  const charges = all<Charge & { unitId: number }>(
    `SELECT id, unit_id AS unitId, period, kind, concept, amount_cents AS amountCents
     FROM charges ORDER BY period, id`,
  );
  const payments = all<AllocRow>(`${PAY_ALLOC_SQL} ORDER BY paid_on, id`);
  const byUnit = new Map<number, { charges: Charge[]; payments: AllocRow[] }>();
  const slot = (unitId: number) => {
    let s = byUnit.get(unitId);
    if (!s) byUnit.set(unitId, (s = { charges: [], payments: [] }));
    return s;
  };
  for (const c of charges) slot(c.unitId).charges.push(c);
  for (const p of payments) slot(p.unitId).payments.push(p);
  const result = new Map<number, { charges: Charge[]; settlement: Settlement }>();
  for (const [unitId, s] of byUnit) result.set(unitId, { charges: s.charges, settlement: settle(s.charges, s.payments) });
  return result;
}

/**
 * Lo que falta por pagar de cada cargo de un local, por id de cargo. Cada pago cubre
 * primero aquello a lo que se destinó; el resto, lo más antiguo.
 */
export function pendingByCharge(unitId: number): Map<number, number> {
  return settleUnit(unitId).settlement.pending;
}

/** Lo pendiente de un local separado en cuota mensual y cuotas extra. */
export function pendingSplitOf(unitId: number) {
  const { charges, settlement } = settleUnit(unitId);
  return splitPending(charges, settlement);
}

export type PaymentTarget = { value: string; label: string; pendingCents: number };

/** Opciones de "¿Qué pagas?" para un local: lo más antiguo, la cuota mensual y cada cuota extra pendiente. */
export function targetsFrom(charges: Charge[], s: Settlement): PaymentTarget[] {
  const { monthly, extra } = splitPending(charges, s);
  const targets: PaymentTarget[] = [{ value: "auto", label: "Lo más antiguo primero", pendingCents: monthly + extra }];
  if (monthly > 0) targets.push({ value: "mensual", label: "Cuota mensual de condominio", pendingCents: monthly });
  for (const c of charges) {
    const owed = s.pending.get(c.id) ?? 0;
    if (c.kind === "especial" && owed > 0) {
      targets.push({ value: `cargo:${c.id}`, label: `${c.concept} (${periodLabel(c.period).toLowerCase()})`, pendingCents: owed });
    }
  }
  return targets;
}

export function paymentTargets(unitId: number): PaymentTarget[] {
  const { charges, settlement } = settleUnit(unitId);
  return targetsFrom(charges, settlement);
}

/** Lo que un local todavía debe de lo cobrado en un mes (aviso, canon y cargos de ese mes). */
export function pendingOf(unitId: number, period: string): number {
  const pending = pendingByCharge(unitId);
  return chargesOf(unitId)
    .filter((c) => c.period === period)
    .reduce((n, c) => n + (pending.get(c.id) ?? 0), 0);
}

export type Payment = {
  id: number;
  unitId: number;
  unitCode: string;
  /** Comercio del local; null si está desocupado. */
  business: string | null;
  paidOn: string;
  method: string;
  currency: "USD" | "VES";
  amountCents: number;
  rate: number | null;
  usdCents: number;
  reference: string | null;
  note: string | null;
  status: "pendiente" | "aprobado" | "rechazado";
  /** Cuándo la administración lo aprobó o rechazó; null si sigue por verificar. */
  reviewedAt: string | null;
  /** A qué lo destinó el local (ver lib/allocation.ts) y, si es una cuota extra, cuál. */
  appliesTo: AppliesTo;
  chargeId: number | null;
  chargeConcept: string | null;
};

const PAYMENT_SQL = `
  SELECT p.id, p.unit_id AS unitId, u.code AS unitCode, u.business, p.paid_on AS paidOn, p.method,
    p.currency, p.amount_cents AS amountCents, p.rate, p.usd_cents AS usdCents,
    p.reference, p.note, p.status, p.reviewed_at AS reviewedAt,
    p.applies_to AS appliesTo, p.charge_id AS chargeId, ch.concept AS chargeConcept
  FROM payments p JOIN units u ON u.id = p.unit_id LEFT JOIN charges ch ON ch.id = p.charge_id`;

export function paymentsOf(unitId: number): Payment[] {
  return all<Payment>(`${PAYMENT_SQL} WHERE p.unit_id = ? ORDER BY p.paid_on DESC, p.id DESC`, unitId);
}

export function pendingPayments(): Payment[] {
  return all<Payment>(`${PAYMENT_SQL} WHERE p.status = 'pendiente' ORDER BY p.created_at`);
}

export function recentPayments(limit: number): Payment[] {
  return all<Payment>(
    `${PAYMENT_SQL} WHERE p.status = 'aprobado' ORDER BY p.paid_on DESC, p.id DESC LIMIT ?`,
    limit,
  );
}

const sum = (sql: string, ...params: (string | number)[]) =>
  get<{ total: number | null }>(sql, ...params)?.total ?? 0;

export function chargedIn(period: string): number {
  return sum("SELECT SUM(amount_cents) AS total FROM charges WHERE period = ?", period);
}

export function incomeIn(period: string): number {
  return sum(
    "SELECT SUM(usd_cents) AS total FROM payments WHERE status = 'aprobado' AND substr(paid_on, 1, 7) = ?",
    period,
  );
}

export function expensesIn(period: string): number {
  return sum(
    "SELECT SUM(usd_cents) AS total FROM expenses WHERE kind != 'descuento' AND substr(spent_on, 1, 7) = ?",
    period,
  );
}

/** Cobrado a los locales más los demás ingresos, menos todo lo gastado, en equivalente USD. */
export function cashBalance(): number {
  return (
    sum("SELECT SUM(usd_cents) AS total FROM payments WHERE status = 'aprobado'") +
    sum("SELECT SUM(CASE kind WHEN 'descuento' THEN usd_cents ELSE -usd_cents END) AS total FROM expenses")
  );
}

export type Expense = {
  id: number;
  spentOn: string;
  /** fijo y eventual se reparten por alícuota; descuento es un ingreso que rebaja el aviso. */
  kind: "fijo" | "eventual" | "descuento";
  code: string | null;
  taxable: number;
  category: string;
  description: string;
  supplier: string | null;
  currency: "USD" | "VES";
  amountCents: number;
  rate: number | null;
  usdCents: number;
};

export function expensesOf(period: string): Expense[] {
  return all<Expense>(
    `SELECT id, spent_on AS spentOn, kind, code, taxable, category, description, supplier, currency,
       amount_cents AS amountCents, rate, usd_cents AS usdCents
     FROM expenses WHERE substr(spent_on, 1, 7) = ?
     ORDER BY CASE kind WHEN 'fijo' THEN 0 WHEN 'eventual' THEN 1 ELSE 2 END, code IS NULL, code, id`,
    period,
  );
}

export type FixedExpense = {
  id: number;
  code: string | null;
  description: string;
  category: string;
  supplier: string | null;
  currency: "USD" | "VES";
  /** Monto habitual, en la moneda en que se paga. */
  amountCents: number;
  taxable: number;
  /** Las inactivas se conservan en el maestro pero no se cargan al mes. */
  active: number;
};

/** Maestro de gastos fijos, en el orden en que salen en el aviso de cobro. */
export function listFixedExpenses(): FixedExpense[] {
  return all<FixedExpense>(
    `SELECT id, code, description, category, supplier, currency, amount_cents AS amountCents, taxable, active
     FROM fixed_expenses ORDER BY code IS NULL, code, id`,
  );
}

export type Visit = {
  id: number;
  unitId: number;
  unitCode: string;
  /** Comercio del local, para que seguridad lo ubique por nombre. */
  business: string | null;
  kind: "proveedor" | "carga" | "contratista" | "visita";
  visitorName: string;
  company: string | null;
  idDoc: string | null;
  plate: string | null;
  expectedOn: string;
  code: string;
  note: string | null;
  status: "por_aprobar" | "rechazada" | "autorizada" | "adentro" | "salio" | "cancelada";
  enteredAt: string | null;
  exitedAt: string | null;
};

const VISIT_SQL = `
  SELECT v.id, v.unit_id AS unitId, u.code AS unitCode, u.business, v.kind,
    v.visitor_name AS visitorName, v.company, v.id_doc AS idDoc, v.plate, v.expected_on AS expectedOn, v.code, v.note, v.status,
    v.entered_at AS enteredAt, v.exited_at AS exitedAt
  FROM visits v JOIN units u ON u.id = v.unit_id`;

export function visitsOfUnit(unitId: number, from: string): Visit[] {
  return all<Visit>(
    `${VISIT_SQL} WHERE v.unit_id = ? AND (v.expected_on >= ? OR v.status = 'adentro')
     ORDER BY v.expected_on, v.id`,
    unitId, from,
  );
}

/** Lo que ve seguridad: lo autorizado para hoy y quien siga adentro. */
export function gateVisits(date: string): Visit[] {
  return all<Visit>(
    `${VISIT_SQL}
     WHERE (v.expected_on = ? AND v.status IN ('autorizada', 'salio')) OR v.status = 'adentro'
     ORDER BY CASE v.status WHEN 'autorizada' THEN 0 WHEN 'adentro' THEN 1 ELSE 2 END, v.id DESC`,
    date,
  );
}

/** Trabajos de contratistas que esperan la aprobación de la administración. */
export function accessesToApprove(from: string): Visit[] {
  return all<Visit>(
    `${VISIT_SQL} WHERE v.status = 'por_aprobar' AND v.expected_on >= ? ORDER BY v.expected_on, v.id`,
    from,
  );
}

export type Announcement = {
  id: number;
  title: string;
  body: string;
  pinned: number;
  createdAt: string;
  audienceLevel: string | null;
  audienceAisle: string | null;
};

export function listAnnouncements(viewer: Viewer, limit = 50): Announcement[] {
  const filter = audienceFilter("a", viewer);
  return all<Announcement>(
    `SELECT a.id, a.title, a.body, a.pinned, a.created_at AS createdAt,
       a.audience_level AS audienceLevel, a.audience_aisle AS audienceAisle
     FROM announcements a WHERE ${filter.sql}
     ORDER BY a.pinned DESC, a.created_at DESC, a.id DESC LIMIT ?`,
    ...filter.params, limit,
  );
}

export type Poll = {
  id: number;
  question: string;
  closesOn: string;
  options: { id: number; label: string; votes: number }[];
  totalVotes: number;
  myOptionId: number | null;
};

export function listPolls(unitId: number | null): Poll[] {
  const polls = all<{ id: number; question: string; closesOn: string }>(
    "SELECT id, question, closes_on AS closesOn FROM polls ORDER BY closes_on DESC, id DESC",
  );
  return polls.map((p) => {
    const options = all<{ id: number; label: string; votes: number }>(
      `SELECT o.id, o.label,
         (SELECT COUNT(*) FROM votes v WHERE v.option_id = o.id) AS votes
       FROM poll_options o WHERE o.poll_id = ? ORDER BY o.id`,
      p.id,
    ).map((o) => ({ ...o }));
    const mine = unitId
      ? get<{ optionId: number }>(
          "SELECT option_id AS optionId FROM votes WHERE poll_id = ? AND unit_id = ?",
          p.id, unitId,
        )
      : undefined;
    return {
      ...p,
      options,
      totalVotes: options.reduce((n, o) => n + o.votes, 0),
      myOptionId: mine?.optionId ?? null,
    };
  });
}

export type Amenity = { id: number; name: string; description: string | null };

export function listAmenities(): Amenity[] {
  return all<Amenity>("SELECT id, name, description FROM amenities ORDER BY id");
}

export type Reservation = {
  id: number;
  amenityId: number;
  amenityName: string;
  unitId: number;
  unitCode: string;
  date: string;
  slot: string;
  note: string | null;
};

const RESERVATION_SQL = `
  SELECT r.id, r.amenity_id AS amenityId, a.name AS amenityName, r.unit_id AS unitId,
    u.code AS unitCode, r.date, r.slot, r.note
  FROM reservations r
  JOIN amenities a ON a.id = r.amenity_id
  JOIN units u ON u.id = r.unit_id`;

export function reservationsOn(date: string): Reservation[] {
  return all<Reservation>(`${RESERVATION_SQL} WHERE r.date = ?`, date);
}

export function upcomingReservations(from: string, unitId: number | null): Reservation[] {
  return unitId
    ? all<Reservation>(
        `${RESERVATION_SQL} WHERE r.date >= ? AND r.unit_id = ? ORDER BY r.date, r.id`,
        from, unitId,
      )
    : all<Reservation>(`${RESERVATION_SQL} WHERE r.date >= ? ORDER BY r.date, r.id`, from);
}

export type UserRow = {
  id: number;
  name: string;
  email: string;
  role: "admin" | "comerciante" | "vigilante";
  unitCode: string | null;
  active: number;
};

export function listUsers(): UserRow[] {
  return all<UserRow>(
    `SELECT us.id, us.name, us.email, us.role, un.code AS unitCode, us.active
     FROM users us LEFT JOIN units un ON un.id = us.unit_id
     ORDER BY us.role, un.id, us.name`,
  );
}

export type UnitPermissions = Unit & {
  /** Permisos suspendidos al local, p. ej. ["reservar", "escribir"]. */
  blocked: string[];
  /** Usuarios activos del local; puede ser 0 si aún no se le creó ninguno. */
  users: number;
};

export function listUnitPermissions(): UnitPermissions[] {
  return all<Unit & { blockedList: string | null; users: number }>(
    `SELECT ${UNIT_COLUMNS},
       (SELECT GROUP_CONCAT(privilege) FROM unit_restrictions r WHERE r.unit_id = u.id) AS blockedList,
       (SELECT COUNT(*) FROM users us WHERE us.unit_id = u.id AND us.active = 1) AS users
     FROM units u`,
  )
    .map(({ blockedList, ...u }) => ({ ...u, blocked: blockedList ? blockedList.split(",") : [] }))
    .sort(compareAddress);
}

export type Notification = {
  id: number;
  kind: string;
  title: string;
  body: string;
  href: string;
  readAt: string | null;
  createdAt: string;
};

export function notificationsOf(userId: number, limit = 60): Notification[] {
  return all<Notification>(
    `SELECT id, kind, title, body, href, read_at AS readAt, created_at AS createdAt
     FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?`,
    userId, limit,
  );
}

export function unreadNotifications(userId: number): number {
  return sum("SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL", userId);
}

export type LatestNotification = { id: number; title: string; body: string; href: string };

/** La notificación sin leer más reciente: la app la anuncia en pantalla y con sonido si llega con ella abierta. */
export function latestUnreadNotification(userId: number): LatestNotification | null {
  const row = get<LatestNotification>(
    `SELECT id, title, body, href FROM notifications
     WHERE user_id = ? AND read_at IS NULL ORDER BY id DESC LIMIT 1`,
    userId,
  );
  // Copia simple: la fila de SQLite no es un objeto común y no puede ir a un componente del navegador.
  return row ? { id: row.id, title: row.title, body: row.body, href: row.href } : null;
}

export type Message = {
  id: number;
  fromAdmin: number;
  senderName: string;
  body: string;
  createdAt: string;
};

export function messagesOf(unitId: number): Message[] {
  return all<Message>(
    `SELECT m.id, m.from_admin AS fromAdmin, u.name AS senderName, m.body, m.created_at AS createdAt
     FROM messages m JOIN users u ON u.id = m.sender_id
     WHERE m.unit_id = ? ORDER BY m.id`,
    unitId,
  );
}

/** Mensajes sin leer: los de la administración para un comerciante, los de los comerciantes para la administración. */
export function unreadMessages(viewer: { role: string; unitId: number | null }): number {
  if (viewer.role === "admin") {
    return sum("SELECT COUNT(*) AS total FROM messages WHERE from_admin = 0 AND read_at IS NULL");
  }
  if (!viewer.unitId) return 0;
  return sum(
    "SELECT COUNT(*) AS total FROM messages WHERE unit_id = ? AND from_admin = 1 AND read_at IS NULL",
    viewer.unitId,
  );
}

export type Thread = {
  unitId: number;
  unitCode: string;
  owner: string;
  business: string | null;
  lastBody: string | null;
  lastAt: string | null;
  lastFromAdmin: number | null;
  unread: number;
  level: string | null;
  aisle: string | null;
  number: string | null;
};

/** Bandeja de la administración: una fila por local, las conversaciones recientes primero. */
export function listThreads(): Thread[] {
  const threads = all<Thread>(
    `SELECT u.id AS unitId, u.code AS unitCode, u.owner, u.business, u.level, u.aisle, u.number,
       last.body AS lastBody, last.created_at AS lastAt, last.from_admin AS lastFromAdmin,
       (SELECT COUNT(*) FROM messages m
        WHERE m.unit_id = u.id AND m.from_admin = 0 AND m.read_at IS NULL) AS unread
     FROM units u
     LEFT JOIN messages last
       ON last.id = (SELECT MAX(id) FROM messages WHERE unit_id = u.id)
     ORDER BY last.id IS NULL, last.id DESC`,
  );
  // Las conversaciones abiertas van primero, por actividad; los locales sin mensajes, por dirección.
  return [...threads.filter((t) => t.lastAt), ...threads.filter((t) => !t.lastAt).sort(compareAddress)];
}

export type Alert = {
  id: number;
  kind: AlertKind;
  title: string;
  body: string;
  photo: string | null;
  status: AlertStatus;
  createdAt: string;
  userId: number;
  /** El comercio que lo envió, o "Administración" / "Seguridad" si no fue un local. */
  author: string;
  /** Ubicación del local que lo envió; null si lo envió la administración o la seguridad. */
  unitCode: string | null;
  comments: number;
  audienceLevel: string | null;
  audienceAisle: string | null;
};

const AUTHOR_SQL = `COALESCE(un.business, un.code,
      CASE us.role WHEN 'admin' THEN 'Administración' ELSE 'Seguridad' END)`;

const ALERT_SQL = `
  SELECT a.id, a.kind, a.title, a.body, a.photo, a.status, a.created_at AS createdAt,
    a.user_id AS userId, a.audience_level AS audienceLevel, a.audience_aisle AS audienceAisle,
    ${AUTHOR_SQL} AS author, un.code AS unitCode,
    (SELECT COUNT(*) FROM alert_comments c WHERE c.alert_id = a.id) AS comments
  FROM alerts a
  JOIN users us ON us.id = a.user_id
  LEFT JOIN units un ON un.id = a.unit_id`;

/**
 * Qué reportes ve un comerciante: los de su propio local y, de los demás, solo los
 * que se difunden (seguridad, emergencia y avisos) dirigidos a su zona. Las fallas
 * de mantenimiento y limpieza de otros locales no le aparecen.
 */
function alertFilter(viewer: Viewer): { sql: string; params: (string | number | null)[] } {
  if (viewer.role !== "comerciante") return { sql: "1 = 1", params: [] };
  const audience = audienceFilter("a", viewer);
  return {
    sql: `(a.unit_id = ? OR (a.kind IN (${BROADCAST_KINDS.map(() => "?").join(", ")}) AND ${audience.sql}))`,
    params: [viewer.unitId, ...BROADCAST_KINDS, ...audience.params],
  };
}

/** Abiertos primero; dentro de cada grupo, los más recientes arriba. */
export function listAlerts(viewer: Viewer, limit = 40): Alert[] {
  const filter = alertFilter(viewer);
  return all<Alert>(
    `${ALERT_SQL} WHERE ${filter.sql} ORDER BY a.status = 'resuelta', a.created_at DESC LIMIT ?`,
    ...filter.params, limit,
  );
}

export function activeAlerts(viewer: Viewer, limit = 3): Alert[] {
  const filter = alertFilter(viewer);
  return all<Alert>(
    `${ALERT_SQL} WHERE a.status != 'resuelta' AND ${filter.sql} ORDER BY a.created_at DESC LIMIT ?`,
    ...filter.params, limit,
  );
}

/** Un reporte, solo si a quien lo pide le corresponde verlo. */
export function getAlert(id: number, viewer: Viewer): Alert | null {
  const filter = alertFilter(viewer);
  const row = get<Alert>(`${ALERT_SQL} WHERE a.id = ? AND ${filter.sql}`, id, ...filter.params);
  return row ? { ...row } : null;
}

/** Reporte de seguridad o emergencia aún abierto y reciente: se muestra en todas las pantallas. */
export function urgentAlert(viewer: Viewer, sinceIso: string): Alert | null {
  const filter = alertFilter(viewer);
  const row = get<Alert>(
    `${ALERT_SQL} WHERE a.status != 'resuelta' AND a.kind IN ('seguridad', 'emergencia')
       AND a.created_at >= ? AND ${filter.sql} ORDER BY a.created_at DESC LIMIT 1`,
    sinceIso, ...filter.params,
  );
  return row ? { ...row } : null;
}

/** Fallas y reportes sin cerrar, para el resumen de la administración. */
export function openAlertCount(): number {
  return sum("SELECT COUNT(*) AS total FROM alerts WHERE status != 'resuelta'");
}

export type AlertComment = { id: number; body: string; createdAt: string; author: string; userId: number };

export function alertComments(alertId: number): AlertComment[] {
  return all<AlertComment>(
    `SELECT c.id, c.body, c.created_at AS createdAt, c.user_id AS userId,
       ${AUTHOR_SQL} AS author
     FROM alert_comments c
     JOIN users us ON us.id = c.user_id
     LEFT JOIN units un ON un.id = us.unit_id
     WHERE c.alert_id = ? ORDER BY c.id`,
    alertId,
  );
}

/** Niveles del centro comercial y las pasillos de cada una, para elegir destinatarios. */
export function listZones(): { level: string; aisles: string[] }[] {
  const zones: { level: string; aisles: string[] }[] = [];
  for (const unit of listUnits()) {
    if (!unit.level) continue;
    let zone = zones.find((z) => z.level === unit.level);
    if (!zone) zones.push((zone = { level: unit.level, aisles: [] }));
    if (unit.aisle && !zone.aisles.includes(unit.aisle)) zone.aisles.push(unit.aisle);
  }
  return zones;
}

/** Usuarios comerciantes activos de una zona (todo el centro comercial si no se indica nivel). */
export function residentsOf(level: string | null, aisle: string | null): number[] {
  return all<{ id: number }>(
    `SELECT us.id FROM users us JOIN units un ON un.id = us.unit_id
     WHERE us.role = 'comerciante' AND us.active = 1
       AND (? IS NULL OR un.level = ?) AND (? IS NULL OR un.aisle = ?)`,
    level, level, aisle, aisle,
  ).map((u) => u.id);
}
