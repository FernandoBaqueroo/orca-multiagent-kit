# Tarjeta del plan (`plan.json`)

El plan de rondas de SKILL.md §3, en JSON, para que el plugin del kit en Orca lo enseñe como tarjeta en su pestaña Avisos, con «Sí» y una caja «Cambiar». El plugin lo lee al verte escribir el fichero (hook `agent.tool.after` de tu herramienta de escritura): no lo busca en disco, así que escríbelo **de una vez** con esa herramienta, no con un comando de shell.

## Cuándo y dónde
- Justo antes de enseñar la tabla del plan, en `.work/runs/<run>/plan.json` del checkout principal (`.work/` está en `.gitignore`).
- Si el plan cambia tras un «cambia X», vuelve a escribirlo entero con la versión nueva antes de enseñarla.
- En `auto` también: la tarjeta sale sin botones de confirmar y sirve de aviso.

## Formato (versión 1)
```json
{
  "version": 1,
  "run": "20261107-recargas",
  "source": "spec-kit 003-recargas",
  "autonomy": "semi",
  "base": "origin/main @ 1a2b3c4 (main local iba 3 commits por detrás)",
  "integration": "feat/003-recargas",
  "merge": "feat/003-recargas → main",
  "units": [
    { "round": 0, "id": "U0", "title": "setup + foundational", "role": "Hefesto", "level": "alto", "agent": "coordinador", "model": null, "resource": "inline", "files": "7", "depends": null },
    { "round": 1, "id": "U2", "title": "recarga con tarjeta (P1)", "role": "Ariadna", "level": "alto", "agent": "claude", "model": "<alto>", "resource": "worker", "files": "11", "depends": "U0" },
    { "round": 1, "id": "U2r", "title": "revisión cross de U2", "role": "Casandra", "level": "alto", "agent": "antigravity", "model": "<alto>", "resource": "worker", "files": "lectura", "depends": "U2" }
  ],
  "notes": ["modelos: nuevo en antigravity: <id> → nivel medio"]
}
```
| Campo | Qué lleva |
|---|---|
| `version` | `1` |
| `run` | El id del run, igual que en `run.md` |
| `source`, `autonomy`, `base`, `integration`, `merge` | Lo mismo que la cabecera y el pie de la tabla; `null` si no aplica |
| `units[]` | Una fila de la tabla por unidad, en orden de ronda. `agent`: id del agente (`claude`, `codex`…) o `coordinador`. `model`: el de `~/.agents/models.md`, o `null` si va el de por defecto. `files` y `depends`: texto tal cual sale en la tabla |
| `notes[]` | Las líneas sueltas del plan (`modelos:`, `ficha:`, avisos), una por elemento |

Límites que el plugin aplica (lo que pase se recorta o se descarta): 60 unidades, 10 notas, 200 caracteres por texto. Nada de secretos ni contenido de `.env`: es un fichero que se enseña.

## La respuesta
El plugin escribe en tu terminal `sí` o `cambia: <lo que pida el usuario>`, como si lo tecleara él. Trátalo igual que una respuesta del chat: `sí` es la confirmación 1; `cambia:` es un cambio del plan que se vuelve a enseñar.
