# 95 — Trabajo multiagente: reglas de paralelismo

> El núcleo (`~/.agents/AGENTS.md` §6) enuncia las invariantes. Este fichero añade criterio y casos. No las repite.

## Cuándo paralelizar (y cuándo no)
Paraleliza solo si **todo** se cumple:
- Hay ≥2 unidades sin dependencia entre sí.
- Sus conjuntos de ficheros de escritura no se cortan (ver §Solapes).
- Cada unidad tiene ≥ ~15 min de trabajo. Por debajo, el coste de worktree + revisión + merge supera la ganancia.
- Puedes verificar cada unidad por separado (tests, build o comprobación visual concreta).
Si falla cualquiera: secuencial en un solo agente. Decláralo: `ENGINE: inline (motivo)`.

## Tamaño de unidad
| Talla | Orientación | Qué hacer |
|---|---|---|
| S | 1–3 ficheros, una capa | No merece worker propio: agrúpala con otra o hazla inline |
| M | 3–10 ficheros, una user story o sprint | Tamaño ideal de worker |
| L | >10 ficheros o varias capas | Divídela antes de delegar |

## Solapes de ficheros
1. Calcula, para cada unidad, `write` (ficheros que crea o modifica). Usa rutas exactas o globs estrechos.
2. Dos unidades con `write` en común ⇒ **no** van en la misma ronda. Opciones, por este orden:
   a) mover la parte común a una unidad previa "Foundational" que hace el coordinador;
   b) serializarlas (`depends_on`);
   c) preguntar al usuario (una pregunta) si la decisión cambia el diseño.
3. Ficheros calientes típicos (van a `shared` en `ORCHESTRATION.md`): esquemas y migraciones de BD, `routes`/router central, layout raíz, store global, `package.json` y lockfiles, config de i18n, tipos compartidos, `tailwind.config`, `.env.example`, y ficheros de contexto de otras herramientas (`PRODUCT.md`, `DESIGN.md` de impeccable; `.specify/memory/constitution.md`).

## Higiene de worktree
- Dependencias: `node_modules` y cachés se comparten por symlink (`orca.yaml` → `worktree.sharedDirectories`) o se instalan con el hook de setup. Nunca se commitean.
- Secretos: solo `.env` de **desarrollo** se copia a worktrees (`.worktreeinclude`). Credenciales de producción nunca entran en un worktree con agente en modo sin confirmación.
- Base de datos: dos workers que migran la misma BD local se pisan. Si una unidad migra, es la única de su ronda que lo hace, o cada worktree usa su propia BD/esquema (ver `ORCHESTRATION.md` §Entorno).
- Puertos: si los workers levantan servidor, cada uno usa el puerto que le asigna el brief (`PORT_BASE + n`).
- Rama base: todas las unidades de una ronda parten del mismo commit, que el coordinador fija y anota en el run.

## Motores (ENGINE)
| Motor | Cuándo | Cómo |
|---|---|---|
| `inline` | 1 unidad, o paralelizar no compensa | El agente actual la ejecuta |
| `subagents` | Paralelo con el mismo proveedor, sin Orca | Subagentes nativos del agente (Claude Code: Agent/Task con aislamiento en worktree; Antigravity: Agent Manager; Codex/Cursor/Copilot: los suyos) |
| `orca` | Paralelo con varios proveedores, o se quiere seguimiento en UI | `orca orchestration` (Run, tasks, workers). Requiere Orca abierto y orquestación activada |
| `manual` | Ninguno de los anteriores disponible | `git worktree add` por unidad + brief en `.work/` para que el humano abra un agente en cada uno |
Detección y comandos: skill `orca`, `references/engine-*.md`.

## Cuotas
- Reparte por proveedor según `ORCHESTRATION.md` §Agentes. Sin esa ficha: alterna proveedores para no agotar una sola cuota.
- Más de 3 workers simultáneos rara vez compensa: la revisión se convierte en el cuello de botella.

## Comunicación coordinador ↔ worker
- El brief viaja entero en el mensaje de despacho (no como ruta a un fichero del checkout principal: el worker no lo ve desde su worktree).
- El informe vuelve por el canal del motor: `worker_done --body` (Orca), mensaje final (subagentes), `.work/runs/<run>/reports/<unit>.md` (manual).
- El coordinador persiste briefs e informes en `.work/runs/<run>/` del checkout principal. `.work/` va en `.gitignore`.

## Conflictos al integrar
- Conflicto en fichero de `shared` ⇒ el coordinador lo resuelve a mano; no se relanza un worker para eso.
- Conflicto en código de unidad ⇒ merge de la de mayor prioridad primero; la otra se rebasa y se repite su `csr-gate`.
- Dos informes contradictorios sobre el mismo contrato (API, tipos) ⇒ `CONFLICT:` al usuario antes de mergear.
