import { getUser } from "@/lib/auth";
import { readPhoto } from "@/lib/uploads";

/** Fotos de los reportes: solo para quien tiene sesión. */
export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!(await getUser())) return new Response("No autorizado", { status: 401 });
  const photo = await readPhoto((await params).name);
  if (!photo) return new Response("No encontrada", { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
