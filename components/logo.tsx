import { EMBLEM_SRC } from "@/lib/emblem";

/** Emblema de CondoSmart: escudo con edificios y un check. Pensado para fondo claro. */
export function Logo({ className = "size-8" }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- es un SVG en línea, no hay nada que optimizar
  return <img src={EMBLEM_SRC} alt="" className={`object-contain ${className}`} />;
}

/** El nombre con sus dos colores, como en el logo: "Condo" en el color del texto y "Smart" en celeste. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      Condo<span className="text-[#2BB6E6]">Smart</span>
    </span>
  );
}
