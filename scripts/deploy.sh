#!/bin/sh
# Publica la app en el hosting: construye el paquete autónomo, lo sube por SSH y
# lo activa sin tocar la carpeta de datos (base y fotos).
#
# Lee la conexión de .env.deploy (no se sube al repositorio):
#   DEPLOY_SSH="usuario@servidor"   DEPLOY_PORT=22   DEPLOY_KEY="$HOME/.ssh/llave"
#   DEPLOY_DIR="apps/atrio"   (relativa a la carpeta personal del servidor)
#   DEPLOY_URL="https://midominio.com"   (dirección pública del sitio)
#
# Uso:  ./scripts/deploy.sh ["Qué cambió en esta versión"]
# Al arrancar la versión nueva, todos los usuarios reciben una notificación con esa nota.
set -eu
cd "$(dirname "$0")/.."
. ./.env.deploy

PKG="$(mktemp -d)"
trap 'rm -rf "$PKG"' EXIT

BUILD_STANDALONE=1 npx next build
cp -R .next/standalone/. "$PKG/"
mkdir -p "$PKG/.next/static"
cp -R .next/static/. "$PKG/.next/static/"
[ -d public ] && cp -R public/. "$PKG/public/"
# Fuera lo que el rastreo de dependencias arrastra y no hace falta para ejecutar.
( cd "$PKG" && rm -rf app components lib scripts data .git .claude .env* *.md \
    tsconfig.json tsconfig.tsbuildinfo postcss.config.mjs next.config.ts package-lock.json )
cp scripts/server-entry.js "$PKG/app.js"
node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ origin: process.argv[2], note: process.argv[3] || "" }))' \
  "$PKG/deploy.json" "${DEPLOY_URL:-}" "${1:-}"

# accept-new: confía en el servidor la primera vez y exige la misma identidad después.
ssh_run() {
  ssh -p "$DEPLOY_PORT" -i "$DEPLOY_KEY" -o IdentitiesOnly=yes -o BatchMode=yes \
    -o StrictHostKeyChecking=accept-new "$DEPLOY_SSH" "$@"
}

# COPYFILE_DISABLE evita que macOS meta archivos "._*" en el paquete.
COPYFILE_DISABLE=1 tar --no-xattrs -czf - -C "$PKG" . | ssh_run "
  set -e
  rm -rf '$DEPLOY_DIR.nuevo' && mkdir -p '$DEPLOY_DIR.nuevo' '$DEPLOY_DIR-data'
  tar -xzf - -C '$DEPLOY_DIR.nuevo'
  chmod 700 '$DEPLOY_DIR-data'
  # Procesos de la versión que está corriendo: los que trabajan dentro de la carpeta de la app.
  VIEJOS=\$(for p in \$(pgrep -u \"\$USER\"); do
    case \"\$(readlink /proc/\$p/cwd 2>/dev/null)\" in \"\$HOME/$DEPLOY_DIR\"*) echo \$p ;; esac
  done)
  rm -rf '$DEPLOY_DIR.anterior'
  [ -d '$DEPLOY_DIR' ] && mv '$DEPLOY_DIR' '$DEPLOY_DIR.anterior'
  mv '$DEPLOY_DIR.nuevo' '$DEPLOY_DIR'
  # Al detenerlos, el lanzador arranca la versión nueva en la siguiente visita.
  [ -n \"\$VIEJOS\" ] && kill \$VIEJOS || true
  echo 'Publicado. La versión anterior queda en $DEPLOY_DIR.anterior'
"
