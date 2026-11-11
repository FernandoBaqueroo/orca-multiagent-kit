// Worker del plugin: comandos de paleta del kit, referencia al contrato del worker en los
// despachos de orquestación, un resumen de agentes en la barra de estado y las peticiones del panel.
// Orca transpila este fichero al cargarlo: no hay paso de build.
import type { OrcaWorkerApi } from 'orca/worker'
import {
  INSTALL_HINT,
  agentLines,
  describeAgents,
  isKitAction,
  isMissingCommand,
  isValidAgentId,
  parseContractHintMode,
  pollUntil,
  resolveFocusedWorkspaceId,
  summarizeAgents,
  withContractHint,
  type ContractHintMode,
  type KitAction,
  type TrackedAgent
} from './kit.ts'
import type { AgentsView } from './protocol.ts'

const STATUS_ITEM = 'agents'
const INIT_PROMPT = 'inicializa el proyecto'
const DEFAULT_INIT_AGENT = 'claude'
// `omk verify` tarda poco; si en ~15 s no hay error de "comando no encontrado", existe.
const MISSING_CHECK = { attempts: 10, delayMs: 1500 }
const NO_WORKSPACE =
  'No identifico el workspace activo. Abre el proyecto en Orca y vuelve a lanzar el comando.'

type OmkSubcommand = 'verify' | 'update'

// Esperas pendientes de las comprobaciones de `omk`: `deactivate` las cancela al parar el worker.
const pendingTimers = new Set<ReturnType<typeof setTimeout>>()
const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer)
      resolve()
    }, ms)
    pendingTimers.add(timer)
  })

export function deactivate(): void {
  for (const timer of pendingTimers) clearTimeout(timer)
  pendingTimers.clear()
}
// Los errores del host son `Error` con `code` (host-api §Errors); el tipo no lo declara.
const describeError = (error: unknown) =>
  error instanceof Error ? `${(error as { code?: string }).code ?? 'error'}: ${error.message}` : String(error)

// Un `code` de error del host llega tal cual al panel (`plugin.request` lo rechaza con él).
const invalidParams = (message: string) => Object.assign(new Error(message), { code: 'invalid_params' })

export default async function activate(orca: OrcaWorkerApi): Promise<void> {
  const { host } = orca
  let contractHint: ContractHintMode = 'kit'
  let statusBarEnabled = true
  let initAgent: unknown = DEFAULT_INIT_AGENT
  const agents = new Map<string, TrackedAgent>()
  let postedView = ''

  const notify = (title: string, body: string) => {
    void host.call('notifications.show', { title, body }).catch((error: unknown) => {
      orca.log(`notificación no entregada (${title}): ${describeError(error)}`)
    })
  }

  // Un fallo de Orca en un comando se cuenta al usuario; nunca se queda en silencio.
  const guarded = (label: string, run: () => Promise<string>) => async () => {
    try {
      return await run()
    } catch (error) {
      const message = `${label}: ${describeError(error)}`
      orca.log(message)
      notify('Orca Multiagent Kit', message)
      return message
    }
  }

  const focusedWorkspaceId = async () => {
    const [focused, list] = await Promise.all([
      host.call('workspace.readContext'),
      host.call('workspace.list')
    ])
    return resolveFocusedWorkspaceId(focused, list.workspaces)
  }

  const agentsView = (): AgentsView => ({
    ...summarizeAgents(agents.values()),
    agents: agentLines(agents.values())
  })

  // Los paneles abiertos reciben el resumen solo cuando cambia: los eventos de estado llegan a
  // ráfagas y Orca limita los envíos (200 cada 10 s).
  const postAgents = (view: AgentsView) => {
    const serialized = JSON.stringify(view)
    if (serialized === postedView) return
    postedView = serialized
    orca.panels.post('agents.changed', view)
  }

  const renderStatus = () => {
    const view = agentsView()
    postAgents(view)
    const update = statusBarEnabled
      ? { id: STATUS_ITEM, visible: true, text: view.text, tone: view.tone, tooltip: view.tooltip }
      : { id: STATUS_ITEM, visible: false }
    void host.call('statusBar.update', update).catch((error: unknown) => {
      orca.log(`barra de estado sin actualizar: ${describeError(error)}`)
    })
  }

  const loadSettings = async () => {
    try {
      const settings = await orca.settings.get()
      contractHint = parseContractHintMode(settings.contractHint)
      statusBarEnabled = settings.statusBar !== false
      initAgent = settings.initAgent ?? DEFAULT_INIT_AGENT
    } catch (error) {
      orca.log(`ajustes no leídos, uso los valores por defecto: ${describeError(error)}`)
    }
  }

  const warnIfOmkMissing = async (terminalId: string) => {
    const missing = await pollUntil(
      async () => (await host.call('terminal.read', { terminalId, maxLines: 40 })).lines,
      (lines) => isMissingCommand(lines),
      { ...MISSING_CHECK, sleep }
    )
    if (missing) notify('omk no está instalado', INSTALL_HINT)
  }

  const runOmk = (subcommand: OmkSubcommand) =>
    guarded(`omk ${subcommand}`, async () => {
      const workspaceId = await focusedWorkspaceId()
      if (!workspaceId) {
        notify('Orca Multiagent Kit', NO_WORKSPACE)
        return NO_WORKSPACE
      }
      // Literal fijo: nunca se interpola texto del usuario ni de terceros en el terminal.
      const command = `omk ${subcommand}`
      const { terminalId } = await host.call('terminal.create', { workspaceId, title: command, command })
      void warnIfOmkMissing(terminalId).catch((error: unknown) => {
        orca.log(`no pude leer la salida de ${command}: ${describeError(error)}`)
      })
      return `Ejecutando \`${command}\` en un terminal nuevo del workspace activo.`
    })

  const initProject = guarded('inicializar proyecto', async () => {
    if (!isValidAgentId(initAgent)) {
      const message = `El ajuste «Agente para inicializar» no es un id de agente válido: ${String(initAgent)}`
      notify('Orca Multiagent Kit', message)
      return message
    }
    const workspaceId = await focusedWorkspaceId()
    if (!workspaceId) {
      notify('Orca Multiagent Kit', NO_WORKSPACE)
      return NO_WORKSPACE
    }
    await host.call('agent.launch', { workspaceId, agent: initAgent, prompt: INIT_PROMPT })
    return `Lanzado ${initAgent} con «${INIT_PROMPT}» (skill kit-init) en el workspace activo.`
  })

  // El hook no deniega nunca: si no aplica, el prompt pasa intacto. Un fallo o un timeout
  // también lo dejan pasar (`onError: "pass"`): es una ayuda al worker, no un control.
  orca.hooks.on('agent.prompt.before', (event, next) => {
    const prompt = withContractHint(event.prompt, event.inputKind, contractHint)
    return prompt === null ? undefined : next({ ...event, prompt })
  })

  const actions: Record<KitAction, () => Promise<string>> = {
    verify: runOmk('verify'),
    update: runOmk('update'),
    init: initProject
  }

  orca.commands.register('kit.verify', actions.verify)
  orca.commands.register('kit.update', actions.update)
  orca.commands.register('kit.init', actions.init)
  orca.commands.register('agents.status', async () => describeAgents(agents.values()))

  // El panel solo elige entre las acciones fijas de arriba; cualquier otro valor se rechaza.
  orca.panels.handle('kit.run', async (input) => {
    const action: unknown = input?.action
    if (!isKitAction(action)) throw invalidParams(`acción desconocida: ${String(action)}`)
    return { message: await actions[action]() }
  })
  orca.panels.handle('agents.summary', () => agentsView())

  orca.events.on('agent.status.changed', (event) => {
    const key = event.terminalId ? `t:${event.terminalId}` : `p:${event.paneKey}`
    if (event.state === 'done') agents.delete(key)
    else agents.set(key, { workspaceId: event.workspaceId, title: event.title ?? null, state: event.state })
    renderStatus()
  })

  orca.events.on('workspace.removed', (event) => {
    for (const [key, agent] of agents) if (agent.workspaceId === event.workspaceId) agents.delete(key)
    renderStatus()
  })

  orca.settings.onDidChange(() => {
    void loadSettings().then(renderStatus)
  })

  await loadSettings()
  try {
    const { agents: current } = await host.call('agents.list')
    for (const agent of current) {
      if (agent.terminalId && agent.state !== 'done') {
        agents.set(`t:${agent.terminalId}`, { workspaceId: null, title: agent.title, state: agent.state })
      }
    }
  } catch (error) {
    orca.log(`agentes iniciales no leídos; la barra se rellena con los eventos: ${describeError(error)}`)
  }
  renderStatus()
}
