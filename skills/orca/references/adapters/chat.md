# Adaptador: prompt de chat o ticket

Un prompt suelto rara vez trae lo que un worker necesita. Este adaptador lo convierte en un brief bueno antes de repartir.

## 1. Completa los huecos (sin preguntar lo deducible)
Para cada hueco, primero intenta deducirlo del repo; solo si cambia el resultado y no se puede deducir, pregunta. Máximo **una** pregunta con hasta 3 sub-puntos.
| Hueco | Dónde deducirlo |
|---|---|
| Qué ficheros/capa | grep/glob del dominio que nombra el usuario |
| Criterio de éxito | tests existentes, contratos, comportamiento actual |
| Comandos de verificación | `STACK.md` §3 |
| Restricciones | `STACK.md` §6, `ORCHESTRATION.md` |
| Fuera de alcance | lo que el usuario no ha pedido y está al lado |

## 2. Reescribe la petición como brief
Antes de dividir, escribe en `.work/runs/<run>/request.md`:
```
Objetivo: <qué existe al terminar>
Contexto: <por qué, para quién>
Restricciones: <stack, límites, decisiones cerradas>
Hecho cuando: <criterios observables>
Fuera de alcance: <...>
ASSUMPTION: <cada supuesto tomado>
```
Muestra al usuario solo `Objetivo`, `Hecho cuando` y los `ASSUMPTION:` (≤6 líneas). Si los corrige, ajusta.

## 3. Divide
- Por capa (datos / API / UI) si las capas tienen contrato claro entre ellas: primero el contrato (tipos, endpoint, esquema) en `U0`, luego capas en paralelo.
- Por funcionalidad vertical si las funcionalidades son independientes.
- Si no se divide limpio ⇒ una sola unidad, `ENGINE: inline`.

## Ticket (GitHub/Linear/Jira)
Igual, tomando título → `goal`, descripción y criterios del ticket → `acceptance`, id del ticket → `source`. La rama del worker usa el id del ticket (`feat/<ticket>-<slug>`, `60-git-workflow.md`).
