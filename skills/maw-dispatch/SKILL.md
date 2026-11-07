---
name: maw-dispatch
description: Coordinador multiagente - toma las unidades de maw-brief, ejecuta la ronda 0, reparte las rondas paralelas entre agentes (Claude, Antigravity u otros) en worktrees separados usando Orca, subagentes nativos o worktrees manuales, y recoge los informes. Usar despues de maw-brief cuando hay unidades paralelizables.
---

# maw-dispatch — Repartir y supervisar

Precondición: `.work/runs/<run>/units.md` existe (`maw-brief`). Si no, ejecuta `maw-brief` primero.

## 1. Prepara la base
1. `git status` limpio en el checkout principal. Si no: `BLOCKED: hay cambios sin commitear` (no los stashees por tu cuenta).
2. Ejecuta las unidades `round: 0` tú mismo y pasa `csr-gate`. La ronda 1 necesita un commit base: pide autorización de commit **una vez para todo el run** (vale también para los commits de integración) y haz el commit de la U0.
3. Anota `base: <sha>` en `.work/runs/<run>/run.md`.

## 2. Elige motor y lee solo su guía
| ENGINE | Guía |
|---|---|
| `orca` | `references/engine-orca.md` |
| `subagents` | `references/engine-subagents.md` |
| `manual` | `references/engine-manual.md` |
Asignación de agente por unidad: campo `agent` de la unidad → si es `any`, `ORCHESTRATION.md` §Agentes → si no existe, alterna proveedores.

## 3. Construye el mensaje de despacho
Cada worker recibe **todo** en el mensaje (no rutas al checkout principal):
```
UNIT: U2 — <título>                RUN: <run-id>   BASE: <sha>
Eres un worker MAW. Carga la skill `maw-worker` y cúmplela.
<bloque completo de la unidad, tal cual está en units.md>
Reglas del proyecto: STACK.md y AGENTS.md/CLAUDE.md de tu worktree.
Shared (no tocar salvo los listados en tu unidad): <lista de ORCHESTRATION.md>
Puerto para servidores de dev: <PORT_BASE + n>
Entrega: informe con el formato de maw-worker por el canal del motor.
```

## 4. Lanza la ronda y supervisa
- Lanza todas las unidades de la ronda; máximo el límite de `ORCHESTRATION.md` (por defecto 3).
- Mientras corren: no edites ficheros que estén en el `write` de un worker activo.
- Preguntas de workers: respóndelas si la respuesta está en spec/plan/notes; si es decisión de producto, pásala al usuario literal, una por mensaje.
- Worker sin informe en el doble del tiempo esperado, o en bucle: lee su salida, decide reintentar (mismo agente o el otro) o marcar `BLOCKED:`.

## 5. Recoge
Por cada informe: guárdalo en `.work/runs/<run>/reports/<unit>.md` y valida:
- `outcome: succeeded` y tabla de gates sin `FAIL`.
- Ficheros tocados ⊆ `write` de la unidad. Si hay ficheros fuera ⇒ `RISK:` y se revisan en `maw-integrate`.
Al cerrar la ronda: `maw-integrate` para esa ronda, y solo después la siguiente ronda (parte del nuevo commit integrado).

## Estado al usuario (una tabla al final de cada ronda, nada más)
```
run 20261107-recargas · ronda 1
unit | agente      | estado     | gates | ficheros
U1   | claude      | succeeded  | PASS  | 6
U2   | antigravity | failed     | FAIL test (2) | 4
BLOCKED: U2 pide decidir si importe mínimo es 5 € o 10 €
```
