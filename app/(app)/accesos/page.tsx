import type { Metadata } from "next";
import { HardHat, LogIn, LogOut, MessageCircle, Search, Truck } from "lucide-react";
import { authorizeVisit, cancelVisit, markVisit, registerWalkIn, reviewAccess } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { Badge, Card, Empty, Field, PageHeader, Suspended, type Tone } from "@/components/ui";
import { UnitOptions } from "@/components/unit-options";
import { ACCESS_KINDS, type AccessKind } from "@/lib/access-kinds";
import { requireUser } from "@/lib/auth";
import { accessesToApprove, gateVisits, getSettings, listUnits, visitsOfUnit, type Visit } from "@/lib/data";
import { dateLabel, timeLabel, today } from "@/lib/format";
import { can } from "@/lib/privileges";

export const metadata: Metadata = { title: "Accesos" };

const STATUS: Record<Visit["status"], { tone: Tone; label: string }> = {
  por_aprobar: { tone: "warn", label: "Por aprobar" },
  rechazada: { tone: "bad", label: "No aprobado" },
  autorizada: { tone: "warn", label: "Por llegar" },
  adentro: { tone: "good", label: "Adentro" },
  salio: { tone: "neutral", label: "Salió" },
  cancelada: { tone: "bad", label: "Cancelado" },
};

const KINDS = Object.entries(ACCESS_KINDS) as [AccessKind, (typeof ACCESS_KINDS)[AccessKind]][];

/** Tipo de acceso: tarjetas para elegir con el pulgar. */
function KindPicker() {
  return (
    <fieldset className="@xl:col-span-2">
      <legend className="mb-1.5 text-sm font-medium">¿Quién viene?</legend>
      <div className="grid grid-cols-2 gap-2">
        {KINDS.map(([kind, { label, icon: Icon }], i) => (
          <label
            key={kind}
            className="flex cursor-pointer items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2.5 text-sm font-medium transition-colors has-checked:border-brand has-checked:bg-brand-soft has-checked:text-brand"
          >
            <input type="radio" name="kind" value={kind} defaultChecked={i === 0} required className="sr-only" />
            <Icon className="size-5 shrink-0" aria-hidden />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function PersonFields() {
  return (
    <>
      <Field label="Nombre de la persona" className="@xl:col-span-2">
        <input name="visitor_name" required className="input" />
      </Field>
      <Field label="Empresa" optional className="@xl:col-span-2">
        <input name="company" className="input" />
      </Field>
      <Field label="Cédula" optional>
        <input name="id_doc" inputMode="numeric" className="input" />
      </Field>
      <Field label="Placa" optional>
        <input name="plate" autoCapitalize="characters" className="input uppercase" />
      </Field>
    </>
  );
}

/** "Carlos Méndez · Distribuidora Café Andino". */
const who = (v: Visit) => (v.company ? `${v.visitorName} · ${v.company}` : v.visitorName);

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const user = await requireUser();
  return user.role === "comerciante" ? (
    <TenantAccess unitId={user.unitId} canAuthorize={can(user, "accesos")} />
  ) : (
    <GateAccess query={((await searchParams).codigo ?? "").trim()} isAdmin={user.role === "admin"} />
  );
}

function TenantAccess({ unitId, canAuthorize }: { unitId: number | null; canAuthorize: boolean }) {
  if (!unitId) return <Empty>Tu usuario no está asociado a un local. Avisa a la administración.</Empty>;
  const visits = visitsOfUnit(unitId, today());
  const { name } = getSettings();
  return (
    <>
      <PageHeader title="Accesos" subtitle="Autoriza a tus proveedores y contratistas; seguridad lo verá al instante." />
      <div className="grid gap-5 @3xl:grid-cols-5">
        <Card title="Autorizar un acceso" className="@3xl:col-span-2">
          {canAuthorize ? (
            <ActionForm action={authorizeVisit} className="grid gap-3 @xl:grid-cols-2">
              <KindPicker />
              <PersonFields />
              <Field label="Día" className="@xl:col-span-2">
                <input type="date" name="expected_on" required defaultValue={today()} min={today()} className="input" />
              </Field>
              <Field
                label="Detalle"
                hint="Para un contratista, describe el trabajo y el horario: la administración debe aprobarlo."
                className="@xl:col-span-2"
              >
                <input name="note" placeholder="Ej. Entrega semanal de mercancía" className="input" />
              </Field>
              <div className="@xl:col-span-2">
                <Submit>Autorizar</Submit>
              </div>
            </ActionForm>
          ) : (
            <Suspended privilege="accesos" />
          )}
        </Card>
        <Card title="Mis accesos" className="@3xl:col-span-3">
          {visits.length === 0 && <Empty icon={Truck}>No tienes accesos programados.</Empty>}
          <ul className="divide-y divide-line">
            {visits.map((v) => {
              const share = `Tu código de acceso a ${name} para el ${dateLabel(v.expectedOn)} es ${v.code}. Dalo en seguridad al llegar.`;
              return (
                <li key={v.id} className="py-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <span>
                      <strong>{who(v)}</strong>
                      <span className="block text-xs text-muted">
                        {ACCESS_KINDS[v.kind].label} · {dateLabel(v.expectedOn)}
                        {v.plate && ` · Placa ${v.plate}`}
                      </span>
                      {v.note && <span className="block text-xs text-muted">{v.note}</span>}
                    </span>
                    <Badge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</Badge>
                  </div>
                  {v.status === "por_aprobar" && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-gold-soft p-3 text-gold">
                      <p className="text-xs">La administración debe aprobar este trabajo antes de dar el código.</p>
                      <CancelAccess visit={v} />
                    </div>
                  )}
                  {v.status === "autorizada" && (
                    <div className="mt-3 rounded-xl bg-cream p-3">
                      <p className="text-xs text-muted">Código de acceso</p>
                      <p className="font-mono text-2xl font-semibold tracking-[0.3em] text-ink">{v.code}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <a
                          href={`https://wa.me/?text=${encodeURIComponent(share)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-sm"
                        >
                          <MessageCircle className="size-4" aria-hidden /> Enviar por WhatsApp
                        </a>
                        <CancelAccess visit={v} />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}

function CancelAccess({ visit }: { visit: Visit }) {
  return (
    <ActionForm action={cancelVisit} compact>
      <input type="hidden" name="id" value={visit.id} />
      <Submit
        small
        variant="danger"
        confirm={`¿Cancelar el acceso de ${visit.visitorName}?`}
        confirmDetail="El código dejará de funcionar en seguridad."
      >
        Cancelar
      </Submit>
    </ActionForm>
  );
}

function GateAccess({ query, isAdmin }: { query: string; isAdmin: boolean }) {
  const all = gateVisits(today());
  const needle = query.toLowerCase();
  const visits = query
    ? all.filter(
        (v) =>
          v.code === query ||
          v.visitorName.toLowerCase().includes(needle) ||
          v.company?.toLowerCase().includes(needle) ||
          v.business?.toLowerCase().includes(needle) ||
          v.unitCode.toLowerCase().includes(needle) ||
          v.plate?.includes(query.toUpperCase()),
      )
    : all;
  const units = listUnits();
  const toApprove = isAdmin ? accessesToApprove(today()) : [];
  return (
    <>
      <PageHeader
        title={isAdmin ? "Accesos" : "Seguridad"}
        subtitle={`Proveedores, contratistas y visitas de hoy, ${dateLabel(today())}`}
      />
      {toApprove.length > 0 && (
        <Card title="Trabajos por aprobar" className="mb-5">
          <ul className="divide-y divide-line">
            {toApprove.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0">
                <span className="flex min-w-0 items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-gold-soft text-gold">
                    <HardHat className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <strong>{who(v)}</strong>
                    <span className="block text-xs text-muted">
                      {v.business ?? "Local desocupado"} · {v.unitCode} · {dateLabel(v.expectedOn)}
                    </span>
                    {v.note && <span className="block text-xs text-muted">{v.note}</span>}
                  </span>
                </span>
                <ActionForm action={reviewAccess} compact className="flex gap-2">
                  <input type="hidden" name="id" value={v.id} />
                  <Submit small name="decision" value="approve">
                    Aprobar
                  </Submit>
                  <Submit small variant="danger" name="decision" value="reject">
                    Rechazar
                  </Submit>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid gap-5 @3xl:grid-cols-5">
        <Card title="Por llegar y adentro" className="@3xl:col-span-3">
          <form role="search" className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted" aria-hidden />
              <input
                type="search"
                name="codigo"
                defaultValue={query}
                placeholder="Código, nombre, empresa, placa o local"
                aria-label="Buscar acceso"
                className="input pl-10 text-lg"
              />
            </div>
            <button className="btn btn-secondary">Buscar</button>
          </form>
          {visits.length === 0 && (
            <Empty icon={query ? Search : Truck}>
              {query ? "Nada coincide con esa búsqueda." : "No hay accesos autorizados para hoy."}
            </Empty>
          )}
          <ul className="divide-y divide-line">
            {visits.map((v) => {
              const Icon = ACCESS_KINDS[v.kind].icon;
              return (
                <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                  <span className="flex min-w-0 items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <strong>{who(v)}</strong>
                      <span className="block">
                        → {v.business ?? "Local desocupado"} <span className="text-muted">· {v.unitCode}</span>
                      </span>
                      <span className="block text-xs text-muted">
                        {ACCESS_KINDS[v.kind].label} · Código {v.code}
                        {v.idDoc && ` · C.I. ${v.idDoc}`}
                        {v.plate && ` · Placa ${v.plate}`}
                        {v.enteredAt && ` · Entró ${timeLabel(v.enteredAt)}`}
                        {v.exitedAt && ` · Salió ${timeLabel(v.exitedAt)}`}
                      </span>
                      {v.note && <span className="block text-xs text-muted">{v.note}</span>}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge tone={STATUS[v.status].tone}>{STATUS[v.status].label}</Badge>
                    {(v.status === "autorizada" || v.status === "adentro") && (
                      <ActionForm action={markVisit} compact>
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="move" value={v.status === "autorizada" ? "in" : "out"} />
                        <Submit small variant={v.status === "autorizada" ? "primary" : "secondary"}>
                          {v.status === "autorizada" ? (
                            <>
                              <LogIn className="size-4" aria-hidden /> Registrar entrada
                            </>
                          ) : (
                            <>
                              <LogOut className="size-4" aria-hidden /> Registrar salida
                            </>
                          )}
                        </Submit>
                      </ActionForm>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title="Llegada sin anunciar" className="@3xl:col-span-2">
          <p className="mb-3 text-sm text-muted">Llama al local para confirmar antes de dejar pasar.</p>
          <ActionForm action={registerWalkIn} className="grid gap-3 @xl:grid-cols-2">
            <Field label="Va a" className="@xl:col-span-2">
              <select name="unit_id" required defaultValue="" className="input">
                <option value="" disabled>
                  Elige el local
                </option>
                <UnitOptions units={units} withOwner />
              </select>
            </Field>
            <KindPicker />
            <PersonFields />
            <div className="@xl:col-span-2">
              <Submit>Registrar entrada</Submit>
            </div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
