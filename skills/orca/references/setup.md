# Preparar la orquestación de un repo

Genera o actualiza `ORCHESTRATION.md`, `orca.yaml`, `.worktreeinclude` y `.work/` en `.gitignore`, y comprueba `~/.agents/models.md`. Al terminar no queda ningún `TODO:` en el entorno de worktree: un worktree nuevo debe poder probar en local.

## Procedimiento
1. **Requisito**: `STACK.md` rellena. Si falta o es la plantilla vacía, ejecuta `csr-stack` primero. Normalmente lo hace `kit-init`.
2. **Detecta**:
   - Gestor de paquetes y dirs pesados regenerables: `node_modules`, `.next/cache`, `.turbo`, `.venv`, `target/`… → candidatos a `sharedDirectories`.
   - Ficheros de entorno: `.env*` gitignorados que existan en el checkout y `.env.example`. Van a `.worktreeinclude` **todos los de desarrollo** que la app necesita para arrancar (`.env`, `.env.local`, `.env.development.local`…). Para decidir si uno es de desarrollo mira solo los **nombres** de sus claves y a qué apunta el nombre del fichero; no copies ni muestres valores.
   - Instalación: el comando `install` de `STACK.md` §3 y si el gestor permite compartir dependencias por symlink sin riesgo (un lockfile igual en todas las unidades).
   - Rama padre y remoto: rama por defecto de `origin` (`git symbolic-ref --short refs/remotes/origin/HEAD`) y si el equipo integra en otra (`develop`).
   - Proveedores activos: CLIs de agente instalados (`claude`, `agy`, `codex`…) y, con Orca, los agentes que tenga activados.
   - BD local: `docker-compose*.yml`, `supabase/config.toml`, URLs en `.env.example` → estrategia de BD por worktree.
   - Servidores de dev y su puerto por defecto → `PORT_BASE`.
   - Ficheros calientes (`95-multi-agent.md` §Solapes) que existan de verdad en el repo → lista `shared`.
   - Dominios sensibles: rutas de auth, permisos, pagos, dinero, fiscal, tenancy que existan de verdad → `ORCHESTRATION.md` §1.
   - Capas/monorepo (`apps/*`, `packages/*`, `frontend/`, `backend/`) → solo si alguna necesita una excepción de reparto.
   - spec-kit (`.specify/`), planes (`planes/`), Orca (`orca.yaml`).
3. **Escribe** desde las plantillas de `~/.agents/templates/` (las deja el instalador; si no existen, usa `templates/` del kit `Orca Multiagent Kit`):
   - `ORCHESTRATION.md` (preservando lo escrito a mano si ya existe). §3 con el setup **real**: ficheros que se copian, comando de instalación y comando de comprobación. Si el fichero existente tiene la tabla antigua «Agentes por capa», consérvala: vale como excepciones (`olimpo.md`).
   - `orca.yaml` con `worktree.sharedDirectories` — solo directorios que **existen y están en `.gitignore`** (Orca ignora los demás) — y `scripts.setup` con el comando de instalación si las dependencias no se comparten.
   - `.worktreeinclude` — solo ficheros gitignorados, rutas literales (sin globs).
   - `~/.agents/models.md`: si no existe, créalo desde `~/.agents/templates/models.md`. Para cada proveedor activo con orden `descubrir`, ejecútala, clasifica tú sus familias en niveles con evidencia (`olimpo.md` §Clasificar una familia nueva) y guarda los patrones; enseña el resultado en el reporte, sin preguntarlo. Si ya existe, no lo reescribas: solo añade el bloque de un proveedor activo que falte.
   - `.gitignore`: añade `.work/` si falta.
4. **Orca** (si está instalado): `orca status --json` debe dar `runtime.reachable: true`. Si `orca orchestration run-list --json` falla, la orquestación está desactivada: dilo en una línea (Settings → Experimental → Orchestration); las unidades usarán subagentes o worktrees a mano hasta que se active. Si faltan las skills `orca-cli`/`orchestration` en `~/.agents/skills`, propón `orca skills install --skill orca-cli --skill orchestration` (no lo ejecutes sin permiso: escribe en la configuración global).
5. **Pregunta** como máximo 3 cosas, en una tanda: proveedores activos (si no se deducen), nivel de autonomía (`manual` / `semi` / `auto`; propón `semi`) y si los workers pueden hacer commits locales. Límite de workers: 3 salvo que el usuario diga otra cosa.
6. **Reporta** en 2 líneas: qué se creó y qué quedó `TODO:`.

## Reglas
- Con Orca, propón fijar la base por defecto del repo al remoto (`orca repo set-base-ref --repo <selector> --ref origin/<padre>`), para que los worktrees creados a mano tampoco salgan de una rama local desfasada. No lo ejecutes sin permiso: cambia la configuración del repo en Orca.
- Nunca pongas en `.worktreeinclude` ficheros con credenciales de producción. Si el único `.env` tiene secretos reales: `RISK:` y propón `.env.development.local` sin secretos de producción.
- No toques `STACK.md` (es de `csr-stack`).
- `ORCHESTRATION.md` y `orca.yaml` se commitean (son del proyecto); `.work/` no.
