#!/usr/bin/env bash
# Instalación en una línea, sin Node:
#   curl -fsSL https://raw.githubusercontent.com/FernandoBaqueroo/orca-multiagent-kit/main/scripts/get.sh | bash
#   curl -fsSL …/get.sh | bash -s -- --dry-run          (los argumentos van a install.sh)
# Descarga la última release, la deja en ~/.local/share/orca-multiagent-kit y ejecuta install.sh.
set -Eeuo pipefail

REPO="FernandoBaqueroo/orca-multiagent-kit"
URL="https://github.com/$REPO/releases/latest/download/orca-multiagent-kit.zip"
DEST="${OMK_HOME:-$HOME/.local/share/orca-multiagent-kit}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "omk: falta '$1'. Instálalo y vuelve a intentarlo." >&2; exit 1; }; }
need curl; need unzip

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo "[omk] Descargando la última versión de $REPO"
curl -fsSL "$URL" -o "$TMP/kit.zip"
unzip -q "$TMP/kit.zip" -d "$TMP"
[ -f "$TMP/orca-multiagent-kit/install.sh" ] || { echo "omk: el zip no tiene el formato esperado" >&2; exit 1; }

rm -rf "$DEST.new"; mkdir -p "$(dirname "$DEST")"
mv "$TMP/orca-multiagent-kit" "$DEST.new"
rm -rf "$DEST"; mv "$DEST.new" "$DEST"
chmod +x "$DEST/install.sh"
echo "[omk] Kit v$(cat "$DEST/VERSION") en $DEST"

bash "$DEST/install.sh" "$@"
