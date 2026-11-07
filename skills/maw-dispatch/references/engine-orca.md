# Motor: Orca

Requisitos: Orca abierto, **Settings → Experimental → Orchestration** activado, skills `orca-cli` y `orchestration` instaladas (`npx skills add https://github.com/stablyai/orca --skill orchestration --global`).

## Regla de oro
Los flags de Orca cambian con cada versión. **Antes del primer comando de cada sesión** carga la guía de tu binario y úsala por encima de este fichero:
```
orca skills get orchestration
```
(Resolución del ejecutable: `ORCA_CLI_COMMAND` si existe; en Linux fuera de Orca, `orca-ide`; si no, `orca`.) No inventes flags; ante la duda, `--help`.

## Flujo de referencia (validar contra la guía)
```bash
orca status --json                                    # Orca vivo
orca orchestration run-create --objective "<run-id>: <objetivo>" --json
# por cada unidad de la ronda:
orca orchestration task-create --task-title "U2 <título>" --spec "<mensaje de despacho completo>" --json
orca orchestration worker-start --task <taskId> --worktree new-child --name <run>-u2 \
     --agent <claude|antigravity|codex|...> --setup run --json
# supervisión:
orca orchestration check --wait --types worker_done,escalation,question --timeout-ms 900000 --json
orca orchestration check --ack <deliveryId> ...        # procesar cada entrega y confirmar
# preguntas de workers: responder por el canal que indique la guía
# al terminar una unidad aceptada:
orca orchestration worker-release --dispatch <dispatchId> --json
```

## Notas
- `--worktree new-child` crea un worktree hijo del actual: parte del commit base de la ronda.
- `--setup run` ejecuta los hooks de setup del repo (install, `.worktreeinclude`, `orca.yaml`).
- Modelo por worker: `--model <id> --effort <nivel>` (solo agentes que lo soportan; ver guía). Úsalo para unidades `L` o de razonamiento duro.
- Antigravity como worker: solo en local (no por SSH).
- El informe del worker llega en el `--body` de `worker_done`; `--files-modified` sirve para validar `write`.
- Checkpoints visibles: pide a los workers `orca worktree set --worktree active --comment "<estado>" --workspace-status in-progress|in-review`.
- No uses `orca orchestration reset` si hay otro coordinador activo.
- Fallo de Orca a mitad de run: no relances todo; `task-list` para ver estado y continúa con `manual` para lo pendiente.
