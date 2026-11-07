# Preparar la orquestación de un repo

Genera o actualiza `ORCHESTRATION.md`, `orca.yaml`, `.worktreeinclude` y `.work/` en `.gitignore`.

## Procedimiento
1. **Requisito**: `STACK.md` rellena. Si falta o es la plantilla vacía, ejecuta `csr-stack` primero. Normalmente lo hace `kit-init`.
2. **Detecta**:
   - Gestor de paquetes y dirs pesados regenerables: `node_modules`, `.next/cache`, `.turbo`, `.venv`, `target/`… → candidatos a `sharedDirectories`.
   - Ficheros de entorno: `.env*` existentes y `.env.example`. Solo los de **desarrollo** van a `.worktreeinclude`.
   - BD local: `docker-compose*.yml`, `supabase/config.toml`, URLs en `.env.example` → estrategia de BD por worktree.
   - Servidores de dev y su puerto por defecto → `PORT_BASE`.
   - Ficheros calientes (`95-multi-agent.md` §Solapes) que existan de verdad en el repo → lista `shared`.
   - Capas/monorepo (`apps/*`, `packages/*`, `frontend/`, `backend/`) → filas de la tabla de agentes.
   - spec-kit (`.specify/`), planes (`planes/`), Orca (`orca.yaml`).
3. **Escribe** desde las plantillas de `~/.agents/templates/` (las deja el instalador; si no existen, usa `templates/` del kit `Orca Multiagent Kit`):
   - `ORCHESTRATION.md` (preservando lo escrito a mano si ya existe).
   - `orca.yaml` con `worktree.sharedDirectories` — solo directorios que **existen y están en `.gitignore`** (Orca ignora los demás).
   - `.worktreeinclude` — solo ficheros gitignorados, rutas literales (sin globs).
   - `.gitignore`: añade `.work/` si falta.
4. **Orca** (si está instalado): `orca status --json` debe dar `runtime.reachable: true`. Si `orca orchestration run-list --json` falla, la orquestación está desactivada: dilo en una línea (Settings → Experimental → Orchestration) y deja `Motor preferido: subagents`. Si faltan las skills `orca-cli`/`orchestration` en `~/.agents/skills`, propón `orca skills install --skill orca-cli --skill orchestration` (no lo ejecutes sin permiso: escribe en la configuración global).
5. **Pregunta** como máximo 3 cosas, en una tanda: reparto de agentes por capa, nivel de autonomía (`manual` / `semi` / `auto`; propón `semi`) y si los workers pueden hacer commits locales. Límite de workers: 3 salvo que el usuario diga otra cosa.
6. **Reporta** en 2 líneas: qué se creó y qué quedó `TODO:`.

## Reglas
- Nunca pongas en `.worktreeinclude` ficheros con credenciales de producción. Si el único `.env` tiene secretos reales: `RISK:` y propón `.env.development.local` sin secretos de producción.
- No toques `STACK.md` (es de `csr-stack`).
- `ORCHESTRATION.md` y `orca.yaml` se commitean (son del proyecto); `.work/` no.
