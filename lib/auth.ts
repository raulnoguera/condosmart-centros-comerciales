import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { all, get, run } from "./db";
import { nowIso } from "./format";
import { isPrivilege, type Privilege } from "./privileges";

const COOKIE = "atrio_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type Role = "admin" | "comerciante" | "vigilante";

export type User = {
  id: number;
  name: string;
  email: string;
  role: Role;
  unitId: number | null;
  unitCode: string | null;
  /** Comercio que opera en su local; es como se le reconoce en el centro comercial. */
  unitBusiness: string | null;
  /** Nivel y pasillo de su local: definen qué avisos y reportes de zona le llegan. */
  unitLevel: string | null;
  unitAisle: string | null;
  /** Funciones que la administración suspendió a su local; vacío para quien no es comerciante. */
  blocked: Privilege[];
};

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: number) {
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + MAX_AGE_SECONDS * 1000);
  run("DELETE FROM sessions WHERE expires_at < ?", nowIso());
  run(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)",
    hashToken(token), userId, expires.toISOString(),
  );
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) run("DELETE FROM sessions WHERE token_hash = ?", hashToken(token));
  store.delete(COOKIE);
}

export const getUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const row = get<Omit<User, "blocked">>(
    `SELECT u.id, u.name, u.email, u.role, u.unit_id AS unitId, un.code AS unitCode, un.business AS unitBusiness,
       un.level AS unitLevel, un.aisle AS unitAisle
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN units un ON un.id = u.unit_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`,
    hashToken(token), nowIso(),
  );
  if (!row) return null;
  const blocked = all<{ privilege: string }>(
    "SELECT privilege FROM unit_restrictions WHERE unit_id = ?",
    row.unitId,
  )
    .map((r) => r.privilege)
    .filter(isPrivilege);
  return { ...row, blocked };
});

/** Para páginas: exige sesión y, opcionalmente, uno de los roles dados. */
export async function requireUser(...roles: Role[]): Promise<User> {
  const user = await getUser();
  if (!user) redirect("/login");
  if (roles.length && !roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

export function homeFor(role: Role): string {
  return role === "vigilante" ? "/accesos" : "/";
}
