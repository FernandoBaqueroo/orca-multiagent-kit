#!/usr/bin/env bash
# Pruebas de la puerta de reparto (hooks/orca-gate.cjs): los casos de la decisión contra transcripts
# sintéticos (tests/fixtures/gate-cases.js) y su instalación en ~/.claude/settings.json con omk, en un
# $HOME desechable.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
unset CLAUDE_CONFIG_DIR CODEX_HOME GEMINI_DIR AGENT_KIT_HOME ORCA_CLAUDE_INJECTED_CONFIG_DIR OMK_PAUSE OMK_NO_GATE OMK_NO_HOOKS
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; if [ -s "${OUT:-}" ]; then sed "s/^/        │ /" "$OUT"; fi; fi; }

command -v node >/dev/null || { echo "  SKIPPED (sin node)"; exit 0; }
wpath() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

echo "== decisión (tests/fixtures/gate-cases.js)"
if node "$ROOT/tests/fixtures/gate-cases.js"; then CASES=0; else CASES=1; fi

W="$(mktemp -d "${TMPDIR:-/tmp}/omk-gate.XXXXXX")"; trap 'rm -rf "$W"' EXIT
H="$W/home"; mkdir -p "$H/.claude"
OUT="$W/out.txt"
export NO_COLOR=1 OMK_ORCA FAKE_ORCA_STATE
OMK_ORCA="$(wpath "$ROOT/tests/fixtures/fake-orca.js")"
FAKE_ORCA_STATE="$(wpath "$W/orca-state.json")"
omk() { HOME="$H" USERPROFILE="$(wpath "$H")" node "$ROOT/bin/omk.js" "$@" </dev/null >"$OUT" 2>&1; }
SET="$H/.claude/settings.json"
# shellcheck disable=SC2016  # el $ es de JavaScript
gate_cmd() { node -e 'const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const pre=(j.hooks.PreToolUse||[]).find((e)=>(e.hooks||[]).some((h)=>String(h.command).includes("orca-gate")));const up=(j.hooks.UserPromptSubmit||[]).flatMap((e)=>e.hooks||[]).filter((h)=>String(h.command).includes("orca-gate"));process.stdout.write(pre?pre.matcher+" · "+pre.hooks[0].command+" · "+up.length:"")' "$(wpath "$SET")"; }

echo "== instalación con omk"
check "omk install copia el script a ~/.agents/hooks"     'omk install --agents claude --no-plugin && [ -f "$H/.agents/hooks/orca-gate.cjs" ]'
check "y registra la puerta en la configuración global"   '[ -n "$(gate_cmd)" ] && gate_cmd | grep -q "^Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell|Agent|Task · node \".*/.agents/hooks/orca-gate.cjs\" \"\[Orca Multiagent Kit\]\" · 1$"'
cp "$SET" "$W/antes"
check "repetirlo no la duplica"                           'omk install --agents claude --no-plugin && cmp -s "$SET" "$W/antes"'
check "omk verify comprueba el script"                    'omk verify && grep -q "puerta de reparto" "$OUT"'
check "omk gate status dice que está encendida"           'omk gate status && grep -q "encendida" "$OUT" && grep -q "instalado en" "$OUT"'
check "omk gate off la apaga y on la enciende"            'omk gate off && [ -f "$H/.agents/state/gate/off" ] && ! omk gate status && grep -q "apagada" "$OUT" && omk gate on && [ ! -e "$H/.agents/state/gate/off" ]'
check "la orden registrada ejecuta el hook de verdad"     'HOME="$H" USERPROFILE="$(wpath "$H")" bash -c "$(gate_cmd | sed "s/^[^·]*· //; s/ · [0-9]*$//")" <<< "{\"hook_event_name\":\"UserPromptSubmit\",\"session_id\":\"s1\",\"prompt\":\"hola\"}" && [ -f "$H/.agents/state/gate/s1.json" ]'
mkdir -p "$W/proj/.claude"; printf '%s' '{"permissions":{"allow":["Read(**)"]}}' > "$W/proj/.claude/settings.json"
check "en el proyecto van solo los recordatorios, no la puerta" '(cd "$W/proj" && HOME="$H" USERPROFILE="$(wpath "$H")" node "$ROOT/bin/omk.js" init . --agents claude) </dev/null >"$OUT" 2>&1 && grep -q "Puerta de reparto" "$W/proj/.claude/settings.json" && ! grep -q "orca-gate" "$W/proj/.claude/settings.json" && grep -q "Read(\*\*)" "$W/proj/.claude/settings.json"'
check "--no-hooks no la registra"                         'rm -f "$SET" && omk install --agents claude --no-plugin --no-hooks && [ ! -e "$SET" ]'

printf '\n%s ok · %s fallos (más los de la decisión, arriba)\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] && [ "$CASES" -eq 0 ]
