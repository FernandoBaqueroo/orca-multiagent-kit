# Adaptador: plan en fichero (`planes/*.md`, `.plans/*.md`, salida de `maw-plan`)

## Formato esperado
El de `maw-plan` (sprints con `Archivos`, `Depende de`, `Paralelo`, `Criterios de aceptación`). Si el plan es del antiguo `planificar` (sin esos campos), dedúcelos de la descripción del sprint y márcalos con `ASSUMPTION:`.

## Mapeo
| Plan | Unidad |
|---|---|
| Sprint n | Unidad `Un` |
| `Archivos` (crear/modificar) | `write` |
| `Depende de: Sprint k` | `depends_on: [Uk]` |
| `Paralelo: sí` | candidato a misma ronda que sus hermanos (sujeto a solapes) |
| Criterios de aceptación | `acceptance` |
| Sprints marcados `✅ completado` | se excluyen |

## Diferencia clave con `planificar`
`planificar` exige aprobar el código de cada sprint en el chat antes de inyectarlo (human-in-the-loop por sprint). En MAW la aprobación se traslada al **diff**: el worker implementa en su worktree y el humano aprueba en `maw-integrate`. Si el usuario quiere conservar la aprobación previa por sprint, `ENGINE: inline` y ejecuta los sprints uno a uno con `maw-plan` modo 2.

## Tras integrar
`maw-integrate` marca el sprint como `✅ completado (merge <sha>)` en el fichero del plan. El worker nunca lo edita.
