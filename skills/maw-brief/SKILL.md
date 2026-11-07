---
name: maw-brief
description: Convierte cualquier entrada (prompt de chat, plan nativo de Claude o Antigravity, planes/*.md, spec-kit tasks.md, ticket, mockup o artefacto) en unidades de trabajo con un formato comun - objetivo, ficheros, dependencias, criterios de aceptacion y verificacion - listas para ejecutarse en paralelo o delegarse a otro agente.
---

# maw-brief — Entrada → unidades de trabajo

## Procedimiento
1. **Identifica la entrada** (la da `maw-route`, o detéctala con su tabla) y lee **solo** el adaptador correspondiente en `references/`:
   | Entrada | Adaptador |
   |---|---|
   | spec-kit | `references/adapter-speckit.md` |
   | `planes/*.md` o salida de `maw-plan` | `references/adapter-plan-file.md` |
   | plan nativo (Claude plan mode, Antigravity `implementation_plan.md`) | `references/adapter-native-plan.md` |
   | prompt de chat o ticket | `references/adapter-chat.md` |
   | mockup, diseño, documento, artefacto, Design Mode | `references/adapter-artifact.md` |
2. **Lee el contexto mínimo**: `STACK.md` (§3 comandos, §6 límites), `ORCHESTRATION.md` (§Shared, §Agentes) y los ficheros que las unidades van a tocar. No leas el repo entero.
3. **Genera las unidades** con el formato de abajo. Una unidad = un incremento verificable por sí solo.
4. **Calcula el grafo**: `depends_on` explícito + solapes de `write` (`95-multi-agent.md` §Solapes). Asigna `round` (0 = lo que hace el coordinador antes de repartir, 1 = primera ronda paralela…).
5. **Guarda** en `.work/runs/<run-id>/units.md` del checkout principal (`run-id` = `AAAAMMDD-<slug>`). Crea `.work/` si no existe y comprueba que está en `.gitignore`.
6. **Reporta** solo la tabla de rondas y los `RISK:` (ver §Salida).

## Formato de unidad (contrato — no cambiar nombres de campo)
```markdown
### UNIT: U2 — Endpoint POST /recargas
- source: speckit specs/003-recargas/tasks.md#US2 (T014–T019)
- goal: <1–2 frases: qué existe al terminar que antes no existía>
- write: [server/src/routes/recargas.ts, server/src/services/recarga.service.ts, server/tests/recargas.test.ts]
- read: [server/src/db/schema.ts, specs/003-recargas/contracts/recargas.yaml]
- shared: []                       # ficheros de la lista shared que necesita tocar (normalmente vacío)
- depends_on: [U0]
- round: 1
- size: M
- agent: claude | antigravity | any   # sugerencia; ORCHESTRATION.md §Agentes manda
- acceptance:
  - POST /recargas con importe válido devuelve 201 y persiste la recarga
  - importe ≤0 o tarjeta inexistente → 422 con código de error del contrato
- verify: [pnpm --filter server test recargas, pnpm --filter server typecheck]   # de STACK.md §3
- out_of_scope: [UI de recarga (U3), notificaciones]
- notes: <decisiones ya tomadas que el worker no debe reabrir>
```
Reglas del formato:
- `write` con rutas reales o globs estrechos (`src/features/recargas/**`). Nunca `src/**`.
- `acceptance` observable y comprobable. "Funciona bien" no vale.
- `verify` sale de `STACK.md` §3. Si un comando no existe: `N/A` + `RISK:`.
- `notes` lleva el contexto que el worker no puede deducir (decisiones de spec/plan, convenciones no escritas). Es lo que evita que el worker pregunte o reinvente.

## Unidad 0 (coordinador)
Todo lo que varias unidades necesitan y toca `shared` (esquema de BD, tipos compartidos, rutas centrales, dependencias nuevas) va a `U0`, `round: 0`. La hace el coordinador antes de repartir y hace commit; las rondas parten de ese commit.

## Salida (al usuario)
```
run: 20261107-recargas · entrada: speckit · unidades: 4
round | unidades        | paralelo
0     | U0 (setup+found)| coordinador
1     | U1, U2          | sí
2     | U3              | —   (depende de U1: comparte src/app/layout.tsx)
RISK: U2 sin test de integración en STACK.md §3
```
Después: `maw-dispatch`, salvo que el usuario quiera revisar las unidades antes.
