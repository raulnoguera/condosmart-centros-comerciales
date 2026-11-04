import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { demoLogin, login } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { BadgeCheck, HardHat, ReceiptText } from "lucide-react";
import { Logo, Wordmark } from "@/components/logo";
import { Field } from "@/components/ui";
import { getUser, homeFor } from "@/lib/auth";
import { APP_NAME, APP_TAGLINE, IS_DEMO } from "@/lib/brand";
import { getSettings } from "@/lib/data";
import { DEMO_ACCOUNTS } from "@/lib/seed";

export const metadata: Metadata = { title: "Entrar" };

/** Muestras de lo que hace la app, flotando sobre el panel de la marca. Solo decoración. */
const HIGHLIGHTS = [
  { icon: ReceiptText, title: "Aviso de cobro emitido", detail: "Cada local ve su parte de los gastos", className: "right-10 top-24 [--tilt:5deg] rotate-[5deg]" },
  { icon: BadgeCheck, title: "Pago aprobado", detail: "En bolívares, a la tasa BCV del día", className: "right-36 top-56 [--tilt:-4deg] -rotate-[4deg] [animation-delay:-2.5s]" },
  { icon: HardHat, title: "Contratista autorizado", detail: "Seguridad lo ve al instante", className: "right-6 top-[22rem] [--tilt:3deg] rotate-[3deg] [animation-delay:-5s]" },
];

export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect(homeFor(user.role));
  const { name, location, logo } = getSettings();

  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      <div className="hero-bg flex flex-col justify-end overflow-hidden p-8 text-white lg:p-14">
        <span className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-white/10" aria-hidden />
        <span className="pointer-events-none absolute -bottom-32 left-1/3 size-80 rounded-full bg-white/[0.07]" aria-hidden />
        {HIGHLIGHTS.map((h) => (
          <div
            key={h.title}
            aria-hidden
            className={`pointer-events-none absolute hidden w-72 animate-float items-center gap-3 rounded-3xl border border-white/30 bg-white/15 p-4 shadow-[inset_0_1px_0_rgb(255_255_255/0.4),0_30px_50px_-20px_rgb(0_0_0/0.55)] backdrop-blur-md xl:flex ${h.className}`}
          >
            <span className="tile-icon grid size-12 shrink-0 place-items-center rounded-2xl">
              <h.icon className="size-6" />
            </span>
            <span>
              <span className="block font-display text-base font-bold leading-tight">{h.title}</span>
              <span className="block text-xs text-white/75">{h.detail}</span>
            </span>
          </div>
        ))}
        <div className="relative mb-auto flex items-center gap-3 pb-10">
          <span className="grid size-14 place-items-center rounded-2xl bg-white shadow-[0_12px_24px_-12px_rgb(0_0_0/0.5)]">
            <Logo className="h-11 w-9" />
          </span>
          <span>
            <span className="block font-display text-3xl font-extrabold leading-none tracking-tight"><Wordmark className="[&>span]:text-[#7DD3F0]" /></span>
            <span className="block text-xs text-white/70">{APP_TAGLINE}</span>
          </span>
        </div>
        {logo && (
          // eslint-disable-next-line @next/next/no-img-element -- lo sirve la propia app
          <img
            src={`/logo?${logo}`}
            alt={`Logo de ${name}`}
            className="relative mb-6 h-24 w-fit rounded-3xl bg-white object-contain p-2 shadow-[0_24px_40px_-16px_rgb(0_0_0/0.5)] lg:h-32"
          />
        )}
        <p className="relative flex flex-wrap items-center gap-x-3 gap-y-1 text-sm uppercase tracking-[0.2em] text-white/60">
          Centro Comercial
          {IS_DEMO && (
            <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-white">
              Demostración · datos ficticios
            </span>
          )}
        </p>
        <h1 className="relative font-display text-5xl font-extrabold leading-[0.95] tracking-tight lg:text-8xl">{name}</h1>
        {location && <p className="relative mt-2 text-white/70">{location}</p>}
        <p className="relative mt-5 max-w-md text-lg text-white/80">
          El estado de cuenta de tu local, tus proveedores y contratistas, y los reportes de mantenimiento, en un solo lugar.
        </p>
      </div>
      <div className="flex items-center justify-center p-6 lg:p-14">
        <div className="w-full max-w-sm rounded-[2rem] bg-paper p-7 shadow-pop">
          <h2 className="font-display text-3xl font-extrabold">Entrar</h2>
          <p className="mb-6 mt-1 text-sm text-muted">Usa el correo que registró la administración.</p>
          <ActionForm action={login} className="grid gap-4">
            <Field label="Correo">
              <input type="email" name="email" required autoComplete="username" className="input" />
            </Field>
            <Field label="Contraseña">
              <input type="password" name="password" required autoComplete="current-password" className="input" />
            </Field>
            <Submit>Entrar</Submit>
          </ActionForm>
          {IS_DEMO && (
            <div className="mt-6 border-t border-line pt-5">
              <p className="font-semibold">Pruébala sin contraseña</p>
              <p className="mt-0.5 text-sm text-muted">Entra con una cuenta de demostración:</p>
              <div className="mt-3 grid gap-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <form key={a.email} action={demoLogin}>
                    <input type="hidden" name="email" value={a.email} />
                    <button className="btn btn-secondary w-full">
                      Entrar como {a.role}
                    </button>
                  </form>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
