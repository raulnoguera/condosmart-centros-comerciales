"use client";

import { useEffect, useRef } from "react";
import { markThreadRead } from "@/app/actions";

/** Al abrir el hilo (o llegar un mensaje nuevo) lo marca como leído y baja al final. */
export function ThreadWatcher({ unitId, lastId, unread }: { unitId: number; lastId: number; unread: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
    if (unread) void markThreadRead(unitId);
  }, [unitId, lastId, unread]);
  return <div ref={end} className="h-px scroll-mb-40" />;
}
