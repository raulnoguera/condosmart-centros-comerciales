import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleCheck, SendHorizontal, Wrench } from "lucide-react";
import { attendAlert, commentAlert, deleteAlert, resolveAlert } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { AlertCard } from "@/components/alert-card";
import { PageHeader, Suspended } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { alertComments, getAlert } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { can } from "@/lib/privileges";

export const metadata: Metadata = { title: "Reporte" };

export default async function AlertPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const alert = getAlert(Number((await params).id) || 0, user);
  if (!alert) notFound();
  const comments = alertComments(alert.id);
  const mine = alert.userId === user.id;
  const canResolve = alert.status !== "resuelta" && (mine || user.role === "admin");
  const canAttend = alert.status === "activa" && user.role === "admin";

  return (
    <>
      <PageHeader
        title="Reporte"
        subtitle={
          <Link href="/reportes" className="text-brand hover:underline">
            ← Todos los reportes
          </Link>
        }
      />
      <div className="grid max-w-xl gap-4">
        <AlertCard alert={alert} full />

        {(canResolve || user.role === "admin") && (
          <div className="flex flex-wrap gap-2">
            {canAttend && (
              <ActionForm action={attendAlert} compact>
                <input type="hidden" name="id" value={alert.id} />
                <Submit>
                  <Wrench className="size-4" aria-hidden /> Marcar en proceso
                </Submit>
              </ActionForm>
            )}
            {canResolve && (
              <ActionForm action={resolveAlert} compact>
                <input type="hidden" name="id" value={alert.id} />
                <Submit variant="secondary">
                  <CircleCheck className="size-4" aria-hidden /> Marcar como resuelto
                </Submit>
              </ActionForm>
            )}
            {user.role === "admin" && (
              <ActionForm action={deleteAlert} compact>
                <input type="hidden" name="id" value={alert.id} />
                <Submit
                  variant="danger"
                  confirm="¿Eliminar este reporte?"
                  confirmDetail="Se borrará para todos, con su foto y sus respuestas."
                >
                  Eliminar
                </Submit>
              </ActionForm>
            )}
          </div>
        )}

        <section>
          <h2 className="mb-2 px-1 font-display text-lg font-bold">Respuestas</h2>
          {comments.length === 0 && (
            <p className="px-1 text-sm text-muted">Nadie ha respondido todavía. Si sabes algo, escríbelo aquí.</p>
          )}
          <ol className="grid gap-2">
            {comments.map((c) => (
              <li key={c.id} className="rounded-3xl border border-line bg-paper px-4 py-3 shadow-card">
                <p className="flex items-baseline justify-between gap-2 text-xs text-muted">
                  <span className="font-semibold text-brand">
                    {c.author}
                    {c.userId === alert.userId && " · quien reportó"}
                  </span>
                  {timeAgo(c.createdAt)}
                </p>
                <p className="mt-0.5 whitespace-pre-line break-words text-[15px] leading-snug">{c.body}</p>
              </li>
            ))}
          </ol>
          {can(user, "reportes") ? (
            <ActionForm
              action={commentAlert}
              className="mt-3 flex flex-wrap items-center gap-2 rounded-3xl border border-line bg-paper p-2 shadow-card"
            >
              <input type="hidden" name="id" value={alert.id} />
              <input
                name="body"
                required
                maxLength={400}
                autoComplete="off"
                enterKeyHint="send"
                placeholder="Escribe una respuesta"
                aria-label="Respuesta"
                className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted/70"
              />
              <button aria-label="Enviar respuesta" className="btn btn-primary size-11 rounded-full p-0">
                <SendHorizontal className="size-5" aria-hidden />
              </button>
            </ActionForm>
          ) : (
            <div className="mt-3">
              <Suspended privilege="reportes" />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
