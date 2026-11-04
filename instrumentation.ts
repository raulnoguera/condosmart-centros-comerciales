// Se ejecuta una vez cada vez que arranca el servidor.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { announceNewVersion } = await import("./lib/release");
  try {
    await announceNewVersion();
  } catch (error) {
    // Un fallo al avisar nunca debe impedir que la app arranque.
    console.error("No se pudo avisar de la versión nueva:", error);
  }
}
