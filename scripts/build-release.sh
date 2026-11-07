#!/usr/bin/env bash
# Empaqueta el kit para una release: dist/orca-multiagent-kit-vX.Y.Z.zip, una copia con nombre
# estable (orca-multiagent-kit.zip, para el enlace /releases/latest/download/) y SHA256SUMS.
#   scripts/build-release.sh            -> usa VERSION
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
V="$(tr -d '[:space:]' < VERSION)"
NAME="orca-multiagent-kit"
STAGE="$(mktemp -d)/$NAME"
rm -rf dist && mkdir -p dist "$STAGE"

# Lo que necesita quien descarga el kit (sin CI, tests ni herramientas de mantenimiento)
for p in README.md LICENSE CHANGELOG.md AI_INSTALL.md GUIA.html VERSION install.sh package.json bin core rules skills templates output-styles docs assets; do
  cp -R "$p" "$STAGE/"
done
chmod +x "$STAGE/install.sh"

(cd "$(dirname "$STAGE")" && zip -qr -X "$ROOT/dist/$NAME-v$V.zip" "$NAME")
cp "dist/$NAME-v$V.zip" "dist/$NAME.zip"
(cd dist && { command -v sha256sum >/dev/null && sha256sum ./*.zip || shasum -a 256 ./*.zip; } > SHA256SUMS)
ls -l dist
