#!/usr/bin/env bash
# Orca Multiagent Kit — fuente única de reglas y skills para todos tus agentes (CSR + MAW).
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
KIT_SKILLS="kit-init orca speckit-orca-implement csr-stack csr-gate csr-audit"
# Skills de versiones anteriores que esta versión retira (consolidadas en "orca")
OLD_SKILLS="maw-route maw-brief maw-plan maw-dispatch maw-worker maw-integrate maw-race maw-setup"
# Ficheros de reglas que versiones anteriores (CSR v1, MAW v1) copiaban dentro de cada agente.
OLD_RULES="00-router.md 10-communication.md 20-clean-code.md 30-security.md 31-security-audit.md 40-testing.md 50-done-gate.md 60-git-workflow.md 70-performance.md 75-reliability.md 80-supply-chain.md 90-docs-comments.md 95-multi-agent.md comunicacion-densa.md idioma-siempre.md"
OLD_LANGS="cpp csharp dart-flutter go infra java kotlin php python react ruby rust shell sql swift typescript web"

PROJECT=""; PROJECT_ONLY=0; VERIFY=0; DRY=0; AGENTS=""; RESTORE=""; ADOPT=""
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

# ------------------------------------------------------------------ salida
# Con OMK_EVENTS=1 (lo pone omk) se emiten eventos «::tipo::…» que omk dibuja con spinner y color.
# Sin él (./install.sh), el mismo contenido en texto, con color si es una terminal.
EV="${OMK_EVENTS:-}"
C_L=''; C_D=''; C_Y=''; C_R=''; C_B=''; C_0=''
if [ -z "$EV" ] && [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  C_L=$'\033[38;5;154m'; C_D=$'\033[2m'; C_Y=$'\033[38;5;221m'; C_R=$'\033[38;5;203m'; C_B=$'\033[1m'; C_0=$'\033[0m'
fi
TODO=""; INFO=""; MOVED=0
ev()    { printf '::%s\n' "$1"; }
title() { if [ -n "$EV" ]; then ev "title::$1::${2:-}"; else printf '\n%s%s%s %s%s%s\n%s%s%s\n\n' "$C_L$C_B" "■" "$C_0" "$C_B" "$1" "$C_0" "$C_D" "${2:-}" "$C_0"; fi; }
phase() { if [ -n "$EV" ]; then ev "begin::$1"; else printf '  %s›%s %s%s%s\n' "$C_L" "$C_0" "$C_B" "$1" "$C_0"; fi; }
done_phase() { if [ -n "$EV" ]; then ev "end::${1:-}"; elif [ -n "${1:-}" ]; then printf '    %s%s%s\n' "$C_D" "$1" "$C_0"; fi; return 0; }
item()  { # $1 add|keep|dry|warn|fail · $2 texto
  if [ -n "$EV" ]; then ev "item::$1::$2"; return 0; fi
  case "$1" in add) m="$C_L+$C_0" ;; keep) m="$C_D=$C_0" ;; dry) m="$C_Y~$C_0" ;; fail) m="${C_R}✗${C_0}" ;; *) m="$C_Y!$C_0" ;; esac
  printf '    %s %s\n' "$m" "$2"; }
todo()  { TODO="${TODO}$1
"; if [ -n "$EV" ]; then ev "todo::$1"; fi; return 0; }
info()  { INFO="${INFO}$1
"; if [ -n "$EV" ]; then ev "info::$1"; fi; return 0; }
short() { local x="$*"; x="${x//"$SRC"/<kit>}"; printf '%s' "${x//"$HOME"/~}"; }
run()  { if [ "$DRY" -eq 1 ]; then item dry "$(short "$*")"; else "$@"; fi; }
# Resumen final: pendientes, información y siguientes pasos (solo texto; omk lo dibuja él)
footer() { # $1 global|project|both
  local st=""; [ -d "$BK" ] && [ "$DRY" -eq 0 ] && st="$STAMP"
  if [ -n "$EV" ]; then ev "footer::$1::$st::$DRY"; return 0; fi
  if [ -n "$TODO" ]; then printf '\n%sPendiente%s\n' "$C_Y$C_B" "$C_0"; printf '%s' "$TODO" | while IFS= read -r l; do printf '  %s›%s %s\n' "$C_Y" "$C_0" "$l"; done; fi
  if [ -n "$INFO" ]; then printf '\n%sPara tu información%s\n' "$C_D$C_B" "$C_0"; printf '%s' "$INFO" | while IFS= read -r l; do printf '  %s· %s%s\n' "$C_D" "$l" "$C_0"; done; fi
  if [ "$DRY" -eq 1 ]; then printf '\n%sSimulación: no se ha escrito nada.%s\n\n' "$C_Y" "$C_0"; return 0; fi
  printf '\n%s✓ Hecho%s\n' "$C_L$C_B" "$C_0"
  case "$1" in
    global) printf '  %scomprobar%s  ./install.sh --verify\n  %sproyecto%s   ./install.sh --project-only <ruta>\n' "$C_D" "$C_0" "$C_D" "$C_0" ;;
    *)      printf '  %ssiguiente%s  en el agente: «inicializa el proyecto»\n' "$C_D" "$C_0" ;;
  esac
  [ -n "$st" ] && printf '  %sdeshacer%s   ./install.sh --restore %s\n' "$C_D" "$C_0" "$st"
  printf '\n'; }
NSK=0; for _s in $KIT_SKILLS; do NSK=$((NSK+1)); done
# Cursor guarda las reglas de usuario en su base de datos de estado: basta con buscar la ruta del núcleo.
cursor_rule_set() {
  local f
  for f in "$HOME/Library/Application Support/Cursor/User/globalStorage/state.vscdb" "$HOME/.config/Cursor/User/globalStorage/state.vscdb"; do
    [ -f "$f" ] && grep -aq '.agents/AGENTS.md' "$f" 2>/dev/null && return 0
  done
  return 1; }
agent_names() { local o="" a; for a in $(printf '%s' "$AGENTS" | tr ',' ' '); do
  case "$a" in claude) a="Claude Code" ;; antigravity) a="Antigravity" ;; codex) a="Codex" ;; copilot) a="Copilot CLI" ;; cursor) a="Cursor" ;; devin) a="Devin" ;; esac
  o="${o:+$o · }$a"; done; printf '%s' "$o"; }
has_agent() { case ",$AGENTS," in *",$1,"*) return 0 ;; *) return 1 ;; esac; }

# Mueve una ruta al backup conservando su ruta relativa a $HOME.
stash() {
  local p="$1" rel
  [ -e "$p" ] || [ -L "$p" ] || return 0
  rel="${p#$HOME/}"
  run mkdir -p "$BK/$(dirname "$rel")"
  run mv "$p" "$BK/$rel"
  MOVED=$((MOVED+1))
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
  if [ "$DRY" -eq 1 ]; then cat >/dev/null; item dry "escribir $(short "$1")"; else mkdir -p "$(dirname "$1")"; cat > "$1"; fi
}

[ -f "$SRC/core/AGENTS.md" ] || { echo "No encuentro core/AGENTS.md en $SRC" >&2; exit 1; }

# ------------------------------------------------------------------ restore
if [ -n "$RESTORE" ]; then
  R="$AG/backups/$RESTORE"; [ -d "$R" ] || { echo "No existe la copia $R (consulta: omk backups)" >&2; exit 1; }
  title "Restaurar" "copia $RESTORE"
  phase "Devolviendo ficheros a su sitio"
  N=0
  while IFS= read -r rel; do
    [ -n "$rel" ] || continue
    dest="$HOME/$rel"
    # si algun directorio padre es ahora un enlace (p. ej. una skill enlazada), quita el enlace: no escribir a traves de el
    p="$(dirname "$dest")"
    while [ "$p" != "$HOME" ] && [ "$p" != "/" ]; do [ -L "$p" ] && run rm -f "$p"; p="$(dirname "$p")"; done
    if [ -L "$dest" ] || [ -f "$dest" ]; then run rm -f "$dest"; fi
    run mkdir -p "$(dirname "$dest")"; run cp -a "$R/$rel" "$dest"
    N=$((N+1))
  done <<EOF
$(cd "$R" && find . \( -type f -o -type l \) | sed 's#^\./##')
EOF
  done_phase "$N ficheros restaurados"
  info "Los enlaces que el kit creó donde antes no había nada siguen ahí; bórralos a mano si quieres."
  if [ -n "$EV" ]; then ev "footer::restore::$RESTORE::$DRY"; else printf '\n%s✓ Restaurado%s\n\n' "$C_L$C_B" "$C_0"; fi
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
  title "Adoptar skill" "$NAME"
  phase "Compartiendo $NAME con todos los agentes"
  run mkdir -p "$BK" "$AG/skills"
  run cp -a "$SKD" "$BK/$NAME.orig"
  run mv "$SKD" "$DEST"
  run ln -s "$DEST" "$SKD"
  item add "copia única en $(short "$DEST")"
  item add "en su sitio original queda un enlace"
  case "$SKD" in "$CLAUDE_DIR"/skills/*) ;; *) has_agent claude && { link "$DEST" "$CLAUDE_DIR/skills/$NAME"; item add "enlazada en Claude Code"; } ;; esac
  case "$SKD" in "$GEMINI_DIR"/*) ;; *) has_agent antigravity && { link "$DEST" "$GEMINI_DIR/config/skills/$NAME"; item add "enlazada en Antigravity"; } ;; esac
  done_phase "Codex, Copilot y Cursor la leen desde ~/.agents/skills"
  info "Si la skill se actualiza con su propio instalador, vuelve a adoptarla."
  footer global
  exit 0
fi

# ------------------------------------------------------------------ verify
if [ "$VERIFY" -eq 1 ]; then
  bad=0; nok=0
  vok()   { nok=$((nok+1)); if [ -n "$EV" ]; then ev "check::ok::$1"; else printf '  %s✓%s %s\n' "$C_L" "$C_0" "$1"; fi; }
  vfail() { bad=$((bad+1)); if [ -n "$EV" ]; then ev "check::fail::$1"; else printf '  %s✗ %s%s\n' "$C_R" "$1" "$C_0"; fi; }
  vinfo() { if [ -n "$EV" ]; then ev "check::info::$1"; else printf '  %s· %s%s\n' "$C_D" "$1" "$C_0"; fi; }
  chk_link() { if [ -L "$3" ] && [ "$(readlink "$3")" = "$2" ]; then vok "$1"; else vfail "$1: $(short "$3") no enlaza a $(short "$2")"; fi; }
  title "Verificación" "$(agent_names)"
  [ -f "$AG/AGENTS.md" ] && vok "núcleo en ~/.agents/AGENTS.md (v$(cat "$AG/AGENT_KIT_VERSION" 2>/dev/null || echo '?'))" || vfail "falta ~/.agents/AGENTS.md: ejecuta omk install"
  n=$(ls -1 "$AG/rules/lang"/*.md 2>/dev/null | wc -l | tr -d ' '); [ "$n" -ge 17 ] && vok "$n guías de lenguaje" || vfail "guías de lenguaje: $n de 17"
  ms=""; for s in $KIT_SKILLS; do [ -f "$AG/skills/$s/SKILL.md" ] || ms="$ms $s"; done
  [ -z "$ms" ] && vok "$NSK skills del kit" || vfail "faltan skills:$ms"
  [ -f "$AG/speckit-ext/orca/extension.yml" ] && vok "extensión de spec-kit" || vfail "falta la extensión de spec-kit (~/.agents/speckit-ext/orca)"
  for s in $OLD_SKILLS; do [ -e "$AG/skills/$s" ] && vfail "skill retirada sigue instalada: $s"; done
  if has_agent claude; then
    grep -q '@~/.agents/AGENTS.md' "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null && vok "Claude Code: CLAUDE.md importa el núcleo" || vfail "Claude Code: CLAUDE.md no importa el núcleo"
    grep -Eq '<!-- (CSR|MAW):BEGIN' "$CLAUDE_DIR/CLAUDE.md" 2>/dev/null && vfail "Claude Code: CLAUDE.md conserva bloques CSR/MAW antiguos" || true
    for r in $OLD_RULES; do [ -e "$CLAUDE_DIR/rules/$r" ] && vfail "Claude Code: copia antigua $(short "$CLAUDE_DIR/rules/$r") (Claude la carga siempre)"; done
    ms=""; for s in $KIT_SKILLS; do [ -L "$CLAUDE_DIR/skills/$s" ] && [ "$(readlink "$CLAUDE_DIR/skills/$s")" = "$AG/skills/$s" ] || ms="$ms $s"; done
    [ -z "$ms" ] && vok "Claude Code: skills enlazadas" || vfail "Claude Code: skills sin enlazar:$ms"
  fi
  if has_agent antigravity; then
    chk_link "Antigravity: GEMINI.md es el núcleo" "$AG/AGENTS.md" "$GEMINI_DIR/GEMINI.md"
    for r in $OLD_RULES; do [ -e "$GEMINI_DIR/rules/$r" ] && vfail "Antigravity: copia antigua $(short "$GEMINI_DIR/rules/$r")"; done
    [ -e "$GEMINI_DIR/config/plugins/claude-session-rules" ] && vfail "Antigravity: el plugin claude-session-rules sigue instalado (duplica csr-*)"
    ms=""; for s in $KIT_SKILLS; do [ -L "$GEMINI_DIR/config/skills/$s" ] && [ "$(readlink "$GEMINI_DIR/config/skills/$s")" = "$AG/skills/$s" ] || ms="$ms $s"; done
    [ -z "$ms" ] && vok "Antigravity: skills enlazadas" || vfail "Antigravity: skills sin enlazar:$ms"
  fi
  has_agent codex   && chk_link "Codex: AGENTS.md es el núcleo" "$AG/AGENTS.md" "$CODEX_DIR/AGENTS.md"
  has_agent copilot && chk_link "Copilot CLI: copilot-instructions.md es el núcleo" "$AG/AGENTS.md" "$COPILOT_DIR/copilot-instructions.md"
  has_agent devin   && chk_link "Devin: AGENTS.md es el núcleo" "$AG/AGENTS.md" "$DEVIN_DIR/AGENTS.md"
  if has_agent cursor; then
    if cursor_rule_set; then vok "Cursor: regla de usuario configurada"; else vinfo "Cursor: no veo la regla de usuario que apunta a ~/.agents/AGENTS.md (Settings → Rules)"; fi
  fi
  if [ -n "$EV" ]; then ev "result::$bad::$nok"; exit $((bad > 0)); fi
  if [ "$bad" -eq 0 ]; then printf '\n%s✓ Todo correcto%s  %s%s comprobaciones%s\n\n' "$C_L$C_B" "$C_0" "$C_D" "$nok" "$C_0"; exit 0; fi
  printf '\n%s✗ %s fallos%s  %sejecuta «omk install» para repararlos%s\n\n' "$C_R$C_B" "$bad" "$C_0" "$C_D" "$C_0"; exit 1
fi

# ------------------------------------------------------------------ global
if [ "$PROJECT_ONLY" -eq 0 ]; then
  [ -n "$AGENTS" ] || { echo "No detecto ningún agente (Claude Code, Antigravity, Codex, Copilot o Cursor). Indica cuáles con --agents." >&2; exit 1; }
  SUB="$(agent_names)"; [ "$DRY" -eq 1 ] && SUB="$SUB · simulación, no se escribe nada"
  title "Orca Multiagent Kit v${VERSION}" "$SUB"
  run mkdir -p "$BK"

  # 1. Fuente canonica
  phase "Fuente única en ~/.agents"
  PREV="$(cat "$AG/AGENT_KIT_VERSION" 2>/dev/null || true)"
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
  run mkdir -p "$AG/speckit-ext"
  [ -e "$AG/speckit-ext/orca" ] && run rm -rf "$AG/speckit-ext/orca"
  run cp -R "$SRC/speckit-extension/orca" "$AG/speckit-ext/orca"
  NR=$(find "$SRC/rules" -name '*.md' | wc -l | tr -d ' '); NS=$NSK
  if [ -z "$PREV" ]; then item add "instalada v${VERSION}"; elif [ "$PREV" = "$VERSION" ]; then item keep "v${VERSION} reinstalada"; else item add "actualizada de v${PREV} a v${VERSION}"; fi
  done_phase "núcleo · $NR reglas · $NS skills · extensión de spec-kit"

  # 2. Restos de versiones anteriores
  phase "Versiones anteriores"
  M0=$MOVED
  [ -d "$AG/maw" ] && stash "$AG/maw"              # restos de MAW v1
  for s in $OLD_SKILLS; do
    stash "$AG/skills/$s"; stash "$CLAUDE_DIR/skills/$s"; stash "$GEMINI_DIR/config/skills/$s"
  done
  if [ $((MOVED-M0)) -gt 0 ]; then done_phase "$((MOVED-M0)) elementos retirados a la copia de seguridad"; else done_phase "nada que retirar"; fi

  # 3. Claude Code: import en CLAUDE.md; reglas fuera de ~/.claude/rules (Claude carga TODO lo que hay ahi)
  if has_agent claude; then
    phase "Claude Code"
    M0=$MOVED
    if [ -L "$CLAUDE_DIR/CLAUDE.md" ]; then stash "$CLAUDE_DIR/CLAUDE.md"; fi
    [ -f "$CLAUDE_DIR/CLAUDE.md" ] && snapshot "$CLAUDE_DIR/CLAUDE.md"
    TMP="$(mktemp)"; [ -f "$CLAUDE_DIR/CLAUDE.md" ] && strip_blocks "$CLAUDE_DIR/CLAUDE.md" > "$TMP"
    { printf '<!-- AGENTS:BEGIN v%s Orca Multiagent Kit -- reglas globales: edita ~/.agents/AGENTS.md, no este bloque -->\n@~/.agents/AGENTS.md\n<!-- AGENTS:END -->\n' "$VERSION"; [ -s "$TMP" ] && { printf '\n'; cat "$TMP"; }; true; } | write_file "$CLAUDE_DIR/CLAUDE.md"
    [ -s "$TMP" ] && KEPT=1 || KEPT=0
    rm -f "$TMP"
    for r in $OLD_RULES; do stash "$CLAUDE_DIR/rules/$r"; done
    for l in $OLD_LANGS; do stash "$CLAUDE_DIR/rules/lang/$l.md"; done
    [ -d "$CLAUDE_DIR/rules/lang" ] && [ "$DRY" -eq 0 ] && rmdir "$CLAUDE_DIR/rules/lang" 2>/dev/null || true
    for s in $KIT_SKILLS; do link "$AG/skills/$s" "$CLAUDE_DIR/skills/$s"; done
    link "$AG/output-styles/csr-minimal.md" "$CLAUDE_DIR/output-styles/csr-minimal.md"
    stash "$CLAUDE_DIR/templates/STACK.md"; stash "$CLAUDE_DIR/templates/project-CLAUDE.md"
    item add "CLAUDE.md importa el núcleo"
    [ "$KEPT" -eq 1 ] && item keep "tu contenido propio de CLAUDE.md se conserva debajo"
    item add "$NS skills enlazadas · estilo csr-minimal"
    [ $((MOVED-M0)) -gt 0 ] && item add "$((MOVED-M0)) copias antiguas de reglas retiradas"
    done_phase
    info "Claude Code: en la app de escritorio (Cowork) no se cargan imports de fuera de la carpeta de trabajo; en la terminal y el IDE sí."
  fi

  # 4. Antigravity: GEMINI.md pasa a ser un enlace a la fuente unica
  if has_agent antigravity; then
    phase "Antigravity"
    M0=$MOVED
    if [ -f "$GEMINI_DIR/GEMINI.md" ] && [ ! -L "$GEMINI_DIR/GEMINI.md" ]; then
      EXTRA="$(strip_blocks "$GEMINI_DIR/GEMINI.md" | grep -v '^[[:space:]]*$' || true)"
      [ -n "$EXTRA" ] && info "Antigravity: lo que tenías en GEMINI.md fuera de los bloques está en la copia de seguridad. Si era tuyo, pásalo a ~/.agents/rules/personal.md."
    fi
    link "$AG/AGENTS.md" "$GEMINI_DIR/GEMINI.md"
    for r in $OLD_RULES; do stash "$GEMINI_DIR/rules/$r"; done
    for l in $OLD_LANGS; do stash "$GEMINI_DIR/rules/lang/$l.md"; done
    [ -d "$GEMINI_DIR/rules/lang" ] && [ "$DRY" -eq 0 ] && rmdir "$GEMINI_DIR/rules/lang" 2>/dev/null || true
    stash "$GEMINI_DIR/templates/STACK.md"; stash "$GEMINI_DIR/templates/project-CLAUDE.md"
    stash "$GEMINI_DIR/output-styles/csr-minimal.md"
    if [ -e "$GEMINI_DIR/config/plugins/claude-session-rules" ]; then
      stash "$GEMINI_DIR/config/plugins/claude-session-rules"
      item add "plugin claude-session-rules retirado (ya está en la fuente única)"
      info "Antigravity: si se queja de un plugin ausente (claude-session-rules), desactívalo en su configuración."
    fi
    for s in $KIT_SKILLS; do link "$AG/skills/$s" "$GEMINI_DIR/config/skills/$s"; done
    item add "GEMINI.md es un enlace al núcleo"
    item add "$NS skills enlazadas"
    [ $((MOVED-M0)) -gt 0 ] && item add "$((MOVED-M0)) copias antiguas retiradas"
    done_phase
    [ -d "$GEMINI_DIR/config/plugins/user-workflows/skills/planificar" ] && todo "Antigravity: desactiva la skill «planificar» cuando hayas probado «orca», que la sustituye."
  fi

  # 5. Agentes que leen ~/.agents/skills de forma nativa: solo hay que enlazar las reglas globales
  if has_agent codex;   then phase "Codex"; link "$AG/AGENTS.md" "$CODEX_DIR/AGENTS.md"; item add "AGENTS.md es un enlace al núcleo"; item add "skills: las lee de ~/.agents/skills"; done_phase; fi
  if has_agent copilot; then phase "Copilot CLI"; link "$AG/AGENTS.md" "$COPILOT_DIR/copilot-instructions.md"; item add "copilot-instructions.md es un enlace al núcleo"; item add "skills: las lee de ~/.agents/skills"; done_phase; fi
  if has_agent devin;   then phase "Devin"; link "$AG/AGENTS.md" "$DEVIN_DIR/AGENTS.md"; item add "AGENTS.md es un enlace al núcleo"; done_phase
    info "Devin: también lee ~/.claude/CLAUDE.md; si ves reglas duplicadas, quita uno de los dos."; fi
  if has_agent cursor;  then phase "Cursor"
    item add "skills: las lee de ~/.agents/skills"
    if cursor_rule_set; then item keep "regla de usuario ya configurada"; else
      item warn "falta la regla de usuario (Cursor no la guarda en un fichero)"
      todo "Cursor: añade en Settings → Rules → User Rules una regla con este texto: «Al empezar, lee y aplica ~/.agents/AGENTS.md y, bajo demanda, ~/.agents/rules/»"
    fi
    done_phase
    has_agent claude && info "Cursor: también lee ~/.claude/skills, así que puede listar las skills dos veces (con el mismo contenido)."
  fi
fi

# ------------------------------------------------------------------ proyecto
if [ -n "$PROJECT" ]; then
  [ -d "$PROJECT" ] || { echo "No existe la ruta de proyecto: $PROJECT" >&2; exit 1; }
  PNAME="$(basename "$PROJECT")"
  [ "$PROJECT_ONLY" -eq 1 ] && title "Orca Multiagent Kit v${VERSION}" "proyecto $(short "$PROJECT")$([ "$DRY" -eq 1 ] && echo ' · simulación')"
  phase "Proyecto $PNAME"
  INSTALLED="$(cat "$AG/AGENT_KIT_VERSION" 2>/dev/null || true)"
  if [ "$PROJECT_ONLY" -eq 1 ] && [ "$INSTALLED" != "$VERSION" ]; then
    if [ -n "${OMK_CLI:-}" ]; then FIX="omk install"; else FIX="./install.sh"; fi
    todo "Instalación global: en ~/.agents hay ${INSTALLED:-una versión sin instalar} y este kit es v${VERSION}. Ejecuta «${FIX}» para tener las skills orca y kit-init."
  fi
  OV=""
  for f in "$PROJECT/CLAUDE.md" "$PROJECT/AGENTS.md"; do [ -f "$f" ] && OV="$OV$(extract_overrides "$f")
"; done
  OV="$(printf '%s' "$OV" | awk 'NF && !seen[$0]++')"
  for f in AGENTS.md CLAUDE.md; do [ -f "$PROJECT/$f" ] && snapshot "$PROJECT/$f"; done
  [ -f "$PROJECT/AGENTS.md" ] && HADAG=1 || HADAG=0

  TMP="$(mktemp)"; [ -f "$PROJECT/AGENTS.md" ] && strip_blocks "$PROJECT/AGENTS.md" > "$TMP"
  { if [ -n "$OV" ]; then OV="$OV" awk '/^-$/ && !d {print ENVIRON["OV"]; d=1; next} {print}' "$SRC/templates/AGENTS.md"; else cat "$SRC/templates/AGENTS.md"; fi
    [ -s "$TMP" ] && { printf '\n'; cat "$TMP"; }; true; } | write_file "$PROJECT/AGENTS.md"
  REST="$(mktemp)"; [ -f "$PROJECT/CLAUDE.md" ] && strip_blocks "$PROJECT/CLAUDE.md" > "$REST"
  { cat "$SRC/templates/CLAUDE.md"; [ -s "$REST" ] && { printf '\n'; cat "$REST"; }; true; } | write_file "$PROJECT/CLAUDE.md"
  if [ "$HADAG" -eq 1 ]; then item add "AGENTS.md actualizado (tu contenido se conserva)"; else item add "AGENTS.md creado"; fi
  [ -n "$OV" ] && item add "overrides del proyecto movidos a AGENTS.md"
  item add "CLAUDE.md importa AGENTS.md"
  grep -q '[^[:space:]]' "$REST" && todo "$PNAME: CLAUDE.md tiene reglas propias que solo ve Claude. Pide al agente «inicializa el proyecto» para pasarlas a AGENTS.md y que las vean todos."
  rm -f "$TMP" "$REST"
  for f in STACK.md ORCHESTRATION.md orca.yaml .worktreeinclude; do
    if [ -e "$PROJECT/$f" ]; then item keep "$f ya existía: no se toca"; else run cp "$SRC/templates/$f" "$PROJECT/$f"; item add "$f creado"; fi
  done
  if [ ! -e "$PROJECT/.claude/settings.json" ] && has_agent claude; then run mkdir -p "$PROJECT/.claude"; run cp "$SRC/templates/claude-settings.json" "$PROJECT/.claude/settings.json"; item add ".claude/settings.json creado"; fi
  if [ -d "$PROJECT/.specify" ]; then
    EXT="$PROJECT/.specify/extensions.yml"
    if grep -q 'speckit.orca.implement' "$EXT" 2>/dev/null; then item keep "spec-kit: el hook de orquestación ya estaba activo"
    elif command -v specify >/dev/null 2>&1; then
      SKX="$AG/speckit-ext/orca"; [ -f "$SKX/extension.yml" ] || SKX="$SRC/speckit-extension/orca"
      if (cd "$PROJECT" && run specify extension add --dev "$SKX") >/dev/null 2>&1; then item add "spec-kit: extensión orca instalada (hook before_implement)"
      else item warn "spec-kit: «specify extension add» ha fallado"; todo "$PNAME: no se pudo activar el hook de spec-kit. Pide al agente «inicializa el proyecto» y lo añadirá."; fi
    elif [ ! -e "$EXT" ]; then
      # mismo formato que escribe 'specify extension add'
      printf '%s\n' 'installed:' '- orca' 'settings:' '  auto_execute_hooks: true' 'hooks:' '  before_implement:' '  - extension: orca' \
        '    command: speckit.orca.implement' '    enabled: true' '    optional: false' '    priority: 10' \
        '    description: "Orquestacion multiagente: reparte las user stories si compensa"' | write_file "$EXT"
      item add "spec-kit: hook before_implement creado en .specify/extensions.yml"
    else
      item warn "spec-kit: hay extensions.yml y no está el comando specify"
      todo "$PNAME: pide al agente «inicializa el proyecto» para añadir el hook de spec-kit sin romper tu extensions.yml."
    fi
  else
    item keep "sin spec-kit (.specify/): no hace falta hook"
  fi
  if ! grep -qxF '.work/' "$PROJECT/.gitignore" 2>/dev/null; then
    if [ "$DRY" -eq 1 ]; then item dry "añadir .work/ a .gitignore"; else printf '\n# Orca Multiagent Kit: briefs e informes de runs multiagente\n.work/\n' >> "$PROJECT/.gitignore"; fi
    item add ".work/ añadido a .gitignore"
  fi
  done_phase
fi

if [ -n "$PROJECT" ] && [ "$PROJECT_ONLY" -eq 0 ]; then footer both; elif [ -n "$PROJECT" ]; then footer project; else footer global; fi
