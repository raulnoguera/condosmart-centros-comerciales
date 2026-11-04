import type { Metadata } from "next";
import {
  addUnit, addUnitRange, addUser, refreshRate, saveSettings, setPrivilegeForAll, setRateManually,
  toggleUser, updateUnit,
} from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { RateNote } from "@/components/billing";
import { PrivilegeSwitches } from "@/components/privilege-switches";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { OCCUPANCY, getSettings, listUnitPermissions, listUsers, totalAliquot, type UnitPermissions } from "@/lib/data";
import { aliquotLabel } from "@/lib/format";
import { UnitOptions } from "@/components/unit-options";
import { aisleLabel, groupByLevel, levelLabel } from "@/lib/address";
import { PRIVILEGES, type Privilege } from "@/lib/privileges";
import { currentRate } from "@/lib/rates";

export const metadata: Metadata = { title: "Administración" };

const ROLE_LABEL = { admin: "Administración", comerciante: "Comerciante", vigilante: "Seguridad" };

const decimal = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** Comercio, ocupación, alícuota y canon: lo que define cuánto paga un local. */
function UnitDetailFields({ unit }: { unit?: UnitPermissions }) {
  return (
    <>
      <Field label="Comercio" className="col-span-3">
        <input name="business" defaultValue={unit?.business ?? ""} placeholder="Nombre comercial" className="input" />
      </Field>
      <Field label="Ocupación" className="col-span-3">
        <select name="occupancy" defaultValue={unit?.occupancy ?? "propietario"} className="input">
          {Object.entries(OCCUPANCY).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Alícuota (%)" className="col-span-2">
        <input
          name="aliquot"
          inputMode="decimal"
          required
          defaultValue={unit ? String(unit.aliquot).replace(".", ",") : ""}
          placeholder="Ej. 0,7245"
          className="input"
        />
      </Field>
      <Field label="m²" optional>
        <input
          name="area"
          inputMode="decimal"
          defaultValue={unit?.areaM2 ? String(unit.areaM2).replace(".", ",") : ""}
          className="input"
        />
      </Field>
      <Field label="Canon mensual (USD)" optional className="col-span-3">
        <input
          name="rent"
          inputMode="decimal"
          defaultValue={unit?.rentCents ? decimal(unit.rentCents) : ""}
          placeholder="Solo si lo cobra la administración"
          className="input"
        />
      </Field>
    </>
  );
}

export default async function AdminPage() {
  const me = await requireUser("admin");
  const settings = getSettings();
  const rate = await currentRate();
  const units = listUnitPermissions();
  const users = listUsers();

  return (
    <>
      <PageHeader title="Administración" subtitle="Configuración, locales y usuarios." />
      <div className="grid gap-5 @3xl:grid-cols-2">
        <Card title="Centro comercial">
          <ActionForm action={saveSettings} className="grid gap-3 @xl:grid-cols-2">
            <Field label="Nombre">
              <input name="name" required defaultValue={settings.name} className="input" />
            </Field>
            <Field label="RIF" optional hint="Sale en el encabezado del aviso de cobro.">
              <input name="rif" defaultValue={settings.rif} placeholder="J-00000000-0" className="input uppercase" />
            </Field>
            <Field label="Ubicación" optional className="@xl:col-span-2">
              <input name="location" defaultValue={settings.location} placeholder="Ciudad, estado" className="input" />
            </Field>
            <Field
              label="Logo"
              optional
              hint="JPG o PNG. Sale en la pantalla de entrada, en el encabezado y en los avisos en PDF."
              className="@xl:col-span-2"
            >
              <span className="flex items-center gap-3">
                {settings.logo && (
                  // eslint-disable-next-line @next/next/no-img-element -- lo sirve la propia app
                  <img src={`/logo?${settings.logo}`} alt="Logo actual" className="h-12 rounded-lg bg-white object-contain p-1 shadow-card" />
                )}
                <input type="file" name="logo" accept="image/png,image/jpeg,image/webp" className="input py-2.5 text-sm" />
              </span>
            </Field>
            <Field label="Fondo de reserva y publicidad (%)" hint="Se suma al aviso, sobre los gastos del mes.">
              <input
                name="reserve_percent"
                inputMode="decimal"
                defaultValue={String(settings.reservePercent).replace(".", ",")}
                className="input"
              />
            </Field>
            <Field label="Día de vencimiento" hint="Del mes siguiente al del aviso.">
              <input name="due_day" inputMode="numeric" required defaultValue={settings.dueDay} className="input" />
            </Field>
            <Field label="Dónde pagar" hint="Lo ven los comerciantes al reportar un pago." className="@xl:col-span-2">
              <textarea name="payment_info" rows={4} defaultValue={settings.paymentInfo} className="input" />
            </Field>
            <div className="@xl:col-span-2">
              <Submit>Guardar</Submit>
            </div>
          </ActionForm>
        </Card>

        <Card title="Tasa de cambio">
          <p className="mb-4 text-sm text-muted">
            <RateNote rate={rate} />
            {rate && ` · fuente: ${rate.source}`}. Se consulta sola cada día; si falla, cárgala aquí.
          </p>
          <ActionForm action={refreshRate} compact className="mb-4 grid gap-3">
            <div>
              <Submit variant="secondary">Actualizar desde el BCV</Submit>
            </div>
          </ActionForm>
          <ActionForm action={setRateManually} className="flex flex-wrap items-end gap-3">
            <Field label="Tasa de hoy (Bs por USD)" className="flex-1">
              <input name="rate" inputMode="decimal" required placeholder="0,00" className="input" />
            </Field>
            <Submit>Guardar tasa</Submit>
          </ActionForm>
        </Card>

        <Card title={`Locales (${units.length})`} className="@3xl:col-span-2">
          <p className="mb-4 text-sm text-muted">
            Cada local se identifica por su nivel, su pasillo y su número, y paga según su alícuota. Toca un
            local para corregir sus datos. Las alícuotas cargadas suman{" "}
            <strong className="tabular-nums text-ink">{aliquotLabel(totalAliquot())}</strong>.
          </p>
          <div className="grid gap-6 @3xl:grid-cols-2">
            <div className="max-h-[32rem] overflow-y-auto rounded-2xl border border-line">
              {units.length === 0 && <p className="p-4 text-sm text-muted">Aún no hay locales. Crea el primer pasillo.</p>}
              {groupByLevel(units).flatMap(({ level, aisles }) =>
                aisles.map(({ aisle, units: aisleUnits }) => (
                  <section key={`${level}|${aisle}`}>
                    <h3 className="sticky top-0 bg-cream px-4 py-1.5 text-xs font-semibold">
                      {levelLabel(level)} · {aisleLabel(aisle)}
                      <span className="font-normal text-muted"> · {aisleUnits.length} locales</span>
                    </h3>
                    <ul className="divide-y divide-line">
                      {aisleUnits.map((u) => (
                        <li key={u.id}>
                          <details>
                            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm hover:bg-cream/60">
                              <strong className="shrink-0">Local {u.number ?? "?"}</strong>
                              <span className="truncate text-muted">
                                {u.business ?? "Desocupado"} · {aliquotLabel(u.aliquot)}
                              </span>
                            </summary>
                            <ActionForm action={updateUnit} className="grid grid-cols-3 gap-2 bg-cream/50 p-4">
                              <input type="hidden" name="id" value={u.id} />
                              <Field label="Nivel">
                                <input name="level" required defaultValue={u.level ?? ""} className="input" />
                              </Field>
                              <Field label="Pasillo">
                                <input name="aisle" required defaultValue={u.aisle ?? ""} className="input" />
                              </Field>
                              <Field label="Número">
                                <input name="number" required defaultValue={u.number ?? ""} className="input" />
                              </Field>
                              <UnitDetailFields unit={u} />
                              <Field label="Propietario" className="col-span-3">
                                <input name="owner" required defaultValue={u.owner} className="input" />
                              </Field>
                              <Field label="Teléfono" optional className="col-span-3">
                                <input type="tel" name="phone" defaultValue={u.phone ?? ""} autoComplete="off" className="input" />
                              </Field>
                              <div className="col-span-3">
                                <Submit small>Guardar cambios</Submit>
                              </div>
                            </ActionForm>
                          </details>
                        </li>
                      ))}
                    </ul>
                  </section>
                )),
              )}
            </div>

            <div className="grid content-start gap-6">
              <section>
                <h3 className="mb-1 font-display font-bold">Crear un pasillo completo</h3>
                <p className="mb-3 text-sm text-muted">
                  Crea de una vez todos los locales de un pasillo. Quedan desocupados y con el propietario &quot;Por
                  asignar&quot;, para completarlos después.
                </p>
                <ActionForm action={addUnitRange} className="grid grid-cols-2 gap-3">
                  <Field label="Nivel" hint='Solo el nombre o número: "PB", "1", "Feria".'>
                    <input name="level" required className="input" />
                  </Field>
                  <Field label="Pasillo" hint='Solo la letra o número: "B".'>
                    <input name="aisle" required className="input" />
                  </Field>
                  <Field label="Desde el local">
                    <input name="from" inputMode="numeric" required defaultValue="1" className="input" />
                  </Field>
                  <Field label="Hasta el local">
                    <input name="to" inputMode="numeric" required className="input" />
                  </Field>
                  <Field label="Alícuota de cada local (%)" hint="Después puedes ajustar los que sean distintos." className="col-span-2">
                    <input name="aliquot" inputMode="decimal" required placeholder="Ej. 0,7245" className="input" />
                  </Field>
                  <div className="col-span-2">
                    <Submit>Crear locales</Submit>
                  </div>
                </ActionForm>
              </section>

              <section className="border-t border-line pt-5">
                <h3 className="mb-3 font-display font-bold">Agregar un solo local</h3>
                <ActionForm action={addUnit} className="grid grid-cols-3 gap-3">
                  <Field label="Nivel">
                    <input name="level" required className="input" />
                  </Field>
                  <Field label="Pasillo">
                    <input name="aisle" required className="input" />
                  </Field>
                  <Field label="Número">
                    <input name="number" required className="input" />
                  </Field>
                  <UnitDetailFields />
                  <Field label="Propietario" className="col-span-3">
                    <input name="owner" required className="input" />
                  </Field>
                  <Field label="Teléfono" optional className="col-span-3">
                    <input type="tel" name="phone" autoComplete="off" className="input" />
                  </Field>
                  <div className="col-span-3">
                    <Submit variant="secondary">Agregar local</Submit>
                  </div>
                </ActionForm>
              </section>
            </div>
          </div>
        </Card>

        <Card title={`Usuarios (${users.length})`}>
          <ul className="mb-4 max-h-64 divide-y divide-line overflow-y-auto text-sm">
            {users.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 py-2">
                <span className={u.active ? "" : "opacity-50"}>
                  <strong>{u.name}</strong>
                  <span className="block text-xs text-muted">
                    {u.email}
                    {u.unitCode && ` · ${u.unitCode}`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge>{ROLE_LABEL[u.role]}</Badge>
                  {u.id !== me.id && (
                    <ActionForm action={toggleUser} compact>
                      <input type="hidden" name="id" value={u.id} />
                      <Submit
                        small
                        variant={u.active ? "danger" : "secondary"}
                        confirm={u.active ? `¿Desactivar a ${u.name}?` : undefined}
                        confirmDetail="No podrá entrar hasta que lo actives de nuevo."
                      >
                        {u.active ? "Desactivar" : "Activar"}
                      </Submit>
                    </ActionForm>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <ActionForm action={addUser} className="grid gap-3 @xl:grid-cols-2">
            <Field label="Nombre">
              <input name="name" required className="input" />
            </Field>
            <Field label="Correo">
              <input type="email" name="email" required autoComplete="off" className="input" />
            </Field>
            <Field label="Rol">
              <select name="role" className="input" defaultValue="comerciante">
                <option value="comerciante">Comerciante</option>
                <option value="vigilante">Seguridad</option>
                <option value="admin">Administración</option>
              </select>
            </Field>
            <Field label="Local" hint="Solo para comerciantes.">
              <select name="unit_id" className="input" defaultValue="">
                <option value="">—</option>
                <UnitOptions units={units} />
              </select>
            </Field>
            <Field label="Contraseña inicial" hint="Mínimo 8 caracteres. Podrá cambiarla en su perfil." className="@xl:col-span-2">
              <input type="password" name="password" required minLength={8} autoComplete="new-password" className="input" />
            </Field>
            <div className="@xl:col-span-2">
              <Submit variant="secondary">Crear usuario</Submit>
            </div>
          </ActionForm>
        </Card>

        <Card title="Permisos por local" className="@3xl:col-span-2">
          <p className="mb-4 text-sm text-muted">
            Todo local puede pagar, autorizar accesos, reservar, escribir y enviar reportes. Aquí puedes
            suspenderle alguna de esas funciones: aplica a todos los usuarios del local y se les avisa al
            instante. Sin reportes no podrán avisar de emergencias desde la app.
          </p>

          <section className="mb-5 rounded-3xl bg-cream p-4">
            <h3 className="font-display font-bold">Aplicar a todos</h3>
            <p className="mb-2 text-sm text-muted">
              Cambia una función para los {units.length} locales de una vez. Los locales que agregues después
              empiezan con todo permitido.
            </p>
            <ul className="divide-y divide-line">
              {(Object.keys(PRIVILEGES) as Privilege[]).map((key) => {
                const { label, suspended, icon: Icon } = PRIVILEGES[key];
                const blockedCount = units.filter((u) => u.blocked.includes(key)).length;
                const status =
                  blockedCount === 0
                    ? "Permitido a todos"
                    : blockedCount === units.length
                      ? "Suspendido a todos"
                      : `Suspendido a ${blockedCount} de ${units.length}`;
                return (
                  <li key={key} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                    <Icon className={`size-5 shrink-0 ${blockedCount ? "text-muted" : "text-brand"}`} aria-hidden />
                    <span className="min-w-40 flex-1 text-sm">
                      <span className="block font-medium">{label}</span>
                      <span className={`block text-xs font-semibold ${blockedCount ? "text-clay" : "text-brand"}`}>
                        {status}
                      </span>
                    </span>
                    <ActionForm action={setPrivilegeForAll} compact className="flex flex-wrap gap-2">
                      <input type="hidden" name="privilege" value={key} />
                      {blockedCount > 0 && (
                        <Submit small variant="secondary" name="allowed" value="1">
                          Permitir a todos
                        </Submit>
                      )}
                      {blockedCount < units.length && (
                        <Submit
                          small
                          variant="danger"
                          name="allowed"
                          value="0"
                          confirm={`¿Suspender a todos los locales la opción de ${suspended}?`}
                          confirmDetail={
                            key === "reportes"
                              ? "Ningún local podrá avisar de emergencias desde la app. Se les avisará a todos."
                              : `Afecta a los ${units.length} locales. Se avisará a sus usuarios.`
                          }
                        >
                          Suspender a todos
                        </Submit>
                      )}
                    </ActionForm>
                  </li>
                );
              })}
            </ul>
          </section>

          <h3 className="mb-2 font-display font-bold">Por local</h3>
          <ul className="grid gap-3 @3xl:grid-cols-2">
            {units.map((u) => (
              <li key={u.id} className="rounded-3xl border border-line p-3">
                <details open={u.blocked.length > 0}>
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-2">
                    <span className="min-w-0">
                      <strong className="block truncate">{u.business ?? "Local desocupado"}</strong>
                      <span className="block truncate text-sm">{u.code}</span>
                      <span className="block text-xs text-muted">
                        {u.users === 0 ? "Sin usuario todavía" : u.users === 1 ? "1 usuario" : `${u.users} usuarios`}
                      </span>
                    </span>
                    <Badge tone={u.blocked.length ? "bad" : "good"}>
                      {u.blocked.length === 0
                        ? "Todo permitido"
                        : u.blocked.length === 1
                          ? "1 suspendido"
                          : `${u.blocked.length} suspendidos`}
                    </Badge>
                  </summary>
                  <div className="mt-2 border-t border-line pt-2">
                    <PrivilegeSwitches unitId={u.id} blocked={u.blocked} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
