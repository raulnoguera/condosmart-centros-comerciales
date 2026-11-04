import type { Metadata } from "next";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { deleteFixedExpense, importFixedMaster, saveFixedExpense, toggleFixedExpense } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { Badge, Card, Empty, Field, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listFixedExpenses, type FixedExpense } from "@/lib/data";
import { EXPENSE_CATEGORIES, money } from "@/lib/format";

export const metadata: Metadata = { title: "Maestro de gastos fijos" };

/** Campos de una partida del maestro; sirven para agregar y para corregir. */
function FixedFields({ item }: { item?: FixedExpense }) {
  return (
    <>
      <Field label="Descripción" className="@xl:col-span-2 @3xl:col-span-3">
        <input
          name="description"
          required
          defaultValue={item?.description}
          placeholder="Ej. Servicio de vigilancia"
          className="input"
        />
      </Field>
      <Field label="Código" optional>
        <input
          name="code"
          maxLength={12}
          autoCapitalize="characters"
          defaultValue={item?.code ?? ""}
          placeholder="Ej. G00002"
          className="input uppercase"
        />
      </Field>
      <Field label="Categoría">
        <select name="category" required defaultValue={item?.category ?? "Servicios"} className="input">
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <Field label="Proveedor" optional>
        <input name="supplier" defaultValue={item?.supplier ?? ""} className="input" />
      </Field>
      <Field label="Moneda">
        <select name="currency" defaultValue={item?.currency ?? "VES"} className="input">
          <option value="VES">Bolívares (Bs)</option>
          <option value="USD">Dólares (USD)</option>
        </select>
      </Field>
      <Field label="Monto habitual" hint="Al cargarlo en un mes se puede ajustar.">
        <input
          name="amount"
          inputMode="decimal"
          required
          defaultValue={item ? (item.amountCents / 100).toFixed(2).replace(".", ",") : ""}
          placeholder="0,00"
          className="input"
        />
      </Field>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 text-sm @xl:col-span-2 @3xl:col-span-3">
        <input type="checkbox" name="taxable" defaultChecked={item?.taxable === 1} className="size-5 accent-brand" />
        El monto incluye IVA
      </label>
    </>
  );
}

export default async function FixedExpensesPage() {
  await requireUser("admin");
  const items = listFixedExpenses();
  const active = items.filter((i) => i.active).length;

  return (
    <>
      <PageHeader
        title="Maestro de gastos fijos"
        subtitle={
          <Link href="/gastos" className="text-brand hover:underline">
            ← Volver a gastos
          </Link>
        }
      />
      <div className="grid gap-5">
        <Card title="Partidas que se repiten cada mes" aside={items.length > 0 && <Badge>{active} activas</Badge>}>
          <p className="mb-4 text-sm text-muted">
            La nómina, la vigilancia, la luz, el agua, los mantenimientos contratados. Se definen aquí una sola vez y
            cada mes se cargan desde Gastos con un botón.
          </p>
          {items.length === 0 && <Empty icon={ListChecks}>El maestro está vacío.</Empty>}
          <ul className="divide-y divide-line">
            {items.map((item) => (
              <li key={item.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 text-sm">
                    <span className={`min-w-0 ${item.active ? "" : "opacity-50"}`}>
                      <strong className="font-semibold">{item.description}</strong>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                        {item.code && <span className="font-mono">{item.code}</span>}
                        <span>
                          {item.category}
                          {item.supplier && ` · ${item.supplier}`}
                          {item.taxable === 1 && " · con IVA"}
                        </span>
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      {!item.active && <Badge>Inactiva</Badge>}
                      <strong className="tabular-nums">{money(item.amountCents, item.currency)}</strong>
                      <span className="text-xs font-medium text-brand">Editar</span>
                    </span>
                  </summary>
                  <div className="mt-3 rounded-2xl bg-cream/70 p-4">
                    <ActionForm action={saveFixedExpense} className="grid gap-3 @xl:grid-cols-2 @3xl:grid-cols-3">
                      <input type="hidden" name="id" value={item.id} />
                      <FixedFields item={item} />
                      <div className="@xl:col-span-2 @3xl:col-span-3">
                        <Submit small>Guardar cambios</Submit>
                      </div>
                    </ActionForm>
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
                      <ActionForm action={toggleFixedExpense} compact>
                        <input type="hidden" name="id" value={item.id} />
                        <Submit small variant="secondary">
                          {item.active ? "Dejar de cargarla" : "Volver a cargarla"}
                        </Submit>
                      </ActionForm>
                      <ActionForm action={deleteFixedExpense} compact>
                        <input type="hidden" name="id" value={item.id} />
                        <Submit
                          small
                          variant="danger"
                          confirm="¿Quitar esta partida del maestro?"
                          confirmDetail={`${item.description}. Los meses donde ya se cargó no cambian.`}
                        >
                          Quitar
                        </Submit>
                      </ActionForm>
                    </div>
                  </div>
                </details>
              </li>
            ))}
          </ul>
          <ActionForm action={importFixedMaster} compact className="mt-4 flex justify-center border-t border-line pt-4">
            <Submit variant="secondary">
              {items.length === 0
                ? "Crearlo con los gastos fijos de los últimos meses"
                : "Traer las que falten de los últimos meses"}
            </Submit>
          </ActionForm>
        </Card>

        <Card title="Agregar un gasto fijo">
          <ActionForm action={saveFixedExpense} className="grid gap-3 @xl:grid-cols-2 @3xl:grid-cols-3">
            <FixedFields />
            <div className="@xl:col-span-2 @3xl:col-span-3">
              <Submit>Agregar al maestro</Submit>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
