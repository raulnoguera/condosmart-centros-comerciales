import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { DATABASE_FILE } from "./paths";
import { seedDemo, seedProduction } from "./seed";

const SCHEMA = `
-- Cada local se identifica por nivel + pasillo + número. "code" es la etiqueta
-- completa ya armada ("Nivel 1 · Pasillo C · Local 3"), que es lo que se muestra.
CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  -- Propietario del local: una persona, una empresa o el propio centro comercial.
  owner TEXT NOT NULL,
  phone TEXT,
  level TEXT,
  aisle TEXT,
  number TEXT,
  -- Comercio que opera en el local; vacío si está desocupado.
  business TEXT,
  -- propietario: lo opera su dueño · alquilado: lo opera un inquilino.
  occupancy TEXT NOT NULL DEFAULT 'propietario'
    CHECK (occupancy IN ('propietario', 'alquilado', 'desocupado')),
  -- Alícuota en porcentaje (0,7245 = 0,7245 %): la parte de los gastos del mes que
  -- le toca pagar al local. La superficie es solo informativa.
  aliquot REAL NOT NULL DEFAULT 0 CHECK (aliquot >= 0),
  area_m2 REAL NOT NULL DEFAULT 0 CHECK (area_m2 >= 0),
  -- Canon mensual que cobra la administración (locales que alquila el centro
  -- comercial). En cero cuando el local no paga canon por aquí.
  rent_cents INTEGER NOT NULL DEFAULT 0 CHECK (rent_cents >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS units_address ON units (level, aisle, number);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'comerciante', 'vigilante')),
  unit_id INTEGER REFERENCES units(id),
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Tasa oficial BCV (bolívares por dólar) vigente en cada fecha.
CREATE TABLE IF NOT EXISTS rates (
  date TEXT PRIMARY KEY,
  bs_per_usd REAL NOT NULL,
  source TEXT NOT NULL
);

-- Todo lo que se le cobra a una unidad, siempre en centavos de USD.
CREATE TABLE IF NOT EXISTS charges (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  period TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('condominio', 'canon', 'especial')),
  concept TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  -- Solo en el condominio: la alícuota con que se calculó y el monto en bolívares
  -- del aviso de cobro, tal como se emitió.
  aliquot REAL,
  bs_cents INTEGER,
  created_at TEXT NOT NULL
);
-- Los cobros mensuales se emiten una sola vez por local y mes.
CREATE UNIQUE INDEX IF NOT EXISTS charges_one_per_period
  ON charges (unit_id, period, kind) WHERE kind != 'especial';

-- amount_cents está en la moneda original; usd_cents es lo que abona a la deuda.
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  paid_on TEXT NOT NULL,
  method TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'VES')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  rate REAL,
  usd_cents INTEGER NOT NULL CHECK (usd_cents > 0),
  reference TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (status IN ('pendiente', 'aprobado', 'rechazado')),
  reported_by INTEGER REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  -- A qué se aplica: NULL a lo más antiguo; 'mensual' a las cuotas de condominio y
  -- canon; 'cargo' al cargo especial charge_id (una cuota extra). Ver lib/allocation.ts.
  applies_to TEXT CHECK (applies_to IN ('mensual', 'cargo')),
  charge_id INTEGER
);

-- Partidas del mes. Los gastos fijos y eventuales se reparten entre los locales
-- por alícuota; los descuentos son ingresos del condominio (aportes, alquiler de
-- áreas comunes) que rebajan lo que se reparte.
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  spent_on TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'eventual' CHECK (kind IN ('fijo', 'eventual', 'descuento')),
  -- Código contable con que aparece en el aviso de cobro, p. ej. "N00001".
  code TEXT,
  -- 1 si el monto incluye IVA: su parte se informa aparte en el aviso.
  taxable INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  supplier TEXT,
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'VES')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  rate REAL,
  usd_cents INTEGER NOT NULL CHECK (usd_cents > 0),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

-- Maestro de gastos fijos: las partidas que se repiten todos los meses, con su
-- monto habitual. Desde aquí se cargan de una vez en el mes que se va a cobrar.
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id INTEGER PRIMARY KEY,
  code TEXT,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  supplier TEXT,
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'VES')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  taxable INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- Aviso de cobro de un mes: la foto de las partidas con que se emitió, para que
-- no cambie aunque después se corrija un gasto. Montos en céntimos de bolívar.
CREATE TABLE IF NOT EXISTS statements (
  period TEXT PRIMARY KEY,
  issued_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  -- Tasa BCV de la fecha de cálculo: con ella la deuda queda fijada en dólares.
  rate REAL NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS statement_lines (
  id INTEGER PRIMARY KEY,
  period TEXT NOT NULL REFERENCES statements(period) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('fijo', 'eventual', 'reserva', 'descuento')),
  code TEXT,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  taxable INTEGER NOT NULL DEFAULT 0
);

-- Quién entra por cuenta de un local: proveedores, despachos, contratistas y visitas.
-- Los trabajos de contratistas esperan la aprobación de la administración.
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  kind TEXT NOT NULL DEFAULT 'proveedor'
    CHECK (kind IN ('proveedor', 'carga', 'contratista', 'visita')),
  visitor_name TEXT NOT NULL,
  company TEXT,
  id_doc TEXT,
  plate TEXT,
  expected_on TEXT NOT NULL,
  code TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'autorizada'
    CHECK (status IN ('por_aprobar', 'rechazada', 'autorizada', 'adentro', 'salio', 'cancelada')),
  entered_at TEXT,
  exited_at TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  -- Destinatarios: ambos vacíos = todo el centro comercial; solo nivel = ese nivel;
  -- nivel y pasillo = ese pasillo.
  audience_level TEXT,
  audience_aisle TEXT
);

CREATE TABLE IF NOT EXISTS polls (
  id INTEGER PRIMARY KEY,
  question TEXT NOT NULL,
  closes_on TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS poll_options (
  id INTEGER PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL
);
-- Un voto por unidad, no por persona.
CREATE TABLE IF NOT EXISTS votes (
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  option_id INTEGER NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
  PRIMARY KEY (poll_id, unit_id)
);

CREATE TABLE IF NOT EXISTS amenities (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT
);
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY,
  amenity_id INTEGER NOT NULL REFERENCES amenities(id),
  unit_id INTEGER NOT NULL REFERENCES units(id),
  date TEXT NOT NULL,
  slot TEXT NOT NULL CHECK (slot IN ('manana', 'tarde', 'noche')),
  note TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (amenity_id, date, slot)
);

-- Buzón de cada usuario; también es lo que se envía como push.
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  href TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS notifications_by_user ON notifications (user_id, read_at, id);

-- Conversación entre un local y la administración: un solo hilo por unidad.
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  from_admin INTEGER NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_by_unit ON messages (unit_id, id);

-- Reportes de los locales: los de seguridad, emergencia y avisos los ven los demás
-- locales; los de mantenimiento y limpieza, solo la administración y la seguridad.
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  unit_id INTEGER REFERENCES units(id),
  kind TEXT NOT NULL
    CHECK (kind IN ('seguridad', 'emergencia', 'mantenimiento', 'limpieza', 'aviso')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  photo TEXT,
  status TEXT NOT NULL DEFAULT 'activa' CHECK (status IN ('activa', 'en_proceso', 'resuelta')),
  resolved_at TEXT,
  created_at TEXT NOT NULL,
  audience_level TEXT,
  audience_aisle TEXT
);
CREATE TABLE IF NOT EXISTS alert_comments (
  id INTEGER PRIMARY KEY,
  alert_id INTEGER NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Funciones que la administración le suspendió a un local. Sin fila, está permitido.
-- Aplica a todos los usuarios de ese local, también a los que se creen después.
CREATE TABLE IF NOT EXISTS unit_restrictions (
  unit_id INTEGER NOT NULL REFERENCES units(id),
  privilege TEXT NOT NULL,
  PRIMARY KEY (unit_id, privilege)
);

-- Dispositivos que aceptaron recibir notificaciones push.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

const globalForDb = globalThis as unknown as { __atrioDb?: DatabaseSync };

/** Columnas agregadas después de la primera versión: se crean si la base es anterior. */
function migrate(conn: DatabaseSync) {
  const columns = (table: string) =>
    new Set((conn.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name));
  const payments = columns("payments");
  if (!payments.has("applies_to")) {
    conn.exec("ALTER TABLE payments ADD COLUMN applies_to TEXT CHECK (applies_to IN ('mensual', 'cargo'))");
  }
  if (!payments.has("charge_id")) conn.exec("ALTER TABLE payments ADD COLUMN charge_id INTEGER");
}

function open(): DatabaseSync {
  fs.mkdirSync(path.dirname(DATABASE_FILE), { recursive: true });
  const conn = new DatabaseSync(DATABASE_FILE);
  conn.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  conn.exec(SCHEMA);
  migrate(conn);
  const { n } = conn.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
  if (n === 0) {
    // En producción nunca se crean las cuentas de demostración (se entra a ellas
    // con un toque, sin contraseña) salvo que se pida a propósito con SEED_DEMO=1.
    const demo = process.env.NODE_ENV !== "production" || process.env.SEED_DEMO === "1";
    if (demo) seedDemo(conn);
    else seedProduction(conn);
  }
  return conn;
}

export function db(): DatabaseSync {
  return (globalForDb.__atrioDb ??= open());
}

export function all<T>(sql: string, ...params: SQLInputValue[]): T[] {
  return db().prepare(sql).all(...params) as T[];
}

export function get<T>(sql: string, ...params: SQLInputValue[]): T | undefined {
  return db().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: SQLInputValue[]) {
  return db().prepare(sql).run(...params);
}

export function transaction<T>(fn: () => T): T {
  const conn = db();
  conn.exec("BEGIN");
  try {
    const result = fn();
    conn.exec("COMMIT");
    return result;
  } catch (e) {
    conn.exec("ROLLBACK");
    throw e;
  }
}
