import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { periodLabel } from "./format";
import { IVA_PERCENT, SECTIONS, share, statementTotals, type Section, type Statement } from "./statement-math";

// El aviso de cobro en PDF, con el formato del recibo en papel de un condominio:
// una fila por partida con su monto, el porcentaje del local y lo que le toca.

const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = 34;
const WIDTH = PAGE.width - MARGIN * 2;
const ROW = 12.5;
// Columnas: código, descripción, monto del mes, % del local y monto a pagar.
const COLS = [52, 228, 96, 55, 96];
const X = COLS.map((_, i) => MARGIN + COLS.slice(0, i).reduce((n, w) => n + w, 0));

const INK = rgb(0.06, 0.12, 0.22);
const MUTED = rgb(0.36, 0.35, 0.47);
const LINE = rgb(0.8, 0.85, 0.9);
const FILL = rgb(0.91, 0.94, 0.98);
const BRAND = rgb(0.11, 0.37, 0.64);

const number = new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amount = (cents: number) => number.format(cents / 100);
const percent = (value: number) =>
  `${new Intl.NumberFormat("es-VE", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(value)}%`;
const shortDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const longDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
};

/** Las fuentes estándar del PDF solo cubren Latin-1: lo demás se sustituye para que no falle. */
const safe = (text: string) =>
  text
    .replace(/[−–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[^\x20-\x7E -ÿ]/g, "?");

export type StatementPdfInput = {
  siteName: string;
  location: string;
  /** Logo del centro comercial (JPG o PNG), para el encabezado. */
  logo?: { bytes: Uint8Array; mime: string } | null;
  /** Instalación de demostración: se avisa al pie que los datos son ficticios. */
  demo?: boolean;
  rif: string;
  paymentInfo: string;
  appName: string;
  statement: Statement;
  /** Sin local se genera el aviso general, con los totales del centro comercial. */
  unit?: { code: string; business: string | null; owner: string };
  aliquot: number;
  /** Total del mes en centavos de USD, tal como se le cobró al local. */
  usdCents: number;
  /** Deuda de meses anteriores y deuda total a hoy, en centavos de USD; solo con local. */
  previousDebt?: number;
  totalDebt?: number;
  today: string;
};

export async function statementPdf(input: StatementPdfInput): Promise<Uint8Array> {
  const { statement, unit, aliquot } = input;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const title = `Aviso de cobro ${periodLabel(statement.period)}${unit ? ` - ${unit.code}` : ""}`;
  pdf.setTitle(safe(title));
  pdf.setCreator(input.appName);

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  type TextOptions = { size?: number; font?: PDFFont; color?: typeof INK; align?: "left" | "right" | "center"; width?: number };
  /** Escribe una línea; si no cabe en `width`, la recorta con puntos suspensivos. */
  function text(raw: string, x: number, baseline: number, o: TextOptions = {}) {
    const { size = 7.5, font = regular, color = INK, align = "left", width } = o;
    let value = safe(raw);
    if (width) {
      while (value.length > 1 && font.widthOfTextAtSize(value, size) > width) value = `${value.slice(0, -2).trimEnd()}…`;
    }
    const w = font.widthOfTextAtSize(value, size);
    const left = align === "right" ? x + (width ?? 0) - w : align === "center" ? x + ((width ?? 0) - w) / 2 : x;
    page.drawText(value, { x: left, y: baseline, size, font, color });
  }
  const rule = (at: number, color = LINE, thickness = 0.5) =>
    page.drawLine({ start: { x: MARGIN, y: at }, end: { x: MARGIN + WIDTH, y: at }, thickness, color });
  const band = (top: number, height: number, color = FILL) =>
    page.drawRectangle({ x: MARGIN, y: top - height, width: WIDTH, height, color });
  /** Salta de página si lo que viene no cabe. */
  function need(space: number) {
    if (y - space >= MARGIN) return;
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
  }

  // ── Encabezado
  let left = MARGIN;
  let headerHeight = 30;
  const image =
    input.logo?.mime === "image/jpeg"
      ? await pdf.embedJpg(input.logo.bytes)
      : input.logo?.mime === "image/png"
        ? await pdf.embedPng(input.logo.bytes)
        : null;
  if (image) {
    const height = 42;
    const width = (image.width / image.height) * height;
    page.drawImage(image, { x: MARGIN, y: y - height, width, height });
    left = MARGIN + width + 10;
    headerHeight = height + 6;
  }
  const titleWidth = WIDTH - (left - MARGIN) - 120;
  text("CONDOMINIO DEL CENTRO COMERCIAL", left, y - 9, { size: 7.5, font: bold, color: MUTED, width: titleWidth });
  text(input.siteName.toUpperCase(), left, y - 22, { size: 13, font: bold, width: titleWidth });
  const details = [input.rif && `RIF N° ${input.rif}`, input.location].filter(Boolean).join("  ·  ");
  if (details) text(details, left, y - 32, { size: 7.5, color: MUTED, width: titleWidth });
  text("AVISO DE COBRO", MARGIN, y - 10, { size: 11, font: bold, color: BRAND, align: "right", width: WIDTH });
  text(periodLabel(statement.period).toUpperCase(), MARGIN, y - 21, { size: 8, font: bold, align: "right", width: WIDTH });
  y -= Math.max(headerHeight, 40);

  band(y, 34);
  page.drawRectangle({ x: MARGIN, y: y - 34, width: WIDTH, height: 34, borderColor: LINE, borderWidth: 0.6 });
  if (unit) {
    text(unit.code.toUpperCase(), MARGIN + 8, y - 13, { size: 9, font: bold, width: 250 });
    text((unit.business ?? "Local desocupado").toUpperCase(), MARGIN + 8, y - 24, { size: 7.5, width: 250 });
    text(`Propietario: ${unit.owner}`, MARGIN + 8, y - 31.5, { size: 6.5, color: MUTED, width: 250 });
    text("ALÍCUOTA", MARGIN + 280, y - 13, { size: 6.5, color: MUTED });
    text(percent(aliquot), MARGIN + 280, y - 25, { size: 10, font: bold });
  } else {
    text("AVISO GENERAL", MARGIN + 8, y - 15, { size: 9, font: bold });
    text("Totales del mes para todos los locales", MARGIN + 8, y - 26, { size: 7.5, color: MUTED });
  }
  text("VENCIMIENTO", MARGIN, y - 13, { size: 6.5, color: MUTED, align: "right", width: WIDTH - 8 });
  text(statement.dueOn ? shortDate(statement.dueOn) : "Borrador sin emitir", MARGIN, y - 25, {
    size: 10, font: bold, align: "right", width: WIDTH - 8,
  });
  y -= 44;

  if (statement.dueOn) {
    text(`PAGUE ANTES DEL DÍA: ${longDate(statement.dueOn).toUpperCase()}`, MARGIN, y - 9, {
      size: 11, font: bold, align: "center", width: WIDTH,
    });
    text("Pague su aviso a tiempo: el condominio tiene compromisos que cumplir puntualmente. Gracias.", MARGIN, y - 19, {
      size: 7, color: MUTED, align: "center", width: WIDTH,
    });
    y -= 28;
  }

  // ── Tabla de partidas
  function header() {
    band(y, ROW + 2, INK);
    const white = rgb(1, 1, 1);
    const o = { size: 7, font: bold, color: white };
    text("CÓDIGO", X[0] + 4, y - 9.5, o);
    text("DESCRIPCIÓN", X[1] + 4, y - 9.5, o);
    text("MONTO Bs.", X[2], y - 9.5, { ...o, align: "right", width: COLS[2] - 4 });
    text("%", X[3], y - 9.5, { ...o, align: "right", width: COLS[3] - 4 });
    text("MONTO A PAGAR Bs.", X[4], y - 9.5, { ...o, align: "right", width: COLS[4] - 4 });
    y -= ROW + 2;
  }
  /** `mine` es la parte del local cuando no sale de una sola partida sino de sumar varias ya redondeadas. */
  function row(
    code: string | null,
    description: string,
    cents: number,
    o: { strong?: boolean; negative?: boolean; fill?: boolean; mine?: number } = {},
  ) {
    need(ROW);
    if (o.fill) band(y, ROW);
    const font = o.strong ? bold : regular;
    const sign = o.negative ? "-" : "";
    if (code) text(code, X[0] + 4, y - 9, { size: 6.5, color: MUTED, width: COLS[0] - 6 });
    text(description, X[1] + 4, y - 9, { font, width: COLS[1] - 8 });
    text(sign + amount(cents), X[2], y - 9, { font, align: "right", width: COLS[2] - 4 });
    text(percent(aliquot), X[3], y - 9, { size: 6.5, color: MUTED, align: "right", width: COLS[3] - 4 });
    text(sign + amount(o.mine ?? share(cents, aliquot)), X[4], y - 9, { font, align: "right", width: COLS[4] - 4 });
    y -= ROW;
    rule(y);
  }
  function group(section: Section) {
    const lines = statement.lines.filter((l) => l.section === section);
    if (lines.length === 0) return;
    need(ROW * 2);
    band(y, ROW);
    text(SECTIONS[section].toUpperCase(), MARGIN, y - 9, { size: 7, font: bold, align: "center", width: WIDTH });
    y -= ROW;
    for (const l of lines) row(l.code, l.description, l.amountCents, { negative: section === "descuento" });
  }

  // Los subtotales del local son la suma de sus partidas, no el porcentaje del
  // subtotal: así cuadran al céntimo con lo que se le cobró.
  const full = statementTotals(statement.lines);
  const mine = statementTotals(statement.lines, aliquot);
  header();
  group("fijo");
  row(null, "SUBTOTAL GASTOS FIJOS", full.fijos, { strong: true, mine: mine.fijos });
  group("eventual");
  row(null, "SUBTOTAL GASTOS EVENTUALES", full.eventuales, { strong: true, mine: mine.eventuales });
  row(null, "SUBTOTAL GASTOS DEL MES", full.gastos, { strong: true, mine: mine.gastos });
  if (full.reserva > 0) row(null, "FONDO DE RESERVA Y PUBLICIDAD", full.reserva, { mine: mine.reserva });
  row(null, "TOTAL GASTOS DEL MES", full.total, { strong: true, fill: true, mine: mine.total });
  if (full.descuentos > 0) {
    group("descuento");
    row(null, "SUBTOTAL DESCUENTOS DEL MES", full.descuentos, { strong: true, negative: true, mine: mine.descuentos });
  }

  // ── Totales
  const labelWidth = COLS[0] + COLS[1] + COLS[2] + COLS[3] - 8;
  function total(label: string, value: string, o: { strong?: boolean; dark?: boolean } = {}) {
    need(ROW + 2);
    const height = o.dark ? ROW + 4 : ROW;
    if (o.dark) band(y, height, INK);
    const color = o.dark ? rgb(1, 1, 1) : INK;
    const font = o.strong || o.dark ? bold : regular;
    const size = o.dark ? 9 : 7.5;
    text(label, MARGIN + 4, y - height + 4, { size, font, color, align: "right", width: labelWidth });
    text(value, X[4], y - height + 4, { size, font, color, align: "right", width: COLS[4] - 4 });
    y -= height;
    if (!o.dark) rule(y);
  }
  y -= 4;
  total(unit ? "TOTAL A PAGAR EN EL MES" : "TOTAL A REPARTIR ENTRE LOS LOCALES", `Bs. ${amount(mine.neto)}`, { dark: true });
  y -= 4;
  if (mine.iva > 0) {
    total("CUOTA PARTE EXENTA Y/O EXONERADA", `Bs. ${amount(mine.exento)}`);
    total(`CUOTA PARTE GRAVABLE (base del IVA ${IVA_PERCENT} %)`, `Bs. ${amount(mine.base)}`);
    total(`IVA ${IVA_PERCENT} % INCLUIDO`, `Bs. ${amount(mine.iva)}`);
  }
  const usd = (cents: number) => `$ ${amount(cents)}`;
  total(
    `${statement.issuedOn ? `FECHA DE CÁLCULO: ${shortDate(statement.issuedOn)}   ` : ""}TASA BCV: Bs. ${number.format(statement.rate)}`,
    usd(input.usdCents),
    { strong: true },
  );
  if (unit && input.previousDebt !== undefined && input.totalDebt !== undefined) {
    total("DEUDA ACUMULADA DE MESES ANTERIORES", usd(input.previousDebt));
    total(`DEUDA TOTAL AL ${shortDate(input.today)}`, usd(Math.max(0, input.totalDebt)), { strong: true });
    if (input.totalDebt < 0) total("SALDO A FAVOR", usd(-input.totalDebt));
  }

  // ── Pie: dónde pagar y la regla de la tasa
  const payment = input.paymentInfo.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 6);
  need(40 + payment.length * 9);
  y -= 12;
  if (payment.length > 0) {
    text("DÓNDE PAGAR", MARGIN, y, { size: 7, font: bold });
    y -= 10;
    for (const line of payment) {
      text(line, MARGIN, y, { size: 7.5, width: WIDTH });
      y -= 9;
    }
    y -= 4;
  }
  text(
    "IMPORTANTE: la deuda queda fijada en dólares a la tasa BCV de la fecha de cálculo. Los pagos en bolívares se",
    MARGIN, y, { size: 7, font: bold, width: WIDTH },
  );
  text(
    "calculan a la tasa BCV del día en que se pague. Reporte su pago desde la app para que la administración lo verifique.",
    MARGIN, y - 9, { size: 7, font: bold, width: WIDTH },
  );
  if (input.demo) {
    text("DEMOSTRACIÓN: los montos, los comercios y los propietarios de este documento son ficticios.", MARGIN, MARGIN - 14, {
      size: 6, color: MUTED,
    });
  }
  text(`Generado con ${input.appName} el ${shortDate(input.today)}`, MARGIN, MARGIN - 14, {
    size: 6, color: MUTED, align: "right", width: WIDTH,
  });

  return pdf.save();
}
