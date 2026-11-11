#!/usr/bin/env bash
# Pruebas de omk setup y omk plugin contra un doble del CLI de Orca (tests/fixtures/fake-orca.js).
# OMK_ORCA apunta siempre al doble: estas pruebas nunca hablan con la app Orca real.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Estas variables apuntan a la configuración real (Orca las inyecta); heredadas, el $HOME desechable no aísla nada.
unset CLAUDE_CONFIG_DIR CODEX_HOME GEMINI_DIR AGENT_KIT_HOME ORCA_CLAUDE_INJECTED_CONFIG_DIR OMK_PAUSE
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }

command -v node >/dev/null || { echo "  SKIPPED (sin node)"; exit 0; }

# Node en Windows no entiende rutas /c/...: las variables de entorno van en formato Windows.
wpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

W="$(mktemp -d "${TMPDIR:-/tmp}/omk-orca.XXXXXX")"; trap 'rm -rf "$W"' EXIT
STATE="$W/orca-state.json"
export OMK_ORCA FAKE_ORCA_STATE NO_COLOR=1
OMK_ORCA="$(wpath "$ROOT/tests/fixtures/fake-orca.js")"
FAKE_ORCA_STATE="$(wpath "$STATE")"
PLUGIN_DIR="$(wpath "$ROOT/orca-plugin")"
PV="$(sed -n 's/^  "version": "\(.*\)",$/\1/p' "$ROOT/orca-plugin/orca-plugin.json")"
KEY="local.multiagent-kit"
OUT="$W/out.txt"

omk()   { node "$ROOT/bin/omk.js" "$@" </dev/null >"$OUT" 2>&1; }
fresh() { rm -f "$STATE" "$STATE.calls"; touch "$STATE.calls"; if [ -n "${1:-}" ]; then printf '%s' "$1" > "$STATE"; fi; }
# Estado previo con el plugin ya instalado: $1 versión, $2 estado, $3 carpeta de origen
installed() { fresh "{\"plugins\":[{\"pluginKey\":\"$KEY\",\"version\":\"$1\",\"status\":\"$2\",\"source\":{\"kind\":\"local-path\",\"path\":$(node -p 'JSON.stringify(process.argv[1])' "$3")}}]}"; }
called() { grep -qF -- "$1" "$STATE.calls"; }
said()   { grep -qF -- "$1" "$OUT"; }
count()  { grep -cF -- "$1" "$STATE.calls" || true; }

echo "== omk plugin install"
fresh
check "sin --yes ni terminal no aprueba nada"        '! omk plugin install && ! called "plugin install $PLUGIN_DIR --approve" && said "Orca pide tu aprobación" && said "workspace:read" && said "--yes"'
check "enseña lo que concede antes de aprobar"       'said "Runs its own code"'
fresh
check "--yes aprueba con la huella de Orca"          'omk plugin install --yes && called "plugin install $PLUGIN_DIR --approve ap1-0123456789abcdef"'
check "enciende los plugins de Orca"                 'called "plugin system on"'
check "queda instalada la versión del kit"           'grep -q "\"version\": \"$PV\"" "$STATE"'
check "repetirlo no reinstala"                       'omk plugin install --yes && [ "$(count "plugin install")" -eq 2 ] && said "ya estaba instalado"'
check "omk plugin status"                            'omk plugin status && said "$KEY v$PV"'
check "omk plugin uninstall"                         'omk plugin uninstall && called "plugin uninstall $KEY" && grep -qF "\"plugins\": []" "$STATE"'
check "status sin plugin sale con error"             '! omk plugin status && said "No instalado"'
check "subcomando desconocido"                       '! omk plugin quita && said "subcomando desconocido"'

echo "== aprobación y estados del plugin"
fresh '{"fingerprint":"ap1-zz; rm -rf ~"}'
check "rechaza una huella con formato inesperado"     '! omk plugin install --yes && ! called "--approve" && said "sin una huella válida"'
fresh '{"pluginName":"Kit\u001b[2J\u001b]0;x\u0007"}'
check "quita los caracteres de control de lo que dice Orca" '! omk plugin install && said "Kit[2J" && ! grep -q "$(printf "\033")" "$OUT"'
fresh '{"failInstall":"se rompió\nlínea interna"}'
check "un error de Orca se cuenta en una línea"      '! omk plugin install --yes && said "action_failed: se rompió" && ! said "línea interna"'
installed 0.0.1 running "$PLUGIN_DIR"
check "otra versión desde esta carpeta: actualiza"   'omk plugin install --yes && called "plugin update $KEY" && ! called "plugin install"'
installed 0.0.1 running "$(wpath "$W/otra-carpeta")"
check "otra versión desde otra carpeta: no la toca"  'omk plugin install --yes && ! called "plugin update" && ! called "plugin install" && said "otra carpeta"'
installed "$PV" disabled "$PLUGIN_DIR"
check "desactivado por el usuario: se respeta"       'omk plugin install --yes && ! called "plugin enable" && said "desactivado"'
installed "$PV" pending "$PLUGIN_DIR"
check "pendiente de aprobación: lo aprueba"          'omk plugin install --yes && called "plugin enable $KEY --approve ap1-0123456789abcdef"'

echo "== Orca ausente o antigua"
fresh
check "Orca antigua: no instala y dice qué versión"  '! FAKE_ORCA_VERSION=1.4.100 omk plugin install --yes && said "necesita >=" && ! called "plugin install"'
check "OMK_ORCA que no existe: no busca otro Orca"   '! OMK_ORCA="$(wpath "$W/no-existe.js")" omk plugin status && said "no responde"'

echo "== omk setup"
H="$W/home"; mkdir -p "$H/.claude"
check "--no-plugin solo instala el kit"              'HOME="$H" omk setup --no-plugin --agents claude && [ -f "$H/.agents/AGENTS.md" ] && [ ! -s "$STATE.calls" ]'
H2="$W/home2"; mkdir -p "$H2/.claude"
fresh '{"reachable":false}'
check "--dry-run no escribe ni instala"              'HOME="$H2" omk setup --dry-run --agents claude && [ ! -e "$H2/.agents/AGENTS.md" ] && ! called "plugin install" && ! called "plugin system" && ! called "open" && said "Simulación"'
fresh '{"reachable":false}'
check "completo: kit, Orca abierto, plugin y panel"  'HOME="$H2" omk setup --yes --agents claude && [ -f "$H2/.agents/AGENTS.md" ] && called "open" && called "plugin system on" && called "plugin install $PLUGIN_DIR --approve" && called "plugin open $KEY --panel kit" && said "Entorno de Orca listo"'
fresh
check "sin aprobación, setup sale con error"         '! HOME="$H2" omk setup --agents claude && said "no se aprobó"'

printf '\n%s ok · %s fallos\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
