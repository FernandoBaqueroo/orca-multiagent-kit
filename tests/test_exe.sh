#!/usr/bin/env bash
# Pruebas del ejecutable autónomo (scripts/build-exe.js). Usa OMK_EXE si se da; si no, el de dist/
# para este sistema, y lo construye si falta. Todo va a carpetas desechables y a un doble de Orca.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Estas variables apuntan a la configuración real (Orca las inyecta); heredadas, el $HOME desechable no aísla nada.
unset CLAUDE_CONFIG_DIR CODEX_HOME GEMINI_DIR AGENT_KIT_HOME ORCA_CLAUDE_INJECTED_CONFIG_DIR OMK_PAUSE OMK_HOME OMK_BIN_DIR
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; }
# Si falla, enseña lo que dijo omk: en CI es la única pista.
check(){ if eval "$2"; then ok "$1"; else bad "$1"; if [ -s "${OUT:-}" ]; then sed "s/^/        │ /" "$OUT"; fi; fi; }

command -v node >/dev/null || { echo "  SKIPPED (sin node)"; exit 0; }
wpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

if [ -z "${OMK_EXE:-}" ]; then
  OMK_EXE="$(node -p '`dist/omk-${{win32:"windows",darwin:"macos",linux:"linux"}[process.platform]}-${process.arch}${process.platform==="win32"?".exe":""}`')"
  OMK_EXE="$ROOT/$OMK_EXE"
  [ -x "$OMK_EXE" ] || node "$ROOT/scripts/build-exe.js"
fi
[ -x "$OMK_EXE" ] || { echo "  FAIL  no hay ejecutable en $OMK_EXE"; exit 1; }
EXE_NAME="omk"; case "$OMK_EXE" in *.exe) EXE_NAME="omk.exe" ;; esac

W="$(mktemp -d "${TMPDIR:-/tmp}/omk-exe.XXXXXX")"; trap 'rm -rf "$W"' EXIT
H="$W/home"; mkdir -p "$H/.claude"
STATE="$W/orca-state.json"; : > "$STATE.calls"
export NO_COLOR=1 OMK_HOME OMK_BIN_DIR OMK_ORCA FAKE_ORCA_STATE
OMK_HOME="$(wpath "$W/kit")"
OMK_BIN_DIR="$(wpath "$W/bin")"
OMK_ORCA="$(wpath "$ROOT/tests/fixtures/fake-orca.js")"
FAKE_ORCA_STATE="$(wpath "$STATE")"
OUT="$W/out.txt"
# En Windows, Node toma el $HOME de USERPROFILE
WH="$(wpath "$H")"
run()  { HOME="$H" USERPROFILE="$WH" "$OMK_EXE" "$@" </dev/null >"$OUT" 2>&1; }
said() { grep -qF -- "$1" "$OUT"; }
stamp_time() { node -p 'require("fs").statSync(process.argv[1]).mtimeMs' "$(wpath "$W/kit/.omk-build")"; }

echo "== arranque y kit embebido"
check "version = VERSION"                        'run version && [ "$(cat "$OUT")" = "$(cat "$ROOT/VERSION")" ]'
check "extrae el kit con su sello"               '[ -f "$W/kit/install.sh" ] && [ -f "$W/kit/orca-plugin/orca-plugin.json" ] && [ -s "$W/kit/.omk-build" ]'
check "no deja carpetas temporales"              '[ ! -e "$W/kit.new" ] && [ ! -e "$W/kit.old" ]'
# shellcheck disable=SC2034  # se usa dentro de eval (check)
T1="$(stamp_time)"
check "la segunda vez no vuelve a extraer"       'run help && [ "$(stamp_time)" = "$T1" ]'
mkdir -p "$W/ajena"; echo "mío" > "$W/ajena/notas.txt"
check "no pisa una carpeta que no es del kit"    '! OMK_HOME="$(wpath "$W/ajena")" run version && said "no es una copia del kit" && [ "$(cat "$W/ajena/notas.txt")" = "mío" ]'

echo "== comandos del kit"
check "install --dry-run no escribe"             'run install --dry-run --agents claude && [ ! -e "$H/.agents/AGENTS.md" ]'
# Sin --offline descargaría el ejecutable de la última release de GitHub: eso se prueba en tests/test_update.sh contra un servidor local.
check "update --offline reaplica esta versión"   'run update --offline --agents claude && said "Kit al día" && [ -f "$H/.agents/AGENTS.md" ]'

echo "== omk setup desde el ejecutable"
check "deja omk en OMK_BIN_DIR"                  'run setup --yes --no-path --agents claude && [ -x "$W/bin/$EXE_NAME" ] && said "omk copiado en"'
# Node carga omk desde la ruta real del kit (en macOS /var es un enlace a /private/var): esa es la que llega a Orca.
# shellcheck disable=SC2034  # se usa dentro de eval (check)
KIT_REAL="$(node -p 'require("fs").realpathSync(process.argv[1])' "$OMK_HOME")"
check "instala el plugin desde el kit extraído"  'grep -qF "plugin install $KIT_REAL" "$STATE.calls" && said "Entorno de Orca listo"'
check "con su carpeta ya en el PATH no lo toca" 'PATH="$W/bin:$PATH" run setup --yes --no-plugin --agents claude && said "ya está en el PATH"'
rm -rf "${W:?}/bin"; mkdir -p "$W/bin"; echo "otra herramienta" > "$W/bin/$EXE_NAME"
check "no pisa otro omk que no es el del kit"    '! run setup --yes --no-path --no-plugin --agents claude && said "no es el ejecutable del kit" && [ "$(cat "$W/bin/$EXE_NAME")" = "otra herramienta" ]'

echo "== omk update desde el ejecutable: se descarga y se sustituye a sí mismo"
# Una «release» v99.0.0 servida en esta máquina cuyo ejecutable es este mismo: lo que se prueba es que el que
# está en marcha se descarga, se comprueba, se sustituye (en Windows, renombrándose) y sigue el nuevo.
mkdir -p "$W/self"; cp "$OMK_EXE" "$W/self/$EXE_NAME"
# shellcheck disable=SC2016  # el $ es de JavaScript
node -e '
const fs = require("node:fs");
const [exe, portFile, mode] = process.argv.slice(1);
const body = fs.readFileSync(exe);
const sum = require("node:crypto").createHash("sha256").update(mode === "bad" ? "otro" : body).digest("hex");
require("node:http").createServer((req, res) => {
  if (req.url === "/releases/latest") { res.writeHead(302, { location: "/releases/tag/v99.0.0" }); res.end(); }
  else if (/^\/releases\/download\/v99\.0\.0\/omk-[\w.-]+\.sha256$/.test(req.url)) res.end(sum + "  omk\n");
  else if (/^\/releases\/download\/v99\.0\.0\/omk-[\w.-]+$/.test(req.url)) res.end(body);
  else { res.writeHead(404); res.end(); }
}).listen(0, "127.0.0.1", function () { fs.writeFileSync(portFile, String(this.address().port)); });
' "$(wpath "$OMK_EXE")" "$(wpath "$W/port")" "${RELEASE_MODE:-}" &
SERVER=$!; trap 'kill "$SERVER" 2>/dev/null || true; rm -rf "$W"' EXIT
for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do [ -s "$W/port" ] && break; sleep 0.5; done
self() { HOME="$H" USERPROFILE="$WH" OMK_RELEASE_BASE="http://127.0.0.1:$(cat "$W/port")" "$W/self/$EXE_NAME" "$@" </dev/null >"$OUT" 2>&1; }
check "descarga la versión nueva, la comprueba y sigue con ella" 'self update --agents claude --no-plugin --no-project --no-hooks && said "Actualizando" && said "99.0.0" && said "Sigue el ejecutable nuevo" && said "Kit al día"'
check "el ejecutable sigue funcionando y no deja restos a medias" '[ "$("$W/self/$EXE_NAME" version)" = "$(cat "$ROOT/VERSION")" ] && [ ! -e "$W/self/$EXE_NAME.new" ]'
check "--offline no descarga nada"                    'self update --offline --agents claude --no-plugin --no-project --no-hooks && ! said "Actualizando" && said "Kit al día"'

printf '\n%s ok · %s fallos\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
