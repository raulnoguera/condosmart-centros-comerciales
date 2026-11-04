import type { ReactNode } from "react";
import { bs } from "@/lib/format";
import { IVA_PERCENT, SECTIONS, share, statementTotals, type Section, type StatementLine } from "@/lib/statement-math";

/** Una partida del aviso: con alícuota muestra la parte del local y, debajo, el total del mes. */
function Line({
  label,
  code,
  total,
  aliquot,
  negative,
}: {
  label: ReactNode;
  code?: string | null;
  total: number;
  aliquot?: number;
  negative?: boolean;
}) {
  const amount = aliquot === undefined ? total : share(total, aliquot);
  return (
    <li className="flex items-baseline justify-between gap-3 py-2 text-sm">
      <span className="min-w-0">
        {label}
        <span className="block text-xs tabular-nums text-muted">
          {code && <span className="mr-1.5 font-mono">{code}</span>}
          {aliquot !== undefined && `de ${bs(total)}`}
        </span>
      </span>
      <span className={`shrink-0 font-semibold tabular-nums ${negative ? "text-good" : ""}`}>
        {negative && "−"}
        {bs(amount)}
      </span>
    </li>
  );
}

function Subtotal({ label, cents, strong }: { label: string; cents: number; strong?: boolean }) {
  return (
    <p
      className={`flex items-baseline justify-between gap-3 border-t border-line py-2.5 tabular-nums ${
        strong ? "font-display text-base font-extrabold" : "text-sm font-semibold"
      }`}
    >
      <span>{label}</span>
      <span>{bs(cents)}</span>
    </p>
  );
}

function Group({ section, lines, aliquot }: { section: Section; lines: StatementLine[]; aliquot?: number }) {
  const own = lines.filter((l) => l.section === section);
  if (own.length === 0) return null;
  return (
    <section>
      <h3 className="rounded-lg bg-cream px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        {SECTIONS[section]}
      </h3>
      <ul className="divide-y divide-line px-1">
        {own.map((l, i) => (
          <Line
            key={`${l.code}-${i}`}
            label={l.description}
            code={l.code}
            total={l.amountCents}
            aliquot={aliquot}
            negative={section === "descuento"}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * El detalle del aviso de cobro, partida por partida. Con `aliquot` es el aviso de
 * un local (su parte de cada gasto); sin ella, el total del centro comercial.
 */
export function StatementDetail({ lines, aliquot }: { lines: StatementLine[]; aliquot?: number }) {
  const t = statementTotals(lines, aliquot ?? 100);
  return (
    <div className="grid gap-1">
      <Group section="fijo" lines={lines} aliquot={aliquot} />
      <div className="px-1">
        <Subtotal label="Subtotal de gastos fijos" cents={t.fijos} />
      </div>
      <Group section="eventual" lines={lines} aliquot={aliquot} />
      <div className="px-1">
        <Subtotal label="Subtotal de gastos eventuales" cents={t.eventuales} />
      </div>
      <Group section="reserva" lines={lines} aliquot={aliquot} />
      <div className="px-1">
        <Subtotal label="Total de gastos del mes" cents={t.total} strong />
      </div>
      <Group section="descuento" lines={lines} aliquot={aliquot} />
      <div className="px-1">
        <Subtotal label={aliquot === undefined ? "Total a repartir entre los locales" : "Total a pagar en el mes"} cents={t.neto} strong />
      </div>
      {t.iva > 0 && (
        <dl className="mt-2 grid gap-1 rounded-2xl bg-cream p-3 text-xs tabular-nums text-muted">
          <div className="flex justify-between gap-3">
            <dt>Parte exenta o exonerada</dt>
            <dd>{bs(t.exento)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Parte gravable</dt>
            <dd>{bs(t.base)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>IVA {IVA_PERCENT} % incluido</dt>
            <dd>{bs(t.iva)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
