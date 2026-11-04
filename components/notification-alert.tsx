"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, X } from "lucide-react";
import type { LatestNotification } from "@/lib/data";

const SHOW_MS = 15_000;

// El navegador solo deja sonar audio después de que la persona tocó la página,
// así que el sonido se prepara con su primer toque o tecla.
let audio: AudioContext | null = null;
function unlockAudio() {
  if (audio) return;
  try {
    audio = new AudioContext();
  } catch {
    audio = null;
  }
}

/** Dos notas cortas y ascendentes, generadas en el momento (sin archivo de sonido). */
function chime() {
  if (!audio) return;
  void audio.resume();
  const start = audio.currentTime + 0.02;
  [880, 1318.5].forEach((freq, i) => {
    const osc = audio!.createOscillator();
    const gain = audio!.createGain();
    const t = start + i * 0.16;
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(audio!.destination);
    osc.start(t);
    osc.stop(t + 0.5);
  });
}

/**
 * Anuncia en pantalla, con un sonido, una notificación que llega mientras la app
 * está abierta. Las que ya estaban al entrar no se anuncian: solo las nuevas que
 * trae el refresco periódico de la página.
 */
export function NotificationAlert({ latest }: { latest: LatestNotification | null }) {
  const seen = useRef(latest?.id ?? 0);
  const [shown, setShown] = useState<LatestNotification | null>(null);

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    if (!latest || latest.id <= seen.current) return;
    seen.current = latest.id;
    setShown(latest);
    chime();
    navigator.vibrate?.(200);
    const timer = setTimeout(() => setShown(null), SHOW_MS);
    return () => clearTimeout(timer);
  }, [latest]);

  if (!shown) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-[calc(0.75rem+env(safe-area-inset-top))] z-50 flex justify-center px-4 lg:inset-x-auto lg:right-6 lg:top-6"
    >
      <div className="flex w-full max-w-sm animate-toast items-start gap-3 rounded-2xl bg-paper p-4 shadow-pop ring-1 ring-line">
        <span className="tile-icon grid size-10 shrink-0 place-items-center rounded-xl">
          <Bell className="size-5" aria-hidden />
        </span>
        <Link href={shown.href} onClick={() => setShown(null)} className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{shown.title}</span>
          <span className="mt-0.5 line-clamp-3 block text-sm text-muted">{shown.body}</span>
        </Link>
        <button
          type="button"
          onClick={() => setShown(null)}
          aria-label="Cerrar aviso"
          className="-m-1.5 grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-muted hover:text-ink"
        >
          <X className="size-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
