#!/usr/bin/env bash
# Instalación en una línea, sin Node:
#   curl -fsSL https://raw.githubusercontent.com/FernandoBaqueroo/orca-multiagent-kit/main/scripts/get.sh | bash
#   curl -fsSL …/get.sh | bash -s -- --dry-run          (los argumentos van a «omk setup»)
# Descarga el ejecutable de la última release para este sistema, comprueba su SHA-256 y hace «omk setup»:
# reglas y skills en ~/.agents, omk en el PATH y, si usas Orca, su plugin. Después, «omk update» lo
# actualiza todo. Donde no hay ejecutable publicado (o no arranca), baja el zip y ejecuta install.sh,
# que instala reglas y skills; lo demás necesita Node (npx orca-multiagent-kit setup).
#   OMK_NO_EXE=1   fuerza el zip.
set -Eeuo pipefail

REPO="FernandoBaqueroo/orca-multiagent-kit"
BASE="https://github.com/$REPO/releases/latest/download"
DEST="${OMK_HOME:-$HOME/.local/share/orca-multiagent-kit}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "omk: falta '$1'. Instálalo y vuelve a intentarlo." >&2; exit 1; }; }
need curl

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

# El ejecutable que la release publica para este sistema y arquitectura, o nada.
asset() {
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64)                            echo "omk-linux-x64" ;;
    Darwin-arm64)                            echo "omk-macos-arm64" ;;
    MINGW*-x86_64|MSYS*-x86_64|CYGWIN*-x86_64) echo "omk-windows-x64.exe" ;;
    *)                                       echo "" ;;
  esac
}
sha256_of() { if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1"; else shasum -a 256 "$1"; fi | cut -d' ' -f1; }

A="$(asset)"
if [ -n "$A" ] && [ -z "${OMK_NO_EXE:-}" ]; then
  echo "[omk] Descargando $A de la última versión de $REPO"
  if curl -fsSL "$BASE/$A" -o "$TMP/$A" && curl -fsSL "$BASE/$A.sha256" -o "$TMP/$A.sha256"; then
    WANT="$(cut -d' ' -f1 < "$TMP/$A.sha256")"
    [ -n "$WANT" ] && [ "$(sha256_of "$TMP/$A")" = "$WANT" ] || { echo "omk: $A no coincide con su SHA-256 publicado: no lo ejecuto." >&2; exit 1; }
    chmod +x "$TMP/$A"
    if "$TMP/$A" version >/dev/null 2>&1; then
      # Con «curl | bash» la entrada es la tubería: las preguntas de omk (aprobar el plugin) van al terminal.
      if [ ! -t 0 ] && (exec </dev/tty) 2>/dev/null; then exec </dev/tty; fi
      "$TMP/$A" setup "$@"
      exit $?
    fi
    echo "[omk] El ejecutable no arranca en este sistema: sigo con el zip."
  else
    echo "[omk] No pude descargar el ejecutable: sigo con el zip."
  fi
fi

need unzip
echo "[omk] Descargando el zip de la última versión de $REPO"
curl -fsSL "$BASE/orca-multiagent-kit.zip" -o "$TMP/kit.zip"
unzip -q "$TMP/kit.zip" -d "$TMP"
[ -f "$TMP/orca-multiagent-kit/install.sh" ] || { echo "omk: el zip no tiene el formato esperado" >&2; exit 1; }

rm -rf "$DEST.new"; mkdir -p "$(dirname "$DEST")"
mv "$TMP/orca-multiagent-kit" "$DEST.new"
rm -rf "$DEST"; mv "$DEST.new" "$DEST"
chmod +x "$DEST/install.sh"
echo "[omk] Kit v$(cat "$DEST/VERSION") en $DEST"

bash "$DEST/install.sh" "$@"
echo "[omk] Instaladas las reglas y las skills. Sin el ejecutable no hay comando omk ni plugin de Orca:"
echo "      con Node 18 o superior, «npx orca-multiagent-kit setup» lo deja todo; para actualizar, repite esta orden."
