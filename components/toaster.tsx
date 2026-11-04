"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck } from "lucide-react";

type Toast = { id: number; kind: "ok" | "error"; text: string };
type Push = (kind: Toast["kind"], text: string) => void;

const ToastContext = createContext<Push>(() => {});
export const useToast = () => useContext(ToastContext);

const DISMISS_MS = 4500;

/** Avisos breves del resultado de una acción; se cierran solos y no roban el foco. */
export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const push = useCallback<Push>((kind, text) => {
    const id = ++nextId.current;
    setToasts((list) => [...list, { id, kind, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), DISMISS_MS);
  }, []);

  return (
    <ToastContext value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4 lg:inset-x-auto lg:right-6 lg:top-6 lg:items-end"
      >
        {toasts.map((t) => (
          <p
            key={t.id}
            className={`flex max-w-sm animate-toast items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-pop ${
              t.kind === "ok" ? "bg-brand-dark" : "bg-clay"
            }`}
          >
            {t.kind === "ok" ? (
              <CircleCheck className="size-5 shrink-0" aria-hidden />
            ) : (
              <CircleAlert className="size-5 shrink-0" aria-hidden />
            )}
            {t.text}
          </p>
        ))}
      </div>
    </ToastContext>
  );
}
