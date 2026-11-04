// La ubicación de un local: nivel, pasillo y número. Hacen falta los tres para
// identificarlo, porque los números se repiten entre pasillos y niveles.

export type Address = { level: string | null; aisle: string | null; number: string | null };

/** Quita la palabra que la gente suele anteponer: "Nivel 2" → "2", "Pasillo B" → "B". */
const strip = (value: string, words: RegExp) => value.trim().replace(words, "").trim();

export function cleanLevel(value: string) {
  const level = strip(value, /^(nivel|piso|planta)\s+/i);
  return /^(baja|pb|p\.b\.)$/i.test(level) ? "PB" : level;
}
export const cleanAisle = (value: string) => strip(value, /^(pasillo|ala|pas\.?)\s*/i);
export const cleanNumber = (value: string) => strip(value, /^(local|loc\.?|n\.?[º°o]?|#)\s*/i);

export const levelLabel = (level: string | null) => (level ? `Nivel ${level}` : "Sin nivel");
export const aisleLabel = (aisle: string | null) => (aisle ? `Pasillo ${aisle}` : "Sin pasillo");

/** Etiqueta completa con la que se nombra el local en toda la app. */
export function unitLabel({ level, aisle, number }: Address): string {
  return [level && `Nivel ${level}`, aisle && `Pasillo ${aisle}`, `Local ${number ?? "?"}`]
    .filter(Boolean)
    .join(" · ");
}

const collator = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/** Los niveles van de abajo hacia arriba: sótanos, planta baja, pisos numerados y el resto. */
function levelRank(level: string | null): number {
  if (!level) return 4;
  if (/^s/i.test(level)) return 0;
  if (/^pb$/i.test(level)) return 1;
  return /^\d/.test(level) ? 2 : 3;
}

/** Orden natural: PB antes que Nivel 1, Pasillo A antes que B, Local 3 antes que Local 12. */
export function compareAddress(a: Address, b: Address): number {
  return (
    levelRank(a.level) - levelRank(b.level) ||
    collator.compare(a.level ?? "", b.level ?? "") ||
    collator.compare(a.aisle ?? "￿", b.aisle ?? "￿") ||
    collator.compare(a.number ?? "", b.number ?? "")
  );
}

/** Agrupa locales ya ordenados por nivel y, dentro de cada nivel, por pasillo. */
export function groupByLevel<T extends Address>(units: T[]) {
  const levels: { level: string | null; aisles: { aisle: string | null; units: T[] }[] }[] = [];
  for (const unit of units) {
    let level = levels.find((s) => s.level === unit.level);
    if (!level) levels.push((level = { level: unit.level, aisles: [] }));
    let aisle = level.aisles.find((b) => b.aisle === unit.aisle);
    if (!aisle) level.aisles.push((aisle = { aisle: unit.aisle, units: [] }));
    aisle.units.push(unit);
  }
  return levels;
}

/** A quién va dirigido un aviso o un reporte: a todos, a un nivel o a un pasillo de ese nivel. */
export type Audience = { level: string | null; aisle: string | null };

export function audienceLabel({ level, aisle }: Audience): string | null {
  if (!level) return null;
  return aisle ? `Solo Nivel ${level} · Pasillo ${aisle}` : `Solo Nivel ${level}`;
}
