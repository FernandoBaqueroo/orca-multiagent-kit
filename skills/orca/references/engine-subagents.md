# Motor: subagentes nativos

Un solo proveedor, sin Orca. Más barato de montar; menos visibilidad.

## Antes de lanzar
- El worktree de un subagente suele crearse desde el `HEAD` actual del coordinador. Lanza cada ronda **desde la rama de integración**, con el commit base de la ronda en `HEAD` y el árbol limpio; si no, los workers parten de otro sitio.
- Unidad en `dispatching` en `run.md` antes de lanzar; `dispatched` con el nombre o id del subagente después (`ledger.md`).

## Claude Code
- Un subagente por unidad con la herramienta de agentes del entorno, con **aislamiento en worktree** (opción de worktree/isolation) y en segundo plano si está disponible: el entorno te avisa al terminar, no hace falta sondear.
- Sin aislamiento, dos subagentes comparten checkout ⇒ solo paralelo si sus `write` son disjuntos **y** no ejecutan instaladores, migraciones ni servidores; en caso contrario, secuencial.
- Prompt del subagente = mensaje de despacho completo (`SKILL.md` §5) con el contrato entero (`worker-contract.md`).
- El informe es el mensaje final del subagente. Su worktree y su rama los indica el entorno al terminar: anótalos en `run.md` y compruébalos con git antes de integrar.
- `rework`: si el entorno permite seguir hablando con un subagente terminado (por nombre o id), mándale la lista de cambios; si no, lanza uno nuevo sobre el mismo worktree con el brief original + la lista.
- Agent Teams / modos de varios agentes del producto sirven igual; las reglas de `write` y `shared` no cambian.

## Antigravity
- Usa el Agent Manager: una conversación/agente por unidad, cada uno en su propio worktree o workspace. Si el entorno no crea worktrees, créalos tú con `engine-manual.md` §1 y abre cada agente sobre su carpeta.
- Pega el mensaje de despacho como primer mensaje del agente.
- Recoge el informe del final de cada conversación.

## Codex, Cursor, Copilot
Usa su mecanismo de agentes en paralelo si crea un worktree por agente. Si no lo crea, trátalo como `engine-manual.md` (tú creas los worktrees, el agente trabaja en cada uno).

## Común
- Límite práctico: 3 subagentes simultáneos.
- Los subagentes no ven tu conversación: todo el contexto va en el despacho.
- Al terminar, la integración es igual: `integrate.md`.
