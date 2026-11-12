<!-- AGENTS:BEGIN project -->
# Reglas del proyecto

1. Lee `./STACK.md` antes de la primera edición de cada sesión: versiones, comandos y límites. Comandos: solo los de `STACK.md` §3; si falta uno, dilo, no lo inventes.
2. Aplican las reglas globales (`~/.agents/AGENTS.md`) y su router (`~/.agents/rules/`). Lee bajo demanda, no todo. Si tu agente no las tiene cargadas, léelas ahora.
3. Ningún cambio se da por terminado sin `~/.agents/rules/50-done-gate.md` y la tabla de gates.
4. Respuestas mínimas: resultado primero, ≤4 líneas de prosa, sin narrar herramientas. Detalle solo si se pide.
5. Trabajo multiagente: antes de la primera edición de un trabajo con ≥2 entregables separables (venga de un prompt, de un plan aprobado, de un plan en fichero, de un artefacto o de un ticket), carga la skill `orca` y, antes de editar, deja en el chat su veredicto en una línea `ORCA: …` (si reparte, con el plan de rondas, y espera la respuesta del usuario) (`~/.agents/AGENTS.md` §6); todo plan que escribas termina con una sección `Reparto`. Antes de repartir, lee `./ORCHESTRATION.md`. Una unidad = un worktree = una rama; los ficheros `shared` solo los toca una unidad por ronda; los workers no editan `tasks.md`, `planes/*.md`, `ORCHESTRATION.md`, `STACK.md`, lockfiles, ficheros generados ni migraciones ajenas, no mergean ni hacen push, y entregan informe. Briefs e informes en `.work/` (ignorado por git).

## Overrides de este proyecto
<!-- Solo lo que se desvía de las reglas globales. Si está vacío, mejor. -->
-
<!-- AGENTS:END -->
