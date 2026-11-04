"use client";

import { useRef, useState } from "react";
import { Check, ImagePlus, Lock, Phone, X } from "lucide-react";
import { createAlert } from "@/app/actions";
import { ActionForm, Submit } from "@/components/action-form";
import { Field } from "@/components/ui";
import { ALERT_KINDS, type AlertKind } from "@/lib/alert-kinds";

const MAX_SIDE = 1280;

/** Reduce la foto en el teléfono antes de subirla: ahorra datos y tiempo de envío. */
async function shrink(file: File): Promise<File> {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  return blob ? new File([blob], "foto.jpg", { type: "image/jpeg" }) : file;
}

export function AlertForm({
  level,
  aisle,
}: {
  /** Nivel y pasillo de quien avisa; sin ellos lo que se difunde va a todo el centro comercial. */
  level?: string | null;
  aisle?: string | null;
}) {
  const [kind, setKind] = useState<AlertKind | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const selected = kind ? ALERT_KINDS[kind] : null;

  async function onPhoto(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return setPreview(null);
    try {
      const small = await shrink(file);
      const transfer = new DataTransfer();
      transfer.items.add(small);
      input.files = transfer.files;
      setPreview(URL.createObjectURL(small));
    } catch {
      // Si el navegador no puede reducirla, se envía la original.
      setPreview(URL.createObjectURL(file));
    }
  }

  function removePhoto() {
    if (fileInput.current) fileInput.current.value = "";
    setPreview(null);
  }

  return (
    <ActionForm action={createAlert} className="grid gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">¿De qué se trata?</legend>
        <div className="grid grid-cols-2 gap-2">
          {(Object.keys(ALERT_KINDS) as AlertKind[]).map((key) => {
            const k = ALERT_KINDS[key];
            const checked = kind === key;
            return (
              <label
                key={key}
                className={`relative flex min-h-20 cursor-pointer flex-col justify-between gap-2 rounded-3xl border p-3 text-sm font-semibold transition-colors has-focus-visible:ring-2 has-focus-visible:ring-brand/40 ${
                  key === "aviso" ? "col-span-2" : ""
                } ${
                  checked
                    ? k.urgent
                      ? "border-clay bg-clay-soft text-clay"
                      : "border-brand bg-brand-soft text-brand-dark"
                    : "border-line bg-paper text-ink shadow-card"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={key}
                  required
                  checked={checked}
                  onChange={() => setKind(key)}
                  className="sr-only"
                />
                <k.icon className={`size-6 ${k.urgent ? "text-clay" : "text-brand"}`} aria-hidden />
                {k.label}
                {checked && <Check className="absolute right-3 top-3 size-5" aria-hidden />}
              </label>
            );
          })}
        </div>
        <p aria-live="polite" className="mt-2 min-h-5 text-sm text-muted">
          {selected?.hint}
        </p>
      </fieldset>

      {selected?.urgent && (
        <p className="flex items-start gap-2.5 rounded-xl bg-clay-soft p-3 text-sm font-medium text-clay">
          <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
          Si hay peligro en este momento, llama primero al 911 y avisa a seguridad. Luego envía el reporte.
        </p>
      )}

      {selected && !selected.broadcast && (
        <p className="flex items-start gap-2.5 rounded-xl bg-sky-soft p-3 text-sm text-sky">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          Este reporte lo ven solo la administración y la seguridad. Te avisaremos cuando lo estén atendiendo y cuando
          quede resuelto.
        </p>
      )}

      {level && selected?.broadcast && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">¿A quién le avisas?</legend>
          <div className="grid gap-2">
            {[
              { value: "", label: "Todo el centro comercial", detail: "Todos los locales" },
              { value: "nivel", label: `Mi nivel`, detail: `Solo los locales del Nivel ${level}` },
              ...(aisle
                ? [{ value: "pasillo", label: "Mi pasillo", detail: `Solo Nivel ${level}, Pasillo ${aisle}` }]
                : []),
            ].map((option) => (
              <label
                key={option.value}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-line bg-paper px-4 py-2 text-sm transition-colors has-checked:border-brand has-checked:bg-brand-soft has-focus-visible:ring-2 has-focus-visible:ring-brand/40"
              >
                <input
                  type="radio"
                  name="scope"
                  value={option.value}
                  defaultChecked={option.value === ""}
                  className="size-5 accent-brand"
                />
                <span>
                  <span className="block font-semibold">{option.label}</span>
                  <span className="block text-xs text-muted">{option.detail}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">La administración y la seguridad lo reciben siempre.</p>
        </fieldset>
      )}

      <Field label="¿Qué está pasando?" hint="Una frase corta: es lo primero que se lee.">
        <input name="title" required maxLength={80} placeholder={selected?.placeholder} className="input" />
      </Field>

      <Field label="Detalles" optional>
        <textarea
          name="body"
          rows={3}
          maxLength={600}
          placeholder="Dónde exactamente, desde cuándo, a quién llamar…"
          className="input"
        />
      </Field>

      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">
          Foto<span className="font-normal text-muted"> · opcional</span>
        </p>
        <input
          ref={fileInput}
          id="alert-photo"
          type="file"
          name="photo"
          accept="image/*"
          onChange={(e) => onPhoto(e.currentTarget)}
          className="peer sr-only"
        />
        {preview ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- vista previa local */}
            <img src={preview} alt="Foto elegida" className="max-h-64 w-full rounded-xl object-cover" />
            <button
              type="button"
              onClick={removePhoto}
              aria-label="Quitar la foto"
              className="absolute right-2 top-2 grid size-11 cursor-pointer place-items-center rounded-full bg-ink/70 text-white"
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>
        ) : (
          <label
            htmlFor="alert-photo"
            className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-paper text-sm font-medium text-muted transition-colors hover:border-brand hover:text-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40"
          >
            <ImagePlus className="size-6" aria-hidden />
            Tomar o elegir una foto
          </label>
        )}
      </div>

      <div className="grid gap-2">
        <Submit>Enviar reporte</Submit>
        <p className="text-center text-xs text-muted">
          Se envía con el nombre y la ubicación de tu local.
        </p>
      </div>
    </ActionForm>
  );
}
