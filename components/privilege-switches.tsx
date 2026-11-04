"use client";

import { useOptimistic, useTransition } from "react";
import { setPrivilege } from "@/app/actions";
import { useToast } from "@/components/toaster";
import { PRIVILEGES, type Privilege } from "@/lib/privileges";

/** Interruptores de la administración para permitir o suspender cada función de un local. */
export function PrivilegeSwitches({ unitId, blocked }: { unitId: number; blocked: string[] }) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [current, setOptimistic] = useOptimistic(blocked);

  function toggle(privilege: Privilege, allow: boolean) {
    startTransition(async () => {
      setOptimistic(allow ? current.filter((p) => p !== privilege) : [...current, privilege]);
      const result = await setPrivilege(unitId, privilege, allow);
      if (result?.error) toast("error", result.error);
      else if (result?.ok) toast("ok", result.ok);
    });
  }

  return (
    <ul className="grid gap-1">
      {(Object.keys(PRIVILEGES) as Privilege[]).map((key) => {
        const { label, icon: Icon } = PRIVILEGES[key];
        const allowed = !current.includes(key);
        return (
          <li key={key}>
            <button
              type="button"
              role="switch"
              aria-checked={allowed}
              disabled={pending}
              onClick={() => toggle(key, !allowed)}
              className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-2 text-left text-sm transition-colors hover:bg-cream disabled:cursor-wait"
            >
              <Icon className={`size-5 shrink-0 ${allowed ? "text-brand" : "text-muted"}`} aria-hidden />
              <span className={`flex-1 ${allowed ? "" : "text-muted line-through"}`}>{label}</span>
              <span className={`text-xs font-semibold ${allowed ? "text-brand" : "text-clay"}`}>
                {allowed ? "Permitido" : "Suspendido"}
              </span>
              <span
                aria-hidden
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${allowed ? "bg-brand" : "bg-line"}`}
              >
                <span
                  className={`absolute top-0.5 size-5 rounded-full bg-white shadow-card transition-transform ${
                    allowed ? "translate-x-[1.375rem]" : "translate-x-0.5"
                  }`}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
