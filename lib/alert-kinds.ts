import { Megaphone, ShieldAlert, Siren, SprayCan, Wrench, type LucideIcon } from "lucide-react";

export type AlertKind = "seguridad" | "emergencia" | "mantenimiento" | "limpieza" | "aviso";

export const ALERT_KINDS: Record<
  AlertKind,
  {
    label: string;
    hint: string;
    placeholder: string;
    urgent: boolean;
    /** Lo ven los demás locales. Si no, solo la administración, la seguridad y quien lo envió. */
    broadcast: boolean;
    icon: LucideIcon;
  }
> = {
  seguridad: {
    label: "Seguridad",
    hint: "Robo, hurto en tienda, persona sospechosa o riña.",
    placeholder: "Ej. Dos personas salieron corriendo con mercancía hacia el pasillo B",
    urgent: true,
    broadcast: true,
    icon: ShieldAlert,
  },
  emergencia: {
    label: "Emergencia",
    hint: "Incendio, humo, accidente o emergencia de salud.",
    placeholder: "Ej. Sale humo del cuarto eléctrico del nivel 1",
    urgent: true,
    broadcast: true,
    icon: Siren,
  },
  mantenimiento: {
    label: "Mantenimiento",
    hint: "Filtración, falla eléctrica, aire acondicionado, escalera o ascensor.",
    placeholder: "Ej. Filtración en el techo, sobre la vitrina",
    urgent: false,
    broadcast: false,
    icon: Wrench,
  },
  limpieza: {
    label: "Limpieza",
    hint: "Derrame, basura acumulada o baños en mal estado.",
    placeholder: "Ej. Derrame de refresco frente al local",
    urgent: false,
    broadcast: false,
    icon: SprayCan,
  },
  aviso: {
    label: "Aviso de mi local",
    hint: "Inventario, remodelación, evento o algo que los demás locales deban saber.",
    placeholder: "Ej. El sábado haremos una activación con música de 3 a 6 p. m.",
    urgent: false,
    broadcast: true,
    icon: Megaphone,
  },
};

export const isAlertKind = (value: string): value is AlertKind => value in ALERT_KINDS;

export const BROADCAST_KINDS = (Object.keys(ALERT_KINDS) as AlertKind[]).filter((k) => ALERT_KINDS[k].broadcast);

export type AlertStatus = "activa" | "en_proceso" | "resuelta";

export const ALERT_STATUS: Record<AlertStatus, string> = {
  activa: "Reportado",
  en_proceso: "En proceso",
  resuelta: "Resuelto",
};
