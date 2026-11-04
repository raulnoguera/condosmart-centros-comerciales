// Identificador de la versión publicada. La app abierta en un teléfono lo consulta
// para saber si hay una versión más nueva que la que tiene cargada.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_BUILD_ID ?? "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
