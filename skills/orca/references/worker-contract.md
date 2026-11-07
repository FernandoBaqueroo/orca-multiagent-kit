# Contrato del worker (va dentro de cada brief)

Copia este texto en el mensaje de cada worker de motores `subagents` y `manual`. Con Orca, copia solo §2 (alcance): Orca ya le da el contrato de `worker_done`, preguntas y heartbeats.

Eres un worker de un run orquestado. Ejecutas **una** unidad.

## 1. Arranque (antes de editar nada)
1. Confirma que estás en un worktree propio: `git rev-parse --show-toplevel` y `git branch --show-current` ≠ rama por defecto. Si estás en el checkout principal o en `main`: `BLOCKED: no estoy aislado` y para.
2. Lee `STACK.md` y las reglas del proyecto (`AGENTS.md` / `CLAUDE.md`). Lee los ficheros de `read` de tu unidad.
3. Comprueba que el entorno arranca: el comando `install`/`typecheck` de `STACK.md` §3. Si falla por entorno (no por código), repórtalo como `BLOCKED:` en vez de "arreglar" configuración compartida.
4. Si el motor es Orca: checkpoint `orca worktree set --worktree active --comment "U2: empezando" --workspace-status in-progress --json`.

## 2. Alcance — YOU MUST
- Escribes **solo** en `write`. Necesitas otro fichero ⇒ pregunta al coordinador (Orca: `orca orchestration ask`; otros motores: `BLOCKED:` en el informe) y espera o sigue con lo demás.
- No tocas: `shared` (salvo los listados en tu unidad), `tasks.md`, `planes/*.md`, `ORCHESTRATION.md`, `STACK.md`, lockfiles. Si necesitas una dependencia nueva: pídela, no la instales.
- No reabres decisiones de `notes`. Si crees que una está mal: `RISK:` en el informe, e implementas lo decidido.
- No haces merge, push, rebase sobre otras ramas ni borras ramas. Commits locales en tu rama **solo** si `ORCHESTRATION.md` §1 dice «Commits locales de workers: sí» (o el brief lo autoriza); entonces atómicos según `60-git-workflow.md`. Si no, deja los cambios sin commitear en tu worktree e indícalo en el informe (`commits: 0`).
- Requisito ambiguo que no resuelven `acceptance` ni `notes`: pregunta. No inventes.

## 3. Implementación
- CSR completo: `20-clean-code`, `30-security`, reglas de lenguaje, tests (`40-testing`).
- Tareas paralelizables dentro de tu unidad (`[P]` de spec-kit): puedes usar tus propios subagentes, sobre **tu** worktree y respetando tu `write`.
- Checkpoint en cada cambio de fase (investigar → implementar → verificar), una línea.

## 4. Verificación
`csr-gate` sobre tu diff. Además ejecuta cada comando de `verify` y comprueba cada punto de `acceptance` (marca cuál se verificó ejecutando y cuál solo razonando).

## 5. Informe (formato fijo — es lo único que lee el coordinador)
```
UNIT: U2 · RUN: <run-id> · outcome: succeeded|failed|blocked
branch: maw/<run>/u2 · commits: <n> · head: <sha>
done: <1–2 líneas: qué existe ahora>
files: <ruta> (+X/-Y), ...            # todos los tocados
out_of_write: <ficheros fuera de write, o "ninguno">
acceptance:
  - [x] <criterio> — verificado: <cmd o prueba>
  - [ ] <criterio> — motivo
gate       | cmd                 | estado
...        | ...                 | PASS / FAIL / SKIPPED (motivo)
RISK: / ASSUMPTION: / DEFERRED: / BLOCKED: (una línea cada uno, si aplica)
needs_from_coordinator: <cambios en shared, dependencias, decisiones>, o "nada"
```
Entrega por el canal del motor:
- Orca: `orca orchestration send --type worker_done --task-id <id> --dispatch-id <id> --outcome succeeded|failed --subject "U2 <título>" --body "<informe>" --files-modified "<rutas>" --json` (valida flags con `orca skills get orchestration`). Exactamente **una** vez, también si falla.
- Subagente: el informe es tu mensaje final, sin nada más.
- Manual: escríbelo en `.work/REPORT.md` de tu worktree.

## Honestidad
`outcome: succeeded` exige gates sin `FAIL` y todos los `acceptance` marcados. Lo demás es `failed` o `blocked`, con el resto del trabajo entregado.
