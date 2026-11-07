---
name: maw-route
description: Decide como abordar una peticion de desarrollo - modo (directo, plan, spec, race, artifact) y motor (inline, subagentes, Orca, manual) - antes de empezar. Usar cuando la peticion tiene varios cambios, menciona plan, spec, sprint, tareas, paralelo, worktrees, Orca o varios agentes, o cuando no esta claro si conviene dividir el trabajo.
---

# maw-route — Elegir modo y motor

## 1. Detecta la entrada
| Señal | Entrada |
|---|---|
| Existe `specs/<feature>/tasks.md` o el usuario cita spec-kit / `/speckit.*` | `speckit` |
| Existe `planes/*.md` o `.plans/*.md`, o cita un sprint | `plan-file` |
| Hay un plan del modo plan nativo (Claude) o `implementation_plan.md` / `task.md` (Antigravity) en la conversación | `native-plan` |
| Adjunta mockup, captura, diseño, documento, artefacto o anotaciones de Design Mode | `artifact` |
| Issue o ticket (GitHub, Linear, Jira) | `ticket` |
| Solo texto en el chat | `chat` |

## 2. Elige el modo
| Modo | Cuándo | Qué sigue |
|---|---|---|
| `directo` | Un cambio lógico, claro, ≤ ~3 ficheros | Hacerlo + `csr-gate`. Fin de MAW |
| `plan` | Varios cambios relacionados, requisitos claros, sin decisiones de producto abiertas | `maw-plan` (o el plan nativo) → `maw-brief` → `maw-dispatch` |
| `spec` | Feature nueva, ambigüedad de requisitos, varias user stories, o el repo ya usa spec-kit | Flujo spec-kit hasta `tasks` + `analyze` → `maw-brief` → `maw-dispatch` |
| `race` | Bug difícil o causa desconocida, o decisión de diseño con 2–3 enfoques plausibles | `maw-race` |
| `artifact` | La entrada es visual o un documento y el criterio de éxito es "que quede como esto" | `maw-brief` (adaptador artifact) → `maw-dispatch` |
Desempate: el modo más ligero que cubra el riesgo. Ante la duda entre `plan` y `spec`: si hay que **decidir qué** construir, `spec`; si solo hay que decidir **cómo**, `plan`.

## 3. Elige el motor
Ejecuta las comprobaciones, no las supongas:
1. ¿Hay ≥2 unidades paralelizables según `95-multi-agent.md` §Cuándo paralelizar? No ⇒ `inline`.
2. ¿Orca disponible? `orca status --json` responde y la orquestación está activada ⇒ candidato `orca`.
3. ¿El reparto pide más de un proveedor (`ORCHESTRATION.md` §Agentes, o el usuario lo pide)? Sí y Orca disponible ⇒ `orca`. Sí y sin Orca ⇒ `manual`.
4. Un solo proveedor ⇒ `subagents` si el agente actual los tiene; si no, `orca` o `manual`.

## 4. Declara y continúa
Una línea, y sigue sin esperar salvo que el modo sea `spec` (sus gates de revisión son humanos):
```
MODE: plan · ENGINE: orca · ENTRADA: plan-file planes/recargas.md · UNIDADES: ~3
```
Pregunta solo si la elección cambia mucho el coste (por ejemplo `spec` frente a `directo`) y no hay forma de deducirla. Máximo una pregunta.

## Errores comunes
- Orquestar un cambio de 20 minutos. El reparto + revisión cuesta más que hacerlo.
- Elegir `race` para algo que se resuelve leyendo un stack trace.
- Saltarse `maw-brief` "porque el plan ya está claro": el plan no trae `write`, `shared` ni verificación por unidad.
