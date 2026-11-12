# Plugin de Orca

El kit funciona en [Orca](https://www.onorca.dev) sin plugin: las skills viven en `~/.agents/skills` (el mismo sitio donde Orca instala las suyas) y la skill `orca` usa `orca orchestration` como motor. El plugin `orca-plugin/` añade lo que solo puede hacer la propia app: comandos en la paleta, un panel lateral con los agentes, el equipo de roles, las acciones y los ajustes, un cambio en los despachos de orquestación, avisos y un indicador en la barra de estado.

Requisitos: Orca ≥ 1.4.248 (hooks y barra de estado) con los plugins activados (*Settings → Plugins → Turn on plugins*). Para los comandos, el kit instalado (`omk` en el `PATH`).

## Qué hace

| Pieza | Qué ves | Cómo funciona |
|---|---|---|
| **Orca Multiagent Kit: verificar instalación** | Un terminal nuevo en el workspace activo que ejecuta `omk verify`, y su estado y su salida en el panel | `terminal.create` con el literal `omk verify --exit-marker`. Ver [Acción en curso](#acción-en-curso) |
| **Orca Multiagent Kit: actualizar kit** | Lo mismo con `omk update`: pone al día el paquete, `~/.agents`, el proyecto activo (también los apartados nuevos de `ORCHESTRATION.md`) y este plugin | `terminal.create` con el literal `omk update --exit-marker`. Qué actualiza: [`MANUAL.md`](MANUAL.md#actualizar-omk-update) |
| **Orca Multiagent Kit: inicializar proyecto** | Un agente nuevo en el workspace activo con el prompt «inicializa el proyecto» (skill `kit-init`), seguido en el panel | `agent.launch`; el agente sale del ajuste *Agente para inicializar* (por defecto `claude`) |
| **Orca Multiagent Kit: estado de los agentes** | Una línea por agente activo: nombre, estado, agente y workspace | Lo que ha ido contando la barra de estado |
| **Panel *Multiagent Kit* · Agentes** (barra lateral derecha, icono de robot) | Los agentes activos con nombre, agrupados por run del kit o por workspace, los bloqueados primero (y abiertos). Cada uno se despliega en su ficha: estado y desde cuándo, agente, unidad, rol y nivel, run, título en Orca, workspace, rama, carpeta, si corre en un terminal o en un chat de Orca y cómo acabó su último turno; y un botón para ir a su workspace | Ver [Nombres de los agentes](#nombres-de-los-agentes) |
| **Panel · Avisos** (la etiqueta dice cuántos hay) | Lo que espera tu respuesta: la **tarjeta del plan de rondas** del coordinador (cabecera, rondas, cada unidad con su rol, nivel, agente con su icono, modelo y recurso en colores, notas) con «Sí, lánzalo» y «Pedir cambio»; y cada agente bloqueado o esperando, con las últimas líneas de su terminal, una caja para responderle, «Ir a su workspace» y «Descartar» | Ver [Avisos y tarjeta del plan](#avisos-y-tarjeta-del-plan) |
| **Panel · Worktrees** | Los worktrees de la orquestación agrupados por run (los demás con agentes, en «Otros»), con su rama y unidad, sus agentes con icono, estado y modelo, «Abrir worktree» y, para un Claude Code que espera, «Cambiar modelo» (opus, sonnet, haiku) | El modelo sale de `--model` en la orden de arranque (hook `agent.launch.before`); el cambio escribe `/model <alias>` + Intro en su terminal |
| **Panel · Historial** | Despachos, bloqueos y finales de unidad, runs terminados, planes, respuestas, cambios de modelo, repartos y autonomía, lo más reciente primero, con filtro y «Vaciar historial» (dos pasos) | Las 200 últimas entradas, en el almacenamiento del plugin (`storage:own`, clave `history.v1`) |
| **Panel · Repartir** | Repartir una tarea entre agentes: eliges de dónde sale el trabajo (lo que escribes, un plan del repo o spec-kit), el coordinador y, si quieres, otra autonomía solo para ese run | Ver [Repartir una tarea](#repartir-una-tarea) |
| **Panel · Equipo** | La autonomía del proyecto (manual, semi, auto) y quién hace cada rol: equipo predefinido o personalizado, proveedores activos (casillas), revisión cruzada, un proveedor por rol de Olimpo y roles propios del proyecto | «Guardar en el proyecto» abre un terminal con `omk team set --autonomy <nivel>`; «Aplicar al proyecto», con `omk team set --data …`; «Ver el del proyecto», con `omk team`. Ver [Equipo](#equipo) |
| **Panel · Kit** | Botones de verificar, inicializar y actualizar y los cinco ajustes del plugin (los agentes se eligen de una lista, no se escriben) | El panel pide las acciones al worker (`kit.run`, solo esas tres) y lee y escribe los ajustes con `settings` |
| **Panel · acción en curso** (encima de las pestañas) | Lo último que has lanzado desde el panel o la paleta: en curso, esperando tu respuesta, terminado o fallido, con las últimas líneas de su terminal y, si `omk` pregunta, «Aprobar» y «Rechazar» | Ver [Acción en curso](#acción-en-curso) |
| **Avisos** | «U2 · Ariadna — Pagos: bloqueado» al bloquearse un agente; «RUN …: unidades terminadas» cuando acaban todas las unidades lanzadas de un run | Transiciones de `agent.status.changed`; se apagan con *Avisos de agentes* |
| **Repartir siempre** | Todo agente que Orca arranca con una tarea (al crear un worktree con tarea, en una pestaña nueva, desde una issue) pasa primero por la skill `orca`: decide si compensa repartir y, si compensa, reparte. Sin spec-kit | Hook `agent.prompt.before` con `inputKind: "launch"`. Ver [Repartir siempre](#repartir-siempre) |
| **Contrato del worker** | Cada despacho de la skill `orca` lleva al final una línea que remite a `~/.agents/skills/orca/references/worker-contract.md` | Hook `agent.prompt.before` |
| **Barra de estado** `MAW · 2 trabajando · 1 bloqueado` | Agentes trabajando, bloqueados o esperando en todos los workspaces. Ámbar si hay alguno bloqueado. El tooltip nombra hasta seis. Al pulsarlo, el estado de los agentes | Evento `agent.status.changed` y `agents.list` al arrancar |

Si `omk` no está en el `PATH`, el terminal muestra el error del shell, la acción queda como fallida en el panel y llega una notificación con cómo instalarlo (`npm install -g orca-multiagent-kit` o el ejecutable de la release, que se deja a sí mismo en el `PATH`). Si el plugin no identifica el workspace activo (ninguno enfocado, o dos con el mismo nombre y rama), lo dice y no ejecuta nada: es preferible no lanzar nada a lanzarlo en otro workspace. Desde el panel, cualquier fallo al lanzar sale como error («No se pudo»), no como respuesta.

### Acción en curso

La API de plugins abre los terminales en segundo plano y no tiene forma de traerlos al frente, así que el plugin trae el terminal al panel: encima de las pestañas hay una tarjeta con la última acción lanzada (desde el panel o desde la paleta).

- **Comandos `omk`** (verificar, actualizar, y los `omk team` de *Equipo*): el worker lee ese terminal cada segundo (`terminal.read`, las 400 últimas líneas) y enseña las 80 últimas, sin códigos de escape ni caracteres de control; el panel deja a la vista el final y pliega el resto en «Salida completa». Para saber cuándo y cómo ha terminado, lanza el comando con `--exit-marker`: con esa opción `omk` escribe al salir `[omk:fin] <comando> salida=<código>`. Código 0, «terminado»; otro, «falló». Pasados 20 minutos deja de seguirlo y lo dice.
- **Si `omk` pregunta** (`omk update` cuando el plugin nuevo necesita tu aprobación: enseña lo que concede y pregunta `¿Apruebas este acceso? [s/N]`), la tarjeta pasa a «espera tu respuesta», llega una notificación y salen «Aprobar» y «Rechazar». Escriben `s` o `n` e Intro en **ese** terminal, y solo si `omk` sigue preguntando en ese momento (el worker lo vuelve a leer antes de escribir). También puedes contestar en el terminal. Sin respuesta en 10 minutos, `omk` lo da por rechazado.
- **Agentes** (inicializar y *Repartir*): la tarjeta sigue el estado que cuenta Orca (trabajando; pide permiso o espera instrucciones, y entonces te manda a *Avisos*; terminado) y las 24 últimas líneas de su terminal.
- **Reinicio del plugin**: *Actualizar kit* cambia el propio plugin y Orca reinicia su worker a mitad del comando. Lo que se sigue está guardado (`storage:own`, clave `action.v1`: título, terminal y hora de inicio), y el worker nuevo retoma el mismo terminal.
- «Dejar de seguir» (o «Quitar», si ya acabó) quita la tarjeta; el terminal sigue como esté. Cada comando `omk` que termina queda en *Historial*.
- **`omk` anterior al plugin**: no conoce `--exit-marker` y lo rechaza. La tarjeta lo explica y dice cómo actualizarlo (`npm install -g orca-multiagent-kit@latest`).

### Nombres de los agentes

Orca no siempre manda título en `agent.status.changed`. El plugin junta lo que sabe de cada terminal, por este orden:

1. **Despacho del kit** (hook `agent.prompt.before`): la cabecera `UNIT: U2 — <título>     RUN: <run>` y la línea `ROL: Ariadna · …` dan `U2 · Ariadna — <título>` y lo agrupan bajo `RUN <run>`.
2. **Título de Orca**, si llega; un cambio de estado sin título conserva el anterior.
3. **Qué agente es** (`claude`, `codex`…), de `agents.list` al arrancar, del hook `agent.launch.before` o, en los chats de agente de Orca (no tienen terminal), del nombre de su panel (`structured-agent-session-<agente>_…`).

El workspace sale de `workspace.list`. Los eventos de agentes lo identifican a veces como `<repo>::<ruta>` y la lista como `identity:…`; el plugin los cruza por la ruta. Títulos y despachos los escribe un agente: se quitan los caracteres de control y de formato y se acortan (80 caracteres) antes de enseñarlos. Lo aprendido de cada terminal vive en memoria (los 200 más recientes); si el plugin se reinicia, los agentes en curso se nombran con lo que vuelva a contar Orca.

### Repartir siempre

Sin el plugin, la orquestación arranca con spec-kit (el hook `before_implement` de `/speckit.implement`), con la «puerta de reparto» del núcleo (`~/.agents/AGENTS.md` §6) y, en Claude Code, con los hooks que el kit pone en `settings.json` (`UserPromptSubmit` y `ExitPlanMode`). El plugin añade lo que esas vías no ven: el prompt con el que Orca arranca un agente. El ajuste *Repartir al lanzar un agente con tarea* (activado por defecto) lo vuelve automático: a cada prompt con el que Orca arranca un agente le añade al final

> [Orca Multiagent Kit] Antes de empezar, y antes de la primera edición, carga la skill orca (~/.agents/skills/orca/SKILL.md) y escribe en el chat su veredicto en una línea `ORCA: …`: si la tarea tiene 2 o más entregables separables, repártela entre agentes. La entrada es este prompt (adaptador de chat): no hace falta spec-kit. Si es un solo entregable, hazla tú directamente.

Así, crear un worktree con una tarea ya es orquestar: la skill decide en menos de un minuto si compensa (`95-multi-agent.md` §Cuándo paralelizar) y, si no, el agente la hace solo como siempre. No se toca:

- lo que escribe una persona en el chat o el terminal (Orca no pasa esos prompts por los hooks);
- los despachos a workers (`inputKind: "orchestration"`), que llevan el contrato del worker en su lugar;
- los prompts que ya van por la skill `orca` (*Repartir* del panel), los de `kit-init` y un despacho del kit.

Falla en abierto como el resto de hooks: si el plugin falla o tarda más de 2 s, el prompt sale sin cambios.

### Repartir una tarea

Es la forma de arrancar un run multiagente sin abrir un chat y escribir el prompt a mano. Lanza el coordinador elegido (`agent.launch`) en el workspace activo con un prompt que invoca la skill `orca` y le dice de dónde sale el trabajo:

| De dónde sale el trabajo | Qué recibe el coordinador | Campo de texto |
|---|---|---|
| Lo que escribo aquí | La tarea, con el adaptador de chat | Obligatorio (máx. 4000 caracteres) |
| Un plan del repo | «reparte el plan de `planes/*.md`», adaptador plan-file | Opcional: qué plan |
| Tareas de spec-kit | «reparte `specs/<feature>/tasks.md`», adaptador speckit | Opcional: qué feature |

Las dos primeras dicen expresamente que **no hace falta spec-kit**: la skill `orca` reparte igual desde un texto o un plan. Después, el coordinador hace lo de siempre: decide si compensa repartir, te enseña el plan de rondas para que lo confirmes, lanza un agente por unidad en su worktree con su rol del equipo, integra y te pide confirmar el merge. Los agentes aparecen en la pestaña *Agentes*.

### Equipo

La pestaña *Equipo* edita un borrador (se guarda en el panel) y lo escribe en `ORCHESTRATION.md` §1 del proyecto activo con `omk team set --data <equipo>`, que es lo que la skill `orca` lee al repartir. `<equipo>` es el equipo en JSON y base64url: al terminal solo llegan letras, números, `-` y `_`, aunque los roles propios lleven texto libre; `omk team` lo valida otra vez entero antes de escribir.

| En el panel | En `ORCHESTRATION.md` §1 |
|---|---|
| Proveedores activos (casillas; al menos uno) | `- Proveedores activos: claude, codex` (conserva el comentario) |
| Revisión cruzada | `- Revisión cruzada (…): unidades L y sensibles` · `todas` · `nunca` |
| Un proveedor por rol de Olimpo | Una fila `Rol Casandra · Casandra / codex · equipo (omk team)` en «Excepciones al reparto por roles». `references/olimpo.md` la lee como «todas las unidades de ese rol van con ese proveedor» |
| Roles propios (hasta 10): nombre, qué hace, nivel, revisión, guardarraíl y proveedor | Una fila `**Hermes** · Traducciones · bajo · Argos · … <!-- omk team -->` en «Roles propios del proyecto» y, si lleva proveedor, su fila `Rol Hermes` en las excepciones. Se quitan `\|`, `<`, `>` y saltos de línea del texto |
| Coordinador | No se escribe: es el agente que lanza *Repartir* |

Los agentes se eligen de una lista: los habituales del catálogo de Orca (Claude Code, Codex, Gemini CLI, Antigravity, Copilot, Cursor, OpenCode…). Un nombre de rol propio no puede repetir uno de Olimpo ni otro propio.

Equipos predefinidos: *Solo Claude* (sin roles fijados; la revisión cruzada la hace una sesión nueva), *Claude + Codex revisor* (todo con Claude salvo Casandra, con Codex) y *Codex + Claude revisor* (al revés). Elegir uno conserva los roles propios; cualquier cambio a mano lo deja en *Personalizado*. `omk team` solo reescribe las filas que escribió él (`equipo (omk team)` y `<!-- omk team -->`); las que escribiste tú se quedan. Desde un terminal:

```bash
omk team                                                    # el equipo del proyecto
omk team set --provider claude --provider codex --cross todas --role casandra=codex
omk team set --role casandra=auto                           # vuelve a decidirlo el coordinador
omk team set --autonomy auto                                # §0: manual, semi o auto
```

La tarjeta *Autonomía* de la misma pestaña cambia la línea `- Nivel:` de `ORCHESTRATION.md` §0 (`omk team set --autonomy manual|semi|auto`; el terminal solo recibe uno de esos tres literales). En *Repartir*, «Autonomía de este run» la cambia solo para el coordinador que lanzas: va en su prompt y no toca el fichero.

### Avisos y tarjeta del plan

- **Tarjeta del plan**: antes de pedir la confirmación 1, la skill `orca` escribe el plan en `.work/runs/<run>/plan.json` ([formato](../skills/orca/references/plan-card.md)). El plugin lo ve en el hook `agent.tool.after` (la herramienta `Write` de Claude Code, con su contenido), lo valida campo a campo (hasta 60 unidades, 10 notas y 200 caracteres por texto; lo que no encaja se descarta y queda en `orca plugin logs`) y lo pinta en *Avisos*, con una notificación. «Sí, lánzalo» escribe `sí` en el terminal del coordinador; «Pedir cambio», `cambia: <lo que pidas>`. Es lo mismo que escribirlo tú en su chat.
- **Coordinador en un chat de Orca**: ahí no llega el hook, así que cuando el coordinador se queda esperando el plugin busca `.work/runs/*/plan.json` en su workspace (solo ficheros de verdad, no enlaces; hasta 64 KB y 50 runs; solo los escritos después de arrancar el plugin). Como la API de plugins no escribe en chats, la respuesta va por el buzón del Run de Orca de la tarjeta (`orcaRun`): `orca orchestration send --from run:<orcaRun> --to run:<orcaRun> --subject "Respuesta desde el panel: …" --body <tu texto>`, y Orca la entrega al chat del coordinador. Sin `orcaRun`, se le responde en su chat.
- **Agentes que esperan**: un agente bloqueado (pide permiso) o esperando instrucciones sale con las 12 últimas líneas de su terminal, sin códigos de escape ni caracteres de control. La respuesta va a **su** terminal (el worker no acepta un terminal que venga del panel), en una sola línea de hasta 2000 caracteres, sin saltos ni caracteres de control, y con Intro.
- Un aviso desaparece al responderlo, al descartarlo o cuando el agente vuelve a trabajar; uno descartado no vuelve hasta que el agente cambie de estado.

### Por qué el contrato del worker

Con el motor Orca, la skill `orca` copia en el despacho solo parte del contrato (entorno §1.4, alcance §2, verificación §4 e informe §5), porque Orca ya le explica al worker cómo preguntar y cómo cerrar con `worker_done`. El hook añade una línea que remite al fichero completo, para que el worker tenga también el arranque y la implementación. Para eso:

- Solo actúa sobre prompts que Orca marca como despacho de orquestación (`inputKind: "orchestration"`). Nunca toca lo que escribes tú, los prompts de arranque de un agente ni `orca terminal send`.
- En el modo por defecto (*Solo despachos del kit*), además, el despacho tiene que llevar la cabecera de la skill `orca` (`UNIT: U<n> …` al principio de una línea y `RUN: …`). Las líneas `ROL:` y `SETUP:` que la skill añade desde la 1.4.0 no cambian esa detección. Los despachos de otros coordinadores pasan intactos. *Todos los despachos* lo añade a cualquiera; *Desactivado* lo apaga.
- Si el prompt ya cita `worker-contract.md`, no lo repite.
- **No deniega nunca** y falla en abierto (`"onError": "pass"`): si el worker del plugin falla o tarda más de 2 s, Orca envía el prompt sin cambios. Es una ayuda para el worker, no un control de seguridad.

## Permisos que pide

Es un plugin `trusted-worker`: Orca ejecuta `src/worker.ts` en un proceso Node aparte, con el acceso de tu usuario a la máquina. Por eso pide aprobación al instalarlo. Las capacidades, y para qué se usa cada una:

| Capacidad | Para qué | Si no la concedes |
|---|---|---|
| `workspace:read` | Saber qué workspace está enfocado y cómo se llama cada uno (`workspace.readContext` + `workspace.list`) y enterarse de los que se eliminan | Los comandos no saben dónde ejecutarse y los agentes salen sin workspace |
| `workspace:write` | Abrir el workspace de un agente al pulsarlo en el panel (`workspace.open`). El plugin no renombra workspaces ni ejecuta comandos de Orca | Pulsar un agente no hace nada |
| `terminal:send` | Abrir un terminal con `omk verify`, `omk update` u `omk team` (`terminal.create`); escribir tu respuesta de *Avisos* o `/model <alias>` en el terminal de un agente que sigue el plugin, y `s` o `n` en el terminal de la acción en curso cuando `omk` pregunta (`terminal.sendText`) | No hay comandos de verificar ni actualizar, no se aplican el equipo ni la autonomía, y no se puede responder ni cambiar el modelo desde el panel |
| `terminal:read` | Leer la salida del terminal de la acción en curso (el que abrió el plugin, o el del agente que lanzó) para enseñarla y saber si terminó, si `omk` no existe o si pregunta; y las últimas líneas del terminal de un agente que espera, para su aviso | La acción en curso no tiene salida ni estado, el fallo de `omk` ausente solo se ve en el terminal, y los avisos salen sin contexto |
| `agent:launch` | Lanzar el agente de «inicializar proyecto» y el coordinador de *Repartir* (`agent.launch`) | No hay comando de inicializar ni botón de repartir |
| `agent:read` | Contar y nombrar agentes para la barra, el panel y los avisos (`agents.list`, `agent.status.changed`) | La barra se queda en `MAW` |
| `notifications:show` | Avisos accionables (sin `omk`, sin workspace, fallos de Orca, agente bloqueado, run terminado) | Los avisos solo quedan en `orca plugin logs` |
| `settings:own` | Leer los cinco ajustes del plugin, y cambiarlos desde el panel | Se usan los valores por defecto y el panel no puede guardarlos |
| `storage:own` | Guardar el historial (las 200 últimas entradas, clave `history.v1`) y qué acción se está siguiendo (clave `action.v1`) | El historial solo dura hasta que se reinicia el plugin, y *Actualizar kit* pierde el seguimiento cuando cambia el plugin |

Además observa dos hooks sin cambiar ni denegar nada: `agent.launch.before` (qué agente se lanza, en qué terminal y con qué `--model`) y `agent.tool.after` (solo le interesa un `Write` de `.work/runs/<run>/plan.json`; el resto de llamadas se descartan en el acto y no se guardan).

Lo que **no** hace: no envía a un **shell** texto libre de un usuario, de un agente o de un fichero. `omk verify` y `omk update` son literales fijos (con el literal `--exit-marker` detrás, como todos los `omk` que lanza), `omk team set --autonomy` lleva uno de tres literales, y `omk team set --data` solo lleva base64url (letras, números, `-` y `_`) de un equipo que el worker ya validó entero (ids con `^[a-z0-9][a-z0-9-]{0,39}$`, roles, niveles y revisiones de listas cerradas, texto de los roles propios sin `|`, `<`, `>` ni caracteres de control); `omk team` lo valida otra vez. El id de agente se valida igual antes de pasarlo a `agent.launch`. La tarea de *Repartir* va como prompt al agente que eliges. Lo único que se escribe en el terminal de un agente es lo que tú escribes en *Avisos* (una línea, sin caracteres de control) y `/model <id>` con un id de modelo validado, y solo en terminales de agentes que el plugin sigue. En el terminal de la acción en curso solo se escribe `s` o `n`, cuando pulsas «Aprobar» o «Rechazar» y `omk` está preguntando. La salida de un terminal se enseña como texto, sin códigos de escape ni caracteres de control, y nada de lo que diga se ejecuta ni se interpreta salvo la línea de cierre de `omk`. No usa red ni secretos. Fuera de la API de Orca solo hace dos cosas, ambas para el coordinador que corre como chat: lee `.work/runs/*/plan.json` (`node:fs`, solo esos ficheros, sin seguir enlaces) y ejecuta el `orca` que trae la propia app (`resources/bin` junto a `Orca.exe`) con `orchestration send` (`node:child_process`, `execFile` **sin shell**: cada argumento va aparte, el id del Run se valida con `^run_[a-z0-9]{4,40}$` y tu respuesta va como un único argumento `--body`).

> **Seguridad**: «Aprobar» en la tarjeta de *Actualizar kit* es tu aprobación del acceso que pide la versión nueva del plugin: léelo en la salida antes de pulsarlo (la tarjeta enseña entonces las 30 últimas líneas, donde `omk` lista lo que Orca concedería). El plugin no aprueba nada por su cuenta: `omk` solo sigue con un `s` y el worker solo lo escribe cuando lo pulsas.

> **Seguridad**: cualquier agente del Run puede escribir en su buzón con `--from run:<id>`, así que un mensaje «Respuesta desde el panel» no prueba que lo escribieras tú. La skill `orca` solo lo acepta para la confirmación 1 (lanzar el plan o cambiarlo); el merge final y la limpieza (confirmaciones 2 y 3) solo valen escritos en el chat.

## Instalar

```bash
omk plugin install         # enciende los plugins, enseña lo que pide el plugin y te pregunta antes de aprobarlo
omk plugin status          # qué versión hay instalada y si es la de este kit
omk setup                  # todo el entorno: kit, Orca abierto, plugins encendidos, plugin y su panel
```

`omk plugin install` busca el CLI de Orca (en el `PATH` o donde lo deja el instalador de Orca; `OMK_ORCA` para indicar otro) y comprueba que su versión cumple `engines.orca`. Después:

- **No está instalado**: `orca plugin install <kit>/orca-plugin`. Orca contesta `approval_required` con lo que concedería; omk lo enseña y pregunta `¿Apruebas este acceso? [s/N]`. Solo con un sí repite la orden con `--approve <huella>`, la que da Orca, y solo si tiene el formato esperado. Sin terminal interactivo no aprueba nada: hay que repetir con `--yes`, que es tu aprobación dada de antemano.
- **Otra versión instalada desde esta carpeta**: `orca plugin update` (Orca vuelve a copiar la carpeta; si la versión nueva pide más acceso, se pregunta otra vez).
- **Otra versión instalada desde otra carpeta**: no la toca y dice cómo cambiarla (`omk plugin uninstall && omk plugin install`).
- **Esta versión, pendiente de aprobación**: `orca plugin enable` con el mismo flujo de aprobación.
- **Esta versión, desactivada por ti**: se respeta.

El plugin queda como `local.multiagent-kit`. A mano, sin omk: `orca plugin install ./orca-plugin --json` y, tras revisar lo que lista `error.data`, el comando con `--approve <fingerprint>` que da Orca. La huella está ligada a esta versión, sus ficheros y su acceso.

## Ajustes

Dos sitios, los mismos valores (cambiar uno cambia el otro, y el worker se entera al momento):

- El panel *Multiagent Kit* de la barra lateral derecha.
- *Settings → Plugins → Orca Multiagent Kit*, la página que Orca genera con los ajustes que declara el manifiesto (`contributes.settings`).

| Ajuste | Por defecto | Valores |
|---|---|---|
| Repartir al lanzar un agente con tarea | Activado | sí / no |
| Contrato del worker en los despachos | Solo despachos del kit | Solo del kit · Todos · Desactivado |
| Agentes en la barra de estado | Activado | sí / no |
| Avisos de agentes | Activado | sí / no |
| Agente para inicializar | Claude Code | Lista de agentes del catálogo de Orca |

## Desactivar o quitar

```bash
orca plugin disable local.multiagent-kit --json     # deja de ejecutarse; se reactiva con enable
orca plugin uninstall local.multiagent-kit --json   # lo quita
```

Sin plugin, el kit sigue funcionando igual. Solo se pierden la paleta, la barra y la línea del contrato en los despachos.

## Limitaciones

- **Barra de estado**: al arrancar solo conoce los agentes del workspace enfocado (`agents.list` no da más); los de los demás aparecen con su siguiente cambio de estado. Un agente que Orca solo identifica por su panel (sin `terminalId`) no recibe el nombre de su despacho. Un agente cuyo terminal se cierra sin pasar a `done` sigue contando hasta que se elimina su workspace o se reinicia el plugin (`orca plugin restart local.multiagent-kit`).
- **Terminal al frente**: la API de plugins no puede enfocar ni mostrar un terminal (`terminal.create` lo abre en segundo plano), así que la salida se trae al panel. El terminal sigue ahí, con el título del comando, si prefieres mirarlo.
- **Acción en curso**: una cada vez (la última lanzada sustituye a la anterior en la tarjeta; su terminal sigue). Lee lo que el terminal pinta, no la salida del proceso: un terminal muy estrecho corta las líneas, y si se cierra a mitad la tarjeta queda «sin seguimiento» con lo último que leyó. De un agente que Orca abre como chat (sin terminal) no llega salida.
- **Detección de `omk` ausente**: es heurística. Busca el mensaje de "comando no encontrado" de bash, zsh, fish, cmd y PowerShell, en inglés y español. Con otros idiomas o shells, el error se ve en la salida pero la acción se queda «en curso» hasta su plazo.
- En un workspace remoto (SSH), `omk` se ejecuta en ese host, que es donde se usa el kit en ese workspace.
- **Chats de Orca**: un agente que corre como chat de Orca (sin terminal; es lo que lanza Orca para los workers si así lo tienes en sus ajustes de pestañas de agente) sale en *Avisos* y *Worktrees*, pero la API de plugins no puede escribir en un chat. La tarjeta del plan del coordinador sí se contesta desde el panel, por el buzón del Run (ver [Avisos y tarjeta del plan](#avisos-y-tarjeta-del-plan)); a los demás chats se les responde y se les cambia el modelo desde su chat («Ir a su workspace»).
- **Tarjeta del plan**: en un terminal la lee del `Write` de Claude Code (hook `agent.tool.after`; otros agentes nombran distinto su herramienta de escritura); en un chat, del disco cuando el coordinador espera, y solo en workspaces locales. Orca aún no engancha agentes por SSH o WSL: con ellos el plan sale solo en el chat.
- **Cambiar el modelo**: solo Claude Code (`/model`), y solo mientras espera instrucciones: trabajando, el texto acabaría en su turno; bloqueado, en el diálogo de permiso.

DEFERRED:
- **Progreso del run en la barra** (`ronda 1 · 2/3 unidades`): exige leer `.work/runs/<run>/units.md`, y la API de Orca no da acceso a ficheros a los workers (el plugin solo lee `plan.json`, con Node, para los chats; ampliarlo a más ficheros del proyecto queda fuera). Hoy el coordinador lo deja en el comentario del worktree (`orca worktree set --comment`).
- **Instalación desde Git** (`orca plugin install FernandoBaqueroo/orca-multiagent-kit`): la ayuda de `orca plugin install` (1.4.252) no documenta instalar desde una subcarpeta del repositorio. Haría falta un repo propio para el plugin o confirmar que Orca acepta una URL `tree/<ref>/orca-plugin`.
- **Preparar worktrees nuevos** (`workspace.create.after`): ya lo hacen `orca.yaml` (`scripts.setup`, `sharedDirectories`), `.worktreeinclude` y `worker-start --setup run`, que la skill pasa siempre; un hook duplicaría ese trabajo.
- **Nivel de modelo en el panel**: el rol sale del despacho y el modelo de `--model` al arrancar, pero el nivel de cada unidad solo está en `.work/runs/<run>/run.md`, que el plugin no lee (sí en la tarjeta del plan, mientras espera confirmación).
- **Leer el equipo del proyecto en el panel**: el plugin no lee ficheros del proyecto (salvo `plan.json`); «Ver el del proyecto» lo enseña en un terminal con `omk team`.

## Probarlo

```bash
orca plugin validate orca-plugin --json   # manifiesto como lo carga Orca
orca plugin test orca-plugin --json       # 210 pruebas: src/**/*.test.ts(x)
bash tests/test_team.sh                   # omk team sobre una copia de templates/ORCHESTRATION.md
bash tests/test_update.sh                 # omk update y la línea de cierre que lee el plugin
orca plugin check orca-plugin --json      # dibuja el panel en cada escenario de src/panel.check.ts
orca plugin shot orca-plugin --scenario accion-pregunta   # PNG de un escenario (con la ventana de Orca minimizada)
orca plugin inspect orca-plugin --json    # qué aporta y qué acceso pide
bash scripts/check.sh                     # comprobación estática del manifiesto, también en CI (sin Orca)
```

Las pruebas usan `orca/testing`: `mountWorker` sobre un host simulado con las capacidades del manifiesto. Cubren el hook (con y sin cabecera del kit, otros `inputKind`, el modo apagado e idempotencia), los comandos (literal enviado, workspace sin identificar, fallo de Orca notificado, id de agente hostil) la barra (eventos, siembra inicial, desactivada), los nombres (título que no se pierde, despacho antes y después del estado, hook de lanzamiento), los avisos (bloqueo una sola vez, run terminado, apagados) y las peticiones del panel (abrir workspace, aplicar equipo en base64url con equipos hostiles rechazados, repartir con cada entrada). El panel se prueba con `mount`: fichas de agentes y botón de ir, repartir con y sin texto, equipos predefinidos, casillas de proveedores, roles propios incompletos y completos, ajustes con desplegables, cada botón con su acción y un fallo del worker enseñado; y el worker rechaza cualquier acción del panel fuera de las tres. La detección de `omk` ausente se prueba con los mensajes reales de cada shell. La acción en curso (`src/worker/actions.test.ts`) se prueba con un terminal simulado cuya salida va cambiando: fin con código 0 y distinto de 0, `omk` ausente o anterior, la pregunta y sus respuestas (también la que llega tarde), el plazo, el terminal que deja de leerse, el reinicio del worker y el agente de inicializar.

Para probarlo en Orca sin instalarlo: `orca plugin dev watch orca-plugin --json`. También pide aprobación, y `Ctrl-C` lo descarga.

RISK: con Orca 1.4.252, `orca plugin test` falla al importar `orca-runtime.mjs` cuando la ruta del plugin contiene una carpeta que empieza por punto (por ejemplo `.claude/worktrees/…`). Si te pasa, copia `orca-plugin/` a una ruta sin carpetas ocultas y ejecútalo allí.
