# Motor: subagentes nativos

Un solo proveedor, sin Orca. Más barato de montar; menos visibilidad.

## Claude Code
- Lanza un subagente por unidad con la herramienta de agentes/tareas del entorno, con **aislamiento en worktree** si está disponible (opción de worktree/isolation). Sin aislamiento, dos subagentes comparten checkout ⇒ solo paralelo si sus `write` son disjuntos **y** no ejecutan instaladores, migraciones ni servidores; en caso contrario, secuencial.
- Prompt del subagente = mensaje de despacho completo (`maw-dispatch` §3).
- El informe es el mensaje final del subagente: exígelo con el formato de `maw-worker`.
- Agent Teams / modos de varios agentes del producto sirven igual; las reglas de `write` y `shared` no cambian.

## Antigravity
- Usa el Agent Manager: una conversación/agente por unidad, cada uno en su propio worktree o workspace. Si el entorno no crea worktrees, créalos tú con `engine-manual.md` §1 y abre cada agente sobre su carpeta.
- Pega el mensaje de despacho como primer mensaje del agente.
- Recoge el informe del final de cada conversación.

## Común
- Límite práctico: 3 subagentes simultáneos.
- Los subagentes no ven tu conversación: todo el contexto va en el despacho.
- Al terminar, la integración es igual: `maw-integrate`.
