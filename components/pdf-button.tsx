"use client";

import { useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";
import { useToast } from "@/components/toaster";

/**
 * Botón que entrega un PDF sin sacar a la persona de la app. En el teléfono abre
 * la hoja de compartir del sistema (guardar, imprimir, WhatsApp); en el
 * computador lo descarga. Nunca navega al PDF: en la app instalada no hay botón
 * de "atrás" y la persona quedaría atrapada en el documento.
 */
export function PdfButton({
  href,
  filename,
  className,
  children,
}: {
  href: string;
  filename: string;
  className?: string;
  children: ReactNode;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // PDF ya generado, a la espera de un segundo toque (ver `blocked` más abajo).
  const [ready, setReady] = useState<File | null>(null);

  /** Comparte el archivo; "blocked" si el navegador exige un toque nuevo. */
  async function share(file: File): Promise<"done" | "blocked" | "unsupported"> {
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (!touch || !navigator.canShare?.({ files: [file] })) return "unsupported";
    try {
      await navigator.share({ files: [file], title: file.name });
      return "done";
    } catch (error) {
      const name = (error as DOMException).name;
      if (name === "AbortError") return "done"; // La persona cerró la hoja de compartir.
      return name === "NotAllowedError" ? "blocked" : "unsupported";
    }
  }

  function download(file: File) {
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function onClick() {
    if (busy) return;
    if (ready) {
      setReady(null);
      if ((await share(ready)) !== "done") download(ready);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error(String(response.status));
      const file = new File([await response.blob()], filename, { type: "application/pdf" });
      const result = await share(file);
      if (result === "unsupported") download(file);
      // Algunos teléfonos solo dejan compartir justo después de un toque: el PDF
      // tardó en generarse y hay que pedir uno más.
      if (result === "blocked") {
        setReady(file);
        toast("ok", "El PDF está listo. Toca otra vez para guardarlo o compartirlo.");
      }
    } catch {
      toast("error", "No se pudo generar el PDF. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={onClick} aria-busy={busy} className={`cursor-pointer text-left ${className ?? ""}`}>
      {busy && <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}
