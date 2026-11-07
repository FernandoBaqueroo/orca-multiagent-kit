---
description: "Decide si compensa implementar la feature en paralelo y, si compensa, la orquesta con varios agentes."
---

# speckit-orca-implement — Implementación orquestada desde spec-kit

Te ha invocado el hook `before_implement` (o el usuario directamente) en un proyecto con spec-kit.

1. Carga la skill **`orca`** y síguela con estas condiciones:
   - **Entrada**: spec-kit; la feature activa es la que resuelve `.specify/scripts/bash/check-prerequisites.sh --json --require-tasks --include-tasks` (`FEATURE_DIR`).
   - **Paso 1 (¿compensa?)** con las user stories pendientes de `tasks.md`. Las tareas ya marcadas `[x]` no cuentan.
   - **No** vuelvas a invocar `/speckit.implement` ni `/speckit-implement`: ya estás dentro de él.
2. Resultado, siempre en **una línea** al final:
   - `ORCA: secuencial — <motivo>. Continúa /speckit.implement.` → el flujo de implement sigue con su Outline normal.
   - `ORCA: orquestado — <n> tareas completadas en <r> rondas. /speckit.implement solo debe validar y ejecutar sus hooks posteriores.` → implement encontrará todas las tareas en `[x]`.
   - `ORCA: cancelado por el usuario. Continúa /speckit.implement en modo secuencial.` si en la confirmación 1 el usuario dice que no.
