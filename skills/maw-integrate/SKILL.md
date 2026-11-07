---
name: maw-integrate
description: Cierra una ronda de trabajo multiagente - revisa el diff de cada worker contra su unidad, decide el orden de merge, integra con confirmacion del usuario, repasa la puerta de validez sobre el resultado combinado y actualiza el estado (tasks.md, plan, checkpoints, limpieza de worktrees).
---

# maw-integrate — Revisar, integrar, cerrar

Entrada: informes en `.work/runs/<run>/reports/` de la ronda actual.

## 1. Revisión por unidad (antes de mergear nada)
Para cada rama de worker, `git diff <base>...maw/<run>/<unit>` y comprueba:
1. **Alcance**: ficheros ⊆ `write`. Extra ⇒ ¿justificado en el informe? Si no, se revierte esa parte o vuelve al worker.
2. **Acceptance**: cada criterio verificado de verdad (comando o prueba citada). Marcado sin evidencia ⇒ trátalo como no hecho.
3. **Calidad**: criterios de bloqueo de `60-git-workflow.md` §Revisión (corrección, seguridad, pérdida de datos, contrato roto, falta de test). No bloquees por estilo que impone el formateador.
4. **Contratos entre unidades**: si dos unidades hablan entre sí (API ↔ UI, tipos), que coincidan.
Resultado por unidad: `accept` · `rework` (con lista concreta de cambios, de vuelta al mismo worker) · `discard`.
Opcional: en Orca, el usuario puede revisar con Annotate AI Diff y devolver comentarios al worker.

## 2. Orden de merge
Prioridad de la unidad (P1 antes que P2) → dependencias → la que menos `shared` toca primero.

## 3. Integrar — requiere confirmación
Presenta el plan de merge en una tabla y espera "sí" del usuario (ese «sí» es la autorización de commit que exige `60-git-workflow.md`). Si un worker no hizo commits, primero haz tú un commit atómico en su worktree con los cambios revisados (`feat(<ámbito>): <unidad>`). Luego, por unidad:
```bash
git switch <rama-integración o la rama del feature>
git merge --no-ff maw/<run>/<unit>
```
Conflicto ⇒ `95-multi-agent.md` §Conflictos. Nunca `--force`, nunca a la rama por defecto sin que el usuario lo pida.

## 4. Puerta sobre el resultado combinado
Si la ronda tocó UI y existe `impeccable`: `impeccable audit` sobre las vistas cambiadas (a11y, rendimiento, responsive) antes de los gates.
`csr-gate` completo tras mergear la ronda. Que cada unidad pasara sola no garantiza que pasen juntas. Fallo ⇒ arregla tú la integración (es trabajo del coordinador) y repite.

## 5. Actualizar estado (el coordinador es el único que escribe aquí)
- spec-kit: marcar `[x]` las tareas de las unidades integradas en `tasks.md`.
- plan: `[completado] (merge <sha>)` en el sprint de `planes/*.md`.
- Orca: `worker-release` de cada dispatch aceptado; comentario del worktree principal con el estado del run.
- `.work/runs/<run>/run.md`: ronda cerrada, sha resultante.

## 6. Limpieza — requiere confirmación
Worktrees y ramas de unidades integradas: borrado con `git worktree remove` + `git branch -d` (o el borrado de worktree de Orca). Unidades `discard`: confirmar explícitamente antes de borrar su rama.

## Reporte final del run
```
run 20261107-recargas · rondas: 2 · unidades: 4 (accept 3, rework 1→accept)
merge: <sha> en feat/003-recargas
<tabla de gates combinados>
DEFERRED: Polish (T030–T034) pendiente de nueva ronda
```
