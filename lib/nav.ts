import {
  CalendarDays, ChartColumn, House, Megaphone, MessageCircle, ReceiptText, Settings, Siren, Truck,
  UserRound, Wallet, type LucideIcon,
} from "lucide-react";
import type { Role } from "./auth";

export type NavItem = {
  href: string;
  label: string;
  /** Nombre alternativo cuando lo ve un comerciante. */
  tenantLabel?: string;
  /** Nombre alternativo cuando lo ve la administración. */
  adminLabel?: string;
  icon: LucideIcon;
  roles: Role[];
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: House, roles: ["admin", "comerciante"] },
  { href: "/cobranza", label: "Cobranza", tenantLabel: "Mi cuenta", icon: Wallet, roles: ["admin", "comerciante"] },
  { href: "/gastos", label: "Gastos", icon: ReceiptText, roles: ["admin", "comerciante"] },
  { href: "/accesos", label: "Accesos", icon: Truck, roles: ["admin", "comerciante", "vigilante"] },
  { href: "/reportes", label: "Reportes", adminLabel: "Incidencias", icon: Siren, roles: ["admin", "comerciante", "vigilante"] },
  { href: "/informes", label: "Reportes", icon: ChartColumn, roles: ["admin"] },
  { href: "/mensajes", label: "Mensajes", icon: MessageCircle, roles: ["admin", "comerciante"] },
  { href: "/comunicados", label: "Comunicados", icon: Megaphone, roles: ["admin", "comerciante", "vigilante"] },
  { href: "/reservas", label: "Reservas", icon: CalendarDays, roles: ["admin", "comerciante"] },
  { href: "/admin", label: "Administración", icon: Settings, roles: ["admin"] },
  { href: "/perfil", label: "Mi perfil", icon: UserRound, roles: ["admin", "comerciante", "vigilante"] },
];

/** Lo que cabe en la barra inferior del teléfono (máximo cuatro, más "Más"). */
const MOBILE_PRIMARY: Record<Role, string[]> = {
  admin: ["/", "/cobranza", "/gastos", "/accesos"],
  comerciante: ["/", "/cobranza", "/accesos", "/mensajes"],
  vigilante: ["/accesos", "/reportes", "/comunicados"],
};

/** El comerciante y la seguridad usan la app en formato teléfono; la administración, en escritorio. */
export function shellFor(role: Role): "app" | "web" {
  return role === "admin" ? "web" : "app";
}

export function navFor(role: Role) {
  const items = NAV_ITEMS.filter((i) => i.roles.includes(role)).map((i) => ({
    ...i,
    label: (role === "comerciante" && i.tenantLabel) || (role === "admin" && i.adminLabel) || i.label,
  }));
  return {
    all: items,
    primary: items.filter((i) => MOBILE_PRIMARY[role].includes(i.href)),
    more: items.filter((i) => !MOBILE_PRIMARY[role].includes(i.href)),
  };
}
