#!/usr/bin/env bash
# Orca Multiagent Kit v2 — fuente única de reglas y skills para todos tus agentes (CSR + MAW).
#   ./install.sh --dry-run                 muestra lo que haria, sin escribir
#   ./install.sh                           instala/migra para los agentes detectados
#   ./install.sh --agents claude,codex     solo esos (claude antigravity codex copilot cursor devin)
#   ./install.sh --project /ruta           ademas, migra/prepara un proyecto
#   ./install.sh --project-only /ruta      solo el proyecto
#   ./install.sh --verify                  comprueba instalacion y que no queden copias divergentes
#   ./install.sh --restore AAAAMMDD-HHMMSS deshace una instalacion desde su backup
#   ./install.sh --adopt <carpeta-skill>   hace multiproveedor una skill externa (una copia, todos la ven)
# Compatible con bash 3.2 (macOS).
set -Eeuo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AG="${AGENT_KIT_HOME:-$HOME/.agents}"
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
GEMINI_DIR="${GEMINI_DIR:-$HOME/.gemini}"
CODEX_DIR="${CODEX_HOME:-$HOME/.codex}"
COPILOT_DIR="$HOME/.copilot"
CURSOR_DIR="$HOME/.cursor"
DEVIN_DIR="$HOME/.config/devin"
STAMP="$(date +%Y%m%d-%H%M%S)"
BK="$AG/backups/$STAMP"
VERSION="$(cat "$SRC/VERSION")"
KIT_SKILLS="kit-init csr-stack csr-gate csr-audit maw-route maw-brief maw-plan maw-dispatch maw-worker maw-integrate maw-race maw-setup"
# Ficheros de reglas que versiones anteriores (CSR v1, MAW v1) copiaban dentro de cada agente.
OLD_RULES="00-router.md 10-communication.md 20-clean-code.md 30-security.md 31-security-audit.md 40-testing.md 50-done-gate.md 60-git-workflow.md 70-performance.md 75-reliability.md 80-supply-chain.md 90-docs-comments.md 95-multi-agent.md comunicacion-densa.md idioma-siempre.md"
OLD_LANGS="cpp csharp dart-flutter go infra java kotlin php python react ruby rust shell sql swift typescript web"

PROJECT=""; PROJECT_ONLY=0; VERIFY=0; DRY=0; AGENTS=""; RESTORE=""; ADOPT=""; WARN=""
while [ $# -gt 0 ]; do
  case "$1" in
    --project)      PROJECT="${2:-}"; shift 2 ;;
    --project-only) PROJECT="${2:-}"; PROJECT_ONLY=1; shift 2 ;;
    --agents)       AGENTS="${2:-}"; shift 2 ;;
    --verify)       VERIFY=1; shift ;;
    --dry-run)      DRY=1; shift ;;
    --restore)      RESTORE="${2:-}"; shift 2 ;;
    --adopt)        ADOPT="${2:-}"; shift 2 ;;
    -h|--help)      sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Opcion desconocida: $1" >&2; exit 2 ;;
  esac
done

step() { printf '[kit] %s\n' "$1"; }
warn() { WARN="${WARN}  - $1
"; }
run()  { if [ "$DRY" -eq 1 ]; then printf '  (dry) %s\n' "$*"; else "$@"; fi; }
has_agent() { case ",$AGENTS," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

# Mueve una ruta al backup conservando su ruta relativa a $HOME.
stash() {
  local p="$1" rel
  [ -e "$p" ] || [ -L "$p" ] || return 0
  rel="${p#$HOME/}"
  run mkdir -p "$BK/$(dirname "$rel")"
  run mv "$p" "$BK/$rel"
}
# Copia (sin mover) una ruta al backup.
snapshot() {
  local p="$1" rel
  [ -e "$p" ] || return 0
  rel="${p#$HOME/}"
  run mkdir -p "$BK/$(dirname "$rel")"
  run cp -a "$p" "$BK/$rel"
}
# Deja $2 como enlace simbolico a $1. Si habia otra cosa, va al backup.
link() {
  local target="$1" l="$2"
  if [ -L "$l" ] && [ "$(readlink "$l")" = "$target" ]; then return 0; fi
  stash "$l"
  run mkdir -p "$(dirname "$l")"
  run ln -s "$target" "$l"
}
# Quita los bloques gestionados (CSR, MAW, AGENTS) de un fichero, conservando el resto.
strip_blocks() { # $1 fichero -> stdout
  awk 'BEGIN{tag=""}
       tag=="" && match($0,/<!-- (CSR|MAW|AGENTS):BEGIN/) {tag=substr($0,RSTART+5,RLENGTH-11); next}
       tag!="" { if (index($0,"<!-- " tag ":END -->")) tag=""; next }
       {print}' "$1" | cat -s | awk 'NF{f=1} f'
}
# Lineas de "Overrides de este proyecto" dentro de un bloque CSR/AGENTS de proyecto.
extract_overrides() { # $1 fichero -> stdout
  awk 'BEGIN{inb=0;ov=0}
       /<!-- (CSR|AGENTS):BEGIN project/ {inb=1; next}
       inb && /<!-- (CSR|AGENTS):END -->/ {inb=0; ov=0; next}
       inb && /^## Overrides de este proyecto/ {ov=1; next}
       inb && ov && !/^<!--/ && !/^-[[:space:]]*$/ && NF>0 {print}' "$1"
}
write_file() { # $1 destino, stdin contenido
  if [ "$DRY" -eq 1 ]; then cat >/dev/null; printf '  (dry) escribir %s\n' "$1"; else mkdir -p "$(dirname "$1")"; cat > "$1"; fi
}

[ -f "$SRC/core/AGENTS.md" ] || { echo "No encuentro core/AGENTS.md en $SRC" >&2; exit 1; }

# ------------------------------------------------------------------ restore
if [ -n "$RESTORE" ]; then
  R="$AG/backups/$RESTORE"; [ -d "$R" ] || { echo "No existe $R" >&2; exit 1; }
  step "Restaurando desde $R"
  (cd "$R" && find . \( -type f -o -type l \) | sed 's#^\./##') | while IFS= read -r rel; do
    dest="$HOME/$rel"
    # si algun directorio padre es ahora un enlace (p. ej. una skill enlazada), quita el enlace: no escribir a traves de el
    p="$(dirname "$dest")"
    while [ "$p" != "$HOME" ] && [ "$p" != "/" ]; do [ -L "$p" ] && run rm -f "$p"; p="$(dirname "$p")"; done
    if [ -L "$dest" ] || [ -f "$dest" ]; then run rm -f "$dest"; fi
    run mkdir -p "$(dirname "$dest")"; run cp -a "$R/$rel" "$dest"
  done
  step "Hecho. Los enlaces creados donde antes no habia nada se mantienen; borralos a mano si quieres."
  exit 0
fi

# ------------------------------------------------------------------ agentes
if [ -z "$AGENTS" ]; then
  [ -d "$CLAUDE_DIR" ]  && AGENTS="$AGENTS,claude"
  [ -d "$GEMINI_DIR" ]  && AGENTS="$AGENTS,antigravity"
  [ -d "$CODEX_DIR" ]   && AGENTS="$AGENTS,codex"
  [ -d "$COPILOT_DIR" ] && AGENTS="$AGENTS,copilot"
  [ -d "$CURSOR_DIR" ]  && AGENTS="$AGENTS,cursor"
  AGENTS="${AGENTS#,}"   # devin solo con --agents (opt-in)
fi

# ------------------------------------------------------------------ adopt
if [ -n "$ADOPT" ]; then
  SKD="${ADOPT%/}"
  [ -f "$SKD/SKILL.md" ] || { echo "No es una skill (falta SKILL.md): $SKD" >&2; exit 1; }
  [ -L "$SKD" ] && { echo "Ya es un enlace: $SKD -> $(readlink "$SKD")" >&2; exit 1; }
  NAME="$(basename "$SKD")"; DEST="$AG/skills/$NAME"
  [ -e "$DEST" ] && { echo "Ya existe $DEST. Si es la misma skill, borra una de las dos copias antes." >&2; exit 1; }
  step "Adoptando $NAME: $SKD -> $DEST (en su sitio original queda un enlace)"
  run mkdir -p "$BK" "$AG/skills"
  run cp -a "$SKD" "$BK/$NAME.orig"
  run mv "$SKD" "$DEST"
  run ln -s "$DEST" "$SKD"
  case "$SKD" in "$CLAUDE_DIR"/skills/*) ;; *) has_agent claude && link "$DEST" "$CLAUDE_DIR/skills/$NAME" ;; esac
  case "$SKD" in "$GEMINI_DIR"/*) ;; *) has_agent antigravity && link "$DEST" "$GEMINI_DIR/config/skills/$NAME" ;; esac
  step "Hecho. Codex, Copilot y Cursor la leen desde $AG/skills. Si la skill se actualiza con su propio instalador, vuelve a adoptarla."
  exit 0
fi

# ------------------------------------------------------------------ verify
if [ "$VERIFY" -eq 1 ]; then
  bad=0
  ok()   { echo "  OK    $1"; }
  fail() { echo "  MAL   $1"; bad=1; }
  chk_link() { if [ -L "$2" ] && [ "$(readlink "$2")" = "$1" ]; then ok "$2 -> $1"; else fail "$2 no enlaza a $1"; fi; }
  [ -f "$AG/AGENTS.md" ] && ok "$AG/AGENTS.md" || fail "$AG/AGENTS.md"
  n=$(ls -1 "$AG/rules/lang"/*.md 2>/dev/null | wc -l | tr -d ' '); [ "$n" -ge 17 ] && ok "rules/lang: $n" || fail "rules/lang: $n (esperado 17)"
  for s in $KIT_SKILLS; do [ -f "$AG/skills/$s/SKILL.md" ] || fail "skill $s"; done
  if has_agent claude; then
    grep -q '@~/.agents/AGENTS.md' "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null && ok "CLAUDE.md importa AGENTS.md" || fail "CLAUDE.md sin import"
    grep -Eq '<!-- (CSR|MAW):BEGIN' "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null && fail "CLAUDE.md conserva bloques CSR/MAW antiguos" || true
    for r in $OLD_RULES; do [ -e "$CLAUDE_DIR/rules/$r" ] && fail "copia divergente: $CLAUDE_DIR/rules/$r (Claude la carga SIEMPRE)"; done
    for s in $KIT_SKILLS; do chk_link "$AG/skills/$s" "$CLAUDE_DIR/skills/$s"; done
  fi
  if has_agent antigravity; then
    chk_link "$AG/AGENTS.md" "$GEMINI_DIR/GEMINI.md"
    for r in $OLD_RULES; do [ -e "$GEMINI_DIR/rules/$r" ] && fail "copia divergente: $GEMINI_DIR/rules/$r"; done
    [ -e "$GEMINI_DIR/config/plugins/claude-session-rules" ] && fail "plugin claude-session-rules sigue instalado (duplica csr-*)"
    for s in $KIT_SKILLS; do chk_link "$AG/skills/$s" "$GEMINI_DIR/config/skills/$s"; done
  fi
  has_agent codex   && chk_link "$AG/AGENTS.md" "$CODEX_DIR/AGENTS.md"
  has_agent copilot && chk_link "$AG/AGENTS.md" "$COPILOT_DIR/copilot-instructions.md"
  has_agent devin   && chk_link "$AG/AGENTS.md" "$DEVIN_DIR/AGENTS.md"
  has_agent cursor  && echo "  INFO  cursor: lee ~/.agents/skills solo; reglas globales en Settings -> Rules (no hay fichero)"
  [ "$bad" -eq 0 ] && { step "Verificacion: OK ($AGENTS)"; exit 0; }
  step "Verificacion: con fallos"; exit 1
fi

# ------------------------------------------------------------------ global
if [ "$PROJECT_ONLY" -eq 0 ]; then
  [ -n "$AGENTS" ] || { echo "No detecto ningun agente. Usa --agents." >&2; exit 1; }
  step "Orca Multiagent Kit v$VERSION · agentes: $AGENTS"
  step "Fuente unica: $AG · backup: $BK"
  run mkdir -p "$BK"

  # 1. Fuente canonica
  [ -f "$AG/AGENTS.md" ] && snapshot "$AG/AGENTS.md"
  run mkdir -p "$AG/rules" "$AG/skills" "$AG/templates" "$AG/output-styles"
  run cp "$SRC/core/AGENTS.md" "$AG/AGENTS.md"
  run cp -R "$SRC/rules/." "$AG/rules/"
  for r in comunicacion-densa.md idioma-siempre.md; do [ -e "$AG/rules/$r" ] && stash "$AG/rules/$r"; done
  for s in $KIT_SKILLS; do
    [ -e "$AG/skills/$s" ] && run rm -rf "$AG/skills/$s"
    run cp -R "$SRC/skills/$s" "$AG/skills/$s"
  done
  run cp -R "$SRC/templates/." "$AG/templates/"
  run cp -R "$SRC/output-styles/." "$AG/output-styles/"
  run cp "$SRC/VERSION" "$AG/AGENT_KIT_VERSION"
  [ -d "$AG/maw" ] && stash "$AG/maw"              # restos de MAW v1

  # 2. Claude Code: import en CLAUDE.md; reglas fuera de ~/.claude/rules (Claude carga TODO lo que hay ahi)
  if has_agent claude; then
    step "Claude Code"
    if [ -L "$CLAUDE_DIR/CLAUDE.md" ]; then stash "$CLAUDE_DIR/CLAUDE.md"; fi
    [ -f "$CLAUDE_DIR/CLAUDE.md" ] && snapshot "$CLAUDE_DIR/CLAUDE.md"
    TMP="$(mktemp)"; [ -f "$CLAUDE_DIR/CLAUDE.md" ] && strip_blocks "$CLAUDE_DIR/CLAUDE.md" > "$TMP"
    { printf '<!-- AGENTS:BEGIN v%s Orca Multiagent Kit -- reglas globales: edita ~/.agents/AGENTS.md, no este bloque -->\n@~/.agents/AGENTS.md\n<!-- AGENTS:END -->\n' "$VERSION"; [ -s "$TMP" ] && { printf '\n'; cat "$TMP"; }; true; } | write_file "$CLAUDE_DIR/CLAUDE.md"
    rm -f "$TMP"
    for r in $OLD_RULES; do stash "$CLAUDE_DIR/rules/$r"; done
    for l in $OLD_LANGS; do stash "$CLAUDE_DIR/rules/lang/$l.md"; done
    [ -d "$CLAUDE_DIR/rules/lang" ] && [ "$DRY" -eq 0 ] && rmdir "$CLAUDE_DIR/rules/lang" 2>/dev/null || true
    for s in $KIT_SKILLS; do link "$AG/skills/$s" "$CLAUDE_DIR/skills/$s"; done
    link "$AG/output-styles/csr-minimal.md" "$CLAUDE_DIR/output-styles/csr-minimal.md"
    stash "$CLAUDE_DIR/templates/STACK.md"; stash "$CLAUDE_DIR/templates/project-CLAUDE.md"
    warn "Claude Code: en sesiones de Cowork (app de escritorio) no se cargan imports de fuera de la carpeta de trabajo; en la CLI y el IDE, si."
  fi

  # 3. Antigravity: GEMINI.md pasa a ser un enlace a la fuente unica
  if has_agent antigravity; then
    step "Antigravity"
    if [ -f "$GEMINI_DIR/GEMINI.md" ] && [ ! -L "$GEMINI_DIR/GEMINI.md" ]; then
      EXTRA="$(strip_blocks "$GEMINI_DIR/GEMINI.md" | grep -v '^[[:space:]]*$' || true)"
      if [ -n "$EXTRA" ]; then
        warn "Antigravity: GEMINI.md tenia contenido fuera de los bloques (va al backup). Idioma y comunicacion ya estan en AGENTS.md; si habia algo mas tuyo, pasalo a ~/.agents/rules/personal.md"
      fi
    fi
    link "$AG/AGENTS.md" "$GEMINI_DIR/GEMINI.md"
    for r in $OLD_RULES; do stash "$GEMINI_DIR/rules/$r"; done
    for l in $OLD_LANGS; do stash "$GEMINI_DIR/rules/lang/$l.md"; done
    [ -d "$GEMINI_DIR/rules/lang" ] && [ "$DRY" -eq 0 ] && rmdir "$GEMINI_DIR/rules/lang" 2>/dev/null || true
    stash "$GEMINI_DIR/templates/STACK.md"; stash "$GEMINI_DIR/templates/project-CLAUDE.md"
    stash "$GEMINI_DIR/output-styles/csr-minimal.md"
    if [ -e "$GEMINI_DIR/config/plugins/claude-session-rules" ]; then
      stash "$GEMINI_DIR/config/plugins/claude-session-rules"
      warn "Antigravity: plugin claude-session-rules retirado (sus csr-* y su estilo ya estan en la fuente unica). Si Antigravity se queja de un plugin ausente, desactivalo en su configuracion."
    fi
    for s in $KIT_SKILLS; do link "$AG/skills/$s" "$GEMINI_DIR/config/skills/$s"; done
    [ -d "$GEMINI_DIR/config/plugins/user-workflows/skills/planificar" ] && warn "Antigravity: 'planificar' sigue activo; 'maw-plan' lo sustituye. Desactivalo cuando hayas probado maw-plan."
  fi

  # 4. Agentes que leen ~/.agents/skills de forma nativa: solo hay que enlazar las reglas globales
  if has_agent codex;   then step "Codex";   link "$AG/AGENTS.md" "$CODEX_DIR/AGENTS.md"; fi
  if has_agent copilot; then step "Copilot CLI"; link "$AG/AGENTS.md" "$COPILOT_DIR/copilot-instructions.md"; fi
  if has_agent devin;   then step "Devin CLI"; link "$AG/AGENTS.md" "$DEVIN_DIR/AGENTS.md"
    warn "Devin: tambien lee ~/.claude/CLAUDE.md; si ves reglas duplicadas, quita uno de los dos."; fi
  if has_agent cursor;  then step "Cursor (skills: nativo en ~/.agents/skills)"
    warn "Cursor: sus reglas de usuario no estan en ficheros. Pega en Settings -> Rules -> User Rules: «Al empezar, lee y aplica ~/.agents/AGENTS.md y, bajo demanda, ~/.agents/rules/»."
    has_agent claude && warn "Cursor: tambien lee ~/.claude/skills por compatibilidad; puede listar las skills dos veces (mismo contenido)."; fi
fi

# ------------------------------------------------------------------ proyecto
if [ -n "$PROJECT" ]; then
  [ -d "$PROJECT" ] || { echo "No existe la ruta de proyecto: $PROJECT" >&2; exit 1; }
  step "Proyecto: $PROJECT"
  OV=""
  for f in "$PROJECT/CLAUDE.md" "$PROJECT/AGENTS.md"; do [ -f "$f" ] && OV="$OV$(extract_overrides "$f")
"; done
  OV="$(printf '%s' "$OV" | awk 'NF && !seen[$0]++')"
  for f in AGENTS.md CLAUDE.md; do [ -f "$PROJECT/$f" ] && snapshot "$PROJECT/$f"; done

  TMP="$(mktemp)"; [ -f "$PROJECT/AGENTS.md" ] && strip_blocks "$PROJECT/AGENTS.md" > "$TMP"
  { if [ -n "$OV" ]; then OV="$OV" awk '/^-$/ && !d {print ENVIRON["OV"]; d=1; next} {print}' "$SRC/templates/AGENTS.md"; else cat "$SRC/templates/AGENTS.md"; fi
    [ -s "$TMP" ] && { printf '\n'; cat "$TMP"; }; true; } | write_file "$PROJECT/AGENTS.md"
  REST="$(mktemp)"; [ -f "$PROJECT/CLAUDE.md" ] && strip_blocks "$PROJECT/CLAUDE.md" > "$REST"
  { cat "$SRC/templates/CLAUDE.md"; [ -s "$REST" ] && { printf '\n'; cat "$REST"; }; true; } | write_file "$PROJECT/CLAUDE.md"
  grep -q '[^[:space:]]' "$REST" && warn "Proyecto: CLAUDE.md tiene reglas propias fuera del bloque; solo las ve Claude. Muevelas a AGENTS.md para que las vean todos."
  rm -f "$TMP" "$REST"
  [ -n "$OV" ] && step "  overrides migrados a AGENTS.md"
  for f in STACK.md ORCHESTRATION.md orca.yaml .worktreeinclude; do
    if [ -e "$PROJECT/$f" ]; then step "  $f ya existe: no se toca"; else run cp "$SRC/templates/$f" "$PROJECT/$f"; step "  $f creado"; fi
  done
  if [ ! -e "$PROJECT/.claude/settings.json" ] && has_agent claude; then run mkdir -p "$PROJECT/.claude"; run cp "$SRC/templates/claude-settings.json" "$PROJECT/.claude/settings.json"; step "  .claude/settings.json creado"; fi
  if ! grep -qxF '.work/' "$PROJECT/.gitignore" 2>/dev/null; then
    if [ "$DRY" -eq 1 ]; then echo "  (dry) añadir .work/ a .gitignore"; else printf '\n# Orca Multiagent Kit: briefs e informes de runs multiagente\n.work/\n' >> "$PROJECT/.gitignore"; fi
    step "  .work/ añadido a .gitignore"
  fi
  step "  Siguiente: en el agente, «ejecuta kit-init» (detecta el stack y prepara la orquestacion)."
fi

[ -n "$WARN" ] && { step "Avisos:"; printf '%s' "$WARN"; }
step "Hecho. Comprueba con: ./install.sh --verify   ·   deshacer: ./install.sh --restore $STAMP"
