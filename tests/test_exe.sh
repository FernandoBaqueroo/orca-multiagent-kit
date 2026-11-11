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
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

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
check "update explica cómo actualizar"           'run update --agents claude && said "ejecutable autónomo" && [ -f "$H/.agents/AGENTS.md" ]'

echo "== omk setup desde el ejecutable"
check "deja omk en OMK_BIN_DIR"                  'run setup --yes --no-path --agents claude && [ -x "$W/bin/$EXE_NAME" ] && said "omk copiado en"'
check "instala el plugin desde el kit extraído"  'grep -qF "plugin install $OMK_HOME" "$STATE.calls" && said "Entorno de Orca listo"'
check "con su carpeta ya en el PATH no lo toca" 'PATH="$W/bin:$PATH" run setup --yes --no-plugin --agents claude && said "ya está en el PATH"'
rm -rf "${W:?}/bin"; mkdir -p "$W/bin"; echo "otra herramienta" > "$W/bin/$EXE_NAME"
check "no pisa otro omk que no es el del kit"    '! run setup --yes --no-path --no-plugin --agents claude && said "no es el ejecutable del kit" && [ "$(cat "$W/bin/$EXE_NAME")" = "otra herramienta" ]'

printf '\n%s ok · %s fallos\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
