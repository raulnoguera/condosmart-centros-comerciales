import { CalendarDays, MessageCircle, Siren, Truck, Wallet, type LucideIcon } from "lucide-react";

/** Lo que la administración puede suspenderle a un local. Todo está permitido salvo que se quite. */
export const PRIVILEGES = {
  pagar: { label: "Reportar pagos", suspended: "reportar pagos", icon: Wallet },
  accesos: { label: "Autorizar accesos", suspended: "autorizar accesos", icon: Truck },
  reservar: { label: "Reservar espacios", suspended: "reservar espacios", icon: CalendarDays },
  escribir: { label: "Escribir a la administración", suspended: "escribir a la administración", icon: MessageCircle },
  reportes: { label: "Enviar y responder reportes", suspended: "enviar y responder reportes", icon: Siren },
} satisfies Record<string, { label: string; suspended: string; icon: LucideIcon }>;

export type Privilege = keyof typeof PRIVILEGES;

export const isPrivilege = (value: string): value is Privilege => value in PRIVILEGES;

/** La administración y la seguridad nunca están restringidas; solo los comerciantes. */
export function can(user: { role: string; blocked: Privilege[] }, privilege: Privilege): boolean {
  return user.role !== "comerciante" || !user.blocked.includes(privilege);
}
