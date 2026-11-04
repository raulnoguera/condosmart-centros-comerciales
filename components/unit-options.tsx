import { aisleLabel, groupByLevel, levelLabel, type Address } from "@/lib/address";

type UnitOption = Address & { id: number; owner?: string; business?: string | null };

/**
 * Opciones de un <select> de locales, agrupadas por nivel y pasillo para que una
 * lista larga se pueda recorrer. Va dentro de un <select>.
 */
export function UnitOptions({ units, withOwner }: { units: UnitOption[]; withOwner?: boolean }) {
  return groupByLevel(units).flatMap(({ level, aisles }) =>
    aisles.map(({ aisle, units }) => (
      <optgroup key={`${level}|${aisle}`} label={`${levelLabel(level)} · ${aisleLabel(aisle)}`}>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            Local {u.number ?? "?"}
            {withOwner && (u.business || u.owner) ? ` · ${u.business || u.owner}` : ""}
          </option>
        ))}
      </optgroup>
    )),
  );
}
