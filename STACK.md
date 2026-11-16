# STACK.md — Ficha técnica del proyecto
> Fuente de verdad del stack. El agente la lee ANTES de tocar nada.
> Regenerar o actualizar: skill `csr-stack` («actualiza el STACK»).

## 1. Identidad
- **Proyecto**: orca-multiagent-kit (v1.8.2; plugin de Orca v0.8.1)
- **Qué es** (1 línea): una sola fuente de reglas y skills (CSR + MAW) para Claude Code, Antigravity, Codex, Copilot y Cursor, con orquestación multiagente; se instala con `omk` o `install.sh`.
- **Tipo**: CLI + instalador + contenido (reglas, skills, plantillas) + plugin de Orca
- **Estado**: producción (publicado en npm y en GitHub Releases)
- **Usuarios y datos**: no hay datos personales ni dinero. Sí escribe en la configuración global del usuario (`~/.agents`, `~/.claude`, `~/.gemini`…) y descarga y ejecuta versiones del propio kit.
- **Nivel de seguridad objetivo (ASVS)**: TODO: confirmar (propuesto L1 + cadena de suministro)

## 2. Stack
| Capa | Tecnología | Versión exacta |
|---|---|---|
| Lenguaje(s) | JavaScript (CommonJS, sin transpilar) · Bash · TypeScript/TSX (plugin) · Python (solo `scripts/banner.py`) · Markdown | bash compatible con 3.2 (macOS) |
| Runtime | Node.js | `engines: >=18`; CI 20; ejecutable autónomo con 22 |
| Framework | N/A (CLI propio en `bin/`) | |
| UI | Panel del plugin de Orca (`orca-plugin/src/*.tsx`); web estática `site/index.html` | tipos de Orca en `orca-plugin/.orca/types` (generados) |
| Base de datos | N/A | |
| ORM / acceso a datos | N/A | |
| Gestor de paquetes | npm, **sin dependencias** (ni `dependencies` ni `devDependencies`) | |
| Build / bundler | `scripts/build-release.sh` (zip + `SHA256SUMS`) · `scripts/build-exe.js` (ejecutable autónomo, Node SEA) | |
| Tests | Scripts bash en `tests/` · `orca plugin test` (`src/*.test.ts` con `orca/testing`) | |
| Lint / format | `shellcheck -S warning` (solo en CI) · sin formateador | |
| Infra / despliegue | npm (Trusted Publishing) · GitHub Releases · GitHub Pages (`site/`) | |
| CI | GitHub Actions: `ci.yml`, `release.yml`, `pages.yml` | |

## 3. Comandos canónicos (el agente NO debe inventar otros)
```
install    : N/A (no hay dependencias que instalar)
dev        : N/A
build      : bash scripts/build-release.sh        # zip de release
build:exe  : npm run build:exe                    # ejecutable autónomo en dist/
test       : npm test                             # check.sh + todos los tests/test_*.sh salvo test_exe.sh
test:exe   : bash tests/test_exe.sh               # tras build:exe
test:plugin: orca plugin test . --json            # desde orca-plugin/
test:watch : N/A
coverage   : N/A
lint       : shellcheck -S warning install.sh scripts/*.sh tests/*.sh
check      : bash scripts/check.sh                # sintaxis, skills, versión coherente, rutas neutrales, manifiesto del plugin, tamaño del núcleo
format     : N/A
typecheck  : N/A
sec-scan   : N/A
deps-audit : N/A (sin dependencias)
migrate    : N/A
run-app    : node bin/omk.js
plugin     : orca plugin validate . --json        # desde orca-plugin/
banner     : python3 scripts/banner.py assets     # regenera los SVG al cambiar versión o nombre
```
En Windows los scripts `.sh` se ejecutan con Git Bash.

## 4. Mapa del repo
```
core/AGENTS.md        núcleo siempre cargado (≤ 200 líneas)
rules/                módulos bajo demanda y lang/
skills/<nombre>/      skills (SKILL.md + references/)
templates/            ficheros que se copian a cada proyecto y models.md
output-styles/        estilo de salida de Claude Code
hooks/orca-gate.cjs   puerta de reparto (hook de Claude Code)
bin/                  CLI omk (omk.js, setup, update, sync, team, run/…)
install.sh            instalador bash
speckit-extension/    extensión orca de spec-kit (hook before_implement)
orca-plugin/          plugin de Orca (manifiesto, src/, assets/)
scripts/              check, empaquetado, ejecutable, banner
tests/                pruebas bash y fixtures
site/, assets/, docs/ web, SVG generados y documentación
```

## 5. Convenciones del proyecto
- Estilo de nombres: ficheros en kebab-case; skills con `name` igual a su carpeta.
- Estructura de módulos: una regla, un sitio (el núcleo enuncia, `rules/` detalla, las skills describen procedimientos). Detalle largo de una skill en `references/`.
- Manejo de errores: bash con `set -Eeuo pipefail`; el CLI falla con mensaje y código de salida distinto de 0.
- Gestión de estado: ficheros (`.work/runs/<run>/`, `~/.agents/`).
- Formato de commits: Conventional Commits en español; ramas `feat/…`, `fix/…`, `docs/…`; un PR, un cambio lógico.
- Idioma de código/comentarios/UI: español (textos, comentarios y mensajes); identificadores en inglés.

## 6. Límites y prohibiciones específicas
- No tocar: `assets/*.svg` a mano (se generan con `scripts/banner.py`); `dist/` (salida de build).
- No añadir dependencias de: npm en general — el kit no tiene ninguna y debe seguir instalándose sin `npm install`.
- Decisiones cerradas (no reabrir): rutas neutrales `~/.agents/…` (nunca `~/.claude/rules` ni `~/.gemini/rules`); ningún nombre de modelo en `core`, `rules`, `skills` ni `templates` (solo niveles `alto|medio|bajo`); `core/AGENTS.md` ≤ 200 líneas; el formato de unidad y el contrato del worker son contratos estables (cambiarlos es MAJOR).
- Restricciones duras del producto: `install.sh` compatible con bash 3.2 (sin arrays asociativos ni `sed -i`); `$VAR` nunca pegado a un carácter no ASCII (usa `${VAR}`); funciona en macOS, Linux y Windows.

## 7. Seguridad del proyecto
- Datos sensibles que se manejan: ninguno propio; toca la configuración global de los agentes del usuario.
- Dónde viven los secretos: no hay. La publicación en npm usa Trusted Publishing (sin tokens).
- Modelo de autenticación/autorización: N/A.
- Amenazas principales (3): (1) cadena de suministro — `scripts/get.sh`, `bin/fetch.js` y `bin/update.js` descargan y ejecutan el kit; (2) inyección de instrucciones en reglas, skills, plantillas y hooks que luego obedecen los agentes; (3) el instalador sobrescribe o corrompe configuración del usuario (`settings.json`, `AGENTS.md`).
- Auditoría obligatoria en cambios que toquen: `install.sh`, `scripts/get.sh`, `bin/fetch.js`, `bin/update.js`, `bin/setup.js`, `bin/hooks.js`, `hooks/`, `templates/claude-settings.json`, `.github/workflows/release.yml`.

## 8. Rendimiento
- Presupuestos: `core/AGENTS.md` ≤ 200 líneas (se carga en cada mensaje); los hooks de Claude Code responden dentro de su `timeout` (5 s).
- Puntos calientes conocidos: N/A

## 9. Módulos CSR activos
Siempre: `20-clean-code`, `30-security`, `50-done-gate`.
Lenguaje: `lang/typescript` (también para el JavaScript de `bin/`), `lang/shell`, `lang/react` (panel del plugin), `lang/python` (solo `scripts/banner.py`)
Extra: `40-testing`, `75-reliability`, `80-supply-chain`, `31-security-audit`, `32-ai-security` (define agentes, skills y hooks), `90-docs-comments`
Desactivados para este proyecto (con motivo): `70-performance` (sin servidor ni rutas calientes)

## 10. Estado actual
- En curso: rama `fix/inicializar-un-clic`
- Bloqueado por: —
- Deuda técnica conocida: `package-lock.json` sin versionar en el checkout, generado con la versión 1.6.0 (el repo no versiona lockfile porque no hay dependencias)
- Última actualización de esta ficha: 2026-11-16
