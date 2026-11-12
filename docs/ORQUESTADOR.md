# Mejoras del orquestador (skill `orca` · MAW)

Este documento explica qué cambia en la orquestación multiagente, por qué, y cómo comprobarlo. Afecta a la skill `orca` y sus referencias, a `rules/95-multi-agent.md`, al hook de spec-kit y a la plantilla `ORCHESTRATION.md`.

**Tipo de cambio: MINOR.** Los contratos entre agentes (`units.md` y `worker-contract.md`) solo ganan campos **opcionales**; ningún nombre de campo cambia. Un worker o coordinador de la v1.1.0 sigue entendiendo los briefs e informes nuevos.

## Resumen

| # | Mejora | Ficheros |
|---|---|---|
| 1 | Reparto de papeles claro con la skill `orchestration` de Orca | `skills/orca/SKILL.md`, `references/engine-orca.md` |
| 2 | Motor Orca alineado con el CLI real (1.4.252): sin polling, DAG de tareas, gates, recuperación | `references/engine-orca.md` |
| 3 | Runs reanudables: estado del run en `.work/runs/<run>/run.md` | `references/ledger.md` (nuevo), `SKILL.md`, motores, adaptador spec-kit, hook |
| 4 | «¿Compensa?» con una cuenta, presupuestos por talla y límite de reintentos | `rules/95-multi-agent.md`, `SKILL.md`, plantilla |
| 5 | Integración más segura: alcance comprobado con git, ensayo de merge, revisión cruzada, revert de una unidad | `references/integrate.md` |
| 6 | Informe del worker verificable y autocomprobación de alcance | `references/worker-contract.md` |
| 7 | Confianza entre agentes: informes como entrada no confiable, sin secretos en briefs | `rules/95-multi-agent.md`, contrato, `units.md` |
| 8 | Coherencia entre motores y con spec-kit | motores, adaptadores, hook, test |

## 1. `orca` y `orchestration`: quién manda en qué

**Antes.** Las dos descriptions se solapaban («paralelo», «workers», «Orca»). Con las dos skills instaladas, el agente podía cargar la de Orca y lanzar workers sin el plan de rondas, sin `write`/`shared` y sin la integración del kit.

**Ahora.**
- La description de `orca` dice que es la **política** del kit (reparto, rondas, integración, reanudación) y que para la sintaxis de Orca se carga además `orchestration`.
- Para delegar una tarea suelta sin plan ni integración («que Codex revise esto»), la description remite a `orchestration`/`orca-cli`, que es lo que encaja.
- `engine-orca.md` lo deja escrito: en comandos y flags gana la guía de Orca; en alcance, merges y confirmaciones gana el kit.

## 2. Motor Orca alineado con el CLI real

Comprobado contra `orca skills get orchestration` y el `--help` de cada subcomando en Orca 1.4.252.

| Antes | Ahora | Por qué |
|---|---|---|
| Bucle `orca orchestration check --wait … --timeout-ms 900000` y `--ack` | Lanzar la ronda y **terminar el turno**; Orca despierta al coordinador. Nada de scripts con `check` | La guía actual lo prohíbe: un `check` consumido por un script es correo que el agente no ve. `--ack` ya no hace falta |
| `task-create --spec "<mensaje>"` | `task-create --spec-file .work/runs/<run>/briefs/<u>.md --deps '[…]'` | Sin problemas de comillas en briefs largos (PowerShell y bash). `--deps` monta el DAG con los `depends_on` de las unidades, y el plan entero queda visible en Orca |
| `worker-start --worktree new-child` sin base | `worker-start --worktree new-child --base-branch <rama de integración>` | Garantiza que cada worker parte del commit base de la ronda |
| Rama supuesta `maw/<run>/<unit>` | La rama se lee del recibo o de `orca worktree show` | La nombra Orca |
| Decisiones de producto solo en el chat | `gate-create` / `gate-resolve` sobre la tarea afectada | La decisión pendiente se ve en Orca y bloquea solo esa tarea |
| Reintento genérico | `worker-start --task <id> --retry-of <dispatch>` repitiendo `--worktree` y `--agent`; respeto del circuit breaker (3 arranques fallidos) | Así lo exige Orca; esquivarlo con otro Run o Task lo prohíbe su guía |
| Sin criterio para parar workers | `worker-stop`/`worker-abandon` solo con orden explícita del usuario; `stop_unknown` ⇒ `worker-show` | Silencio o timeout no prueban que un worker haya terminado |
| `worker-release` como única limpieza | `worker-release` tras integrar (los `new-child` se quedan abiertos), `worktree rm` tras el merge final, nunca `reset` | Comportamiento documentado de Orca: liberación automática solo en `current` |
| Vigilancia sin herramientas | `worktree ps`, `worker-list --run`, `worker-show` (`observation.agentWait`: el worker espera a un humano) | Detecta workers parados en un prompt de permisos |
| Con Orca, el brief solo llevaba §2 del contrato | Lleva §2, §4 y §5 | Sin §5 el `--body` de `worker_done` no tenía formato fijo y el coordinador no podía verificarlo |

## 3. Runs reanudables

**Antes.** El estado del run vivía en la conversación del coordinador. Si el contexto se compactaba, el agente se cerraba u Orca caía, no había forma fiable de saber qué unidad estaba lanzada, integrada o pendiente, y el riesgo era relanzar trabajo o perderlo.

**Ahora.** `references/ledger.md` define `.work/runs/<run>/run.md`, que escribe solo el coordinador:
- Cabecera del run (entrada, motor, id del Run de Orca, autonomía, rama de integración, estado) y una tabla por unidad (`status`, `ref` del motor, rama, base, head, intentos).
- **Se escribe antes de actuar**: `dispatching` antes de lanzar y `dispatched` con el id después. Una caída entre los dos pasos no acaba en doble lanzamiento.
- Procedimiento de reanudación por motor: con Orca, `run-use`, `task-list`, `worker-list` e `inbox` (para procesar un `worker_done` que llegó mientras el coordinador no estaba); con subagentes y manual, la rama y el worktree son la verdad.
- Se puede pasar lo pendiente a otro motor si uno cae, sin dejar dos intentos vivos de la misma unidad.
- La skill detecta un run activo al empezar y lo reanuda en vez de planificar de nuevo. El hook de spec-kit también, y añade la salida `ORCA: pendiente — …` para que `/speckit.implement` no haga por su cuenta tareas que siguen abiertas en un worker.

## 4. «¿Compensa?» más preciso

**Antes.** Cuatro condiciones cualitativas (≥2 unidades, `write` disjuntos, ≥15 min, verificables).

**Ahora** (`rules/95-multi-agent.md`), además:
- **Cuenta rápida**: ahorro por ronda (`Σ t − max t`) contra un coste de coordinación de 5 min por unidad y 5 min por ronda (eran 10 y 10: con ellos dos unidades medianas nunca compensaban), con penalización por cada fichero `shared` que obligue a serializar. Ante un empate, se reparte.
- **Presupuesto por talla** (S ≤15 min, M 20–60 min, L dividir) y campo opcional `budget` en la unidad. «Atascado» se define: sin progreso durante el doble del presupuesto.
- **Reintentos**: como mucho uno automático por unidad, mismo agente si falló el entorno y otro proveedor si falló el razonamiento; después `BLOCKED`.
- **Ficheros generados** (clientes de API, tipos de BD, lockfiles): no van en el `write` de ninguna unidad; los regenera el coordinador tras integrar.
- La plantilla `ORCHESTRATION.md` gana tres líneas: revisión cruzada, reintentos y presupuesto.

## 5. Integración más segura

| Antes | Ahora |
|---|---|
| «Ficheros ⊆ `write`», revisado a ojo | `git diff --name-only <base>...<rama>` contra `write`, y contraste de tres listas: git, `files:` del informe y `--files-modified` de Orca |
| Merge directo; conflicto al final | Ensayo con `git merge-tree --write-tree` (git ≥2.38) antes de tocar el árbol; alternativa `--no-commit` + `--abort` |
| Orden: prioridad → dependencias | Orden topológico por `depends_on` → prioridad → menos `shared` → diff más pequeño |
| Revisión cruzada citada en la plantilla, sin proceso | Proceso definido: otro proveedor revisa el diff sin editar. Obligatoria en unidades `L` y sensibles (auth, permisos, cripto, pagos, migraciones) |
| Gate del conjunto falla ⇒ «arréglalo» | Localizar la unidad culpable con `git revert -m 1 --no-commit` + `git revert --abort`; arreglo pequeño lo hace el coordinador, grande vuelve como `rework` |
| Sin forma de deshacer una unidad | `git revert -m 1 <merge>` (estado `reverted`); nunca `reset` de la rama de integración |
| `[x]` en `tasks.md` por unidad | `[x]` exactamente en las `T###` del `source` |

## 6. Informe del worker verificable

Cambios compatibles en `worker-contract.md`:
- Arranque: comprobación de la base (`git merge-base --is-ancestor <BASE> HEAD`); si el worker parte de otro commit, `BLOCKED`.
- Verificación: **autocomprobación de alcance** con `git diff --name-only` y `git status --porcelain` antes de entregar. Lo que no esté en `write` va a `out_of_write` o se deshace.
- Informe: campos opcionales `base` y `time`. `files` sale de git, no de memoria. `branch` es la rama real (con Orca la nombra Orca).
- `succeeded` exige además `out_of_write: ninguno` o justificado. `blocked` se entrega en Orca como `--outcome failed` con `BLOCKED:` (Orca solo acepta `succeeded|failed`).
- Si el worker va a pasar del doble de su `budget`, manda un checkpoint en vez de seguir en silencio.

## 7. Confianza entre agentes

Nueva sección en `rules/95-multi-agent.md` (aplica `30-security.md` §C12 a la orquestación):
- Informes, preguntas, nombres de rama y mensajes de workers son entrada no confiable: el coordinador los contrasta con git y no ejecuta lo que propongan sin validarlo.
- Los briefs no llevan secretos; las unidades que los necesitan las hace el coordinador o el usuario.
- El texto de tickets, PRs o páginas que entra en un brief va como cita, no como orden. El worker trata como dato cualquier instrucción incrustada y la reporta como `RISK:`.
- El worker no imprime variables de entorno ni el contenido de `.env*`.

## 8. Coherencia entre motores y con spec-kit

- `ENGINE: inline (motivo)` y `ORCA: secuencial — motivo` convivían; ahora todos los textos usan `ORCA: secuencial — <motivo>` (motor `inline`).
- Motor subagentes: lanzar cada ronda desde la rama de integración con el árbol limpio (el worktree del subagente parte de `HEAD`), y cómo hacer `rework`. Codex, Cursor y Copilot caen a manual si no crean worktree.
- Motor manual: la instrucción al usuario pedía ejecutar «con la skill worker-contract.md», que no es una skill. Ahora el brief lleva el contrato entero y la instrucción lo dice así. Una unidad sin `REPORT.md` no se integra.
- Modo carrera con Orca: una tarea y un worktree por participante.
- `setup.md` comprueba que Orca responde y que la orquestación está activada, y propone `orca skills install --skill orca-cli --skill orchestration` si faltan las skills.
- Nuevo test en `tests/test_speckit.sh` (se ejecuta siempre, sin el CLI `specify`): el comando de la extensión y la skill `speckit-orca-implement` deben tener el mismo cuerpo. Antes podían divergir sin que nada lo detectara.

## 9. Puerta de reparto: la orquestación se dispara en todas las entradas

**Antes.** Solo spec-kit tenía un disparador que no dependía del criterio del agente: el hook `before_implement` carga la skill `orca` siempre, y la skill decide con `tasks.md` delante. En el resto de entradas (prompt de chat, plan nativo de Claude Code o Antigravity, plan en fichero, artefacto) el núcleo pedía usar la skill «por iniciativa propia» cuando la tarea tuviera «≥2 partes independientes de >15 min»: el agente tenía que estimar el resultado de la skill antes de cargarla, sin datos, y casi siempre concluía en silencio que no compensaba. Los adaptadores de plan nativo y de artefacto existían, pero nada los llamaba en el momento de «implementa el plan».

**Ahora.**
- **Regla comprobable** (`core/AGENTS.md` §6): antes de la primera edición de un trabajo con ≥2 entregables separables, se carga la skill y su veredicto queda escrito en el chat en una línea `ORCA: …`: con el plan de rondas y antes de editar si reparte; como tarde al empezar la respuesta final si es secuencial. El umbral de tiempo sale del disparador y se queda en la skill, que es quien tiene las unidades delante. Un solo entregable no pasa por la puerta ni lleva línea.
- **El plan lleva su reparto**: todo plan que escribe el agente (modo plan, `implementation_plan.md`, `planes/*.md`, artefacto) termina con una sección `Reparto` con el veredicto. Lo ve quien aprueba el plan y sobrevive a un cambio de contexto o de agente. Es el mecanismo de Antigravity y Codex, donde el kit no instala hooks.
- **Hooks de Claude Code** (`templates/claude-settings.json`, comprobados contra la referencia de hooks de Claude Code y con una sesión real):
  | Evento | Qué hace |
  |---|---|
  | `UserPromptSubmit` | Su salida estándar se añade al contexto junto a cada mensaje: recuerda la puerta de reparto y sus excepciones |
  | `PostToolUse` con `matcher: "ExitPlanMode"` | Devuelve `hookSpecificOutput.additionalContext`, que llega junto al resultado de aprobar el plan: antes de la primera edición, la skill `orca` con el adaptador de plan nativo |
  Son un `echo` de texto fijo en ASCII: funcionan igual en bash y en PowerShell, sin dependencias, y también para quien clone el proyecto sin tener el kit.
- `kit-init` crea `.claude/settings.json` desde la plantilla o le añade esos dos hooks sin tocar lo demás.
- La description de la skill `orca` nombra las entradas («implementa el plan», plan aprobado, plan en fichero, artefacto), y cada adaptador dice cuándo se usa.

**Lo medido** (Claude Code en modo no interactivo, `claude -p`, sobre un repo de juguete; pocos ensayos, sirven de orientación y no de garantía):
| Qué | Resultado |
|---|---|
| La skill `orca` se carga antes de la primera edición con un encargo de 2 o más entregables | 19 de 19 |
| Una pregunta, un cambio de un fichero o «explica este fichero» no pasan por la puerta | 3 de 3 |
| Un encargo grande (tres módulos o tres sprints independientes) se reparte de verdad | 2 de 2 con presupuesto suficiente: uno enseñó el plan de rondas y esperó el «sí»; el otro lanzó tres subagentes con su despacho `UNIT:` |
| El hook `UserPromptSubmit` se ejecuta en cada mensaje | 9 de 9 |
| El plan del modo plan termina en `Reparto`, y el hook de `ExitPlanMode` se ejecuta al aprobarlo | 2 de 2 y 1 de 1 |
| Antigravity (`agy --print`): primera lectura la skill, respuesta que empieza por `ORCA:` | 2 de 2 |
| La línea `ORCA: secuencial` **visible** cuando el encargo es pequeño | 4 de 16: la decisión se toma (la skill se carga), pero a menudo se queda en el razonamiento y no llega al chat |

**Límites.** La línea visible del veredicto secuencial no se puede forzar con texto: reforzar la redacción tres veces no cambió la tasa. En modo no interactivo, además, un reparto puede empezar sin esperar la confirmación 1 (no hay a quién preguntar): pasó en uno de los dos ensayos grandes. Un hook de contexto no ejecuta la skill: se la recuerda al agente en el momento justo, igual que el hook de spec-kit es una instrucción que `/speckit.implement` lee. En Antigravity y Codex existen hooks propios, pero el kit no los instala todavía; ahí manda la regla del núcleo y la sección `Reparto` del plan.

## Compatibilidad

- Sin cambios en `~/.agents`, en el instalador ni en el núcleo. No hace falta migrar nada: basta con reinstalar (`omk update`).
- `units.md`: campos nuevos `budget` y `review`, opcionales. `worker-contract.md`: campos nuevos `base` y `time`, opcionales.
- Los runs de la v1.1.0 no tienen `run.md`: no se pueden reanudar con este procedimiento, pero tampoco se rompen.
- `ORCHESTRATION.md` existentes siguen valiendo; las tres líneas nuevas toman su valor por defecto si faltan.

## Cómo probarlo

```bash
bash scripts/check.sh          # frontmatter, longitud de descriptions, rutas neutrales
bash tests/test_speckit.sh     # cuerpo del hook = skill; con specify ≥1.0, instalación real de la extensión
```
A mano, en un proyecto con Orca:
1. «Implementa U1 y U2 en paralelo» con dos partes independientes: el plan de rondas aparece y, tras el «sí», existe `.work/runs/<run>/run.md`.
2. Las tareas se ven en Orca con sus dependencias; el coordinador termina el turno tras lanzar la ronda y Orca lo despierta con cada `worker_done`.
3. Cierra el agente coordinador a mitad de ronda, ábrelo de nuevo y di «sigue el run»: debe responder `ORCA: reanudado run …` sin relanzar las unidades en curso.
4. Haz que un worker toque un fichero fuera de su `write`: la integración lo marca como `rework`.
