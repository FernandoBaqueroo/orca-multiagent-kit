# Adaptador: plan en fichero (`planes/*.md`, `.plans/*.md`, salida de `plan.md`)

**Cuándo se usa**: «implementa/ejecuta/sigue `planes/x.md`» (o un plan pegado o adjunto) con ≥2 sprints pendientes, antes de la primera edición (puerta de reparto, `~/.agents/AGENTS.md` §6). «Comienza el Sprint N» es un solo entregable: va por `plan.md` modo 2, sin repartir.

## Formato esperado
El de `plan.md` (sprints con `Archivos`, `Depende de`, `Paralelo`, `Criterios de aceptación`). Si el plan es del antiguo `planificar` (sin esos campos), dedúcelos de la descripción del sprint y márcalos con `ASSUMPTION:`.

## Mapeo
| Plan | Unidad |
|---|---|
| Sprint n | Unidad `Un` |
| `Archivos` (crear/modificar) | `write` |
| `Depende de: Sprint k` | `depends_on: [Uk]` |
| `Paralelo: sí` | candidato a misma ronda que sus hermanos (sujeto a solapes) |
| Criterios de aceptación | `acceptance` |
| Sprints marcados `[completado]` | se excluyen |

## Diferencia clave con `planificar`
`planificar` exige aprobar el código de cada sprint en el chat antes de inyectarlo (human-in-the-loop por sprint). En MAW la aprobación se traslada al **diff**: el worker implementa en su worktree y el humano aprueba en la integración (`integrate.md`). Si el usuario quiere conservar la aprobación previa por sprint, secuencial (motor `inline`) y ejecuta los sprints uno a uno con `plan.md` modo 2.

## Tras integrar
la integración (`integrate.md`) marca el sprint como `[completado] (merge <sha>)` en el fichero del plan. El worker nunca lo edita.
