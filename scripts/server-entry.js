// Punto de entrada en el hosting (se copia como app.js). El lanzador de Node de
// LiteSpeed carga este archivo y conecta el servidor HTTP por su cuenta.
const path = require("path");

// La base de datos y las fotos viven fuera de la carpeta del código para que
// una actualización no las borre.
process.env.DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", path.basename(__dirname) + "-data");
// Instalación de prueba: carga los locales y las cuentas de demostración si la base
// está vacía. Para el arranque real, quitar esta línea y definir ADMIN_EMAIL y
// ADMIN_PASSWORD (ver README).
process.env.SEED_DEMO = process.env.SEED_DEMO || "1";

// Datos que deja el script de despliegue: la dirección pública del sitio (con la
// que la app se identifica al enviar notificaciones push) y la nota de la versión.
try {
  const deploy = require("./deploy.json");
  if (deploy.origin) process.env.PUSH_SUBJECT = process.env.PUSH_SUBJECT || deploy.origin;
  if (deploy.note) process.env.RELEASE_NOTE = deploy.note;
} catch {}

// El lanzador del hosting descarta la salida de la app. Se guarda en un archivo
// junto a los datos para poder diagnosticar errores (se reinicia al pasar de 2 MB).
const fs = require("fs");
fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
const logFile = path.join(process.env.DATA_DIR, "app.log");
try {
  if (fs.statSync(logFile).size > 2 * 1024 * 1024) fs.renameSync(logFile, logFile + ".1");
} catch {}
const log = fs.createWriteStream(logFile, { flags: "a" });
for (const stream of [process.stdout, process.stderr]) {
  stream.write = (chunk, encoding, done) => log.write(chunk, encoding, done);
}
console.log(`--- arranque ${new Date().toISOString()} · node ${process.version}`);

require("./server.js");
