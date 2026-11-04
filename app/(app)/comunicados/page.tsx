import type { Metadata } from "next";
import { Megaphone, Pin, Vote } from "lucide-react";
import { createPoll, deleteAnnouncement, deletePoll, postAnnouncement, vote } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { Badge, Card, Empty, Field, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { audienceLabel } from "@/lib/address";
import { listAnnouncements, listPolls, listUnits, listZones } from "@/lib/data";
import { dateLabel, today } from "@/lib/format";

export const metadata: Metadata = { title: "Comunicados" };

export default async function CommunityPage() {
  const user = await requireUser();
  const isAdmin = user.role === "admin";
  const announcements = listAnnouncements(user);
  const polls = user.role === "vigilante" ? [] : listPolls(user.unitId);
  const unitCount = listUnits().length;
  const zones = isAdmin ? listZones() : [];

  return (
    <>
      <PageHeader title="Comunicados" subtitle="Circulares de la administración y consultas a los locales." />
      <div className="grid gap-5 @3xl:grid-cols-2">
        <div className="grid content-start gap-5">
          <Card title="Avisos">
            {announcements.length === 0 && <Empty icon={Megaphone}>No hay avisos.</Empty>}
            <ul className="divide-y divide-line">
              {announcements.map((a) => (
                <li key={a.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="flex items-center gap-2 font-semibold">
                      {a.pinned === 1 && <Pin className="size-4 text-clay" aria-label="Fijado" />}
                      {a.title}
                    </p>
                    {isAdmin && (
                      <ActionForm action={deleteAnnouncement} compact>
                        <input type="hidden" name="id" value={a.id} />
                        <Submit small variant="danger" confirm="¿Borrar este aviso?" confirmDetail={a.title}>
                          Borrar
                        </Submit>
                      </ActionForm>
                    )}
                  </div>
                  {audienceLabel({ level: a.audienceLevel, aisle: a.audienceAisle }) && (
                    <p className="mt-1">
                      <Badge tone="warn">{audienceLabel({ level: a.audienceLevel, aisle: a.audienceAisle })}</Badge>
                    </p>
                  )}
                  <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-muted">{a.body}</p>
                  <p className="mt-2 text-xs text-muted">{dateLabel(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          </Card>
          {isAdmin && (
            <Card title="Publicar un aviso">
              <ActionForm action={postAnnouncement} className="grid gap-3">
                <Field label="Título">
                  <input name="title" required className="input" />
                </Field>
                <Field label="Mensaje">
                  <textarea name="body" required rows={4} className="input" />
                </Field>
                {zones.length > 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Enviar a">
                      <select name="audience_level" defaultValue="" className="input">
                        <option value="">Todo el centro comercial</option>
                        {zones.map((z) => (
                          <option key={z.level} value={z.level}>
                            Solo Nivel {z.level}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Pasillo" hint="Solo aplica si eliges un nivel.">
                      <select name="audience_aisle" defaultValue="" className="input">
                        <option value="">Todo el nivel</option>
                        {zones.map((z) => (
                          <optgroup key={z.level} label={`Nivel ${z.level}`}>
                            {z.aisles.map((b) => (
                              <option key={`${z.level}|${b}`} value={b}>
                                Pasillo {b}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
                <label className="flex min-h-11 items-center gap-2 text-sm">
                  <input type="checkbox" name="pinned" className="size-5 accent-brand" /> Fijar arriba
                </label>
                <div>
                  <Submit>Publicar</Submit>
                </div>
              </ActionForm>
            </Card>
          )}
        </div>

        {user.role !== "vigilante" && (
          <div className="grid content-start gap-5">
            {polls.length === 0 && (
              <Card title="Consultas">
                <Empty icon={Vote}>No hay consultas abiertas.</Empty>
              </Card>
            )}
            {polls.map((poll) => {
              const open = poll.closesOn >= today();
              const canVote = open && user.role === "comerciante";
              return (
                <Card key={poll.id}>
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-display text-lg font-bold">{poll.question}</h2>
                    <Badge tone={open ? "good" : "neutral"}>{open ? "Abierta" : "Cerrada"}</Badge>
                  </div>
                  <p className="mb-4 mt-1 text-xs text-muted">
                    {open ? "Cierra" : "Cerró"} el {dateLabel(poll.closesOn)} · {poll.totalVotes} de {unitCount}{" "}
                    locales han votado · un voto por local
                  </p>
                  <ActionForm action={vote} className="grid gap-3">
                    {poll.options.map((o) => {
                      const share = poll.totalVotes ? (o.votes / poll.totalVotes) * 100 : 0;
                      return (
                        <label key={o.id} className={`block text-sm ${canVote ? "cursor-pointer" : ""}`}>
                          <span className="flex items-center justify-between gap-3">
                            <span className="flex min-h-8 items-center gap-2">
                              {canVote && (
                                <input
                                  type="radio"
                                  name="option_id"
                                  value={o.id}
                                  defaultChecked={poll.myOptionId === o.id}
                                  required
                                  className="size-5 accent-brand"
                                />
                              )}
                              {o.label}
                              {poll.myOptionId === o.id && <Badge tone="good">Tu voto</Badge>}
                            </span>
                            <span className="tabular-nums text-muted">
                              {o.votes} · {Math.round(share)}%
                            </span>
                          </span>
                          <span className="mt-1 block h-2 rounded-full bg-cream">
                            <span className="block h-2 rounded-full bg-brand" style={{ width: `${share}%` }} />
                          </span>
                        </label>
                      );
                    })}
                    {canVote && (
                      <div>
                        <Submit>{poll.myOptionId ? "Cambiar mi voto" : "Votar"}</Submit>
                      </div>
                    )}
                  </ActionForm>
                  {isAdmin && (
                    <ActionForm action={deletePoll} compact className="mt-3">
                      <input type="hidden" name="id" value={poll.id} />
                      <Submit
                        small
                        variant="danger"
                        confirm="¿Eliminar esta consulta?"
                        confirmDetail="Se perderán también los votos registrados."
                      >
                        Eliminar consulta
                      </Submit>
                    </ActionForm>
                  )}
                </Card>
              );
            })}
            {isAdmin && (
              <Card title="Nueva consulta">
                <ActionForm action={createPoll} className="grid gap-3">
                  <Field label="Pregunta">
                    <input name="question" required className="input" />
                  </Field>
                  <Field label="Opciones" hint="Una por línea, mínimo dos.">
                    <textarea name="options" required rows={3} className="input" placeholder={"Sí\nNo"} />
                  </Field>
                  <Field label="Se puede votar hasta">
                    <input type="date" name="closes_on" required min={today()} className="input" />
                  </Field>
                  <div>
                    <Submit>Publicar consulta</Submit>
                  </div>
                </ActionForm>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
