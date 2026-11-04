import type { ReactNode } from "react";
import { Inbox, Lock, type LucideIcon } from "lucide-react";
import { PRIVILEGES, type Privilege } from "@/lib/privileges";

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-[2rem] font-extrabold leading-[1.05] text-ink @3xl:text-[2.5rem]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </header>
  );
}

export function Card({
  title,
  aside,
  children,
  className = "",
  id,
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={`rounded-3xl bg-paper p-5 shadow-card ${className}`}>
      {(title || aside) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && (
            <h2 className="flex items-center gap-2.5 font-display text-xl font-bold text-ink">
              <span className="h-5 w-1.5 shrink-0 rounded-full bg-linear-to-b from-brand to-pink" aria-hidden />
              {title}
            </h2>
          )}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  neutral: "bg-cream text-muted",
  good: "bg-good-soft text-good",
  warn: "bg-gold-soft text-gold",
  bad: "bg-clay-soft text-clay",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  progress,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "bad" | "good";
  icon?: LucideIcon;
  /** De 0 a 1: dibuja una barra de avance bajo la cifra. */
  progress?: number;
}) {
  const color = tone === "bad" ? "text-clay" : tone === "good" ? "text-good" : "text-ink";
  return (
    <div className="stat lift relative overflow-hidden rounded-3xl bg-paper p-4 shadow-card">
      <span
        className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-linear-to-br from-(--from) to-(--to) opacity-15"
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
        {Icon && (
          <span className="tile grid size-10 shrink-0 place-items-center rounded-2xl">
            <Icon className="size-5" aria-hidden />
          </span>
        )}
      </div>
      <p className={`relative mt-2 font-display text-[clamp(1.2rem,7.2cqw,1.7rem)] font-extrabold leading-none tabular-nums ${color}`}>
        {value}
      </p>
      {progress !== undefined && (
        <div
          role="progressbar"
          aria-label={label}
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="relative mt-3 h-2 overflow-hidden rounded-full bg-cream"
        >
          <div className="h-full rounded-full bg-linear-to-r from-(--from) to-(--to)" style={{ width: `${Math.min(1, progress) * 100}%` }} />
        </div>
      )}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Field({
  label,
  hint,
  optional,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  optional?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-muted"> · opcional</span>}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Empty({ children, icon: Icon = Inbox }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted">
      <span className="grid size-11 place-items-center rounded-full bg-cream">
        <Icon className="size-5" aria-hidden />
      </span>
      <p className="max-w-xs">{children}</p>
    </div>
  );
}

/** Se muestra en lugar del formulario cuando la administración suspendió esa función al local. */
export function Suspended({ privilege }: { privilege: Privilege }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-gold-soft p-4 text-gold">
      <Lock className="mt-0.5 size-5 shrink-0" aria-hidden />
      <p className="text-sm">
        <strong className="block">Opción suspendida</strong>
        La administración suspendió la opción de {PRIVILEGES[privilege].suspended} para tu local. Para recuperarla,
        comunícate con la administración.
      </p>
    </div>
  );
}

export const STANDING_BADGE = {
  al_dia: { tone: "good", label: "Al día" },
  pendiente: { tone: "warn", label: "Pendiente" },
  moroso: { tone: "bad", label: "Moroso" },
} as const;

export const PAYMENT_BADGE = {
  pendiente: { tone: "warn", label: "Por verificar" },
  aprobado: { tone: "good", label: "Aprobado" },
  rechazado: { tone: "bad", label: "Rechazado" },
} as const;
