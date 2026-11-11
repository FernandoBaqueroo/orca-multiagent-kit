# Plugin de Orca

El kit funciona en [Orca](https://www.onorca.dev) sin plugin: las skills viven en `~/.agents/skills` (el mismo sitio donde Orca instala las suyas) y la skill `orca` usa `orca orchestration` como motor. El plugin `orca-plugin/` añade lo que solo puede hacer la propia app: comandos en la paleta, un panel lateral con acciones y ajustes, un cambio en los despachos de orquestación y un indicador en la barra de estado.

Requisitos: Orca ≥ 1.4.248 (hooks y barra de estado) con los plugins activados (*Settings → Plugins → Turn on plugins*). Para los comandos, el kit instalado (`omk` en el `PATH`).

## Qué hace

| Pieza | Qué ves | Cómo funciona |
|---|---|---|
| **Orca Multiagent Kit: verificar instalación** | Un terminal nuevo en el workspace activo que ejecuta `omk verify` | `terminal.create` con el literal `omk verify` |
| **Orca Multiagent Kit: actualizar kit** | Lo mismo con `omk update` | `terminal.create` con el literal `omk update` |
| **Orca Multiagent Kit: inicializar proyecto** | Un agente nuevo en el workspace activo con el prompt «inicializa el proyecto» (skill `kit-init`) | `agent.launch`; el agente sale del ajuste *Agente para inicializar* (por defecto `claude`) |
| **Orca Multiagent Kit: estado de los agentes** | Una línea por agente activo: título y estado | Lo que ha ido contando la barra de estado |
| **Panel *Multiagent Kit*** (barra lateral derecha, icono de robot) | Botones de verificar, inicializar y actualizar; los tres ajustes del plugin; los agentes activos | Panel de componentes (`src/panel.tsx`) que pide las acciones al worker (`kit.run`, solo esas tres) y lee y escribe los ajustes con `settings` |
| **Contrato del worker** | Cada despacho de la skill `orca` lleva al final una línea que remite a `~/.agents/skills/orca/references/worker-contract.md` | Hook `agent.prompt.before` |
| **Barra de estado** `MAW · 2 trabajando · 1 bloqueado` | Agentes trabajando, bloqueados o esperando en todos los workspaces. Ámbar si hay alguno bloqueado. Al pulsarlo, el estado de los agentes | Evento `agent.status.changed` y `agents.list` al arrancar |

Si `omk` no está en el `PATH`, el terminal muestra el error del shell y, en unos 15 s, llega una notificación con cómo instalarlo (`npm install -g orca-multiagent-kit` o el ejecutable de la release, que se deja a sí mismo en el `PATH`). Si el plugin no identifica el workspace activo (ninguno enfocado, o dos con el mismo nombre y rama), avisa y no ejecuta nada: es preferible no lanzar nada a lanzarlo en otro workspace.

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
| `workspace:read` | Saber qué workspace está enfocado (`workspace.readContext` + `workspace.list`) y enterarse de los que se eliminan | Los comandos no saben dónde ejecutarse |
| `terminal:send` | Abrir un terminal con `omk verify` / `omk update` (`terminal.create`) | No hay comandos de verificar ni actualizar |
| `terminal:read` | Leer la salida de **ese** terminal para detectar que `omk` no existe y avisar | El fallo se ve en el terminal, pero no llega la notificación |
| `agent:launch` | Lanzar el agente de «inicializar proyecto» (`agent.launch`) | No hay comando de inicializar |
| `agent:read` | Contar agentes por estado para la barra (`agents.list`, `agent.status.changed`) | La barra se queda en `MAW` |
| `notifications:show` | Avisos accionables (sin `omk`, sin workspace, fallos de Orca) | Los avisos solo quedan en `orca plugin logs` |
| `settings:own` | Leer los tres ajustes del plugin, y cambiarlos desde el panel | Se usan los valores por defecto y el panel no puede guardarlos |

Lo que **no** hace: no envía al terminal texto que venga de un usuario, de un agente o de un fichero (los dos comandos son literales fijos). El id de agente del ajuste se valida (`^[a-z0-9][a-z0-9-]{0,39}$`) antes de pasarlo a `agent.launch`. No usa red, secretos ni almacenamiento, no lee ficheros del proyecto y no importa módulos de Node (`fs`, `child_process`…): todo pasa por la API de Orca y sus capacidades.

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
| Contrato del worker en los despachos | Solo despachos del kit | Solo del kit · Todos · Desactivado |
| Agentes en la barra de estado | Activado | sí / no |
| Agente para inicializar | `claude` | Id de agente de Orca (`claude`, `codex`…) |

## Desactivar o quitar

```bash
orca plugin disable local.multiagent-kit --json     # deja de ejecutarse; se reactiva con enable
orca plugin uninstall local.multiagent-kit --json   # lo quita
```

Sin plugin, el kit sigue funcionando igual. Solo se pierden la paleta, la barra y la línea del contrato en los despachos.

## Limitaciones

- **Barra de estado**: al arrancar solo conoce los agentes del workspace enfocado (`agents.list` no da más); los de los demás aparecen con su siguiente cambio de estado. Un agente cuyo terminal se cierra sin pasar a `done` sigue contando hasta que se elimina su workspace o se reinicia el plugin (`orca plugin restart local.multiagent-kit`).
- **Detección de `omk` ausente**: es heurística. Busca durante ~15 s el mensaje de "comando no encontrado" de bash, zsh, fish, cmd y PowerShell, en inglés y español. Con otros idiomas o shells, el error se ve en el terminal pero no llega la notificación.
- En un workspace remoto (SSH), `omk` se ejecuta en ese host, que es donde se usa el kit en ese workspace.

DEFERRED:
- **Progreso del run en la barra** (`ronda 1 · 2/3 unidades`): exige leer `.work/runs/<run>/units.md`, y la API de Orca no da acceso a ficheros a los workers. Hoy el coordinador lo deja en el comentario del worktree (`orca worktree set --comment`).
- **Instalación desde Git** (`orca plugin install FernandoBaqueroo/orca-multiagent-kit`): la ayuda de `orca plugin install` (1.4.252) no documenta instalar desde una subcarpeta del repositorio. Haría falta un repo propio para el plugin o confirmar que Orca acepta una URL `tree/<ref>/orca-plugin`.
- **Preparar worktrees nuevos** (`workspace.create.after`): ya lo hacen `orca.yaml` (`scripts.setup`, `sharedDirectories`), `.worktreeinclude` y `worker-start --setup run`, que la skill pasa siempre; un hook duplicaría ese trabajo.
- **Rol y modelo en la barra de estado**: la barra cuenta agentes por estado, pero no sabe qué rol de Olimpo ni qué nivel de modelo tiene cada uno; eso está en `.work/runs/<run>/run.md`, que el plugin no puede leer.

## Probarlo

```bash
orca plugin validate orca-plugin --json   # manifiesto como lo carga Orca
orca plugin test orca-plugin --json       # 48 pruebas: src/kit.test.ts, src/worker.test.ts y src/panel.test.tsx
orca plugin check orca-plugin --json
orca plugin inspect orca-plugin --json    # qué aporta y qué acceso pide
bash scripts/check.sh                     # comprobación estática del manifiesto, también en CI (sin Orca)
```

Las pruebas usan `orca/testing`: `mountWorker` sobre un host simulado con las capacidades del manifiesto. Cubren el hook (con y sin cabecera del kit, otros `inputKind`, el modo apagado e idempotencia), los comandos (literal enviado, workspace sin identificar, fallo de Orca notificado, id de agente hostil) y la barra (eventos, siembra inicial, desactivada). El panel se prueba con `mount`: ajustes leídos y guardados, id de agente no válido rechazado, cada botón con su acción, un fallo del worker enseñado y los agentes que envía el worker; y el worker rechaza cualquier acción del panel fuera de las tres. La detección de `omk` ausente se prueba con los mensajes reales de cada shell.

Para probarlo en Orca sin instalarlo: `orca plugin dev watch orca-plugin --json`. También pide aprobación, y `Ctrl-C` lo descarga.

RISK: con Orca 1.4.252, `orca plugin test` falla al importar `orca-runtime.mjs` cuando la ruta del plugin contiene una carpeta que empieza por punto (por ejemplo `.claude/worktrees/…`). Si te pasa, copia `orca-plugin/` a una ruta sin carpetas ocultas y ejecútalo allí.
