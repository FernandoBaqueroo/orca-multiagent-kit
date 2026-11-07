# Cómo contribuir

Gracias por querer mejorar **Orca Multiagent Kit**. Este documento explica cómo está organizado el proyecto y qué se espera de un cambio.

## Principios (no negociables)

1. **Una regla, un sitio.** Cada norma se enuncia en un único fichero. El núcleo (`core/AGENTS.md`) enuncia; los módulos de `rules/` detallan; las skills describen procedimientos. Nunca copies una regla en dos sitios.
2. **Rutas neutrales.** Reglas y skills usan `~/.agents/…`. Nada de `~/.claude/rules` ni `~/.gemini/rules`: eso lo resuelve el instalador.
3. **El núcleo es caro.** `core/AGENTS.md` se carga en cada mensaje de cada agente. Límite: 200 líneas. Si algo no hace falta siempre, va a `rules/` o a una skill.
4. **Lo que un linter puede imponer no se escribe aquí.** Estas reglas son para lo que ninguna herramienta verifica.
5. **Contratos estables.** El formato de unidad (`skills/orca/references/units.md`) y el contrato del worker (`references/worker-contract.md`) se usan entre agentes. Si cambias un campo, cámbialo en los dos lados y súbelo como cambio MAJOR.

## Estructura

| Ruta | Contenido |
|---|---|
| `core/AGENTS.md` | Núcleo siempre cargado |
| `rules/` | Módulos bajo demanda y `lang/` |
| `skills/<nombre>/SKILL.md` | Skills en formato estándar (frontmatter `name` + `description`) |
| `templates/` | Ficheros que se copian a cada proyecto |
| `install.sh` | Instalador (bash 3.2 compatible: sin arrays asociativos ni `sed -i`) |
| `tests/`, `scripts/` | Pruebas, comprobaciones y empaquetado |
| `assets/` | SVG del README, generados con `scripts/banner.py` |

## Antes de abrir un PR

```bash
bash scripts/check.sh          # sintaxis, skills, versión, rutas, tamaño del núcleo
bash tests/test_install.sh     # instalador en un $HOME desechable
```

Si cambias la versión o el nombre, regenera los SVG: `python3 scripts/banner.py assets`.

### Añadir una skill
1. `skills/<nombre>/SKILL.md` con `name` igual a la carpeta y una `description` que diga **cuándo** usarla (≤1024 caracteres, sin `<` ni `>`).
2. Añádela a `KIT_SKILLS` en `install.sh` y al router (§7) de `core/AGENTS.md`.
3. Detalle largo en `skills/<nombre>/references/`, no en el `SKILL.md`.

### Añadir una regla
Un fichero nuevo en `rules/`, una fila en `rules/00-router.md` (disparador y coste aproximado) y, solo si de verdad hace falta siempre, una línea en el router del núcleo.

## Commits y ramas

[Conventional Commits](https://www.conventionalcommits.org/es/v1.0.0/), como en `rules/60-git-workflow.md`: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`, `ci:`. Ramas `feat/…`, `fix/…`, `docs/…`. Un PR, un cambio lógico.

## Versionado

[SemVer](https://semver.org/lang/es/):
- **MAJOR**: cambia la estructura de `~/.agents`, el formato de unidad o de informe, o la migración exige pasos manuales.
- **MINOR**: nuevas skills, reglas, agentes soportados u opciones del instalador.
- **PATCH**: correcciones y mejoras de texto que no cambian el comportamiento esperado.

## Publicar una versión (mantenedores)

1. Actualiza `VERSION`, `package.json`, la cabecera de `core/AGENTS.md` y mueve `[Unreleased]` a `[X.Y.Z] - AAAA-MM-DD` en `CHANGELOG.md`.
2. `python3 scripts/banner.py assets && bash scripts/check.sh`.
3. Commit `chore(release): vX.Y.Z` en una rama y abre un PR.
4. Al fusionarlo, el workflow **Release** se lanza solo (detecta el cambio de `VERSION`): comprueba que coincide con `package.json`, ejecuta las pruebas, crea la release `vX.Y.Z` con el zip y `SHA256SUMS` y publica en npm con Trusted Publishing (sin tokens).
5. Si una versión ya publicada necesita repetirse, lánzalo a mano: *Actions → Release → Run workflow* con el tag.

## Conducta

Este proyecto sigue el [Código de conducta](CODE_OF_CONDUCT.md).
