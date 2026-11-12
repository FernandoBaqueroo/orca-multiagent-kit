# Plugin de Orca — Orca Multiagent Kit

Integra el kit en la app [Orca](https://www.onorca.dev) (≥ 1.4.248). Qué hace, qué permisos pide y cómo instalarlo: [`docs/PLUGIN-ORCA.md`](../docs/PLUGIN-ORCA.md).

```sh
orca plugin validate . --json     # manifiesto
orca plugin test . --json         # src/*.test.ts con orca/testing
orca plugin inspect . --json      # qué aporta y qué acceso pide
```

- `src/kit.ts`: lógica pura (detección de despachos, mensajes de "comando no encontrado", resumen de agentes).
- `src/protocol.ts`: el contrato entre panel y worker (peticiones y eventos), declarado una vez.
- `src/worker.ts`: el worker que Orca carga; solo habla con Orca por su API. Oye cada hook y evento una vez y lo reparte a `src/worker/{notices,worktrees,history}.ts` (`src/worker/context.ts`).
- `src/worker/actions.ts`: sigue en su terminal el comando `omk` o el agente que se acaba de lanzar, hasta que termina.
- `src/panel.tsx`: el panel; las pestañas Avisos, Worktrees, Historial y la autonomía viven en `src/tabs/`, y la tarjeta de la acción en curso en `src/ui/action-card.tsx`.
- `src/panel.check.ts`: escenarios del panel para `orca plugin check` y `orca plugin shot . --scenario <nombre>`.
- `src/plan-card.ts`: valida el `plan.json` de la skill `orca` ([formato](../skills/orca/references/plan-card.md)).
- `assets/logos/`: los logos de agente que usa Orca, a 16 px (ver su README).
