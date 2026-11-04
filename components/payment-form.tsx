"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { reportPayment } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { UnitOptions } from "@/components/unit-options";
import type { PaymentTarget } from "@/lib/data";
import { METHODS, bs, parseAmount, rateLabel, usd } from "@/lib/format";

type UnitOption = {
  id: number;
  owner: string;
  balance: number;
  level: string | null;
  aisle: string | null;
  number: string | null;
  /** Opciones de "¿Qué pagas?" de ese local. */
  targets?: PaymentTarget[];
};

const asInput = (cents: number) =>
  (cents / 100).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Reporte de pago (comerciante) o registro directo (administración). Muestra en vivo cuánto
 * abona en dólares un monto en bolívares y permite rellenar el saldo completo.
 */
export function PaymentForm({
  units,
  unitId,
  balanceCents = 0,
  targets: fixedTargets,
  rate,
  today,
}: {
  /** Solo para la administración: lista para elegir a quién se le registra el pago. */
  units?: UnitOption[];
  /** Unidad fija (la administración, desde el estado de cuenta de un local). */
  unitId?: number;
  /** Saldo del local fijo o del comerciante que reporta. */
  balanceCents?: number;
  /** Opciones de "¿Qué pagas?" del local fijo o del comerciante. */
  targets?: PaymentTarget[];
  /** Tasa BCV de hoy; la conversión definitiva usa la del día del pago. */
  rate: number | null;
  today: string;
}) {
  const [method, setMethod] = useState("pago_movil");
  const [amount, setAmount] = useState("");
  const [selected, setSelected] = useState("");
  const [applies, setApplies] = useState("auto");

  const choosing = Boolean(units) && !unitId;
  const byAdmin = Boolean(units) || Boolean(unitId);
  const currency = METHODS[method].currency;
  const inBs = currency === "VES";
  const cents = parseAmount(amount);
  const targets = (choosing ? units?.find((u) => String(u.id) === selected)?.targets : fixedTargets) ?? [];
  const target = targets.find((x) => x.value === applies);
  // "Usar saldo" rellena lo que falta de lo elegido; sin opciones, el saldo completo.
  const balance = target
    ? target.pendingCents
    : choosing
      ? (units?.find((u) => String(u.id) === selected)?.balance ?? 0)
      : balanceCents;
  const dueCents = balance > 0 ? (inBs ? (rate ? Math.round(balance * rate) : null) : balance) : null;

  return (
    <ActionForm
      action={reportPayment}
      className="grid gap-4 @xl:grid-cols-2"
      onSuccess={() => {
        setAmount("");
        setSelected("");
        setApplies("auto");
      }}
    >
      {unitId && <input type="hidden" name="unit_id" value={unitId} />}
      {choosing && (
        <Field label="Local" className="@xl:col-span-2">
          <select
            name="unit_id"
            required
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setApplies("auto");
            }}
            className="input"
          >
            <option value="" disabled>
              Elige el local
            </option>
            <UnitOptions units={units ?? []} withOwner />
          </select>
        </Field>
      )}

      {targets.length > 1 && (
        <Field
          label="¿Qué pagas?"
          hint="Si eliges una cuota extra, el pago se aplica primero a ella; lo que sobre, a lo más antiguo."
          className="@xl:col-span-2"
        >
          <select name="applies" value={applies} onChange={(e) => setApplies(e.target.value)} className="input">
            {targets.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label} · debe {usd(x.pendingCents)}
              </option>
            ))}
          </select>
        </Field>
      )}

      <fieldset className="@xl:col-span-2">
        <legend className="mb-1.5 text-sm font-medium text-ink">Forma de pago</legend>
        <div className="flex flex-wrap gap-2">
          {Object.entries(METHODS).map(([key, m]) => (
            <label
              key={key}
              className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm font-medium transition-colors has-checked:border-brand has-checked:bg-brand-soft has-checked:text-brand-dark has-focus-visible:ring-2 has-focus-visible:ring-brand/40"
            >
              <input
                type="radio"
                name="method"
                value={key}
                checked={method === key}
                onChange={() => setMethod(key)}
                className="sr-only"
              />
              {method === key && <Check className="size-4" aria-hidden />}
              {m.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="@xl:col-span-2">
        <Field label={`Monto pagado en ${inBs ? "bolívares" : "dólares"}`}>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
              {inBs ? "Bs." : "$"}
            </span>
            <input
              name="amount"
              inputMode="decimal"
              required
              placeholder="0,00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="input pl-11 text-lg font-semibold tabular-nums"
            />
          </div>
        </Field>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <p aria-live="polite" className="text-muted">
            {inBs && cents && rate ? (
              <>
                Abona <strong className="text-ink">{usd(Math.round(cents / rate))}</strong> a la tasa de hoy
              </>
            ) : inBs && rate ? (
              `Tasa BCV de hoy: Bs. ${rateLabel(rate)} por dólar`
            ) : inBs ? (
              "No hay tasa BCV cargada."
            ) : null}
          </p>
          {dueCents !== null && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setAmount(asInput(dueCents))}
            >
              Usar saldo: {inBs ? bs(dueCents) : usd(dueCents)}
            </button>
          )}
        </div>
      </div>

      <Field label="Fecha del pago">
        <input type="date" name="paid_on" required defaultValue={today} max={today} className="input" />
      </Field>
      <Field label="Referencia" optional={method.startsWith("efectivo")}>
        <input
          name="reference"
          required={!method.startsWith("efectivo")}
          placeholder="Nº de referencia"
          className="input"
        />
      </Field>

      {inBs && (
        <p className="text-xs text-muted @xl:col-span-2">
          Los pagos en bolívares se convierten con la tasa BCV del día en que se hizo el pago.
        </p>
      )}
      <div className="@xl:col-span-2">
        <Submit>{byAdmin ? "Registrar pago" : "Reportar pago"}</Submit>
      </div>
    </ActionForm>
  );
}
