import type { Metadata } from "next";
import { CalendarDays, Lock } from "lucide-react";
import { cancelReservation, reserve } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { Card, Empty, Field, PageHeader, Suspended } from "@/components/ui";
import { UnitOptions } from "@/components/unit-options";
import { requireUser } from "@/lib/auth";
import { listAmenities, listUnits, reservationsOn, upcomingReservations } from "@/lib/data";
import { SLOTS, dateLabel, isDate, today } from "@/lib/format";
import { can } from "@/lib/privileges";

export const metadata: Metadata = { title: "Reservas" };

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string }>;
}) {
  const user = await requireUser("admin", "comerciante");
  const isAdmin = user.role === "admin";
  const canReserve = can(user, "reservar");
  const { fecha } = await searchParams;
  const date = fecha && isDate(fecha) && fecha >= today() ? fecha : today();
  const amenities = listAmenities();
  const taken = reservationsOn(date);
  const upcoming = upcomingReservations(today(), isAdmin ? null : user.unitId);
  const units = isAdmin ? listUnits() : [];

  return (
    <>
      <PageHeader title="Reservas" subtitle="Andén de carga, salón y espacios para eventos, por turno.">
        <form className="flex items-end gap-2">
          <Field label="Día">
            <input type="date" name="fecha" defaultValue={date} min={today()} className="input" />
          </Field>
          <button className="btn btn-secondary">Ver</button>
        </form>
      </PageHeader>

      <div className="grid gap-5">
        {!canReserve && <Suspended privilege="reservar" />}
        <div className="grid gap-5 @3xl:grid-cols-3">
          {amenities.map((amenity) => (
            <Card key={amenity.id} title={amenity.name}>
              {amenity.description && <p className="-mt-2 mb-4 text-sm text-muted">{amenity.description}</p>}
              <ul className="space-y-2">
                {Object.entries(SLOTS).map(([slot, label]) => {
                  const booked = taken.find((r) => r.amenityId === amenity.id && r.slot === slot);
                  return (
                    <li
                      key={slot}
                      className={`rounded-xl border p-3 text-sm ${
                        booked ? "border-line bg-cream" : "border-brand/30 bg-brand-soft/50"
                      }`}
                    >
                      <p className="font-medium">{label}</p>
                      {booked ? (
                        <p className="flex items-center gap-1.5 text-xs text-muted">
                          <Lock className="size-3.5 shrink-0" aria-hidden />
                          Reservado por {booked.unitCode}
                          {booked.note && ` · ${booked.note}`}
                        </p>
                      ) : !canReserve ? (
                        <p className="text-xs text-muted">Disponible</p>
                      ) : (
                        <ActionForm action={reserve} compact className="mt-2 flex flex-wrap items-center gap-2">
                          <input type="hidden" name="amenity_id" value={amenity.id} />
                          <input type="hidden" name="date" value={date} />
                          <input type="hidden" name="slot" value={slot} />
                          {isAdmin && (
                            <select
                              name="unit_id"
                              required
                              defaultValue=""
                              aria-label="Local que reserva"
                              className="input w-auto flex-1 text-sm"
                            >
                              <option value="" disabled>
                                ¿Para quién?
                              </option>
                              <UnitOptions units={units} />
                            </select>
                          )}
                          <Submit small>Reservar</Submit>
                        </ActionForm>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
        <p className="-mt-2 text-sm text-muted">Mostrando la disponibilidad del {dateLabel(date)}.</p>

        <Card title={isAdmin ? "Próximas reservas" : "Mis reservas"}>
          {upcoming.length === 0 && <Empty icon={CalendarDays}>No hay reservas próximas.</Empty>}
          <ul className="divide-y divide-line">
            {upcoming.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <span>
                  <strong>{r.amenityName}</strong>
                  {isAdmin && ` · ${r.unitCode}`}
                  <span className="block text-xs text-muted">
                    {dateLabel(r.date)} · {SLOTS[r.slot]}
                  </span>
                </span>
                <ActionForm action={cancelReservation} compact>
                  <input type="hidden" name="id" value={r.id} />
                  <Submit
                    small
                    variant="danger"
                    confirm="¿Cancelar esta reserva?"
                    confirmDetail={`${r.amenityName} · ${dateLabel(r.date)} · ${SLOTS[r.slot]}. El turno quedará libre para otros.`}
                  >
                    Cancelar reserva
                  </Submit>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
