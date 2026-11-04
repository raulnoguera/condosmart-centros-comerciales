"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * La única zona de la app que se desplaza. La página en sí queda quieta, del alto
 * de la pantalla, y las barras de arriba y de abajo viven fuera de esta zona: así
 * no dependen de `position: fixed`, que en el teléfono se suelta con facilidad
 * (barra del navegador que se esconde, página más ancha que la pantalla, rebote).
 */
export function Scroller({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Al cambiar de pantalla se vuelve arriba, salvo que el enlace apunte a una sección (#reportar).
  useEffect(() => {
    if (!window.location.hash) ref.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div ref={ref} className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${className}`}>
      {children}
    </div>
  );
}
