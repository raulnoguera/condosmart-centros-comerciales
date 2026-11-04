import { headers } from "next/headers";
import webpush from "web-push";
import { all, get, run } from "./db";

type Keys = { publicKey: string; privateKey: string };

const setting = (key: string) =>
  get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)?.value;

/**
 * Claves VAPID que identifican a este servidor ante Apple, Google y Mozilla.
 * Se generan una sola vez y se guardan en la base: si se pierden, todos los
 * dispositivos tienen que volver a activar las notificaciones.
 */
export function vapidKeys(): Keys {
  const publicKey = setting("vapid_public");
  const privateKey = setting("vapid_private");
  if (publicKey && privateKey) return { publicKey, privateKey };
  const keys = webpush.generateVAPIDKeys();
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('vapid_public', ?)", keys.publicKey);
  run("INSERT OR REPLACE INTO settings (key, value) VALUES ('vapid_private', ?)", keys.privateKey);
  return keys;
}

export type PushPayload = { title: string; body: string; href: string };

/**
 * Identificación de este servidor ante los servicios de push: la dirección
 * pública del sitio, tomada de la petición en curso. Apple rechaza el envío
 * (403 BadJwtToken) si el contacto no es real, por ejemplo un correo de un
 * dominio que no existe, así que no se usa el correo de la administración.
 * Solo puede llamarse dentro de una acción del servidor o una ruta.
 */
export async function pushSubject(): Promise<string | undefined> {
  if (process.env.PUSH_SUBJECT) return process.env.PUSH_SUBJECT;
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    const url = new URL(h.get("origin") ?? `https://${host}`);
    const local = /^(localhost|[\d.]+|.*\.local)$/.test(url.hostname);
    return url.protocol === "https:" && !local ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/** Envía un push a todos los dispositivos de esos usuarios. Nunca lanza. */
export async function sendPush(userIds: number[], payload: PushPayload, subject?: string): Promise<number> {
  if (userIds.length === 0) return 0;
  const subs = all<{ endpoint: string; p256dh: string; auth: string }>(
    `SELECT endpoint, p256dh, auth FROM push_subscriptions
     WHERE user_id IN (${userIds.map(() => "?").join(",")})`,
    ...userIds,
  );
  if (subs.length === 0) return 0;

  const { publicKey, privateKey } = vapidKeys();
  // Sin dirección pública (pruebas en local) se recurre al correo de la administración.
  const contact =
    subject ??
    `mailto:${
      get<{ email: string }>("SELECT email FROM users WHERE role = 'admin' AND active = 1 ORDER BY id")
        ?.email ?? "admin@example.com"
    }`;

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { vapidDetails: { subject: contact, publicKey, privateKey }, TTL: 60 * 60 * 24 },
      ),
    ),
  );
  let delivered = 0;
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      delivered++;
      return;
    }
    // 404 y 410: el dispositivo ya no existe o retiró el permiso.
    const { statusCode: status, body } = (result.reason ?? {}) as { statusCode?: number; body?: string };
    if (status === 404 || status === 410) {
      run("DELETE FROM push_subscriptions WHERE endpoint = ?", subs[i].endpoint);
      console.log(`Push: dispositivo dado de baja (${status}), se borra su suscripción.`);
    } else {
      console.error("Push no entregado:", status ?? result.reason, String(body ?? "").slice(0, 200));
    }
  });
  // Una línea por envío, para poder comprobar en el registro que salió.
  console.log(`Push "${payload.title}": ${delivered} de ${subs.length} dispositivos aceptaron el envío.`);
  return delivered;
}
