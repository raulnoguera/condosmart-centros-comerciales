import Link from "next/link";
import { CircleCheck, LoaderCircle, Lock, MessageCircle } from "lucide-react";
import { audienceLabel } from "@/lib/address";
import { ALERT_KINDS, ALERT_STATUS } from "@/lib/alert-kinds";
import type { Alert } from "@/lib/data";
import { timeAgo } from "@/lib/format";

/** Color de un reporte: rojo si es urgente y sigue abierto, dorado si ya se está atendiendo. */
export function alertTone(alert: Pick<Alert, "kind" | "status">) {
  if (alert.status === "resuelta") return { card: "border-transparent bg-paper", icon: "bg-cream text-muted" };
  if (ALERT_KINDS[alert.kind].urgent) return { card: "border-clay/40 bg-clay-soft/60", icon: "bg-clay text-white" };
  if (alert.status === "en_proceso") return { card: "border-gold/30 bg-gold-soft/50", icon: "bg-gold text-white" };
  return { card: "border-transparent bg-paper", icon: "bg-sky-soft text-sky" };
}

/**
 * Tarjeta de un reporte. En las listas va resumida y enlaza al detalle;
 * con `full` muestra todo el texto y la foto completa.
 */
export function AlertCard({ alert, full }: { alert: Alert; full?: boolean }) {
  const kind = ALERT_KINDS[alert.kind];
  const tone = alertTone(alert);
  const content = (
    <>
      <div className="flex items-start gap-3">
        <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${tone.icon}`}>
          <kind.icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">{kind.label}</span>
            <span>
              {alert.author} · {timeAgo(alert.createdAt)}
            </span>
          </p>
          <p className={`font-semibold leading-snug ${full ? "mt-0.5 font-display text-xl" : ""}`}>{alert.title}</p>
          {full && alert.unitCode && <p className="mt-0.5 text-xs text-muted">{alert.unitCode}</p>}
          {alert.body && (
            <p className={`mt-1 whitespace-pre-line text-sm text-muted ${full ? "" : "line-clamp-2"}`}>
              {alert.body}
            </p>
          )}
        </div>
      </div>
      {alert.photo && (
        // eslint-disable-next-line @next/next/no-img-element -- se sirve con sesión, sin optimizador
        <img
          src={`/fotos/${alert.photo}`}
          alt={`Foto del reporte: ${alert.title}`}
          loading="lazy"
          className={`mt-3 w-full rounded-xl bg-cream object-cover ${full ? "max-h-[28rem]" : "aspect-[16/10]"}`}
        />
      )}
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {audienceLabel({ level: alert.audienceLevel, aisle: alert.audienceAisle }) && (
          <span className="rounded-full bg-gold-soft px-2 py-0.5 font-semibold text-gold">
            {audienceLabel({ level: alert.audienceLevel, aisle: alert.audienceAisle })}
          </span>
        )}
        {!kind.broadcast && (
          <span className="flex items-center gap-1" title="Solo lo ven la administración, la seguridad y el local que lo envió">
            <Lock className="size-3.5" aria-hidden /> Solo administración
          </span>
        )}
        {alert.status === "en_proceso" && (
          <span className="flex items-center gap-1 font-semibold text-gold">
            <LoaderCircle className="size-4" aria-hidden /> {ALERT_STATUS.en_proceso}
          </span>
        )}
        {alert.status === "resuelta" && (
          <span className="flex items-center gap-1 font-semibold text-good">
            <CircleCheck className="size-4" aria-hidden /> {ALERT_STATUS.resuelta}
          </span>
        )}
        <span className="flex items-center gap-1">
          <MessageCircle className="size-4" aria-hidden />
          {alert.comments === 0 ? "Sin respuestas" : alert.comments === 1 ? "1 respuesta" : `${alert.comments} respuestas`}
        </span>
      </p>
    </>
  );

  const className = `block rounded-3xl border p-4 shadow-card ${tone.card}`;
  return full ? (
    <article className={className}>{content}</article>
  ) : (
    <Link href={`/reportes/${alert.id}`} className={`${className} transition-colors hover:border-brand`}>
      {content}
    </Link>
  );
}
