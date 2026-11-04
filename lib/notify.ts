import { after } from "next/server";
import { all, run } from "./db";
import { nowIso } from "./format";
import { pushSubject, sendPush } from "./push";

export type NotificationKind =
  | "pago" | "cargo" | "aviso" | "visita" | "consulta" | "reserva" | "mensaje" | "alerta" | "sistema";

export type NewNotification = {
  kind: NotificationKind;
  title: string;
  body: string;
  /** A dónde lleva al tocarla. */
  href: string;
};

const ids = (sql: string, ...params: (string | number)[]) =>
  all<{ id: number }>(sql, ...params).map((r) => r.id);

/** Deja la notificación en el buzón de cada usuario. Devuelve a quiénes, sin repetidos. */
export function storeNotifications(userIds: number[], n: NewNotification): number[] {
  const unique = [...new Set(userIds)];
  const now = nowIso();
  for (const userId of unique) {
    run(
      "INSERT INTO notifications (user_id, kind, title, body, href, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      userId, n.kind, n.title, n.body, n.href, now,
    );
  }
  return unique;
}

/** Guarda la notificación en el buzón de cada usuario y la envía como push. */
export function notifyUsers(userIds: number[], n: NewNotification) {
  const unique = storeNotifications(userIds, n);
  if (unique.length === 0) return;
  // El push sale después de responder, para no hacer esperar a quien actuó.
  after(async () => {
    await sendPush(unique, { title: n.title, body: n.body, href: n.href }, await pushSubject());
  });
}

export function notifyUnit(unitId: number, n: NewNotification) {
  notifyUsers(ids("SELECT id FROM users WHERE unit_id = ? AND active = 1", unitId), n);
}

export function notifyRole(role: "admin" | "comerciante" | "vigilante", n: NewNotification, exceptUserId = 0) {
  notifyUsers(ids("SELECT id FROM users WHERE role = ? AND active = 1 AND id != ?", role, exceptUserId), n);
}
