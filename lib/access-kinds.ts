import { HardHat, Package, Truck, UserRound, type LucideIcon } from "lucide-react";

export type AccessKind = "proveedor" | "carga" | "contratista" | "visita";

/** Quién entra por cuenta de un local. Los trabajos necesitan aprobación de la administración. */
export const ACCESS_KINDS: Record<
  AccessKind,
  { label: string; hint: string; approval: boolean; icon: LucideIcon }
> = {
  proveedor: { label: "Proveedor", hint: "Entrega o servicio en horario normal.", approval: false, icon: Package },
  carga: { label: "Carga y descarga", hint: "Camión por el andén de carga.", approval: false, icon: Truck },
  contratista: {
    label: "Contratista",
    hint: "Remodelación, electricidad, aire o trabajos fuera de horario. Requiere aprobación.",
    approval: true,
    icon: HardHat,
  },
  visita: { label: "Visita", hint: "Persona que entra fuera del horario de apertura.", approval: false, icon: UserRound },
};

export const isAccessKind = (value: string): value is AccessKind => value in ACCESS_KINDS;
