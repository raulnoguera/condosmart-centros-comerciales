"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, LoaderCircle, Smartphone } from "lucide-react";
import { removePushSubscription, savePushSubscription, sendTestPush } from "@/app/actions";
import { useToast } from "@/components/toaster";
import { APP_NAME } from "@/lib/brand";

type State = "loading" | "unsupported" | "needs-install" | "denied" | "off" | "on";

/** La clave pública VAPID llega en base64url; el navegador la quiere en bytes. */
function toBytes(base64url: string) {
  const base64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const bytes = new Uint8Array(new ArrayBuffer(atob(base64).length));
  [...atob(base64)].forEach((c, i) => (bytes[i] = c.charCodeAt(0)));
  return bytes;
}

const COPY: Record<State, { title: string; body: string }> = {
  loading: { title: "Notificaciones en este dispositivo", body: "Comprobando…" },
  off: {
    title: "Activa las notificaciones",
    body: "Recibe un aviso al instante cuando aprueben tu pago, llegue tu proveedor o te escriba la administración.",
  },
  on: {
    title: "Notificaciones activadas",
    body: "Este dispositivo recibirá los avisos aunque la app esté cerrada.",
  },
  denied: {
    title: "Notificaciones bloqueadas",
    body: "Este navegador las tiene bloqueadas para la app. Permítelas en los ajustes del sitio o del teléfono y vuelve aquí.",
  },
  "needs-install": {
    title: "Instala la app para recibir avisos",
    body: `En iPhone: toca Compartir y luego «Agregar a inicio». Abre ${APP_NAME} desde el icono y vuelve aquí.`,
  },
  unsupported: {
    title: "Este navegador no admite notificaciones",
    body: "Igual verás todos los avisos aquí, en tu buzón, cada vez que abras la app.",
  },
};

export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        // Safari en iPhone solo ofrece push cuando la app está en la pantalla de inicio.
        setState(/iphone|ipad|ipod/i.test(navigator.userAgent) ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setState("denied");
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      setState(subscription ? "on" : "off");
    })();
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.register("/sw-push.js");
      await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toBytes(publicKey),
      });
      if (!(await savePushSubscription(subscription.toJSON()))) throw new Error("No se guardó");
      setState("on");
      const delivered = await sendTestPush();
      toast("ok", delivered ? "Listo. Te enviamos una notificación de prueba." : "Notificaciones activadas.");
    } catch {
      toast("error", "No se pudieron activar las notificaciones en este dispositivo.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState("off");
      toast("ok", "Notificaciones desactivadas en este dispositivo.");
    } finally {
      setBusy(false);
    }
  }

  const Icon = state === "on" ? BellRing : state === "needs-install" ? Smartphone : BellOff;
  return (
    <section className="flex gap-3 rounded-3xl border border-line bg-paper p-4 shadow-card">
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-full ${
          state === "on" ? "bg-brand-soft text-brand" : "bg-cream text-muted"
        }`}
      >
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{COPY[state].title}</h2>
        <p className="mt-0.5 text-sm text-muted">{COPY[state].body}</p>
        {(state === "off" || state === "on") && (
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={state === "off" ? enable : disable}
            className={`btn mt-3 ${state === "off" ? "btn-primary" : "btn-secondary btn-sm"}`}
          >
            {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {state === "off" ? "Activar notificaciones" : "Desactivar en este dispositivo"}
          </button>
        )}
      </div>
    </section>
  );
}
