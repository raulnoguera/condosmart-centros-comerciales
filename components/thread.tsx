import { MessageCircle, SendHorizontal } from "lucide-react";
import { sendMessage } from "@/app/actions";
import { ActionForm } from "@/components/action-form";
import { ThreadWatcher } from "@/components/thread-client";
import { Empty, Suspended } from "@/components/ui";
import { messagesOf } from "@/lib/data";
import { dateLabel, dayOf, timeLabel, today } from "@/lib/format";

/** Conversación entre un local y la administración, vista desde cualquiera de los dos lados. */
export function Thread({
  unitId,
  asAdmin,
  canWrite = true,
}: {
  unitId: number;
  asAdmin: boolean;
  /** Falso cuando la administración le suspendió al comerciante la opción de escribir. */
  canWrite?: boolean;
}) {
  const messages = messagesOf(unitId);
  const mine = (fromAdmin: number) => Boolean(fromAdmin) === asAdmin;
  const hasIncoming = messages.some((m) => !mine(m.fromAdmin));
  let lastDay = "";

  return (
    <>
      {messages.length === 0 && (
        <Empty icon={MessageCircle}>
          {asAdmin ? "Aún no hay mensajes con esta local." : "Escríbele a la administración: dudas, reportes o solicitudes."}
        </Empty>
      )}
      <ol className="flex flex-col gap-2">
        {messages.map((m) => {
          const day = dayOf(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          const own = mine(m.fromAdmin);
          return (
            <li key={m.id} className="flex flex-col">
              {showDay && (
                <p className="my-3 self-center rounded-full bg-line/60 px-3 py-1 text-xs text-muted">
                  {day === today() ? "Hoy" : dateLabel(day)}
                </p>
              )}
              <div
                className={`max-w-[82%] rounded-3xl px-3.5 py-2.5 shadow-card ${
                  own
                    ? "self-end rounded-br-md bg-brand text-white"
                    : "self-start rounded-bl-md border border-line bg-paper"
                }`}
              >
                {!own && (
                  <p className="text-xs font-semibold text-brand">{m.fromAdmin ? "Administración" : m.senderName}</p>
                )}
                <p className="whitespace-pre-line break-words text-[15px] leading-snug">{m.body}</p>
                <p className={`mt-1 text-right text-xs ${own ? "text-white/70" : "text-muted"}`}>
                  <span className="sr-only">{own ? "Enviado" : "Recibido"} a las </span>
                  {timeLabel(m.createdAt)}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      <ThreadWatcher unitId={unitId} lastId={messages.at(-1)?.id ?? 0} unread={hasIncoming} />

      {canWrite ? (
        <ActionForm
          action={sendMessage}
          className="sticky bottom-(--bottom-bar) mt-4 flex flex-wrap items-center gap-2 rounded-3xl border border-line bg-paper p-2 shadow-pop"
        >
          <input type="hidden" name="unit_id" value={unitId} />
          <input
            name="body"
            required
            maxLength={1000}
            autoComplete="off"
            enterKeyHint="send"
            placeholder="Escribe un mensaje"
            aria-label="Mensaje"
            className="min-h-11 min-w-0 flex-1 bg-transparent px-2 text-base outline-none placeholder:text-muted/70"
          />
          <button aria-label="Enviar" className="btn btn-primary size-11 rounded-full p-0">
            <SendHorizontal className="size-5" aria-hidden />
          </button>
        </ActionForm>
      ) : (
        <div className="mt-4">
          <Suspended privilege="escribir" />
        </div>
      )}
    </>
  );
}
