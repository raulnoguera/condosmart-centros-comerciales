import { all, get, run } from "./db";
import { storeNotifications } from "./notify";
import { sendPush } from "./push";

/**
 * Al arrancar una versión recién publicada, avisa a todos los usuarios: deja la
 * notificación en su buzón y la envía como push. Se ejecuta una sola vez por
 * versión, aunque el hosting reinicie la app varias veces.
 */
export async function announceNewVersion() {
  // En desarrollo cada reinicio cuenta como versión nueva; ahí no se avisa.
  if (process.env.NODE_ENV !== "production") return;
  const build = process.env.NEXT_PUBLIC_BUILD_ID;
  if (!build) return;

  const previous = get<{ value: string }>("SELECT value FROM settings WHERE key = 'last_build'")?.value;
  if (previous === build) return;
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_build', ?)", build);
  // Primera puesta en marcha: no hay una versión anterior de la que avisar.
  if (!previous) return;

  const users = all<{ id: number }>("SELECT id FROM users WHERE active = 1").map((u) => u.id);
  const notice = {
    kind: "sistema" as const,
    title: "La app se actualizó",
    // La nota la escribe quien publica: ./scripts/deploy.sh "Qué cambió"
    body: process.env.RELEASE_NOTE?.trim() || "Hay una versión nueva. Ábrela para usarla.",
    href: "/",
  };
  storeNotifications(users, notice);
  // Fuera de una petición no se puede deducir la dirección del sitio: la da el despliegue.
  await sendPush(users, notice, process.env.PUSH_SUBJECT);
}
