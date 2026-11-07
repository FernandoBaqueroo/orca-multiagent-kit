#!/usr/bin/env bash
# Valida la extensión de spec-kit con el CLI real: init de un proyecto, 'specify extension add --dev' y hook registrado.
#   SPECIFY=/ruta/a/specify tests/test_speckit.sh     (por defecto, 'specify' del PATH)
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SPECIFY="${SPECIFY:-specify}"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }
body() { awk 'n>=2{print} /^---$/{n++}' "$1"; }   # contenido tras el frontmatter

# El comando de la extensión y la skill global son el mismo texto: si divergen, cada agente haría una cosa.
echo "== comando de la extensión = skill speckit-orca-implement"
check "mismo cuerpo en commands/implement.md y en la skill" \
  '[ "$(body "$ROOT/speckit-extension/orca/commands/implement.md")" = "$(body "$ROOT/skills/speckit-orca-implement/SKILL.md")" ]'

if ! command -v "$SPECIFY" >/dev/null 2>&1; then
  echo "  SKIPPED (sin CLI specify)"
  printf '\n%s ok · %s fallos\n' "$PASS" "$FAIL"
  [ "$FAIL" -eq 0 ]; exit
fi

P="$(mktemp -d "${TMPDIR:-/tmp}/omk-speckit.XXXXXX")"
cd "$P" && git init -q
"$SPECIFY" init --here --integration claude --script sh --ignore-agent-tools --force >/dev/null 2>&1
echo "== spec-kit $("$SPECIFY" --version 2>/dev/null | tail -1)"
check "proyecto spec-kit creado"                  '[ -d .specify ] && [ -d .claude/skills/speckit-implement ]'
check "speckit-implement procesa before_implement" 'grep -q "hooks.before_implement" .claude/skills/speckit-implement/SKILL.md'
"$SPECIFY" extension add --dev "$ROOT/speckit-extension/orca" >/dev/null 2>&1
check "extensión orca instalada"                  'grep -q "^- orca" .specify/extensions.yml'
check "hook before_implement obligatorio"         'grep -q "command: speckit.orca.implement" .specify/extensions.yml && grep -q "optional: false" .specify/extensions.yml'
check "skill del comando generada"                '[ -f .claude/skills/speckit-orca-implement/SKILL.md ]'
check "el comando delega en la skill orca"        'grep -q "skill \*\*\`orca\`\*\*" .claude/skills/speckit-orca-implement/SKILL.md'
check "el comando contempla runs a medias"        'grep -q "Run a medias" .claude/skills/speckit-orca-implement/SKILL.md'

printf '\n%s ok · %s fallos\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
