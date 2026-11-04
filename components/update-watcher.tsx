"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/components/toaster";
import { APP_NAME } from "@/lib/brand";

const LOADED = process.env.NEXT_PUBLIC_BUILD_ID ?? "";
const CHECK_EVERY_MS = 5 * 60 * 1000;
const RELOADED_FOR = "atrio-reloaded-for";

async function publishedBuild(): Promise<string | null> {
  try {
    const res = await fetch("/version", { cache: "no-store" });
    return res.ok ? ((await res.json()) as { build?: string }).build || null : null;
  } catch {
    return null;
  }
}

/**
 * Una app instalada en el teléfono no tiene botón de recargar y puede quedarse
 * abierta días. Este componente detecta que se publicó una versión nueva:
 * al volver a la app la recarga solo; si la persona la está usando, le ofrece
 * un botón para no interrumpirla.
 */
export function UpdateWatcher() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!LOADED) return;
    const check = async (returning: boolean) => {
      const published = await publishedBuild();
      if (!published || published === LOADED) return;
      // Una sola recarga automática por versión, para no entrar en un bucle si
      // algo entre el servidor y el teléfono sigue entregando la versión vieja.
      if (returning && sessionStorage.getItem(RELOADED_FOR) !== published) {
        sessionStorage.setItem(RELOADED_FOR, published);
        location.reload();
        return;
      }
      setAvailable(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void check(true);
    };
    void check(false);
    const timer = setInterval(() => void check(false), CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!available) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 flex justify-center px-4"
    >
      <button
        type="button"
        onClick={() => location.reload()}
        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white shadow-pop"
      >
        <RefreshCw className="size-4" aria-hidden />
        Hay una versión nueva · Actualizar
      </button>
    </div>
  );
}

/**
 * Comprobación manual desde el menú. Muestra la versión que tiene cargada el
 * teléfono y, al tocarlo, dice si ya es la última o recarga para traer la nueva.
 */
export function UpdateButton({ className }: { className?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState("");

  // Se formatea en el teléfono: es la versión que este dispositivo tiene cargada.
  useEffect(() => {
    const date = new Date(LOADED);
    if (!Number.isNaN(date.getTime())) {
      setVersion(
        date.toLocaleString("es-VE", { timeZone: "America/Caracas", dateStyle: "medium", timeStyle: "short" }),
      );
    }
  }, []);

  async function check() {
    setBusy(true);
    const published = await publishedBuild();
    if (published && published !== LOADED) {
      location.reload();
      return;
    }
    setBusy(false);
    toast(
      published ? "ok" : "error",
      published ? "Ya tienes la versión más reciente." : "No se pudo consultar. Revisa tu conexión.",
    );
  }

  return (
    <div className="text-center">
      <button type="button" onClick={check} disabled={busy} aria-busy={busy} className={className}>
        {busy ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <RefreshCw className="size-4" aria-hidden />
        )}
        Buscar actualización
      </button>
      <p className="mt-2 text-xs text-muted">
        <strong className="text-ink">{APP_NAME}</strong>
        {version && ` · Versión instalada: ${version}`}
      </p>
    </div>
  );
}
