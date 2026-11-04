"use client";

import { useActionState, useEffect, useId, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { useToast } from "@/components/toaster";
import type { FormAction, FormState } from "@/lib/form";

/**
 * Formulario ligado a una acción del servidor. El éxito se avisa con un toast;
 * el error se muestra junto al formulario, o también en toast si es `compact`
 * (formularios de un solo botón dentro de una lista).
 */
export function ActionForm({
  action,
  children,
  className,
  compact,
  onSuccess,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  compact?: boolean;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  // El aviso se lanza aquí y no en un efecto: tras aprobar o borrar, la fila que
  // contiene el formulario desaparece y un efecto ya no llegaría a ejecutarse.
  const [state, formAction] = useActionState(async (prev: FormState, data: FormData) => {
    const result = await action(prev, data);
    if (result?.ok) {
      toast("ok", result.ok);
      onSuccess?.();
    } else if (result?.error && compact) {
      toast("error", result.error);
    }
    return result;
  }, null);

  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && !compact && (
        <p role="alert" className="basis-full rounded-lg bg-clay-soft px-3 py-2.5 text-sm font-medium text-clay">
          {state.error}
        </p>
      )}
    </form>
  );
}

function Spinner() {
  return <LoaderCircle className="size-4 animate-spin" aria-hidden />;
}

/**
 * Botón de envío. Con `confirm` abre primero un diálogo: úsalo en todo lo que
 * borra, cancela o rechaza.
 */
export function Submit({
  children,
  variant = "primary",
  small,
  name,
  value,
  confirm,
  confirmDetail,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  small?: boolean;
  name?: string;
  value?: string;
  confirm?: string;
  confirmDetail?: string;
}) {
  const { pending } = useFormStatus();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const className = `btn btn-${variant} ${small ? "btn-sm" : ""}`;

  useEffect(() => {
    if (!pending) dialog.current?.close();
  }, [pending]);

  if (!confirm) {
    return (
      <button type="submit" name={name} value={value} disabled={pending} aria-busy={pending} className={className}>
        {pending && <Spinner />}
        {children}
      </button>
    );
  }

  return (
    <>
      <button type="button" disabled={pending} className={className} onClick={() => dialog.current?.showModal()}>
        {children}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-3xl bg-paper p-6 text-left text-ink shadow-pop"
      >
        <p id={titleId} className="font-display text-xl font-bold">
          {confirm}
        </p>
        {confirmDetail && <p className="mt-1.5 text-sm font-normal text-muted">{confirmDetail}</p>}
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => dialog.current?.close()}>
            Volver
          </button>
          <button
            type="submit"
            name={name}
            value={value}
            disabled={pending}
            aria-busy={pending}
            className="btn btn-destructive"
          >
            {pending && <Spinner />}
            {children}
          </button>
        </div>
      </dialog>
    </>
  );
}
