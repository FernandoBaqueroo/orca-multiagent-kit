---
name: maw-setup
description: Prepara un repositorio para trabajo multiagente - genera o actualiza ORCHESTRATION.md (reparto de agentes, ficheros compartidos, entorno de worktree, limites), orca.yaml y .worktreeinclude, y anade .work/ al .gitignore. Usar al empezar a usar MAW u Orca en un repo, o cuando cambie su estructura.
---

# maw-setup — Ficha de orquestación del proyecto

Análogo a `csr-stack`: detecta lo que se puede leer, pregunta solo lo que no.

## Procedimiento
1. **Requisito**: `STACK.md` rellena. Si falta o es la plantilla vacía, ejecuta `csr-stack` primero. Para preparar el proyecto entero de una vez, el punto de entrada es `kit-init`.
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
4. **Pregunta** como máximo 3 cosas, en una tanda: reparto de agentes por capa, límite de workers simultáneos, si los workers pueden hacer commits locales.
5. **Reporta** en 2 líneas: qué se creó y qué quedó `TODO:`.

## Reglas
- Nunca pongas en `.worktreeinclude` ficheros con credenciales de producción. Si el único `.env` tiene secretos reales: `RISK:` y propón `.env.development.local` sin secretos de producción.
- No toques `STACK.md` (es de `csr-stack`).
- `ORCHESTRATION.md` y `orca.yaml` se commitean (son del proyecto); `.work/` no.
