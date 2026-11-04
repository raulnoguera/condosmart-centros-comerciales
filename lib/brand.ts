// Nombre del producto. El centro comercial que lo usa (p. ej. "Paseo Alameda") no
// va aquí: se configura en Administración y es lo que se muestra en el encabezado.
export const APP_NAME = "CondoSmart";
export const APP_TAGLINE = "Tu centro comercial inteligente";

/**
 * Instalación de demostración: datos ficticios cargados para mostrar la app. Se
 * avisa en la pantalla de entrada y en los PDF, para que nadie los tome por reales.
 */
export const IS_DEMO = process.env.NODE_ENV !== "production" || process.env.SEED_DEMO === "1";
