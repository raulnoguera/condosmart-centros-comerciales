import { get, run } from "./db";
import { today } from "./format";

export type Rate = { date: string; bsPerUsd: number; source: string };

const BCV_URL = "https://ve.dolarapi.com/v1/dolares/oficial";
const RETRY_MS = 30 * 60 * 1000;
let lastAttempt = 0;
let inFlight: Promise<number | null> | null = null;

export function saveRate(date: string, bsPerUsd: number, source: string) {
  run(
    `INSERT INTO rates (date, bs_per_usd, source) VALUES (?, ?, ?)
     ON CONFLICT (date) DO UPDATE SET bs_per_usd = excluded.bs_per_usd, source = excluded.source`,
    date, bsPerUsd, source,
  );
}

/** Tasa vigente en una fecha: la más reciente publicada hasta ese día. */
export function rateOn(date: string): Rate | null {
  const row = get<Rate>(
    `SELECT date, bs_per_usd AS bsPerUsd, source FROM rates
     WHERE date <= ? ORDER BY date DESC LIMIT 1`,
    date,
  );
  return row ? { ...row } : null;
}

export async function fetchBcvRate(): Promise<number | null> {
  try {
    const res = await fetch(BCV_URL, { signal: AbortSignal.timeout(4000), cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as { promedio?: number };
    return typeof data.promedio === "number" && data.promedio > 0 ? data.promedio : null;
  } catch {
    return null;
  }
}

/**
 * Tasa de hoy. Si aún no hay una cargada para hoy intenta traerla del BCV
 * (como mucho una vez cada media hora) y, si falla, usa la última conocida.
 */
export async function currentRate(): Promise<Rate | null> {
  const date = today();
  const known = rateOn(date);
  if (known?.date === date) return known;
  if (!inFlight && Date.now() - lastAttempt > RETRY_MS) {
    lastAttempt = Date.now();
    inFlight = fetchBcvRate().finally(() => {
      inFlight = null;
    });
  }
  // Quien llegue mientras la consulta está en curso espera el mismo resultado,
  // para que el encabezado y la página no muestren tasas distintas.
  const value = inFlight ? await inFlight : null;
  if (value) {
    saveRate(date, value, "BCV");
    return { date, bsPerUsd: value, source: "BCV" };
  }
  return rateOn(date);
}
