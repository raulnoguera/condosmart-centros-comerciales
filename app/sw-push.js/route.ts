// Service worker de la app: recibe las notificaciones push y abre la app al tocarlas.
//
// Se sirve desde una ruta de la app y no como archivo en /public porque algunos
// hostings de Node (LiteSpeed) no entregan archivos .js sueltos de la carpeta pública.
const SOURCE = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "CondoSmart", {
      body: data.body || "",
      icon: "/icons/192",
      badge: "/icons/96",
      data: { href: data.href || "/notificaciones" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = new URL(event.notification.data?.href || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => "focus" in w);
      if (open) return open.navigate(href).then((w) => (w || open).focus());
      return self.clients.openWindow(href);
    }),
  );
});
`;

export function GET() {
  return new Response(SOURCE, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      // El navegador debe poder detectar una versión nueva en cuanto se publique.
      "Cache-Control": "no-cache",
      "Service-Worker-Allowed": "/",
    },
  });
}
