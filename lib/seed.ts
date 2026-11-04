import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { unitLabel } from "./address";
import { hashPassword } from "./password";
import { currentPeriod, nowIso, periodLabel, shiftPeriod, today, usd } from "./format";
import { share, statementTotals, withReserve, type StatementLine } from "./statement-math";

// Datos de demostración: se cargan solo cuando la base está vacía.
// Para empezar de cero, borra data/atrio.db y vuelve a arrancar.
/**
 * Contraseña de las cuentas de demostración. Nunca va en el código: se toma de la
 * variable DEMO_PASSWORD o, si no está, se genera una al azar. En el sitio de
 * demostración no hace falta saberla: se entra con los botones de un toque.
 */
function demoPassword(): string {
  const fromEnv = process.env.DEMO_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  const generated = randomBytes(12).toString("base64url");
  if (process.env.NODE_ENV !== "production") {
    console.log(`[demo] Contraseña de las cuentas de demostración: ${generated}`);
  }
  return generated;
}

const SITE_NAME = "Paseo Las Delicias II";
const SITE_LOCATION = "Maracay, estado Aragua";
// Nombres inventados: ningún comercio ni propietario de la demostración es real.
const LANDLORD = "Promotora del centro comercial";
const RESERVE_PERCENT = 13; // fondo de reserva y publicidad, sobre los gastos del mes
const DUE_DAY = 10;
const RENT_RATE_CENTS = 1400; // por m² al mes, en los locales que alquila el centro comercial

/** Niveles del centro comercial de demostración: pasillos y locales por pasillo. */
const LAYOUT: { level: string; aisles: string[]; perAisle: number }[] = [
  { level: "PB", aisles: ["A", "B", "C"], perAisle: 14 },
  { level: "1", aisles: ["A", "B", "C"], perAisle: 14 },
  { level: "2", aisles: ["A", "B"], perAisle: 12 },
  { level: "Feria", aisles: ["A"], perAisle: 12 },
];

const SHOPS = [
  "Boutique", "Zapatería", "Óptica", "Joyería", "Librería", "Perfumería", "Juguetería", "Farmacia",
  "Relojería", "Peluquería", "Barbería", "Telefonía", "Electrónica", "Deportes", "Lencería",
  "Bisutería", "Papelería", "Floristería", "Cosméticos", "Tienda de regalos", "Agencia de viajes",
  "Hogar y decoración", "Ropa infantil", "Casa de cambio",
];
const FOOD = [
  "Pizzería", "Arepera", "Hamburguesas", "Pollos", "Sushi", "Heladería", "Jugos", "Parrilla",
  "Empanadas", "Pastas", "Postres", "Comida criolla",
];
const NAMES = [
  "Alba", "Brisa", "Canaima", "Dorado", "Estrella", "Faro", "Girasol", "Horizonte", "Índigo",
  "Jazmín", "Kairós", "Luna", "Marfil", "Nogal", "Orquídea", "Perla", "Quetzal", "Roble", "Sol",
  "Trébol", "Universo", "Valle", "Zafiro",
];
const FIRST = ["María", "José", "Carmen", "Luis", "Ana", "Pedro", "Rosa", "Carlos", "Elena", "Miguel", "Isabel"];
const LAST = [
  "Ascanio", "Blanco", "Tovar", "Herrera", "Ibarra", "Palacios", "Rivas", "Toro", "Ponte", "Mijares",
  "Lovera", "Urbina", "Pacheco",
];
const AREAS = [24, 32, 36, 45, 28, 60, 40, 52, 30, 75, 22, 48];

/** Locales con nombre y superficie propios: las tiendas ancla y el local de prueba. */
const FEATURED: Record<number, { business: string; area: number; owner?: string }> = {
  0: { business: "Supermercado Central", area: 320 },
  6: { business: "Café Aroma", area: 36, owner: "Daniela Ríos" },
  42: { business: "Tiendas Casa Nova", area: 260 },
};
const DEMO_UNIT = 6;

type DemoUnit = {
  level: string;
  aisle: string;
  number: string;
  owner: string;
  business: string | null;
  occupancy: "propietario" | "alquilado" | "desocupado";
  area: number;
  /** Alícuota en porcentaje, proporcional a la superficie. */
  aliquot: number;
  rentCents: number;
};

function demoUnits(): DemoUnit[] {
  const units: Omit<DemoUnit, "aliquot">[] = [];
  for (const { level, aisles, perAisle } of LAYOUT) {
    for (const aisle of aisles) {
      for (let n = 1; n <= perAisle; n++) {
        const i = units.length;
        const food = level === "Feria";
        const person = FEATURED[i]?.owner ?? `${FIRST[i % FIRST.length]} ${LAST[(i * 5) % LAST.length]}`;
        const area = FEATURED[i]?.area ?? (food ? 22 + (i % 4) * 4 : AREAS[i % AREAS.length]);
        const business =
          FEATURED[i]?.business ??
          `${food ? FOOD[i % FOOD.length] : SHOPS[i % SHOPS.length]} ${NAMES[(i * 7) % NAMES.length]}`;
        // De cada 20 locales: 2 son de la promotora, que los alquila y cobra el canon;
        // 12 los opera su dueño, 5 los alquila un propietario particular y 1 está desocupado.
        const slot = i % 20;
        const base = { level, aisle, number: String(n), area };
        if (slot < 2) {
          units.push({ ...base, owner: LANDLORD, business, occupancy: "alquilado", rentCents: area * RENT_RATE_CENTS });
        } else if (slot < 14) {
          units.push({ ...base, owner: person, business, occupancy: "propietario", rentCents: 0 });
        } else if (slot < 19) {
          units.push({ ...base, owner: person, business, occupancy: "alquilado", rentCents: 0 });
        } else {
          units.push({ ...base, owner: person, business: null, occupancy: "desocupado", rentCents: 0 });
        }
      }
    }
  }
  const totalArea = units.reduce((n, u) => n + u.area, 0);
  return units.map((u) => ({ ...u, aliquot: Math.round((u.area / totalArea) * 1_000_000) / 10_000 }));
}

const UNITS = demoUnits();

type DemoLine = [kind: "fijo" | "eventual" | "descuento", code: string, description: string, category: string, bs: number, taxable: 0 | 1];

/** Gastos fijos de un mes típico, en bolívares: los que se repiten todos los meses. */
const FIXED: DemoLine[] = [
  ["fijo", "N00001", "Nómina, primera quincena", "Administración", 1_862_400, 0],
  ["fijo", "N00002", "Nómina, segunda quincena", "Administración", 2_041_750, 0],
  ["fijo", "F00001", "Liquidación y apartado de prestaciones sociales", "Administración", 2_395_300, 0],
  ["fijo", "G00001", "Cesta ticket del personal", "Administración", 1_948_600, 0],
  ["fijo", "G00002", "Energía eléctrica y aseo de áreas comunes", "Servicios", 148_920, 1],
  ["fijo", "G00003", "Banavih / FAOV", "Administración", 9_850, 0],
  ["fijo", "S00001", "Seguro social (IVSS)", "Administración", 48_300, 0],
  ["fijo", "G00004", "Telefonía e internet", "Servicios", 18_640, 1],
  ["fijo", "G00005", "Agua", "Servicios", 1_031_200, 0],
  ["fijo", "G00006", "INCES", "Administración", 37_250, 0],
  ["fijo", "M00001", "Mantenimiento de ascensores", "Ascensores y escaleras", 156_800, 1],
  ["fijo", "M00002", "Mantenimiento de jardines", "Mantenimiento", 164_500, 1],
  ["fijo", "G00007", "Honorarios contables", "Administración", 102_300, 1],
  ["fijo", "I00001", "Aseo y relleno sanitario", "Limpieza", 179_400, 0],
];
const DISCOUNTS: DemoLine[] = [
  ["descuento", "A00001", "Aporte del hotel a los gastos del mes", "Otros", 1_068_000, 0],
  ["descuento", "A00002", "Aporte de la feria a los gastos del mes", "Otros", 1_015_500, 0],
  ["descuento", "A00003", "Alquiler de áreas comunes y antenas", "Otros", 1_118_900, 0],
];
/** Gastos eventuales de cada mes, del más antiguo al mes en curso. */
const EVENTUAL: DemoLine[][] = [
  [
    ["eventual", "GRMG001", "Reparaciones y mantenimiento general", "Mantenimiento", 1_104_300, 1],
    ["eventual", "GVG0001", "Gastos varios generales", "Otros", 962_800, 1],
    ["eventual", "CHILL01", "Mantenimiento mayor de los chillers", "Aire acondicionado", 2_640_000, 1],
    ["eventual", "INSELEC", "Insumos eléctricos", "Mantenimiento", 187_450, 1],
  ],
  [
    ["eventual", "GRMG001", "Reparaciones y mantenimiento general", "Mantenimiento", 1_287_500, 1],
    ["eventual", "GVG0001", "Gastos varios generales", "Otros", 1_074_200, 1],
    ["eventual", "AREO001", "Artículos y reparación de equipos de oficina", "Administración", 98_700, 1],
    ["eventual", "PROTPEN", "Declaración de protección a las pensiones", "Administración", 431_900, 0],
    ["eventual", "ESCMEC1", "Reparación de la escalera mecánica norte", "Ascensores y escaleras", 1_530_000, 1],
  ],
  [
    ["eventual", "GRMG001", "Reparaciones y mantenimiento general", "Mantenimiento", 1_296_000, 1],
    ["eventual", "GVG0001", "Gastos varios generales", "Otros", 1_080_400, 1],
    ["eventual", "INPSASE", "Viáticos por talleres, registros y certificaciones", "Administración", 12_400, 0],
    ["eventual", "PROTPEN", "Declaración de protección a las pensiones", "Administración", 435_400, 0],
    ["eventual", "EQUIENV", "Dotación del personal y pipotes de agua para baños", "Limpieza", 214_300, 1],
    ["eventual", "MOFACH1", "Mano de obra: reposición de acabados de la fachada este", "Reparaciones", 3_068_000, 1],
    ["eventual", "MATFACH", "Materiales: reposición de la fachada dañada", "Reparaciones", 2_706_500, 1],
    ["eventual", "OBSTAN1", "Plomería: obstrucción de aguas negras en PB", "Reparaciones", 181_600, 1],
  ],
  [
    ["eventual", "GRMG001", "Reparaciones y mantenimiento general", "Mantenimiento", 418_000, 1],
    ["eventual", "LUMEST1", "Luminarias LED del estacionamiento", "Mantenimiento", 826_500, 1],
  ],
];
/** Tasa BCV de demostración al cierre de cada uno de esos cuatro meses. */
const RATES = [748.2, 772.3, 804.81, 852.6];
const demoLabel = (i: number) => unitLabel(UNITS[i]);

export const DEMO_ACCOUNTS = [
  { role: "Administración", email: "admin@condosmart.test" },
  { role: `Comerciante (${demoLabel(DEMO_UNIT)})`, email: "comerciante@condosmart.test" },
  { role: "Seguridad", email: "seguridad@condosmart.test" },
];

/**
 * Arranque real: base vacía con una sola cuenta de la administración, tomada de
 * las variables ADMIN_EMAIL y ADMIN_PASSWORD. Los locales, los comerciantes y las
 * tarifas se cargan después desde Administración.
 */
export function seedProduction(conn: DatabaseSync) {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!email || password.length < 10) {
    throw new Error(
      "Primera puesta en marcha: define ADMIN_EMAIL y ADMIN_PASSWORD (mínimo 10 caracteres) " +
        "para crear la cuenta de la administración, o SEED_DEMO=1 para cargar los datos de demostración.",
    );
  }
  conn.exec("BEGIN");
  const setting = conn.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  setting.run("name", "Centro comercial");
  setting.run("reserve_percent", "0");
  setting.run("due_day", String(DUE_DAY));
  setting.run("payment_info", "");
  conn
    .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'admin')")
    .run("Administración", email, hashPassword(password));
  conn.exec("COMMIT");
}

export function seedDemo(conn: DatabaseSync) {
  const now = nowIso();
  const period = currentPeriod();
  // Cuatro meses de gastos: de los tres anteriores ya se emitió el aviso de cobro;
  // el mes en curso tiene sus gastos cargados y está por emitir.
  const periods = [shiftPeriod(period, -3), shiftPeriod(period, -2), shiftPeriod(period, -1), period];
  const issued = periods.slice(0, 3);
  const insert = (sql: string, ...params: (string | number | null)[]) =>
    Number(conn.prepare(sql).run(...params).lastInsertRowid);

  conn.exec("BEGIN");

  const setting = conn.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  setting.run("name", SITE_NAME);
  setting.run("location", SITE_LOCATION);
  setting.run("rif", "J-00000000-0");
  setting.run("reserve_percent", String(RESERVE_PERCENT));
  setting.run("due_day", String(DUE_DAY));
  setting.run(
    "payment_info",
    "Transferencia: Banco 0102 · J-00000000-0 · Cuenta corriente 0102-0000-00-0000000000\nPago móvil: 0102 · J-00000000-0 · 0412-0000000\nZelle: pagos@condosmart.test\nEfectivo: en la oficina de administración, de lunes a viernes.",
  );

  periods.forEach((p, k) => {
    insert("INSERT INTO rates (date, bs_per_usd, source) VALUES (?, ?, 'demo')", `${p}-01`, RATES[k]);
  });

  const unitIds = UNITS.map((u) =>
    insert(
      `INSERT INTO units (code, owner, level, aisle, number, business, occupancy, aliquot, area_m2, rent_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      unitLabel(u), u.owner, u.level, u.aisle, u.number, u.business, u.occupancy, u.aliquot, u.area, u.rentCents,
    ),
  );

  const hash = hashPassword(demoPassword());
  const user = (name: string, email: string, role: string, unitId: number | null) =>
    insert(
      "INSERT INTO users (name, email, password_hash, role, unit_id) VALUES (?, ?, ?, ?, ?)",
      name, email, hash, role, unitId,
    );
  const admin = user("Administración", DEMO_ACCOUNTS[0].email, "admin", null);
  const tenant = user("Daniela Ríos", DEMO_ACCOUNTS[1].email, "comerciante", unitIds[DEMO_UNIT]);
  user("Seguridad", DEMO_ACCOUNTS[2].email, "vigilante", null);

  // Gastos de cada mes, en bolívares, con el mismo detalle del aviso de cobro.
  const cents = (bs: number) => Math.round(bs * 100);
  const monthLines = (k: number): DemoLine[] => [
    // Los fijos suben un poco cada mes; del mes en curso solo va cargada la primera quincena.
    ...FIXED.slice(0, k === 3 ? 5 : FIXED.length).map(
      ([kind, code, description, category, bs, taxable]): DemoLine =>
        [kind, code, description, category, Math.round(bs * (1 + 0.025 * k)), taxable],
    ),
    ...EVENTUAL[k],
    ...(k === 3 ? [] : DISCOUNTS),
  ];
  periods.forEach((p, k) => {
    for (const [kind, code, description, category, bs, taxable] of monthLines(k)) {
      insert(
        `INSERT INTO expenses (spent_on, kind, code, taxable, category, description, currency, amount_cents,
           rate, usd_cents, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'VES', ?, ?, ?, ?, ?)`,
        k === 3 ? today() : `${p}-28`, kind, code, taxable, category, description, cents(bs),
        RATES[k], Math.round(cents(bs) / RATES[k]), admin, now,
      );
    }
  });

  // El maestro de gastos fijos, con el monto habitual de cada partida.
  for (const [, code, description, category, bs, taxable] of FIXED) {
    insert(
      `INSERT INTO fixed_expenses (code, description, category, currency, amount_cents, taxable, created_at)
       VALUES (?, ?, ?, 'VES', ?, ?, ?)`,
      code, description, category, cents(bs), taxable, now,
    );
  }

  // Avisos de cobro de los tres meses cerrados. Cada uno se calcula el día 3 del mes
  // siguiente, a la tasa de ese día, y vence el 10.
  const monthly: number[][] = []; // monthly[k][i]: lo cobrado al local i en el aviso k, en centavos de USD
  issued.forEach((p, k) => {
    const next = periods[k + 1];
    const rate = RATES[k + 1];
    const issuedOn = `${next}-03` < today() ? `${next}-03` : today();
    insert(
      "INSERT INTO statements (period, issued_on, due_on, rate, created_at) VALUES (?, ?, ?, ?, ?)",
      p, issuedOn, `${next}-${String(DUE_DAY).padStart(2, "0")}`, rate, now,
    );
    const lines: StatementLine[] = withReserve(
      monthLines(k).map(([section, code, description, , bs, taxable]) => ({
        section, code, description, amountCents: cents(bs), taxable,
      })),
      RESERVE_PERCENT,
    );
    for (const l of lines) {
      insert(
        "INSERT INTO statement_lines (period, section, code, description, amount_cents, taxable) VALUES (?, ?, ?, ?, ?, ?)",
        p, l.section, l.code, l.description, l.amountCents, l.taxable,
      );
    }
    monthly.push(
      UNITS.map((u, i) => {
        const bs = statementTotals(lines, u.aliquot).neto;
        const usdCents = Math.round(bs / rate);
        insert(
          `INSERT INTO charges (unit_id, period, kind, concept, amount_cents, aliquot, bs_cents, created_at)
           VALUES (?, ?, 'condominio', ?, ?, ?, ?, ?)`,
          unitIds[i], p, `Condominio ${periodLabel(p)}`, usdCents, u.aliquot, bs, now,
        );
        if (u.rentCents) {
          insert(
            "INSERT INTO charges (unit_id, period, kind, concept, amount_cents, created_at) VALUES (?, ?, 'canon', ?, ?, ?)",
            unitIds[i], p, `Canon de arrendamiento ${periodLabel(p)}`, u.rentCents, now,
          );
        }
        return usdCents + u.rentCents;
      }),
    );
  });

  // Pagos: casi todos al día; algunos deben dos avisos y unos pocos, los tres.
  issued.forEach((p, k) => {
    const next = periods[k + 1];
    const latest = k === issued.length - 1;
    UNITS.forEach((_, i) => {
      const veryLate = i % 37 === 9;
      const late = i % 11 === 4;
      // El último aviso aún no vence: lo ha pagado un tercio. El local de prueba lo debe.
      const paid = !veryLate && (latest ? i % 3 === 0 && i !== DEMO_UNIT && !late : !(late && k === 1));
      if (!paid) return;
      const total = monthly[k][i];
      const inBs = i % 2 === 0;
      const rate = inBs ? RATES[k + 1] : null;
      insert(
        `INSERT INTO payments (unit_id, paid_on, method, currency, amount_cents, rate, usd_cents,
           reference, status, reported_by, reviewed_by, reviewed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aprobado', ?, ?, ?, ?)`,
        unitIds[i],
        latest ? today() : `${next}-${String(4 + (i % 6)).padStart(2, "0")}`,
        inBs ? "transferencia" : "zelle",
        inBs ? "VES" : "USD",
        inBs ? Math.round(total * rate!) : total,
        rate,
        total,
        inBs ? String(48210000 + k * 1000 + i * 7) : null,
        admin, admin, now, now,
      );
    });
  });

  // Un pago reportado por el local de prueba, esperando conciliación.
  const demoDue = monthly[issued.length - 1][DEMO_UNIT];
  insert(
    `INSERT INTO payments (unit_id, paid_on, method, currency, amount_cents, rate, usd_cents,
       reference, status, reported_by, created_at)
     VALUES (?, ?, 'zelle', 'USD', ?, NULL, ?, 'Zelle a nombre de la administración', 'pendiente', ?, ?)`,
    unitIds[DEMO_UNIT], today(), demoDue, demoDue, tenant, now,
  );

  const announcement = (title: string, body: string, pinned: number, level: string | null = null) =>
    insert(
      "INSERT INTO announcements (title, body, pinned, created_by, created_at, audience_level) VALUES (?, ?, ?, ?, ?, ?)",
      title, body, pinned, admin, now, level,
    );
  announcement(
    `Bienvenidos a la app de ${SITE_NAME}`,
    "Desde aquí puedes ver tu estado de cuenta, reportar pagos, autorizar a tus proveedores y contratistas, reservar el andén de carga y reportar fallas. Cualquier duda, escribe a la administración.",
    1,
  );
  announcement(
    "Mantenimiento de las escaleras mecánicas",
    "El martes de 7:00 a 10:00 a. m. las escaleras del lado norte estarán fuera de servicio. Los ascensores funcionarán con normalidad.",
    0,
  );
  announcement(
    "Fumigación de la feria de comida",
    "El domingo a las 10:00 p. m., al cierre. Dejen los alimentos guardados y las superficies despejadas.",
    0,
    "Feria",
  );

  const poll = insert(
    "INSERT INTO polls (question, closes_on, created_at) VALUES (?, ?, ?)",
    "¿Extendemos el horario hasta las 9:00 p. m. los viernes y sábados de diciembre?",
    `${shiftPeriod(period, 1)}-15`, now,
  );
  const options = ["Sí, viernes y sábados", "Solo los sábados", "No, mantener el horario"].map((label) =>
    insert("INSERT INTO poll_options (poll_id, label) VALUES (?, ?)", poll, label),
  );
  [0, 1, 0, 2, 0, 0, 1, 0, 2, 0, 1, 0, 0, 2, 1, 0, 0, 1].forEach((opt, i) =>
    insert("INSERT INTO votes (poll_id, unit_id, option_id) VALUES (?, ?, ?)", poll, unitIds[i * 3 + 1], options[opt]),
  );

  const amenity = (name: string, description: string) =>
    insert("INSERT INTO amenities (name, description) VALUES (?, ?)", name, description);
  const dock = amenity("Andén de carga", "Descarga de mercancía por turnos. Un camión por turno.");
  amenity("Salón de reuniones", "Capacidad para 20 personas, con proyector.");
  const plaza = amenity("Plaza central", "Activaciones de marca, eventos y exhibiciones.");
  amenity("Espacio para stand", "Módulo temporal de 2 × 2 m frente a la entrada principal.");
  const reservation = (amenityId: number, unit: number, slot: string, note: string) =>
    insert(
      "INSERT INTO reservations (amenity_id, unit_id, date, slot, note, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      amenityId, unitIds[unit], today(), slot, note, now,
    );
  reservation(dock, 0, "manana", "Recepción de mercancía refrigerada");
  reservation(plaza, 42, "tarde", "Lanzamiento de temporada");

  const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

  // Accesos del día: un proveedor por llegar, un despacho que ya entró y un
  // trabajo de contratista que espera la aprobación de la administración.
  const access = (
    unit: number, kind: string, name: string, company: string, plate: string | null, code: string,
    note: string, status: string, createdBy: number, enteredAt: string | null = null,
  ) =>
    insert(
      `INSERT INTO visits (unit_id, kind, visitor_name, company, plate, expected_on, code, note, status,
         entered_at, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      unitIds[unit], kind, name, company, plate, today(), code, note, status, enteredAt, createdBy, now,
    );
  access(DEMO_UNIT, "proveedor", "Carlos Méndez", "Distribuidora Café Andino", "AB123CD", "482913", "Entrega semanal de café", "autorizada", tenant);
  access(DEMO_UNIT, "contratista", "Luis Paredes", "Climas del Centro", null, "730164", "Mantenimiento del aire del local, de 9:00 p. m. a 12:00 a. m.", "por_aprobar", tenant);
  access(0, "carga", "Jesús Rondón", "Lácteos del Valle", "A45BC6D", "915027", "Camión refrigerado, andén de carga", "adentro", admin, minutesAgo(35));
  access(15, "contratista", "Andrés Salas", "Vitrinas y Vidrios Perla", "AC789DE", "264880", "Cambio del vidrio de la vitrina, fuera de horario", "autorizada", admin);

  // Una conversación corta entre el local de prueba y la administración.
  const message = (senderId: number, fromAdmin: number, body: string, ago: number, read: boolean) =>
    insert(
      "INSERT INTO messages (unit_id, sender_id, from_admin, body, read_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      unitIds[DEMO_UNIT], senderId, fromAdmin, body, read ? now : null, minutesAgo(ago),
    );
  message(tenant, 0, "Buenas tardes. La luminaria del pasillo frente a mi local lleva tres días apagada.", 190, true);
  message(admin, 1, "Gracias por avisar. Mantenimiento la cambia esta semana.", 170, true);
  message(admin, 1, "Listo, quedó cambiada hoy en la mañana. Cualquier cosa nos escribes.", 25, false);

  const notification = (userId: number, kind: string, title: string, body: string, href: string, ago: number) =>
    insert(
      "INSERT INTO notifications (user_id, kind, title, body, href, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      userId, kind, title, body, href, minutesAgo(ago),
    );
  notification(tenant, "cargo", `Aviso de cobro de ${periodLabel(issued[2])}`, `Tu parte de los gastos del mes: ${usd(demoDue)}. Vence el día ${DUE_DAY}.`, "/cobranza", 60 * 26);
  notification(tenant, "aviso", "Mantenimiento de las escaleras mecánicas", "El martes de 7:00 a 10:00 a. m. las escaleras del lado norte estarán fuera de servicio.", "/comunicados", 60 * 5);
  notification(tenant, "consulta", "Nueva consulta", "¿Extendemos el horario hasta las 9:00 p. m. los viernes y sábados de diciembre?", "/comunicados", 60 * 3);
  notification(tenant, "mensaje", "Mensaje de la administración", "Listo, quedó cambiada hoy en la mañana. Cualquier cosa nos escribes.", "/mensajes", 25);
  notification(admin, "pago", "Pago por verificar", `${demoLabel(DEMO_UNIT)} reportó ${usd(demoDue)} por Zelle.`, "/cobranza", 40);
  notification(admin, "visita", "Trabajo por aprobar", `${demoLabel(DEMO_UNIT)} pide autorizar a Climas del Centro.`, "/accesos", 30);

  // Reportes: un aviso de otro local, una falla en proceso y una ya resuelta.
  const other = user("Marta Lovera", "local12@condosmart.test", "comerciante", unitIds[11]);
  const report = (userId: number, unit: number, kind: string, title: string, body: string, status: string, ago: number) =>
    insert(
      "INSERT INTO alerts (user_id, unit_id, kind, title, body, status, resolved_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      userId, unitIds[unit], kind, title, body, status, status === "resuelta" ? now : null, minutesAgo(ago),
    );
  const notice = report(
    other, 11, "aviso", "Inventario el domingo: recibiremos mercancía de noche",
    "Entre las 8:00 y las 11:00 p. m. entrarán dos camiones por el andén. Ya está autorizado con seguridad.", "activa", 50,
  );
  const leak = report(
    tenant, DEMO_UNIT, "mantenimiento", "Filtración en el techo, sobre la vitrina",
    "Gotea desde ayer en la tarde. Puse un envase, pero está mojando el piso del pasillo.", "en_proceso", 60 * 6,
  );
  report(
    other, 11, "limpieza", "Derrame de refresco frente al local",
    "Está resbaloso; pasan muchos niños por aquí.", "resuelta", 60 * 28,
  );
  insert(
    "INSERT INTO alert_comments (alert_id, user_id, body, created_at) VALUES (?, ?, ?, ?)",
    leak, admin, "Mantenimiento ya lo revisó: es el drenaje del aire del nivel 1. Lo reparan mañana a primera hora.", minutesAgo(60 * 4),
  );
  notification(
    tenant, "alerta", "En proceso: Filtración en el techo, sobre la vitrina",
    "La administración está atendiendo tu reporte.", `/reportes/${leak}`, 60 * 4,
  );
  notification(
    tenant, "alerta", "Aviso de mi local: Inventario el domingo",
    `${demoLabel(11)} · Entrarán dos camiones por el andén.`, `/reportes/${notice}`, 50,
  );

  conn.exec("COMMIT");
}
