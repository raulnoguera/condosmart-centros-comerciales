import type { Metadata } from "next";
import { changePassword } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { LogoutForm } from "@/components/push-session";
import { Card, Field, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PRIVILEGES } from "@/lib/privileges";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Mi perfil" subtitle={`${user.name} · ${user.email}`} />
      <div className="grid max-w-md gap-5">
        {user.role === "comerciante" && (
          <Card title="Mis permisos">
            <ul className="grid gap-2 text-sm">
              {(Object.keys(PRIVILEGES) as (keyof typeof PRIVILEGES)[]).map((key) => {
                const allowed = !user.blocked.includes(key);
                const Icon = PRIVILEGES[key].icon;
                return (
                  <li key={key} className="flex items-center gap-3">
                    <Icon className={`size-5 ${allowed ? "text-brand" : "text-muted"}`} aria-hidden />
                    <span className={`flex-1 ${allowed ? "" : "text-muted"}`}>{PRIVILEGES[key].label}</span>
                    <span className={`text-xs font-semibold ${allowed ? "text-brand" : "text-clay"}`}>
                      {allowed ? "Permitido" : "Suspendido por la administración"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
        <Card title="Cambiar contraseña">
          <ActionForm action={changePassword} className="grid gap-3">
            <Field label="Contraseña actual">
              <input type="password" name="current" required autoComplete="current-password" className="input" />
            </Field>
            <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
              <input type="password" name="next" required minLength={8} autoComplete="new-password" className="input" />
            </Field>
            <div>
              <Submit>Guardar</Submit>
            </div>
          </ActionForm>
        </Card>
        <LogoutForm>
          <button className="btn btn-secondary w-full">Cerrar sesión</button>
        </LogoutForm>
      </div>
    </>
  );
}
