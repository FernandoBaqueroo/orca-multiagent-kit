// Pestaña Worktrees: los worktrees que crea la orquestación, agrupados por run, con sus agentes y
// el modelo de cada uno. Cambiar el modelo escribe `/model <x>` en el terminal de un Claude Code
// que espera instrucciones.
import { canonicalWorkspaceId, groupAgents, type TrackedAgent, type UnitInfo } from '../kit.ts'
import { isModelId, modelFromCommand } from '../models.ts'
import type { WorktreeAgent, WorktreeGroup, WorktreeItem } from '../protocol.ts'
import type { KitContext } from './context.ts'

const OTHERS_TITLE = 'Otros worktrees con agentes'
// Terminales de los que se recuerda el modelo; los más antiguos se olvidan.
const MODELS_MAX = 200

const invalidParams = (message: string) => Object.assign(new Error(message), { code: 'invalid_params' })

// La unidad de un worktree: «U2 — Pagos» si es una, «U1, U2» si son varias.
function unitText(units: readonly UnitInfo[]): string | null {
  const distinct = [...new Map(units.map((unit) => [unit.unit, unit])).values()]
  const [only] = distinct
  if (!only) return null
  if (distinct.length === 1) return only.title ? `${only.unit} — ${only.title}` : only.unit
  return distinct.map((unit) => unit.unit).join(', ')
}

type Found = { run: string | null; units: UnitInfo[]; agents: [string, TrackedAgent][] }

export function registerWorktrees(ctx: KitContext): void {
  // Modelo de cada terminal: el de su orden de arranque o el último que se pidió desde el panel.
  const models = new Map<string, string>()
  // Workspaces que `workspace.list` no trajo: no se vuelve a pedir la lista por ellos.
  const unknown = new Set<string>()
  let posted = ''

  const rememberModel = (terminalId: string, model: string | null) => {
    models.delete(terminalId)
    if (model === null) return
    models.set(terminalId, model)
    if (models.size > MODELS_MAX) {
      const oldest = models.keys().next().value
      if (oldest !== undefined) models.delete(oldest)
    }
  }

  const canSetModel = (agent: TrackedAgent) => agent.agent === 'claude' && Boolean(agent.terminalId)

  const build = (): WorktreeGroup[] => {
    const index = ctx.workspaces()
    const canonical = (id: string) => canonicalWorkspaceId(id, index)
    const isWorktree = (id: string) => index.byId.get(id)?.kind === 'worktree'
    const found = new Map<string, Found>()
    const entry = (id: string) => {
      let item = found.get(id)
      if (!item) found.set(id, (item = { run: null, units: [], agents: [] }))
      return item
    }
    const addUnit = (id: string, unit: UnitInfo) => {
      const item = entry(id)
      item.run ??= unit.run
      item.units.push(unit)
    }
    for (const info of ctx.terminals.values()) {
      if (!info.unit || !info.workspaceId) continue
      const id = canonical(info.workspaceId)
      if (isWorktree(id)) addUnit(id, info.unit)
    }
    for (const [key, agent] of ctx.agents) {
      if (agent.state === 'done' || !agent.workspaceId) continue
      const id = canonical(agent.workspaceId)
      if (!isWorktree(id)) continue
      if (agent.unit) addUnit(id, agent.unit)
      entry(id).agents.push([key, agent])
    }
    const groups = new Map<string | null, WorktreeItem[]>()
    for (const [workspaceId, { run, units, agents }] of found) {
      const info = index.byId.get(workspaceId)
      if (!info) continue
      const tracked = new Map(agents)
      const lines = groupAgents(agents, index.byId).flatMap((group) => group.agents)
      const worktreeAgents = lines.flatMap((line): WorktreeAgent[] => {
        const agent = tracked.get(line.id)
        if (!agent) return []
        return [
          {
            id: line.id,
            agent: agent.agent ?? null,
            title: line.title,
            state: line.state,
            blocked: line.blocked,
            model: agent.terminalId ? (models.get(agent.terminalId) ?? null) : null,
            canSetModel: canSetModel(agent)
          }
        ]
      })
      const item: WorktreeItem = {
        workspaceId,
        name: info.name,
        branch: info.branch,
        unit: unitText(units),
        agents: worktreeAgents
      }
      groups.set(run, [...(groups.get(run) ?? []), item])
    }
    const byName = (a: WorktreeItem, b: WorktreeItem) => a.name.localeCompare(b.name, 'es')
    // Los ids de run empiezan por la fecha: el más reciente es el mayor.
    const runs = [...groups.keys()].filter((run): run is string => run !== null).sort((a, b) => b.localeCompare(a))
    const result: WorktreeGroup[] = runs.map((run) => ({
      run,
      title: `RUN ${run}`,
      worktrees: (groups.get(run) ?? []).sort(byName)
    }))
    const others = groups.get(null)
    if (others) result.push({ run: null, title: OTHERS_TITLE, worktrees: others.sort(byName) })
    return result
  }

  // Los workspaces de agentes que `workspace.list` no conoce: se pide la lista una vez por id.
  const learnMissing = () => {
    const index = ctx.workspaces()
    const missing = [...ctx.agents.values()].flatMap(({ workspaceId }) =>
      workspaceId && !index.byId.has(canonicalWorkspaceId(workspaceId, index)) && !unknown.has(workspaceId)
        ? [workspaceId]
        : []
    )
    if (missing.length === 0) return
    for (const id of missing) unknown.add(id)
    void ctx.refreshWorkspaces().then(publish)
  }

  // Los paneles abiertos reciben los worktrees solo cuando cambian: los eventos llegan a ráfagas.
  function publish(): void {
    const groups = build()
    const serialized = JSON.stringify(groups)
    if (serialized !== posted) {
      posted = serialized
      ctx.panels.post('worktrees.changed', { groups })
    }
    learnMissing()
  }

  ctx.on('agent', publish)
  ctx.on('dispatch', publish)
  ctx.on('workspaceRemoved', publish)
  ctx.on('launch', ({ terminalId, agent, command }) => {
    if (agent === 'claude') rememberModel(terminalId, modelFromCommand(command))
    publish()
  })

  ctx.panels.handle('worktrees.list', () => ({ groups: build() }))

  ctx.panels.handle('worktrees.open', async (input) => {
    const workspaceId: unknown = input?.workspaceId
    const listed = build()
      .flatMap((group) => group.worktrees)
      .find((item) => item.workspaceId === workspaceId)
    if (!listed) throw invalidParams('ese worktree ya no está en la lista')
    await ctx.host.call('workspace.open', { workspaceId: listed.workspaceId })
    return { message: `Abierto ${listed.name}.` }
  })

  ctx.panels.handle('worktrees.model', async (input) => {
    const id: unknown = input?.id
    const model: unknown = input?.model
    const agent = typeof id === 'string' ? ctx.agents.get(id) : undefined
    if (typeof id !== 'string' || !agent || agent.state === 'done') throw invalidParams('ese agente ya no está activo')
    const terminalId = agent.terminalId
    if (!canSetModel(agent) || !terminalId) {
      throw invalidParams('solo se puede cambiar el modelo de un Claude Code con terminal')
    }
    // En `working` o `blocked` el texto acabaría en su turno o en un diálogo de permiso.
    if (agent.state !== 'waiting') throw invalidParams('espera a que termine su turno')
    if (!isModelId(model)) throw invalidParams('modelo no válido')
    const title = groupAgents([[id, agent]], ctx.workspaces().byId)[0]?.agents[0]?.title ?? 'agente'
    const { accepted } = await ctx.host.call('terminal.sendText', { terminalId, text: `/model ${model}`, enter: true })
    if (!accepted) {
      throw Object.assign(new Error('el terminal no aceptó el cambio: puede que ya se haya cerrado'), { code: 'unavailable' })
    }
    rememberModel(terminalId, model)
    ctx.emit('action', {
      kind: 'model',
      title: `Modelo de ${title} → ${model}`,
      detail: null,
      agentKey: id,
      run: agent.unit?.run ?? null,
      at: Date.now()
    })
    publish()
    return { message: `Pedido a ${title} el modelo ${model}.` }
  })
}
