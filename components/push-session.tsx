"use client";

import { useEffect, type ReactNode } from "react";
import { logout, removePushSubscription, savePushSubscription } from "@/app/actions";

/** La suscripción push de este dispositivo, si el navegador ya tiene una. */
async function deviceSubscription(): Promise<PushSubscription | null> {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    return (await registration?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Un dispositivo tiene una sola suscripción push, compartida por todas las
 * cuentas que entren en él. Al cargar la app se asocia a quien tiene la sesión
 * abierta, para que las notificaciones lleguen a la persona correcta.
 */
export function PushSync() {
  useEffect(() => {
    void deviceSubscription().then((subscription) => {
      if (subscription) void savePushSubscription(subscription.toJSON());
    });
  }, []);
  return null;
}

/** Cierra la sesión y antes desliga el dispositivo, para que no siga recibiendo avisos de esa cuenta. */
export function LogoutForm({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <form
      className={className}
      action={async () => {
        const subscription = await deviceSubscription();
        if (subscription) await removePushSubscription(subscription.endpoint);
        await logout();
      }}
    >
      {children}
    </form>
  );
}
