import type { Metadata, Viewport } from "next";
// Fuentes servidas desde el propio proyecto: no dependen de Google Fonts al arrancar.
import { GeistSans } from "geist/font/sans";
import "@fontsource-variable/bricolage-grotesque";
import { UpdateWatcher } from "@/components/update-watcher";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: `${APP_NAME}: ${APP_TAGLINE.toLowerCase()}. Cobranza, accesos, reportes y comunicación con la administración.`,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "default" },
  icons: { apple: "/icons/180" },
};

export const viewport: Viewport = { themeColor: "#f1f5f9", viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${GeistSans.variable} h-full antialiased`}>
      <body className="bg-mesh min-h-full">
        {children}
        <UpdateWatcher />
      </body>
    </html>
  );
}
