import { ImageResponse } from "next/og";
import { EMBLEM_RATIO, EMBLEM_SRC } from "@/lib/emblem";

const SIZES = [96, 180, 192, 512];

/** Ícono de la app en PNG: el emblema de CondoSmart sobre fondo blanco. */
export async function GET(_: Request, { params }: { params: Promise<{ size: string }> }) {
  const size = Number((await params).size);
  if (!SIZES.includes(size)) return new Response("Not found", { status: 404 });
  const height = Math.round(size * 0.84);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse no usa next/image */}
        <img src={EMBLEM_SRC} alt="" width={Math.round(height * EMBLEM_RATIO)} height={height} />
      </div>
    ),
    { width: size, height: size },
  );
}
