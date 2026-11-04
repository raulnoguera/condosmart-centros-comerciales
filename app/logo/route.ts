import { getSettings } from "@/lib/data";
import { readPhoto } from "@/lib/uploads";

/**
 * El logo del centro comercial, que se carga en Administración. Es público: se
 * muestra en la pantalla de entrada, antes de iniciar sesión. Con ?marca=1
 * devuelve el emblema cuadrado, si lo hay, para los espacios pequeños.
 */
export async function GET(request: Request) {
  const { logo, logoMark } = getSettings();
  const mark = new URL(request.url).searchParams.has("marca");
  const name = (mark && logoMark) || logo;
  const image = name ? await readPhoto(name) : null;
  if (!image) return new Response("Sin logo", { status: 404 });
  return new Response(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.mime,
      // El nombre del archivo cambia con cada logo nuevo; la dirección no. Una hora basta.
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
