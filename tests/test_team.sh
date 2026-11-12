#!/usr/bin/env bash
# Pruebas de omk team sobre una copia de templates/ORCHESTRATION.md en una carpeta desechable.
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  ok    %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  FAIL  %s\n' "$1"; }
# Si falla, enseña lo que dijo omk: en CI es la única pista.
check(){ if eval "$2"; then ok "$1"; else bad "$1"; if [ -s "${OUT:-}" ]; then sed "s/^/        │ /" "$OUT"; fi; fi; }

command -v node >/dev/null || { echo "  SKIPPED (sin node)"; exit 0; }

W="$(mktemp -d "${TMPDIR:-/tmp}/omk-team.XXXXXX")"; trap 'rm -rf "$W"' EXIT
F="$W/ORCHESTRATION.md"
OUT="$W/out.txt"
export NO_COLOR=1

team()  { (cd "$W" && node "$ROOT/bin/omk.js" team "$@") </dev/null >"$OUT" 2>&1; }
fresh() { cp "$ROOT/templates/ORCHESTRATION.md" "$F"; }
said()  { grep -qF -- "$1" "$OUT"; }
has()   { grep -qF -- "$1" "$F"; }
line()  { grep -qxF -- "$1" "$F"; }
rows()  { grep -cF -- '| equipo (omk team) |' "$F" || true; }

echo "== omk team (enseñar)"
fresh
check "enseña la plantilla tal cual"                    'team && said "Proveedores activos  claude" && said "sin elegir" && said "ninguno: todos los elige el coordinador"'
check "sin ORCHESTRATION.md lo dice y sale con error"   'rm -f "$F" && ! team && said "no hay ORCHESTRATION.md" && said "kit-init"'

echo "== omk team set"
fresh
check "fija proveedores, revisión y roles"              'team set --provider claude --provider codex --cross todas --role casandra=codex --role clio=claude && said "Equipo guardado." && said "Casandra → codex, Clío → claude"'
check "conserva el comentario de la línea"              'has "- Proveedores activos: claude, codex        <!--"'
check "escribe la revisión cruzada elegida"             'has "- Revisión cruzada (otro proveedor revisa el diff): todas"'
check "las filas van en la tabla, sin el hueco vacío"   '[ "$(rows)" = 2 ] && has "  | Rol Casandra | Casandra / codex | equipo (omk team) |" && ! line "  | | | |"'
check "repetir lo mismo no cambia nada"                 'cp "$F" "$W/antes" && team set --role casandra=codex && said "Sin cambios" && cmp -s "$F" "$W/antes"'
check "auto quita un rol"                               'team set --role clio=auto && [ "$(rows)" = 1 ] && ! has "Rol Clío"'
check "--reset-roles deja solo los roles pedidos"       'team set --reset-roles --role argos=claude && [ "$(rows)" = 1 ] && has "Rol Argos" && ! has "Rol Casandra"'
check "sin roles vuelve el hueco de la plantilla"       'team set --reset-roles && [ "$(rows)" = 0 ] && line "  | | | |"'
check "no deja ficheros temporales"                     '[ "$(ls "$W" | grep -c "omk-")" = 0 ]'

echo "== excepciones del usuario y finales de línea"
fresh
sed -i.bak 's/^  | | | |$/  | src\/billing\/ | Ariadna \/ codex | facturación |/' "$F"
check "las excepciones propias no se tocan"             'team set --provider claude --provider codex --reset-roles --role proteo=claude && has "| src/billing/ | Ariadna / codex | facturación |" && said "Otras excepciones"'
fresh
node -e 'const fs=require("fs");const f=process.argv[1];fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/\n/g,"\r\n"))' "$F"
check "respeta CRLF"                                    'team set --role atlas=claude && [ "$(grep -c $'"'"'\r$'"'"' "$F")" = "$(wc -l < "$F" | tr -d " ")" ]'

echo "== omk team set --data (el panel del plugin)"
# El panel manda el equipo entero en JSON y base64url.
data() { node -e 'process.stdout.write(Buffer.from(process.argv[1]).toString("base64url"))' "$1"; }
HERMES='{"name":"Hermes","work":"Textos | <b>UI</b>","level":"bajo","review":"argos","guard":"","provider":"codex"}'
IRIS='{"name":"Iris","work":"Accesibilidad","level":"medio","review":"cross","guard":"WCAG AA","provider":null}'
# Los JSON van entre comillas simples: el bash 3.2 de macOS expande las llaves de un JSON con \" dentro de "$(…)".
# Se exportan porque los usan los check (eval), que ShellCheck no ve.
export TEAM='{"v":1,"providers":["claude","codex"],"cross":"todas","roles":{"casandra":"codex"},"custom":['"$HERMES,$IRIS"']}'
export EMPTY='{"v":1,"providers":["claude"],"cross":"nunca","roles":{},"custom":[]}'
fresh
check "escribe proveedores, revisión, roles y roles propios" 'team set --data "$(data "$TEAM")" && said "Roles propios        Hermes (bajo)" && has "- Revisión cruzada (otro proveedor revisa el diff): todas"'
check "los roles propios van a su tabla, sin | ni < >"      'line "  | **Hermes** | Textos b UI /b | bajo | Argos |  | <!-- omk team -->" && line "  | **Iris** | Accesibilidad | medio | \`cross\` | WCAG AA | <!-- omk team -->"'
check "un rol propio con proveedor lleva su excepción"      'line "  | Rol Hermes | Hermes / codex | equipo (omk team) |" && ! has "Rol Iris"'
check "repetir lo mismo no cambia nada"                     'cp "$F" "$W/antes" && team set --data "$(data "$TEAM")" && said "Sin cambios" && cmp -s "$F" "$W/antes"'
check "--role no borra los roles propios"                   'team set --role argos=claude && has "Rol Hermes" && has "**Iris**" && has "Rol Argos"'
check "un equipo sin roles propios los quita"              'team set --data "$(data "$EMPTY")" && ! has "omk team -->" && [ "$(rows)" = 0 ]'
cp "$F" "$W/antes"
ARIADNA='{"v":1,"providers":["claude"],"cross":"todas","roles":{},"custom":[{"name":"Ariadna","work":"x","level":"alto","review":"propia","guard":"","provider":null}]}'
HERMES_SIN_CODEX='{"v":1,"providers":["claude"],"cross":"todas","roles":{},"custom":['"$HERMES"']}'
IRIS_REPETIDA='{"v":1,"providers":["claude"],"cross":"todas","roles":{},"custom":['"$IRIS,$IRIS"']}'
MAYUSCULA='{"v":1,"providers":["Claude"],"cross":"todas","roles":{},"custom":[]}'
for bad in 'no-es-base64!' "$(data '{"v":2}')" "$(data 'no es json')" \
  "$(data "$ARIADNA")" "$(data "$HERMES_SIN_CODEX")" "$(data "$IRIS_REPETIDA")" "$(data "$MAYUSCULA")"; do
  check "rechaza --data ${bad:0:24}…"                      "! team set --data \"$bad\" && cmp -s \"\$F\" \"\$W/antes\""
done

echo "== entradas no válidas (no se escribe nada)"
fresh
cp "$F" "$W/antes"
for bad_args in "--provider Claude" "--provider cla.ude" "--cross aveces" "--role hefesto=claude" "--role casandra=gemini" "--role casandra" "--role casandra=a=b" "--rol x" ""; do
  # shellcheck disable=SC2086  # los argumentos se separan a propósito
  check "rechaza: set $bad_args"                          "! team set $bad_args && cmp -s \"\$F\" \"\$W/antes\""
done
check "un rol con un proveedor no activo explica por qué" 'team set --role casandra=gemini; said "no está entre los proveedores activos (claude)"'

echo "== omk team set --autonomy (§0)"
fresh
check "enseña el nivel de la plantilla"                 'team && said "Autonomía            semi"'
check "cambia el nivel y conserva el comentario"         'team set --autonomy auto && said "Autonomía            auto" && line "- Nivel: auto        <!-- manual | semi | auto -->"'
check "solo toca la línea de §0"                         'team set --autonomy semi && cmp -s "$F" "$ROOT/templates/ORCHESTRATION.md"'
cp "$F" "$W/antes"
for bad_level in "x" "Semi" "auto;rm" ""; do
  check "rechaza: --autonomy '$bad_level'"              "! team set --autonomy '$bad_level' && cmp -s \"\$F\" \"\$W/antes\""
done
check "una «- Nivel:» fuera de §0 no cuenta"             'printf "## 0. Autonomía\n- Otra cosa\n## 1. Reparto\n- Nivel: alto\n" > "$F" && ! team set --autonomy auto && said "«- Nivel:» de §0" && has "- Nivel: alto"'

printf '\n%s ok · %s fallos\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
