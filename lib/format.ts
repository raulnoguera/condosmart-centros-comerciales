// Fechas y dinero. El dinero se guarda siempre en centavos enteros.

const TZ = "America/Caracas";

export function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function currentPeriod(): string {
  return today().slice(0, 7);
}

export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}

export function isPeriod(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const label = new Intl.DateTimeFormat("es-VE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function dateLabel(date: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-VE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** "lunes, 5 de octubre" para el día de hoy en Caracas. */
export function longDate(): string {
  return new Intl.DateTimeFormat("es-VE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(new Date());
}

export function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("es-VE", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: TZ,
  }).format(new Date(iso));
}

/** "hace 5 min", "hace 3 h", "ayer" o la fecha, según cuánto haya pasado. */
export function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "ahora";
  if (minutes < 60) return `hace ${minutes} min`;
  if (minutes < 60 * 24) return `hace ${Math.floor(minutes / 60)} h`;
  if (minutes < 60 * 48) return "ayer";
  return dateLabel(new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso)));
}

/** Día en Caracas de un instante ISO, como "2026-10-05". */
export function dayOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

const number = new Intl.NumberFormat("es-VE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function usd(cents: number): string {
  return `${cents < 0 ? "-" : ""}$${number.format(Math.abs(cents) / 100)}`;
}

export function bs(cents: number): string {
  return `Bs. ${number.format(cents / 100)}`;
}

export function money(cents: number, currency: "USD" | "VES"): string {
  return currency === "USD" ? usd(cents) : bs(cents);
}

export function rateLabel(rate: number): string {
  return number.format(rate);
}

/** Acepta "1234.56", "1234,56" y "1.234,56". Devuelve el número o null. */
export function parseDecimal(raw: FormDataEntryValue | null): number | null {
  let text = String(raw ?? "").trim().replace(/\s/g, "");
  if (!text) return null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Igual que parseDecimal, pero en centavos enteros. */
export function parseAmount(raw: FormDataEntryValue | null): number | null {
  const value = parseDecimal(raw);
  return value === null ? null : Math.round(value * 100) || null;
}

export const METHODS: Record<string, { label: string; currency: "USD" | "VES" }> = {
  pago_movil: { label: "Pago móvil", currency: "VES" },
  transferencia: { label: "Transferencia Bs", currency: "VES" },
  efectivo_bs: { label: "Efectivo Bs", currency: "VES" },
  zelle: { label: "Zelle", currency: "USD" },
  efectivo_usd: { label: "Efectivo USD", currency: "USD" },
};

export const EXPENSE_CATEGORIES = [
  "Seguridad",
  "Limpieza",
  "Mantenimiento",
  "Servicios",
  "Aire acondicionado",
  "Ascensores y escaleras",
  "Mercadeo",
  "Administración",
  "Reparaciones",
  "Otros",
];

/** Metros cuadrados con hasta dos decimales: "36", "42,5". */
export function areaLabel(m2: number): string {
  return `${new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 }).format(m2)} m²`;
}

/** Alícuota de un local, que ya viene en porcentaje: 0.7245 → "0,7245 %". */
export function aliquotLabel(percent: number): string {
  return `${new Intl.NumberFormat("es-VE", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(percent)} %`;
}

/** Participación de un local en el total, como "1,25 %". */
export function percentLabel(fraction: number): string {
  return `${new Intl.NumberFormat("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(fraction * 100)} %`;
}

export const SLOTS: Record<string, string> = {
  manana: "Mañana · 8 a 12",
  tarde: "Tarde · 1 a 6",
  noche: "Noche · 7 a 11",
};
