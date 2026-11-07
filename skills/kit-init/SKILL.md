---
name: kit-init
description: Inicializa o migra un proyecto al Orca Multiagent Kit con un solo prompt - crea o actualiza AGENTS.md y CLAUDE.md desde las plantillas, detecta el stack (csr-stack), prepara la orquestacion multiagente, activa el hook de spec-kit para que /speckit.implement reparta el trabajo y deja .work/ ignorado. Usar con "inicializa el proyecto", "prepara este repo", "kit-init", al abrir un repo sin AGENTS.md o STACK.md, o con un AGENTS.md/CLAUDE.md con bloques CSR antiguos.
---

# kit-init — Proyecto listo en un prompt

No necesita terminal ni el instalador: copia desde `~/.agents/templates/`. Si esa carpeta no existe: `BLOCKED: Orca Multiagent Kit no está instalado globalmente (./install.sh)`.

## 1. Diagnóstico (solo lectura)
Comprueba y anota en una línea cada uno:
- `AGENTS.md`: falta | tiene bloque `AGENTS:BEGIN project` | tiene bloque antiguo `CSR:`/`MAW:` | contenido propio sin bloque.
- `CLAUDE.md`: igual. Es correcto si solo contiene el bloque con `@AGENTS.md`.
- `STACK.md`: falta | plantilla sin rellenar (campos vacíos, `| | |`) | rellena.
- `ORCHESTRATION.md`, `orca.yaml`, `.worktreeinclude`, `.gitignore` con `.work/`.
- Ficheros de otras herramientas que conviven: `.specify/` (spec-kit), `PRODUCT.md`/`DESIGN.md` (impeccable), `planes/`, `.cursor/rules/`, `.agents/rules/`, `.github/copilot-instructions.md`. No se tocan; se tienen en cuenta.

## 2. Reglas del proyecto
1. `AGENTS.md`: inserta al principio el bloque de `~/.agents/templates/AGENTS.md`. Si había un bloque antiguo `CSR:BEGIN project`, **migra** sus líneas de "Overrides de este proyecto" a la sección del bloque nuevo y elimina el bloque antiguo. Conserva todo el contenido que no esté en bloques.
2. `CLAUDE.md`: debe quedar con el bloque de `~/.agents/templates/CLAUDE.md` (`@AGENTS.md`). Si tenía reglas propias fuera de bloques, **no las borres**: proponlas como overrides en `AGENTS.md` (una pregunta) para que las vean todos los agentes.
3. No crees ficheros de reglas por agente (`GEMINI.md`, `.cursor/rules/…`): todos leen `AGENTS.md`.

## 3. Stack
- Si `STACK.md` falta o es plantilla: ejecuta `csr-stack` (detecta lenguajes, frameworks, comandos reales y riesgos; pregunta como máximo 3 cosas).
- Si está relleno: no lo toques; solo avisa (`RISK:`) si sus comandos no coinciden con el manifiesto.

## 4. Orquestación
Sigue `~/.agents/skills/orca/references/setup.md` (`ORCHESTRATION.md` con su nivel de autonomía, `orca.yaml`, `.worktreeinclude`, `.work/` en `.gitignore`). Añade a la lista `shared` los ficheros de contexto de otras herramientas que existan: `PRODUCT.md`, `DESIGN.md`, `.specify/memory/constitution.md`.
Agrupa sus preguntas con las de `csr-stack` en **una sola tanda** (máximo 4 en total).

## 5. spec-kit (si existe `.specify/`)
Activa la implementación orquestada: el hook `before_implement` de la extensión `orca`.
1. Si existe el CLI `specify`: `specify extension add --dev ~/.agents/speckit-ext/orca`.
2. Si no, añade el hook a mano en `.specify/extensions.yml` (créalo si no existe; conserva lo que haya):
   ```yaml
   installed:
   - orca
   hooks:
     before_implement:
     - extension: orca
       command: speckit.orca.implement
       enabled: true
       optional: false
       priority: 10
       description: "Orquestación multiagente: reparte las user stories si compensa"
   ```
   El comando lo resuelve la skill global `speckit-orca-implement`.
3. Comprueba que `/speckit.implement` lo verá: la skill `speckit-implement` del proyecto debe mencionar `hooks.before_implement`. Si es una versión antigua sin hooks: `RISK:` y propón actualizar spec-kit.

## 6. Cierre
No hagas commit sin permiso. Reporta:
```
kit-init · <proyecto>
AGENTS.md   | creado / migrado (overrides: N) / ya ok
CLAUDE.md   | @AGENTS.md
STACK.md    | detectado: <stack en 1 línea> · TODO: <n>
ORCHESTR.   | agentes: <reparto> · shared: <n> ficheros · autonomía: <nivel>
spec-kit    | hook before_implement: activo / no aplica
convive con | spec-kit · impeccable · …
commit sugerido: chore: inicializar Orca Multiagent Kit (AGENTS, STACK, ORCHESTRATION)
```
