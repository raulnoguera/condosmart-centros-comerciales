import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Marca de cada compilación: queda grabada en la app que carga el teléfono y la
  // sirve /version, para detectar cuándo hay una versión más nueva publicada.
  env: { NEXT_PUBLIC_BUILD_ID: new Date().toISOString() },
  // `npm run build:server` genera un paquete autónomo (.next/standalone) para subir
  // al hosting sin instalar dependencias allí. La base y las fotos locales nunca
  // entran en ese paquete.
  output: process.env.BUILD_STANDALONE ? "standalone" : undefined,
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: { "*": ["./data/**", "./.env*"] },
  // En desarrollo Next solo atiende a `localhost`. Esto permite abrir la app desde un
  // teléfono en la misma red wifi (por IP o por el nombre .local del equipo) y a través
  // de un túnel HTTPS de prueba. No afecta al modo producción.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local", "*.trycloudflare.com"],
  experimental: {
    // Las alertas pueden llevar una foto. El teléfono la reduce antes de enviarla;
    // este margen cubre el caso en que no pueda hacerlo.
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
