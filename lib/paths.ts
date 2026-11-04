import path from "node:path";

/**
 * Carpeta donde viven la base de datos y las fotos. En el servidor conviene
 * apuntarla (DATA_DIR) fuera de la carpeta del código, para que un nuevo
 * despliegue no la borre.
 */
export const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
export const DATABASE_FILE = process.env.DATABASE_PATH ?? path.join(DATA_DIR, "atrio.db");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
