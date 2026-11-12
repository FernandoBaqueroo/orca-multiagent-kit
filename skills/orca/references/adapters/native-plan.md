# Adaptador: plan nativo del agente

## Cuándo se usa
En cuanto el usuario aprueba el plan o dice «implementa el plan», **antes de la primera edición** (puerta de reparto, `~/.agents/AGENTS.md` §6). En Claude Code lo recuerda además el hook `PostToolUse` sobre `ExitPlanMode` de `.claude/settings.json`; en Antigravity y el resto no hay hook: manda la regla.
- Si el plan ya trae la sección `Reparto` (la escribe quien planifica), parte de su veredicto y de su tabla: compruébalos contra el repo y sigue en `SKILL.md` §2–§3.
- Si no la trae, haz ahora `SKILL.md` §1 con los pasos del plan.
- Si el contexto se ha vaciado al aprobar, el plan está en el fichero que el agente guardó (Claude Code lo escribe en disco antes de pedir la aprobación): léelo de ahí.

## Claude Code (modo plan)
El plan aprobado está en la conversación (salida de plan mode). Pasos:
1. Extrae los pasos numerados. Cada grupo de pasos que produce un incremento verificable = una unidad.
2. Los ficheros que el plan menciona → `write`/`read`. Si el plan no los menciona, búscalos (grep/glob) antes de asignar; no los inventes.
3. Persiste el plan original en `.work/runs/<run>/source-plan.md` para que no se pierda al compactar el contexto.

## Antigravity (artefactos de planificación)
Antigravity genera `implementation_plan.md` y `task.md` como artefactos de la conversación.
1. Pide al usuario que los adjunte o los copie, o léelos si están en el workspace. No asumas su ruta interna.
2. `implementation_plan.md` → secciones "Proposed Changes" agrupadas por componente: cada componente = candidata a unidad; los ficheros `[NEW]`/`[MODIFY]` → `write`.
3. `task.md` → checklist; las tareas sin marcar del componente van a `goal`/`notes`.
4. "Verification Plan" → `verify` + `acceptance`.

## Común
- Un plan nativo suele estar escrito para ejecución secuencial por un solo agente: revisa con especial cuidado los solapes de `write` antes de declarar paralelismo.
- Si el plan es corto (≤3 pasos, una capa) ⇒ secuencial (`ORCA: secuencial — <motivo>`), no repartas.
