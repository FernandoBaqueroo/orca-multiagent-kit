#!/usr/bin/env bash
# Pruebas del CLI omk tal como lo instala npm (npm pack + instalación en un prefijo desechable).
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Estas variables apuntan a la configuración real (Orca las inyecta); heredadas, el $HOME desechable no aísla nada.
unset CLAUDE_CONFIG_DIR CODEX_HOME GEMINI_DIR AGENT_KIT_HOME ORCA_CLAUDE_INJECTED_CONFIG_DIR
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

command -v node >/dev/null && command -v npm >/dev/null || { echo "  SKIPPED (sin node/npm)"; exit 0; }

# omk install mira si hay un plugin de Orca que poner al día: aquí habla con el doble, nunca con la app real.
wpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }
export OMK_ORCA FAKE_ORCA_STATE
OMK_ORCA="$(wpath "$ROOT/tests/fixtures/fake-orca.js")"

W="$(mktemp -d "${TMPDIR:-/tmp}/omk-cli.XXXXXX")"
(cd "$ROOT" && npm pack --silent --pack-destination "$W" >/dev/null)
TGZ="$(ls "$W"/orca-multiagent-kit-*.tgz)"
FAKE_ORCA_STATE="$(wpath "$W/orca-state.json")"
npm install --silent --prefix "$W/prefix" -g "$TGZ" >/dev/null 2>&1
# npm -g deja el binario en <prefix>/bin en Unix y en <prefix> en Windows
# shellcheck disable=SC2034  # se usa dentro de eval (check)
OMK="$W/prefix/bin/omk"; [ -e "$OMK" ] || OMK="$W/prefix/omk"

echo "== paquete npm"
# Listado en fichero: con pipefail, tar | grep -q puede fallar por SIGPIPE
tar -tzf "$TGZ" > "$W/files.txt"
check "el paquete incluye install.sh y skills" 'grep -q "package/install.sh" "$W/files.txt" && grep -q "package/skills/orca/SKILL.md" "$W/files.txt"'
check "el paquete no incluye tests ni .github"  '! grep -Eq "package/(tests|\.github)/" "$W/files.txt"'
check "binario omk instalado"                   '[ -x "$OMK" ]'

echo "== comandos"
H="$(mktemp -d)"; mkdir -p "$H/.claude" "$H/proj"
# En Windows, Node toma el $HOME de USERPROFILE (y en formato C:\...); en Unix, de HOME
# shellcheck disable=SC2034  # se usa dentro de eval (check)
if command -v cygpath >/dev/null 2>&1; then WH="$(cygpath -w "$H")"; else WH="$H"; fi
check "omk version = VERSION"                   '[ "$("$OMK" version)" = "$(cat "$ROOT/VERSION")" ]'
check "omk help"                                '"$OMK" help | grep -q "install"'
check "comando desconocido sale con error"      '! "$OMK" nada >/dev/null 2>&1'
check "omk install --dry-run no escribe"        'HOME="$H" "$OMK" install --dry-run >/dev/null 2>&1 && [ ! -e "$H/.agents/AGENTS.md" ]'
check "omk install"                             'HOME="$H" "$OMK" install >/dev/null 2>&1 && [ -f "$H/.agents/AGENTS.md" ]'
check "omk verify"                              'HOME="$H" "$OMK" verify >/dev/null 2>&1'
check "omk init <ruta>"                         'HOME="$H" "$OMK" init "$H/proj" >/dev/null 2>&1 && grep -qx "@AGENTS.md" "$H/proj/CLAUDE.md"'
check "omk backups lista la copia"              'HOME="$H" USERPROFILE="$WH" "$OMK" backups | grep -Eq "^[0-9]{8}-[0-9]{6}"'
check "omk where"                               'HOME="$H" USERPROFILE="$WH" "$OMK" where | grep -qF "$WH"'

printf '\n%s ok · %s fallos\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
