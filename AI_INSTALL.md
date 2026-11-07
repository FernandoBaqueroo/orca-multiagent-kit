# AI_INSTALL.md — Instrucciones para una IA

Eres un agente (Claude Code, Antigravity, Codex, Copilot, Cursor, Devin u otro) y te han pedido **instalar Orca Multiagent Kit**, **migrar desde CSR/MAW v1** o **integrarlo en un proyecto**. `README.md` y `docs/MANUAL.md` son para humanos.

## 0. Principio
Una sola fuente: `~/.agents/` (núcleo `AGENTS.md`, `rules/`, `skills/`, `templates/`). Cada agente **apunta** ahí con un import o un enlace simbólico. Si te encuentras copiando reglas dentro de la carpeta de un agente, para: eso es lo que este kit elimina.

## 1. Reglas
- Solo escribes en: `~/.agents/`, las carpetas de configuración de los agentes detectados y el proyecto indicado.
- Todo lo que muevas o reemplaces va antes a `~/.agents/backups/<fecha>/` (el instalador ya lo hace).
- No modifiques skills de terceros (`orca-cli`, `orchestration`, `supabase`, spec-kit…) ni `~/.agents/rules/personal.md`.
- Nunca borres contenido de `CLAUDE.md`, `AGENTS.md` o `GEMINI.md` fuera de los bloques `<!-- CSR|MAW|AGENTS:BEGIN … :END -->`.
- No pongas rutas de un agente concreto (`~/.claude/rules`, `~/.gemini/rules`) en reglas o skills: usa `~/.agents/…`.

## 2. Instalación global / migración
1. `./install.sh --dry-run`. Enseña al usuario la lista de cambios y pide un «sí»: toca su configuración global.
2. `./install.sh` (o `--agents <lista>` si el usuario lo limita).
3. `./install.sh --verify`. Todo `OK`; cualquier `MAL` se corrige antes de terminar.
4. Reporta: agentes configurados, ruta del backup, los avisos que imprimió el instalador y el comando `--restore` para deshacerlo.

Sin shell disponible: replica `install.sh` por pasos, en este orden: (a) copia `core/AGENTS.md`, `rules/`, `skills/`, `templates/` y `output-styles/` a `~/.agents/`; (b) en `~/.claude/CLAUDE.md` sustituye los bloques CSR/MAW por `@~/.agents/AGENTS.md` dentro de un bloque `AGENTS`; (c) `~/.gemini/GEMINI.md`, `~/.codex/AGENTS.md` y `~/.copilot/copilot-instructions.md` → enlace a `~/.agents/AGENTS.md`; (d) skills enlazadas en `~/.claude/skills/` y `~/.gemini/config/skills/`; (e) saca de `~/.claude/rules/` y `~/.gemini/rules/` los ficheros de CSR/MAW (**Claude Code carga todo `~/.claude/rules/` en cada sesión**).

## 3. Proyecto
1. `./install.sh --project-only <ruta>`. Migra los overrides del bloque CSR antiguo a `AGENTS.md` y deja `CLAUDE.md` como `@AGENTS.md`.
2. Ejecuta la skill `kit-init`: migra las reglas, detecta el stack (`csr-stack`) y prepara la orquestación (`maw-setup`). Sin terminal, `kit-init` hace también el paso 1.
3. Si `CLAUDE.md` tenía reglas propias fuera del bloque, propón moverlas a `AGENTS.md` (sección *Overrides*) para que las vean todos los agentes. No lo hagas sin confirmación.
4. No hagas commit sin permiso. Se commitean `AGENTS.md`, `CLAUDE.md`, `STACK.md`, `ORCHESTRATION.md`, `orca.yaml`, `.worktreeinclude` y `.claude/settings.json`; `.work/` no.

## 4. Agente no soportado por el instalador
1. Busca en **su documentación oficial**: (a) fichero de instrucciones globales; (b) si admite imports (`@ruta`) o enlaces simbólicos; (c) directorio de skills globales y si ya lee `~/.agents/skills`.
2. Preferencia: lee `~/.agents/skills` de serie > enlace simbólico de su fichero global a `~/.agents/AGENTS.md` > import > (último recurso) una línea en sus ajustes: «Al empezar, lee y aplica ~/.agents/AGENTS.md».
3. Nunca copies el contenido del núcleo dentro del agente.
4. Si lo integras, añádelo a `install.sh` (detección + `link`) y a `--verify`, siguiendo el patrón de Codex.

## 5. Comprobación final (obligatoria)
```
prueba                                         | esperado                                   | estado
--verify                                       | todo OK                                    |
ls ~/.claude/rules ~/.gemini/rules             | sin ficheros de CSR/MAW                    |
grep -c 'CSR:BEGIN' ~/.claude/CLAUDE.md        | 0                                          |
nueva sesión: «¿dónde están tus reglas de seguridad?» | ~/.agents/rules/30-security.md      |
nueva sesión: «reparte las user stories de specs/x»   | MODE: spec, U0 + 1 unidad por story |
```

## 6. Qué no hacer
- Editar `~/.agents/AGENTS.md` para un proyecto concreto: eso va en el `AGENTS.md` del proyecto.
- Activar Orca, cambiar permisos de agentes o desactivar plugins sin que el usuario lo pida.
- Escribir comandos de Orca de memoria: la fuente es `orca skills get orchestration`.
- Copiar `.env` con secretos de producción a `.worktreeinclude` o a plantillas.
