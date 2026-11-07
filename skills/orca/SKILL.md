---
name: orca
description: Desarrollo orquestado con varios agentes en paralelo (Orca, subagentes o worktrees). Úsala por iniciativa propia cuando una tarea tenga 2 o más partes independientes de más de 15 minutos cada una (varias user stories, sprints, módulos o pantallas), cuando el usuario pida paralelo, Orca, worktrees, varios agentes o una carrera, y siempre que la invoque el hook before_implement de spec-kit. Decide si compensa, reparte, vigila e integra con solo dos confirmaciones.
---

# orca — Desarrollo orquestado de principio a fin

Un solo punto de entrada. El usuario no tiene que conocer fases ni comandos: tú decides si compensa repartir y, si compensa, llevas el ciclo completo. Detalle en `references/` (léelo solo cuando llegues a ese paso).

## 0. Configuración del run
Lee `./ORCHESTRATION.md` (si no existe, valores por defecto entre paréntesis):
- **Autonomía** (`semi`):
  | Nivel | Confirmaciones del usuario |
  |---|---|
  | `manual` | plan de rondas · cada ronda antes de lanzarla · cada merge |
  | `semi` | **1)** plan de rondas (autoriza también los commits del run) · **2)** merge final a la rama destino |
  | `auto` | solo **2)**; el plan se muestra pero no espera respuesta |
  En ningún nivel se mergea a la rama por defecto ni se hace push sin confirmación. Las decisiones de producto que surjan siempre se preguntan.
- **Agentes por capa**, **ficheros `shared`**, **máximo de workers** (3), **motor preferido**.

## 1. ¿Compensa? (decídelo en menos de un minuto)
Compensa si hay ≥2 unidades sin dependencia entre sí, con `write` disjuntos, de ≥15 min cada una y verificables por separado (`~/.agents/rules/95-multi-agent.md` §Cuándo paralelizar).
- **No compensa** ⇒ una línea `ORCA: secuencial — <motivo>` y:
  - si vienes del hook de spec-kit: termina aquí; `/speckit.implement` continúa normal;
  - si no: hazlo tú directamente y pasa `csr-gate`.
- **Compensa** ⇒ sigue. Declara: `ORCA: <N> unidades · <R> rondas · motor <orca|subagents|manual> · autonomía <nivel>`.

## 2. Unidades
Identifica la entrada y lee **solo** su adaptador:
| Entrada | Adaptador |
|---|---|
| spec-kit (`specs/<feature>/tasks.md`, o vienes del hook) | `references/adapters/speckit.md` |
| `planes/*.md` / `.plans/*.md` | `references/adapters/plan-file.md` |
| Plan nativo (modo plan de Claude, `implementation_plan.md` de Antigravity) | `references/adapters/native-plan.md` |
| Prompt de chat o ticket | `references/adapters/chat.md` (si es grande y vago, primero `references/plan.md`) |
| Mockup, diseño, documento | `references/adapters/artifact.md` |
Escribe las unidades con el formato de `references/units.md` en `.work/runs/<run>/units.md` (`.work/` en `.gitignore`).

## 3. Plan de rondas — confirmación 1 (`manual`, `semi`)
Una sola tabla, sin más prosa:
```
run 20261107-recargas · spec-kit 003-recargas · autonomía semi
ronda | unidad                     | agente      | ficheros | depende
0     | U0 setup + foundational    | coordinador | 7        | —
1     | U1 consulta de saldo (P1)  | claude      | 9        | U0
1     | U2 recarga con tarjeta (P1)| antigravity | 11       | U0
2     | U3 historial (P2)          | codex       | 6        | U1 (comparte layout)
merge final: feat/003-recargas → main (te lo pediré al terminar)
¿Lanzo? (sí / cambia X)
```
El «sí» autoriza los commits y merges **del run** en ramas de trabajo y en la rama de integración.

## 4. Base común (U0)
Haz tú la ronda 0, pasa `csr-gate`, crea la rama de integración (`feat/<feature>` si no existe) y haz commit. Todas las unidades parten de ese commit.

## 5. Lanzar la ronda
Motor: Orca si responde `orca status --json` y la orquestación está activada; si no, subagentes nativos; si no, manual. Lee solo su guía: `references/engine-orca.md` · `engine-subagents.md` · `engine-manual.md`.
Mensaje de despacho (todo dentro del mensaje: el worker no ve tu checkout ni tu conversación):
```
UNIT: U2 — <título>     RUN: <run>     BASE: <sha>     PUERTO DEV: <PORT_BASE+n>
<bloque completo de la unidad, tal cual está en units.md>
Shared (no tocar salvo los de tu unidad): <lista de ORCHESTRATION.md>
<contrato de references/worker-contract.md (con Orca, solo su §2 Alcance)>
```

## 6. Vigilar sin molestar
- Preguntas de workers: respóndelas tú si la respuesta está en spec, plan, `notes` o el código. Al usuario solo le llegan decisiones de producto, una por mensaje.
- Worker atascado (sin progreso en el doble del tiempo esperado) o `failed`: lee su salida y reintenta una vez (mismo agente o el otro proveedor). Si vuelve a fallar: la unidad queda `BLOCKED` y sigues con el resto.
- En Orca, deja el estado visible: `orca worktree set --worktree active --comment "<ronda X: n/m unidades>"`.

## 7. Integrar cada ronda
Sigue `references/integrate.md`: revisas cada diff contra su unidad, mergeas en la **rama de integración** (no en la de por defecto), pasas `csr-gate` sobre el conjunto y actualizas el estado (`[x]` en `tasks.md`, sprint completado en el plan). Después, la siguiente ronda parte del nuevo commit.

## 8. Cierre — confirmación 2
```
ORCA: hecho · 4/4 unidades · 2 rondas · 1h52m
rama: feat/003-recargas (+1.240/−310, 46 ficheros)
<tabla de gates del conjunto>
BLOCKED/DEFERRED: <si aplica>
¿Mergeo feat/003-recargas en main? (o abre PR)
```
Limpieza de worktrees y ramas de unidades integradas tras el merge (Orca: `worker-release`).
- **Si vienes del hook de spec-kit**: todas las tareas quedan marcadas `[x]`. Di en una línea «Tareas completadas por la orquestación; /speckit.implement solo debe validar y ejecutar sus hooks posteriores» y devuelve el control.

## Otros modos (cuando el usuario lo pide explícitamente)
- «carrera», «que lo intenten varios» ⇒ `references/race.md`.
- «solo planifica», «divide en sprints» ⇒ `references/plan.md` (plan sin ejecutar).
- «prepara la orquestación» ⇒ `references/setup.md` (normalmente lo hace `kit-init`).
