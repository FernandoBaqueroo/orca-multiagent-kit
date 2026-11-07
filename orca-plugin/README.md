# Plugin de Orca — Orca Multiagent Kit

Integra el kit en la app [Orca](https://www.onorca.dev) (≥ 1.4.248). Qué hace, qué permisos pide y cómo instalarlo: [`docs/PLUGIN-ORCA.md`](../docs/PLUGIN-ORCA.md).

```sh
orca plugin validate . --json     # manifiesto
orca plugin test . --json         # src/*.test.ts con orca/testing
orca plugin inspect . --json      # qué aporta y qué acceso pide
```

- `src/kit.ts`: lógica pura (detección de despachos, mensajes de "comando no encontrado", resumen de agentes).
- `src/worker.ts`: el worker que Orca carga; solo habla con Orca por su API.
