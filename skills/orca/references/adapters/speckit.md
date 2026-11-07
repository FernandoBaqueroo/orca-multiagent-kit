# Adaptador: spec-kit → unidades

**Si vienes del hook `before_implement`** (el usuario escribió `/speckit.implement`): ya estás en la sesión del coordinador. No vuelvas a invocar `/speckit.implement` ni lo pidas a los workers. Al terminar, todas las tareas integradas quedan `[x]` y el flujo de implement solo valida. Si decides «secuencial», no toques nada: implement sigue solo.

**Run a medias**: si hay un `.work/runs/*/run.md` con `status: active` e `input: speckit specs/<esta feature>`, reanúdalo (`ledger.md` §Reanudar) en vez de planificar de nuevo. Las tareas ya `[x]` no cuentan; las de unidades `dispatched` tampoco se vuelven a repartir.

Precondición: existen `spec.md`, `plan.md` y `tasks.md` en `specs/<feature>/`. Si falta `tasks.md`: `BLOCKED: ejecuta /speckit.tasks primero`. Recomendado haber pasado `/speckit.analyze` sin hallazgos CRITICAL.

## Lectura de tasks.md
Formato de línea: `- [ ] T014 [P] [US2] Descripción con ruta/al/fichero.ts`
- `T###` → id de tarea (se conserva en `source`).
- `[P]` → paralelizable **dentro** de su fase. No implica worker propio.
- `[USn]` → user story. Sin etiqueta = Setup, Foundational o Polish.
- Rutas en la descripción → candidatas a `write`.
- Tareas ya marcadas `[x]` se excluyen.

## Mapeo
| spec-kit | Unidad MAW |
|---|---|
| Phase 1 Setup + Phase 2 Foundational | `U0`, `round: 0`, la hace el coordinador (o un único worker si es grande) |
| Cada `Phase n: User Story k` | Una unidad `Uk`, `size` según nº de tareas y ficheros |
| Phase final Polish / Cross-cutting | Última unidad, `round` = última + 1, tras integrar las stories |
| Tareas `[P]` dentro de una story | Se quedan en la misma unidad; el worker puede paralelizarlas con sus subagentes |

## Campos
- `goal`: el **Goal** de la fase de la story + su prioridad (P1/P2…).
- `acceptance`: los "Acceptance Scenarios" (Given/When/Then) de esa story en `spec.md`, más el "Independent Test" de la fase.
- `read`: `spec.md` (solo la sección de esa story), `plan.md`, `data-model.md`, `contracts/*` que cite la story, `.specify/memory/constitution.md`.
- `notes`: decisiones de `plan.md` y de `research.md` que afecten a la story; principios de la constitución que apliquen (por nombre).
- `source`: `speckit specs/<feature>/tasks.md#USk (T0xx–T0yy)`.
- `agent`: por capa dominante de la story según `ORCHESTRATION.md` §Agentes.

## Solapes típicos en spec-kit
Las stories se escriben "independientes", pero suelen compartir: router/rutas, esquema de BD, tipos de dominio, layout, navegación. Si dos stories escriben el mismo fichero:
1. Si es infraestructura común → muévelo a `U0` (proponlo como `ASSUMPTION:` y anótalo para `/speckit.tasks` futuros).
2. Si no → serializa por prioridad (P1 antes que P2).

## Reglas para el worker (se copian a `notes` de cada unidad)
- No editar `tasks.md`, `spec.md`, `plan.md` ni la constitución. El coordinador marca `[x]` al integrar.
- No ejecutar `/speckit.implement` completo: implementa solo las tareas `T0xx–T0yy` de su unidad, en el orden de `tasks.md` (tests antes si la spec los pide).
- Si encuentra un hueco en la spec: `ask`/`BLOCKED:` al coordinador, no inventa requisito.

## Tras integrar (lo hace la integración (`integrate.md`))
Marcar `[x]` las tareas de las unidades integradas en `tasks.md`, en un commit del coordinador: `chore(spec): marcar US2 completada`.
