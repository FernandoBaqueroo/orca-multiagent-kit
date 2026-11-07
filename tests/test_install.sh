#!/usr/bin/env bash
# Pruebas de install.sh en un $HOME desechable. Sin dependencias; compatible con bash 3.2 (macOS).
#   tests/test_install.sh
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL="$ROOT/install.sh"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; }
check(){ if eval "$2"; then ok "$1"; else bad "$1"; fi; }
newhome(){ mktemp -d "${TMPDIR:-/tmp}/omk-test.XXXXXX"; }
inst() { HOME="$H" bash "$INSTALL" "$@" >/dev/null 2>&1; }

echo "== 1. Instalación limpia (Claude + Antigravity + Codex)"
H="$(newhome)"; mkdir -p "$H/.claude" "$H/.gemini" "$H/.codex"
inst
check "núcleo en ~/.agents"                     '[ -f "$H/.agents/AGENTS.md" ]'
check "17 guías de lenguaje"                     '[ "$(ls "$H/.agents/rules/lang" | wc -l | tr -d " ")" -eq 17 ]'
check "CLAUDE.md importa el núcleo"              'grep -q "@~/.agents/AGENTS.md" "$H/.claude/CLAUDE.md"'
check "GEMINI.md es enlace al núcleo"            '[ "$(readlink "$H/.gemini/GEMINI.md")" = "$H/.agents/AGENTS.md" ]'
check "Codex AGENTS.md es enlace al núcleo"      '[ "$(readlink "$H/.codex/AGENTS.md")" = "$H/.agents/AGENTS.md" ]'
check "skill enlazada en Claude"                 '[ -L "$H/.claude/skills/csr-gate" ]'
check "skill enlazada en Antigravity"            '[ -L "$H/.gemini/config/skills/orca" ]'
check "--verify pasa"                            'HOME="$H" bash "$INSTALL" --verify >/dev/null 2>&1'

echo "== 2. Idempotencia"
# shellcheck disable=SC2034  # se usa dentro de eval (check)
before="$(wc -l < "$H/.claude/CLAUDE.md")"; inst; inst
check "reinstalar no duplica el bloque"          '[ "$(grep -c "AGENTS:BEGIN" "$H/.claude/CLAUDE.md")" -eq 1 ]'
check "reinstalar no crece CLAUDE.md"            '[ "$(wc -l < "$H/.claude/CLAUDE.md")" -eq "$before" ]'

echo "== 3. Migración desde CSR v1 + MAW v1"
H="$(newhome)"; mkdir -p "$H/.claude/rules/lang" "$H/.claude/skills/csr-gate" "$H/.gemini/rules" "$H/.gemini/config/plugins/claude-session-rules/skills" "$H/proj"
printf '<!-- CSR:BEGIN v1.0.0 x -->\nviejo\n<!-- CSR:END -->\n<!-- MAW:BEGIN v1.0.0 x -->\nviejo\n<!-- MAW:END -->\n\n# Mis cosas\n- usar pnpm\n' > "$H/.claude/CLAUDE.md"
for r in 00-router 30-security 50-done-gate; do echo x > "$H/.claude/rules/$r.md"; echo x > "$H/.gemini/rules/$r.md"; done
echo x > "$H/.claude/rules/lang/typescript.md"; echo "mía" > "$H/.claude/rules/personal-mia.md"
echo "csr viejo" > "$H/.claude/skills/csr-gate/SKILL.md"
printf '<!-- CSR:BEGIN v1.0.0 -->\nviejo\n<!-- CSR:END -->\n# Idioma permanente\n' > "$H/.gemini/GEMINI.md"
printf '<!-- CSR:BEGIN project v1.0.0 -->\n# Reglas\n## Overrides de este proyecto\n<!-- comentario -->\n- No tocar legacy/\n<!-- CSR:END -->\n' > "$H/proj/CLAUDE.md"
inst --project "$H/proj"
check "bloques CSR/MAW retirados de CLAUDE.md"   '! grep -Eq "(CSR|MAW):BEGIN" "$H/.claude/CLAUDE.md"'
check "contenido propio de CLAUDE.md conservado" 'grep -q "usar pnpm" "$H/.claude/CLAUDE.md"'
check "reglas CSR fuera de ~/.claude/rules"      '[ ! -e "$H/.claude/rules/30-security.md" ] && [ ! -e "$H/.claude/rules/lang/typescript.md" ]'
check "regla propia en ~/.claude/rules intacta"  '[ -f "$H/.claude/rules/personal-mia.md" ]'
check "reglas CSR fuera de ~/.gemini/rules"      '[ ! -e "$H/.gemini/rules/00-router.md" ]'
check "plugin claude-session-rules retirado"     '[ ! -e "$H/.gemini/config/plugins/claude-session-rules" ]'
check "csr-gate antiguo sustituido por enlace"   '[ -L "$H/.claude/skills/csr-gate" ]'
check "overrides migrados a AGENTS.md"           'grep -q "No tocar legacy/" "$H/proj/AGENTS.md"'
check "CLAUDE.md del proyecto importa AGENTS.md" 'grep -qx "@AGENTS.md" "$H/proj/CLAUDE.md" && ! grep -q "CSR:BEGIN" "$H/proj/CLAUDE.md"'
check "plantillas de proyecto creadas"           '[ -f "$H/proj/STACK.md" ] && [ -f "$H/proj/ORCHESTRATION.md" ] && [ -f "$H/proj/orca.yaml" ]'
check ".work/ en .gitignore"                     'grep -qx ".work/" "$H/proj/.gitignore"'
check "--verify pasa tras migrar"                'HOME="$H" bash "$INSTALL" --verify >/dev/null 2>&1'

H3="$H"
echo "== 3b. Migración desde 1.0 (skills maw-* retiradas) y hook de spec-kit"
H="$(newhome)"; mkdir -p "$H/.claude/skills" "$H/.agents/skills/maw-route" "$H/proj/.specify"
echo "viejo" > "$H/.agents/skills/maw-route/SKILL.md"; ln -s "$H/.agents/skills/maw-route" "$H/.claude/skills/maw-route"
PATH_NO_SPECIFY="$(printf '%s' "$PATH" | tr ':' '\n' | while read -r d; do [ -x "$d/specify" ] || printf '%s:' "$d"; done)"
HOME="$H" PATH="$PATH_NO_SPECIFY" bash "$INSTALL" --project "$H/proj" >/dev/null 2>&1
check "maw-route retirada de ~/.agents/skills"   '[ ! -e "$H/.agents/skills/maw-route" ]'
check "enlace maw-route retirado de Claude"      '[ ! -e "$H/.claude/skills/maw-route" ] && [ ! -L "$H/.claude/skills/maw-route" ]'
check "skill orca enlazada"                      '[ -L "$H/.claude/skills/orca" ]'
check "extensión spec-kit en ~/.agents"          '[ -f "$H/.agents/speckit-ext/orca/extension.yml" ]'
check "hook before_implement creado"             'grep -q "speckit.orca.implement" "$H/proj/.specify/extensions.yml"'
HOME="$H" PATH="$PATH_NO_SPECIFY" bash "$INSTALL" --project "$H/proj" >/dev/null 2>&1
check "reinstalar no duplica el hook"            '[ "$(grep -c "speckit.orca.implement" "$H/proj/.specify/extensions.yml")" -eq 1 ]'

echo "== 4. Restauración"
H="$H3"
STAMP="$(ls "$H/.agents/backups" | head -1)"
HOME="$H" bash "$INSTALL" --restore "$STAMP" >/dev/null 2>&1
check "CLAUDE.md vuelve a tener CSR"             'grep -q "CSR:BEGIN" "$H/.claude/CLAUDE.md"'
check "GEMINI.md vuelve a ser fichero"           '[ -f "$H/.gemini/GEMINI.md" ] && [ ! -L "$H/.gemini/GEMINI.md" ]'
check "reglas devueltas a ~/.claude/rules"       '[ -f "$H/.claude/rules/30-security.md" ]'
check "csr-gate antiguo restaurado"              'grep -q "csr viejo" "$H/.claude/skills/csr-gate/SKILL.md"'
check "copia canónica intacta tras restaurar"    'grep -q "^name: csr-gate" "$H/.agents/skills/csr-gate/SKILL.md"'

echo "== 5. --adopt de una skill externa"
H="$(newhome)"; mkdir -p "$H/.claude" "$H/.gemini/config/plugins/user-workflows/skills/impeccable"
printf -- '---\nname: impeccable\ndescription: x\n---\n' > "$H/.gemini/config/plugins/user-workflows/skills/impeccable/SKILL.md"
inst; inst --adopt "$H/.gemini/config/plugins/user-workflows/skills/impeccable"
check "skill movida a ~/.agents/skills"          '[ -f "$H/.agents/skills/impeccable/SKILL.md" ] && [ ! -L "$H/.agents/skills/impeccable" ]'
check "sitio original es enlace"                 '[ -L "$H/.gemini/config/plugins/user-workflows/skills/impeccable" ]'
check "enlazada en Claude"                       '[ -L "$H/.claude/skills/impeccable" ]'

echo "== 6. --dry-run no escribe"
H="$(newhome)"; mkdir -p "$H/.claude"
HOME="$H" bash "$INSTALL" --dry-run >/dev/null 2>&1
check "sin ~/.agents tras dry-run"               '[ ! -e "$H/.agents/AGENTS.md" ]'
check "sin CLAUDE.md tras dry-run"               '[ ! -e "$H/.claude/CLAUDE.md" ]'

echo "== 7. Sin agentes detectados"
H="$(newhome)"
check "falla con mensaje claro"                  '! HOME="$H" bash "$INSTALL" >/dev/null 2>&1'

echo "== 8. omk init sin omk install previo"
H="$(newhome)"; mkdir -p "$H/.claude" "$H/proj/.specify" "$H/bin"
# specify falso: solo acepta una extensión que exista de verdad
printf '%s\n' '#!/usr/bin/env bash' '[ "$1 $2 $3" = "extension add --dev" ] && [ -f "$4/extension.yml" ]' > "$H/bin/specify"; chmod +x "$H/bin/specify"
# shellcheck disable=SC2034  # OUT se lee dentro de check (eval)
OUT="$(HOME="$H" PATH="$H/bin:$PATH" OMK_CLI=1 bash "$INSTALL" --project-only "$H/proj" 2>&1)"
check "hook instalado desde el propio kit"       'printf "%s" "$OUT" | grep -q "extension orca instalada"'
check "avisa de ejecutar omk install"            'printf "%s" "$OUT" | grep -q "omk install"'
check "mensaje final con comandos omk"           'printf "%s" "$OUT" | grep -q "omk verify"'

printf '\n%s ok · %s fallos\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
