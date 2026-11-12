// Worker del plugin: comandos de paleta del kit, referencia al contrato del worker en los
// despachos de orquestación, la skill orca en los prompts de arranque, los agentes con nombre en
// la barra de estado y el panel, sus avisos, y las peticiones del panel (acciones, equipo y repartir).
// Las pestañas Avisos, Worktrees e Historial viven en src/worker/: este núcleo oye a Orca una sola
// vez y les reparte los sucesos (src/worker/context.ts).
// Orca transpila este fichero al cargarlo: no hay paso de build.
import type { OrcaWorkerApi } from 'orca/worker'
import {
  INSTALL_HINT,
  TASK_MAX,
  blockedNotice,
  cleanLabel,
  describeAgents,
  agentFromPaneKey,
  canonicalWorkspaceId,
  forgetRunUnit,
  groupAgents,
  indexWorkspaces,
  isKitAction,
  isMissingCommand,
  isValidAgentId,
  orchestratePrompt,
  parseContractHintMode,
  parseDispatch,
  parseTeam,
  pollUntil,
  resolveFocusedWorkspaceId,
  summarizeAgents,
  teamCommand,
  trackRun,
  withContractHint,
  withOrchestrateHint,
  type ContractHintMode,
  type KitAction,
  type Notice,
  type RunProgress,
  type TrackedAgent,
  type WorkspaceEntry,
  type WorkspaceIndex
} from './kit.ts'
import type { AgentsView } from './protocol.ts'
import { createBus, type KitContext, type TerminalInfo } from './worker/context.ts'
import { registerHistory } from './worker/history.ts'
import { registerNotices } from './worker/notices.ts'
import { registerWorktrees } from './worker/worktrees.ts'

const STATUS_ITEM = 'agents'
const INIT_PROMPT = 'inicializa el proyecto'
const DEFAULT_INIT_AGENT = 'claude'
// `omk verify` tarda poco; si en ~15 s no hay error de "comando no encontrado", existe.
const MISSING_CHECK = { attempts: 10, delayMs: 1500 }
// Terminales de los que se recuerda qué agente y qué unidad llevan; los más antiguos se olvidan.
const TERMINALS_MAX = 200
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
  let notifyEnabled = true
  let autoOrchestrate = true
  let initAgent: unknown = DEFAULT_INIT_AGENT
  const agents = new Map<string, TrackedAgent>()
  const terminals = new Map<string, TerminalInfo>()
  let workspaces: WorkspaceIndex = indexWorkspaces([])
  // Ids que `workspace.list` no trajo: no se vuelve a pedir la lista por ellos.
  const unnamedWorkspaces = new Set<string>()
  const runs: RunProgress = new Map()
  let refreshing: Promise<void> | null = null
  let postedView = ''
  const bus = createBus((message) => orca.log(message))

  const notify = (title: string, body: string) => {
    void host.call('notifications.show', { title, body }).catch((error: unknown) => {
      orca.log(`notificación no entregada (${title}): ${describeError(error)}`)
    })
  }

  const announce = (notice: Notice | null) => {
    if (notice && notifyEnabled) notify(notice.title, notice.body)
  }

  // Una unidad cambia de estado en su run; si con ella terminan todas, se avisa y se cuenta.
  const progress = (run: string, key: string, state: TrackedAgent['state'], at: number) => {
    const notice = trackRun(runs, run, key, state)
    announce(notice)
    if (notice) bus.emit('runDone', { run, notice, at })
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

  const canonical = (workspaceId: string | null) =>
    workspaceId === null ? null : canonicalWorkspaceId(workspaceId, workspaces)

  // Con la lista nueva, los agentes que llegaron con el id en otro formato pasan al de la lista.
  const rememberWorkspaces = (
    list: readonly (WorkspaceEntry & { path: string; kind?: string | null })[]
  ) => {
    workspaces = indexWorkspaces(list)
    for (const [key, agent] of agents) {
      const workspaceId = canonical(agent.workspaceId)
      if (workspaceId !== agent.workspaceId) agents.set(key, { ...agent, workspaceId })
    }
  }

  const focusedWorkspaceId = async () => {
    const [focused, list] = await Promise.all([
      host.call('workspace.readContext'),
      host.call('workspace.list')
    ])
    rememberWorkspaces(list.workspaces)
    return resolveFocusedWorkspaceId(focused, list.workspaces)
  }

  const agentsView = (): AgentsView => {
    const groups = groupAgents(agents, workspaces.byId)
    return { ...summarizeAgents(agents.values(), groups), groups }
  }

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

  const refreshWorkspaces = () => {
    refreshing ??= host
      .call('workspace.list')
      .then((list) => rememberWorkspaces(list.workspaces))
      .catch((error: unknown) => orca.log(`nombres de workspace no leídos: ${describeError(error)}`))
      .finally(() => {
        refreshing = null
        renderStatus()
      })
    return refreshing
  }

  // El nombre que se conoce ya; si el id es nuevo, se pide la lista una vez y se repinta.
  const workspaceName = (workspaceId: string | null) => {
    if (!workspaceId) return null
    const name = workspaces.byId.get(workspaceId)?.name
    if (name === undefined && !unnamedWorkspaces.has(workspaceId)) {
      unnamedWorkspaces.add(workspaceId)
      void refreshWorkspaces().then(() => {
        if (!workspaces.byId.has(canonical(workspaceId) ?? '')) {
          orca.log(`workspace.list no trae ${workspaceId}: sus agentes salen sin nombre de workspace`)
        }
      })
    }
    return name ?? null
  }

  const rememberTerminal = (terminalId: string, info: TerminalInfo) => {
    const merged = { ...terminals.get(terminalId), ...info }
    terminals.delete(terminalId)
    terminals.set(terminalId, merged)
    if (terminals.size > TERMINALS_MAX) {
      const oldest = terminals.keys().next().value
      if (oldest !== undefined) terminals.delete(oldest)
    }
  }

  // Un despacho del kit da nombre a su terminal: unidad, rol y run.
  const learnPrompt = (terminalId: string, agent: string | null, prompt: string) => {
    const unit = parseDispatch(prompt)
    const id = agent ? cleanLabel(agent, 40) : null
    if (!unit && !id) return
    rememberTerminal(terminalId, { ...(id ? { agent: id } : {}), ...(unit ? { unit } : {}) })
    const key = `t:${terminalId}`
    if (unit) bus.emit('dispatch', { key, terminalId, unit, agent: id, at: Date.now() })
    const tracked = agents.get(key)
    if (!tracked) return
    agents.set(key, { ...tracked, agent: id ?? tracked.agent ?? null, unit: unit ?? tracked.unit ?? null })
    if (unit) progress(unit.run, key, tracked.state, Date.now())
    renderStatus()
  }

  const loadSettings = async () => {
    try {
      const settings = await orca.settings.get()
      contractHint = parseContractHintMode(settings.contractHint)
      statusBarEnabled = settings.statusBar !== false
      notifyEnabled = settings.notify !== false
      autoOrchestrate = settings.autoOrchestrate !== false
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

  // `command` es siempre un literal o sale de `teamCommand` (ids validados): nunca se interpola
  // texto libre del usuario ni de terceros en el terminal.
  const runOmk = (title: string, command: string) =>
    guarded(title, async () => {
      const workspaceId = await focusedWorkspaceId()
      if (!workspaceId) {
        notify('Orca Multiagent Kit', NO_WORKSPACE)
        return NO_WORKSPACE
      }
      const { terminalId } = await host.call('terminal.create', { workspaceId, title, command })
      void warnIfOmkMissing(terminalId).catch((error: unknown) => {
        orca.log(`no pude leer la salida de ${title}: ${describeError(error)}`)
      })
      return `Ejecutando \`${command}\` en un terminal nuevo del workspace activo.`
    })

  const subcommand = (name: OmkSubcommand) => runOmk(`omk ${name}`, `omk ${name}`)

  const launchAgent = (label: string, agent: string, prompt: string, done: string) =>
    guarded(label, async () => {
      const workspaceId = await focusedWorkspaceId()
      if (!workspaceId) {
        notify('Orca Multiagent Kit', NO_WORKSPACE)
        return NO_WORKSPACE
      }
      await host.call('agent.launch', { workspaceId, agent, prompt })
      return done
    })

  const initProject = async () => {
    if (!isValidAgentId(initAgent)) {
      const message = `El ajuste «Agente para inicializar» no es un id de agente válido: ${String(initAgent)}`
      notify('Orca Multiagent Kit', message)
      return message
    }
    return launchAgent(
      'inicializar proyecto',
      initAgent,
      INIT_PROMPT,
      `Lanzado ${initAgent} con «${INIT_PROMPT}» (skill kit-init) en el workspace activo.`
    )()
  }

  // Los hooks no deniegan nunca: si no aplican, el prompt o el lanzamiento pasan intactos. Un
  // fallo o un timeout también (`onError: "pass"`): son una ayuda, no un control.
  // Un despacho lleva el contrato del worker; un prompt de arranque, la indicación de pasar por la
  // skill orca. Son excluyentes: cada uno mira un `inputKind` distinto.
  orca.hooks.on('agent.prompt.before', (event, next) => {
    learnPrompt(event.terminalId, event.agent, event.prompt)
    const prompt =
      withContractHint(event.prompt, event.inputKind, contractHint) ??
      withOrchestrateHint(event.prompt, event.inputKind, autoOrchestrate)
    return prompt === null ? undefined : next({ ...event, prompt })
  })

  orca.hooks.on('agent.launch.before', (event) => {
    if (!event.terminalId) return
    const agent = cleanLabel(event.agent, 40)
    rememberTerminal(event.terminalId, {
      ...(agent ? { agent } : {}),
      ...(event.workspaceId ? { workspaceId: event.workspaceId } : {})
    })
    if (agent) {
      const { terminalId, workspaceId, command } = event
      bus.emit('launch', { terminalId, agent, workspaceId, command, at: Date.now() })
    }
  })

  // Solo observa: Orca no espera a este hook.
  orca.hooks.on('agent.tool.after', (event) => {
    bus.emit('tool', {
      agent: event.agent,
      workspaceId: event.workspaceId,
      terminalId: event.terminalId ?? null,
      tool: event.tool,
      input: event.input,
      at: Date.now()
    })
  })

  const actions: Record<KitAction, () => Promise<string>> = {
    verify: subcommand('verify'),
    update: subcommand('update'),
    init: initProject
  }

  orca.commands.register('kit.verify', actions.verify)
  orca.commands.register('kit.update', actions.update)
  orca.commands.register('kit.init', actions.init)
  orca.commands.register('agents.status', async () => describeAgents(groupAgents(agents, workspaces.byId)))

  // El panel solo elige entre las acciones fijas de arriba; cualquier otro valor se rechaza.
  orca.panels.handle('kit.run', async (input) => {
    const action: unknown = input?.action
    if (!isKitAction(action)) throw invalidParams(`acción desconocida: ${String(action)}`)
    return { message: await actions[action]() }
  })
  orca.panels.handle('agents.summary', () => agentsView())

  orca.panels.handle('agents.open', async (input) => {
    const id: unknown = input?.id
    const agent = typeof id === 'string' ? agents.get(id) : undefined
    if (!agent?.workspaceId) throw invalidParams('ese agente ya no está activo o no tiene workspace')
    await host.call('workspace.open', { workspaceId: agent.workspaceId })
    return { message: `Abierto ${workspaceName(agent.workspaceId) ?? 'su workspace'}.` }
  })

  orca.panels.handle('team.apply', async (input) => {
    const team = parseTeam(input?.team)
    if (!team) throw invalidParams('equipo no válido: revisa los proveedores y los roles')
    const command = teamCommand(team)
    if (command === null) {
      throw invalidParams('el equipo no cabe en una orden de terminal: quita roles propios o acorta sus textos')
    }
    return { message: await runOmk('omk team', command)() }
  })

  orca.panels.handle('team.show', async () => ({ message: await runOmk('omk team', 'omk team')() }))

  orca.panels.handle('team.orchestrate', async (input) => {
    const agent: unknown = input?.agent
    if (!isValidAgentId(agent)) throw invalidParams('el coordinador no es un id de agente válido')
    const prompt = orchestratePrompt(input?.task, input?.source)
    if (prompt === null) throw invalidParams(`falta la tarea, pasa de ${TASK_MAX} caracteres o la entrada no existe`)
    const done = `Lanzado ${agent} con la skill orca en el workspace activo.`
    const message = await launchAgent('orquestar', agent, prompt, done)()
    if (message === done) {
      const task = cleanLabel(typeof input?.task === 'string' ? input.task : '', 120)
      bus.emit('action', { kind: 'orchestrate', title: `Repartir con ${agent}`, detail: task, agentKey: null, run: null, at: Date.now() })
    }
    return { message }
  })

  orca.events.on('agent.status.changed', (event) => {
    const key = event.terminalId ? `t:${event.terminalId}` : `p:${event.paneKey}`
    const previous = agents.get(key)
    const info = event.terminalId ? terminals.get(event.terminalId) : undefined
    const agent: TrackedAgent = {
      workspaceId: canonical(event.workspaceId ?? previous?.workspaceId ?? info?.workspaceId ?? null),
      // Orca no siempre manda el título: el que ya se conocía no se pierde.
      title: cleanLabel(event.title ?? '') ?? previous?.title ?? null,
      state: event.state,
      agent: info?.agent ?? previous?.agent ?? (event.terminalId ? null : agentFromPaneKey(event.paneKey)),
      unit: info?.unit ?? previous?.unit ?? null,
      since: previous?.state === event.state ? (previous.since ?? null) : event.receivedAt,
      // Sin terminal y con panel de chat: es un chat de Orca. Sin ninguno de los dos, no se sabe.
      terminalId: event.terminalId ?? (agentFromPaneKey(event.paneKey) ? null : previous?.terminalId),
      outcome: event.mainAgent?.outcome ?? previous?.outcome ?? null,
      updatedAt: event.receivedAt
    }
    if (agent.state === 'done') agents.delete(key)
    else agents.set(key, agent)
    announce(blockedNotice(previous?.state, agent, workspaceName(agent.workspaceId)))
    if (agent.unit) progress(agent.unit.run, key, agent.state, event.receivedAt)
    bus.emit('agent', {
      key,
      previous,
      agent: agent.state === 'done' ? null : agent,
      state: agent.state,
      outcome: agent.outcome ?? null,
      at: event.receivedAt
    })
    renderStatus()
  })

  orca.events.on('workspace.removed', (event) => {
    const removed = new Set([event.workspaceId, canonical(event.workspaceId)])
    for (const [key, agent] of agents) {
      if (agent.workspaceId === null || !removed.has(agent.workspaceId)) continue
      agents.delete(key)
      forgetRunUnit(runs, key)
    }
    for (const [terminalId, info] of terminals) {
      if (info.workspaceId !== undefined && removed.has(canonical(info.workspaceId))) terminals.delete(terminalId)
    }
    bus.emit('workspaceRemoved', { workspaceId: canonical(event.workspaceId) ?? event.workspaceId, at: Date.now() })
    renderStatus()
  })

  const ctx: KitContext = {
    host,
    panels: orca.panels,
    storage: orca.storage,
    log: (message) => orca.log(message),
    notify: (title, body) => {
      if (notifyEnabled) notify(title, body)
    },
    agents,
    terminals,
    workspaces: () => workspaces,
    workspaceName,
    refreshWorkspaces,
    ...bus
  }
  registerNotices(ctx)
  registerWorktrees(ctx)
  registerHistory(ctx)

  orca.settings.onDidChange(() => {
    void loadSettings().then(renderStatus)
  })

  await loadSettings()
  try {
    // `agents.list` solo da los del workspace enfocado: son de ese workspace.
    const [{ agents: current }, workspaceId] = await Promise.all([
      host.call('agents.list'),
      focusedWorkspaceId().catch((error: unknown) => {
        orca.log(`workspace enfocado no leído; los agentes iniciales quedan sin workspace: ${describeError(error)}`)
        return null
      })
    ])
    for (const agent of current) {
      if (agent.terminalId && agent.state !== 'done') {
        agents.set(`t:${agent.terminalId}`, {
          workspaceId,
          title: cleanLabel(agent.title ?? ''),
          state: agent.state,
          agent: agent.agent ? cleanLabel(agent.agent, 40) : null,
          since: agent.stateStartedAt,
          terminalId: agent.terminalId
        })
      }
    }
  } catch (error) {
    orca.log(`agentes iniciales no leídos; la barra se rellena con los eventos: ${describeError(error)}`)
  }
  renderStatus()
}
