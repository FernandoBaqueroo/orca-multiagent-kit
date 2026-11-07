#!/usr/bin/env bash
# Pruebas del CLI omk tal como lo instala npm (npm pack + instalación en un prefijo desechable).
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

command -v node >/dev/null && command -v npm >/dev/null || { echo "  SKIPPED (sin node/npm)"; exit 0; }

W="$(mktemp -d "${TMPDIR:-/tmp}/omk-cli.XXXXXX")"
(cd "$ROOT" && npm pack --silent --pack-destination "$W" >/dev/null)
TGZ="$(ls "$W"/orca-multiagent-kit-*.tgz)"
npm install --silent --prefix "$W/prefix" -g "$TGZ" >/dev/null 2>&1
# shellcheck disable=SC2034  # se usa dentro de eval (check)
OMK="$W/prefix/bin/omk"

echo "== paquete npm"
# Listado en fichero: con pipefail, tar | grep -q puede fallar por SIGPIPE
tar -tzf "$TGZ" > "$W/files.txt"
check "el paquete incluye install.sh y skills" 'grep -q "package/install.sh" "$W/files.txt" && grep -q "package/skills/maw-route/SKILL.md" "$W/files.txt"'
check "el paquete no incluye tests ni .github"  '! grep -Eq "package/(tests|\.github)/" "$W/files.txt"'
check "binario omk instalado"                   '[ -x "$OMK" ]'

echo "== comandos"
H="$(mktemp -d)"; mkdir -p "$H/.claude" "$H/proj"
check "omk version = VERSION"                   '[ "$("$OMK" version)" = "$(cat "$ROOT/VERSION")" ]'
check "omk help"                                '"$OMK" help | grep -q "install"'
check "comando desconocido sale con error"      '! "$OMK" nada >/dev/null 2>&1'
check "omk install --dry-run no escribe"        'HOME="$H" "$OMK" install --dry-run >/dev/null 2>&1 && [ ! -e "$H/.agents/AGENTS.md" ]'
check "omk install"                             'HOME="$H" "$OMK" install >/dev/null 2>&1 && [ -f "$H/.agents/AGENTS.md" ]'
check "omk verify"                              'HOME="$H" "$OMK" verify >/dev/null 2>&1'
check "omk init <ruta>"                         'HOME="$H" "$OMK" init "$H/proj" >/dev/null 2>&1 && grep -qx "@AGENTS.md" "$H/proj/CLAUDE.md"'
check "omk backups lista la copia"              'HOME="$H" "$OMK" backups | grep -Eq "^[0-9]{8}-[0-9]{6}"'
check "omk where"                               'HOME="$H" "$OMK" where | grep -q "$H/.agents"'

printf '\n%s ok · %s fallos\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
