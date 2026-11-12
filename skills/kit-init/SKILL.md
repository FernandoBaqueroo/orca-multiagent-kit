---
name: kit-init
description: Inicializa o migra un proyecto al Orca Multiagent Kit con un solo prompt - crea o actualiza AGENTS.md y CLAUDE.md desde las plantillas, detecta el stack (csr-stack), prepara la orquestacion multiagente, activa el hook de spec-kit para que /speckit.implement reparta el trabajo, deja en .claude/settings.json los hooks de reparto de Claude Code y deja .work/ ignorado. Usar con "inicializa el proyecto", "prepara este repo", "kit-init", al abrir un repo sin AGENTS.md o STACK.md, o con un AGENTS.md/CLAUDE.md con bloques CSR antiguos.
---

# kit-init — Proyecto listo en un prompt

No necesita terminal ni el instalador: copia desde `~/.agents/templates/`. Si esa carpeta no existe: `BLOCKED: Orca Multiagent Kit no está instalado globalmente` (`omk setup`, o `./install.sh` desde la carpeta del kit).

## 1. Diagnóstico (solo lectura)
Comprueba y anota en una línea cada uno:
- `AGENTS.md`: falta | tiene bloque `AGENTS:BEGIN project` | tiene bloque antiguo `CSR:`/`MAW:` | contenido propio sin bloque.
- `CLAUDE.md`: igual. Es correcto si solo contiene el bloque con `@AGENTS.md`.
- `STACK.md`: falta | plantilla sin rellenar (campos vacíos, `| | |`) | rellena.
- `ORCHESTRATION.md`, `orca.yaml`, `.worktreeinclude`, `.gitignore` con `.work/`.
- `.claude/settings.json` (solo si el proyecto usa Claude Code: hay `.claude/` o `CLAUDE.md`, o es el agente que ejecuta esto): falta | sin hooks de reparto | con hooks de reparto (algún `command` contiene `[Orca Multiagent Kit]`).
- Ficheros de otras herramientas que conviven: `.specify/` (spec-kit), `PRODUCT.md`/`DESIGN.md` (impeccable), `planes/`, `.cursor/rules/`, `.agents/rules/`, `.github/copilot-instructions.md`. No se tocan; se tienen en cuenta.

## 2. Reglas del proyecto
1. `AGENTS.md`: inserta al principio el bloque de `~/.agents/templates/AGENTS.md`. Si había un bloque antiguo `CSR:BEGIN project`, **migra** sus líneas de "Overrides de este proyecto" a la sección del bloque nuevo y elimina el bloque antiguo. Conserva todo el contenido que no esté en bloques.
2. `CLAUDE.md`: debe quedar con el bloque de `~/.agents/templates/CLAUDE.md` (`@AGENTS.md`). Si tenía reglas propias fuera de bloques, **no las borres**: proponlas como overrides en `AGENTS.md` (una pregunta) para que las vean todos los agentes.
3. No crees ficheros de reglas por agente (`GEMINI.md`, `.cursor/rules/…`): todos leen `AGENTS.md`.

## 3. Stack
- Si `STACK.md` falta o es plantilla: ejecuta `csr-stack` (detecta lenguajes, frameworks, comandos reales y riesgos; pregunta como máximo 3 cosas).
- Si está relleno: no lo toques; solo avisa (`RISK:`) si sus comandos no coinciden con el manifiesto.

## 4. Orquestación
Sigue `~/.agents/skills/orca/references/setup.md` (`ORCHESTRATION.md` con su nivel de autonomía, proveedores activos, dominios sensibles y el setup real de worktree; `orca.yaml`; `.worktreeinclude`; `.work/` en `.gitignore`; y `~/.agents/models.md` si falta o le falta un proveedor activo). Añade a la lista `shared` los ficheros de contexto de otras herramientas que existan: `PRODUCT.md`, `DESIGN.md`, `.specify/memory/constitution.md`.
Agrupa sus preguntas con las de `csr-stack` en **una sola tanda** (máximo 4 en total).

## 5. spec-kit (si existe `.specify/`)
Activa la implementación orquestada: el hook `before_implement` de la extensión `orca`.
1. Si existe el CLI `specify`: `specify extension add --dev ~/.agents/speckit-ext/orca`.
2. Si no, añade el hook a mano en `.specify/extensions.yml` (créalo si no existe; conserva lo que haya):
   ```yaml
   installed:
   - orca
   settings:
     auto_execute_hooks: true
   hooks:
     before_implement:
     - extension: orca
       command: speckit.orca.implement
       enabled: true
       optional: false
       priority: 10
       description: "Orquestacion multiagente: reparte las user stories si compensa"
   ```
   El comando lo resuelve la skill global `speckit-orca-implement`.
3. Comprueba que `/speckit.implement` lo verá: la skill `speckit-implement` del proyecto debe mencionar `hooks.before_implement`. Si es una versión antigua sin hooks: `RISK:` y propón actualizar spec-kit.

## 6. Claude Code: `.claude/settings.json` y hooks de reparto (si el proyecto usa Claude Code)
Fuera de spec-kit no hay hook `before_implement`: en Claude Code lo suplen dos hooks de `~/.agents/templates/claude-settings.json` (`UserPromptSubmit`, y `PostToolUse` sobre `ExitPlanMode`) que recuerdan la puerta de reparto (`~/.agents/AGENTS.md` §6) en cada mensaje y al aprobar un plan.
1. No existe `.claude/settings.json` ⇒ cópialo entero de `~/.agents/templates/claude-settings.json`.
2. Existe sin hooks de reparto ⇒ añade a su clave `hooks` las entradas `UserPromptSubmit` y `PostToolUse` de la plantilla, tal cual. Conserva todo lo demás (permisos, otros hooks, otras claves); si ya hay entradas en esos eventos, añade las del kit al final de la lista. No toques `permissions`.
3. Ya los tiene ⇒ si el texto difiere del de la plantilla, sustituye solo esas dos entradas (las que contienen `[Orca Multiagent Kit]`).
4. Comprueba que el fichero sigue siendo JSON válido. No edites `.claude/settings.local.json` ni la configuración global del usuario (`~/.claude/settings.json`): esa la gestiona el instalador.
Otros agentes (Antigravity, Codex…): no se les crea ningún hook; les aplica la regla del núcleo.

## 7. Cierre
No hagas commit sin permiso. Reporta:
```
kit-init · <proyecto>
AGENTS.md   | creado / migrado (overrides: N) / ya ok
CLAUDE.md   | @AGENTS.md
STACK.md    | detectado: <stack en 1 línea> · TODO: <n>
ORCHESTR.   | proveedores: <activos> · sensibles: <n> · shared: <n> ficheros · autonomía: <nivel>
entorno     | copia: <ficheros .env> · install: <cmd> · comprobación: <cmd>
modelos     | ~/.agents/models.md: creado / ya ok / <proveedor> sin nivel <n>
spec-kit    | hook before_implement: activo / no aplica
claude      | .claude/settings.json: creado / hooks de reparto añadidos / ya ok / no aplica
convive con | spec-kit · impeccable · …
commit sugerido: chore: inicializar Orca Multiagent Kit (AGENTS, STACK, ORCHESTRATION)
```
