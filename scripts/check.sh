#!/usr/bin/env bash
# Comprobaciones estáticas del kit: sintaxis, skills, versiones y rutas neutrales.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
FAIL=0
err(){ printf '  FAIL  %s\n' "$1"; FAIL=1; }
ok(){ printf '  ok    %s\n' "$1"; }

echo "== sintaxis bash"
for f in install.sh scripts/*.sh tests/*.sh; do bash -n "$f" && ok "$f" || err "$f"; done

echo "== skills (frontmatter estándar SKILL.md)"
for f in skills/*/SKILL.md; do
  d="$(basename "$(dirname "$f")")"
  [ "$(sed -n '1p' "$f")" = "---" ] || { err "$f: sin frontmatter"; continue; }
  n="$(sed -n 's/^name: //p' "$f" | head -1)"
  desc="$(sed -n 's/^description: //p' "$f" | head -1)"
  [ "$n" = "$d" ] || err "$f: name '$n' no coincide con la carpeta"
  [ -n "$desc" ] || err "$f: sin description"
  [ "${#desc}" -le 1024 ] || err "$f: description > 1024 caracteres"
  case "$desc" in *'<'*|*'>'*) err "$f: description con < o >";; esac
done
ok "$(ls -d skills/*/ | wc -l | tr -d ' ') skills revisadas"

echo "== skills listadas en install.sh y en el núcleo"
for d in skills/*/; do s="$(basename "$d")"
  grep -Eq "^KIT_SKILLS=\"([^\"]* )?$s( |\")" install.sh || err "$s no está en KIT_SKILLS de install.sh"
  grep -q "\`$s\`" core/AGENTS.md || err "$s no está en el router de core/AGENTS.md"
done
ok "todas las skills están en install.sh y en el router"

echo "== versión coherente"
V="$(tr -d '[:space:]' < VERSION)"
echo "$V" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || err "VERSION no es SemVer: $V"
grep -q "v$V" core/AGENTS.md || err "core/AGENTS.md no menciona v$V"
grep -q "## \[$V\]" CHANGELOG.md || err "CHANGELOG.md no tiene la sección [$V]"
grep -q "V$V" assets/banner.svg 2>/dev/null || python3 - "$V" <<'EOF' || err "assets/banner.svg no corresponde a v$V (ejecuta scripts/banner.py assets)"
import sys,subprocess,tempfile,pathlib
d=tempfile.mkdtemp(); subprocess.run([sys.executable,'scripts/banner.py',d],check=True)
sys.exit(0 if pathlib.Path(d,'banner.svg').read_text()==pathlib.Path('assets/banner.svg').read_text() else 1)
EOF
ok "versión $V"

echo "== rutas neutrales (sin ~/.claude/rules ni ~/.gemini/rules en reglas y skills)"
# shellcheck disable=SC2088  # se busca el texto literal "~/", no una ruta
if grep -rnE '~/\.(claude|gemini)/rules' core rules skills templates output-styles >/dev/null; then
  # shellcheck disable=SC2088
  grep -rnE '~/\.(claude|gemini)/rules' core rules skills templates output-styles | sed 's/^/  /'; err "rutas específicas de un agente"
else ok "sin rutas específicas"; fi

echo "== tamaño del núcleo (≤ 200 líneas)"
n="$(wc -l < core/AGENTS.md | tr -d ' ')"; [ "$n" -le 200 ] && ok "$n líneas" || err "core/AGENTS.md tiene $n líneas"

[ "$FAIL" -eq 0 ] && echo "TODO OK" || { echo "HAY FALLOS"; exit 1; }
