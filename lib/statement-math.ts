// El aviso de cobro: los gastos del mes repartidos entre los locales por alícuota.
// Todos los montos de este archivo están en céntimos de bolívar.

export type Section = "fijo" | "eventual" | "reserva" | "descuento";

export const SECTIONS: Record<Section, string> = {
  fijo: "Gastos fijos",
  eventual: "Gastos eventuales",
  reserva: "Fondo de reserva y publicidad",
  descuento: "Descuentos",
};

export const IVA_PERCENT = 16;

export type StatementLine = {
  section: Section;
  code: string | null;
  description: string;
  amountCents: number;
  taxable: number;
};

export type Statement = {
  period: string;
  /** Fecha de cálculo; null mientras es solo una vista previa sin emitir. */
  issuedOn: string | null;
  dueOn: string | null;
  rate: number;
  lines: StatementLine[];
};

/** Parte que le toca a un local de un monto, según su alícuota en porcentaje. */
export const share = (cents: number, aliquot: number) => Math.round((cents * aliquot) / 100);

const sumOf = (lines: StatementLine[], section: Section) =>
  lines.filter((l) => l.section === section).reduce((n, l) => n + l.amountCents, 0);

/** Totales del aviso. Con `aliquot` devuelve la parte de un local; sin ella, el total del mes. */
export function statementTotals(lines: StatementLine[], aliquot = 100) {
  const part = lines.map((l) => ({ ...l, amountCents: share(l.amountCents, aliquot) }));
  const fijos = sumOf(part, "fijo");
  const eventuales = sumOf(part, "eventual");
  const reserva = sumOf(part, "reserva");
  const descuentos = sumOf(part, "descuento");
  const gastos = fijos + eventuales;
  const total = gastos + reserva;
  // Las partidas gravadas ya incluyen el IVA: aquí solo se separa para informarlo.
  const conIva = part.filter((l) => l.taxable && l.section !== "descuento").reduce((n, l) => n + l.amountCents, 0);
  const base = Math.round(conIva / (1 + IVA_PERCENT / 100));
  const neto = total - descuentos;
  return { fijos, eventuales, gastos, reserva, total, descuentos, neto, base, iva: conIva - base, exento: neto - conIva };
}

/** Agrega la partida del fondo de reserva y publicidad: un porcentaje de los gastos del mes. */
export function withReserve(lines: StatementLine[], reservePercent: number): StatementLine[] {
  const gastos = sumOf(lines, "fijo") + sumOf(lines, "eventual");
  const reserva = Math.round((gastos * reservePercent) / 100);
  if (reserva <= 0) return lines;
  return [
    ...lines,
    {
      section: "reserva",
      code: null,
      description: `${SECTIONS.reserva} (${String(reservePercent).replace(".", ",")} % de los gastos)`,
      amountCents: reserva,
      taxable: 0,
    },
  ];
}
