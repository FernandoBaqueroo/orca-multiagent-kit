# ORCHESTRATION.md — Cómo se reparte el trabajo entre agentes
> La lee la skill `orca` (coordinador) antes de repartir trabajo. Generar o actualizar: «inicializa el proyecto» (`kit-init`).
> Complementa a `STACK.md`; no repite sus comandos.
> Aquí va solo lo propio de **este** proyecto. Qué rol hace cada unidad y con qué nivel de modelo lo decide la skill (`references/olimpo.md`); qué modelo es cada nivel está en `~/.agents/models.md`. No escribas nombres de modelos aquí.

## 0. Autonomía
- Nivel: semi        <!-- manual | semi | auto -->
  - manual: confirmas el plan de rondas, cada ronda, cada merge y la limpieza
  - semi: confirmas el plan de rondas, el merge final y la limpieza (recomendado)
  - auto: solo confirmas el merge final y la limpieza
- Nunca se mergea a la rama por defecto, se hace push ni se borran worktrees o ramas sin confirmación, en ningún nivel.

## 1. Reparto
- Proveedores activos: claude, antigravity
- Dominios sensibles de este proyecto (rol Ariadna, nivel alto, revisión cruzada):
  - Instalación y escritura en la configuración global del usuario: `install.sh`, `bin/setup.js`, `bin/sync.js`, `bin/backup.js`, `bin/hooks.js`
  - Descarga y actualización del kit (cadena de suministro): `scripts/get.sh`, `bin/fetch.js`, `bin/update.js`
  - Hooks y permisos de agentes: `hooks/`, `templates/claude-settings.json`
  - Publicación: `.github/workflows/release.yml`, `scripts/build-release.sh`, `scripts/build-exe.js`
  - Contratos entre agentes (cambiarlos es MAJOR): `skills/orca/references/units.md`, `skills/orca/references/worker-contract.md`
- Excepciones al reparto por roles (vacío = se aplica `olimpo.md` tal cual):
  | Unidad, capa o ruta | Rol / proveedor fijado | Motivo |
  |---|---|---|
  | | | |
- Roles propios del proyecto (opcional; mismas columnas que `olimpo.md`):
  | Rol | Trabajo | Nivel | Revisión | Guardarraíl |
  |---|---|---|---|---|
  | | | | | |
- Máximo de workers simultáneos: 3
- Commits locales de workers: sí
- Revisión cruzada (otro proveedor revisa el diff): unidades L y sensibles
- Reintentos automáticos por unidad: 1
- Presupuesto por unidad: por talla (S 15 min · M 60 min · L dividir)

## 2. Shared — ficheros que solo toca una unidad por ronda o el coordinador
```
VERSION
package.json
CHANGELOG.md
README.md
core/AGENTS.md
install.sh
site/index.html
assets/banner.svg
orca-plugin/orca-plugin.json
bin/omk.js
scripts/check.sh
templates/claude-settings.json
```
`VERSION`, `package.json`, la cabecera de `core/AGENTS.md`, el pie de `site/index.html`, `CHANGELOG.md` y `assets/banner.svg` cambian juntos al subir de versión: los toca solo el coordinador.

## 3. Entorno de worktree
Todo worktree nuevo queda listo para probar en local antes de que el worker edite nada.
- Rama padre (destino del merge final): `main` (siempre se parte de `origin/main` actualizado)
- Ficheros de entorno que se copian (solo desarrollo): ninguno (el proyecto no usa `.env`)
- Dependencias: no hay que instalar nada. Los tipos generados del plugin (`orca-plugin/.orca`) se comparten por symlink vía `orca.yaml` (`sharedDirectories`)
- Base de datos: N/A
- `PORT_BASE`: N/A (no hay servidor de desarrollo)
- Setup de cada worktree: ninguno
- Comprobación de que el entorno arranca: `bash scripts/check.sh`

## 4. Flujo por defecto
- Entrada habitual: chat | plan por sprints
- Rama de integración: `feat/<feature>` o `fix/<tema>`, creada desde `origin/main` (nunca directo a `main`)
- Quién mergea: coordinador tras "sí" del usuario
- Limpieza tras el merge final: el coordinador enseña worktrees y ramas, y los borra tras "sí" del usuario
- Estado del run: `.work/runs/<run>/run.md` (lo escribe solo el coordinador; permite reanudar)

## 5. No delegar nunca
- Publicar una versión (subida de `VERSION`, release, npm), cambios en `release.yml`, cambios en permisos o hooks de `templates/claude-settings.json`.

## 6. Última actualización: 2026-11-16
