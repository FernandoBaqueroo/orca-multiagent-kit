// Pestaña Avisos: lo que espera a la persona (planes de rondas por confirmar, agentes bloqueados o
// esperando) y sus respuestas. Con terminal, la respuesta se escribe en él; con el coordinador en un
// chat de Orca, va al buzón de su run de Orca, que se la entrega en el chat (src/worker/system.ts).
// Estado en memoria: un aviso por agente que espera (clave del núcleo) y uno por plan (`plan:<run>`).
import { ANSI, agentName, canonicalWorkspaceId, cleanLabel, type TrackedAgent } from '../kit.ts'
import { parsePlan, planPathRun } from '../plan-card.ts'
import type { NoticeItem, PlanCard } from '../protocol.ts'
import type { KitContext, KitEvents } from './context.ts'

const CONTEXT_READ_LINES = 40
const CONTEXT_LINES = 12
const CONTEXT_LINE_MAX = 200
const PLAN_BYTES_MAX = 64 * 1024
const REPLY_MAX = 2000
const DETAIL_MAX = 120
const KIND_ORDER: Record<NoticeItem['kind'], number> = { plan: 0, blocked: 1, waiting: 2 }

// Un aviso y lo que el panel no ve: el terminal o el run de Orca al que se responde, su workspace
// y su run del kit.
type Entry = {
  item: NoticeItem
  terminalId: string | null
  workspaceId: string | null
  run: string | null
  orcaRun: string | null
}

// Quién ha escrito o tiene el plan: el agente que se para o el que llama a su herramienta.
type PlanSource = { agent: string | null; terminalId: string | null; workspaceId: string | null; at: number }

const invalidParams = (message: string) => Object.assign(new Error(message), { code: 'invalid_params' })
const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error))

// Una línea sin saltos, tabuladores ni caracteres de control o de formato, recortada.
function replyText(value: unknown): string {
  if (typeof value !== 'string') throw invalidParams('el texto de la respuesta no es un texto')
  const text = value
    .replace(/\r\n|\n|\t/g, ' ')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .trim()
  if (text === '') throw invalidParams('la respuesta está vacía')
  if (text.length > REPLY_MAX) throw invalidParams(`la respuesta pasa de ${REPLY_MAX} caracteres`)
  return text
}

function contextLines(lines: readonly string[]): string[] {
  const clean: string[] = []
  for (const line of lines) {
    const text = cleanLabel(line.replace(ANSI, ''), CONTEXT_LINE_MAX)
    if (text !== null) clean.push(text)
  }
  return clean.slice(-CONTEXT_LINES)
}

/** Por dónde va la respuesta: el terminal manda; sin él, el buzón del run de Orca del coordinador. */
function route(terminalId: string | null, orcaRun: string | null): Pick<NoticeItem, 'canReply' | 'via'> {
  if (terminalId !== null) return { canReply: true, via: 'terminal' }
  if (orcaRun !== null) return { canReply: true, via: 'run' }
  return { canReply: false, via: null }
}

export function registerNotices(ctx: KitContext): void {
  const entries = new Map<string, Entry>()
  // Avisos de agente descartados, con el estado en que se descartaron: no vuelven hasta que cambie.
  const dismissed = new Map<string, TrackedAgent['state']>()
  // Por workspace del coordinador, el run de Orca de su último plan: su buzón llega a su chat.
  const coordinatorRuns = new Map<string, string>()
  // Por carpeta de workspace, hasta cuándo se han mirado sus plan.json. Los de antes de arrancar
  // el plugin no salen: son de runs ya confirmados o abandonados.
  const plansSeen = new Map<string, number>()
  const startedAt = Date.now()
  let posted = ''

  const items = () =>
    [...entries.values()]
      .map(({ item }) => item)
      .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.since - b.since)

  // Los paneles abiertos reciben la lista solo cuando cambia lo serializado.
  const publish = () => {
    const view = { items: items() }
    const serialized = JSON.stringify(view)
    if (serialized === posted) return
    posted = serialized
    ctx.panels.post('notices.changed', view)
  }

  const remove = (id: string) => {
    if (entries.delete(id)) publish()
  }

  // Lo último que pinta el terminal. Un fallo se registra y el aviso se queda sin contexto.
  const loadContext = async (id: string, terminalId: string, since: number) => {
    let lines: string[]
    try {
      lines = contextLines((await ctx.host.call('terminal.read', { terminalId, maxLines: CONTEXT_READ_LINES })).lines)
    } catch (error) {
      ctx.log(`contexto de ${id} no leído: ${describeError(error)}`)
      return
    }
    const entry = entries.get(id)
    // El agente pudo cambiar de estado o desaparecer mientras se leía.
    if (!entry || entry.item.since !== since) return
    entries.set(id, { ...entry, item: { ...entry.item, context: lines } })
    publish()
  }

  const showPlan = (plan: PlanCard, source: PlanSource) => {
    const id = `plan:${plan.run}`
    const rounds = new Set(plan.units.map(({ round }) => round)).size
    const summary = `${plan.units.length} unidades en ${rounds} rondas`
    if (plan.orcaRun !== null && source.workspaceId !== null) coordinatorRuns.set(source.workspaceId, plan.orcaRun)
    entries.set(id, {
      item: {
        id,
        kind: 'plan',
        title: `Plan de rondas · ${plan.run}`,
        agent: source.agent === null ? null : cleanLabel(source.agent, 40),
        workspace: ctx.workspaceName(source.workspaceId),
        unit: null,
        since: source.at,
        context: [],
        ...route(source.terminalId, plan.orcaRun),
        plan
      },
      terminalId: source.terminalId,
      workspaceId: source.workspaceId,
      run: plan.run,
      orcaRun: plan.orcaRun
    })
    publish()
    ctx.notify(`Plan listo: ${plan.run}`, `${summary}. Confírmalo en Avisos.`)
    ctx.emit('action', { kind: 'plan', title: `Plan listo: ${plan.run}`, detail: summary, agentKey: null, run: plan.run, at: source.at })
  }

  // Un plan.json escrito: se valida entero; lo que no encaja queda en el log y no sale.
  const learnPlan = (label: string, content: unknown, source: PlanSource) => {
    if (typeof content !== 'string' || content.length > PLAN_BYTES_MAX) {
      ctx.log(`plan.json ignorado (${label}): el contenido no es un texto de hasta 64 KB`)
      return
    }
    let plan
    try {
      plan = parsePlan(JSON.parse(content))
    } catch (error) {
      ctx.log(`plan.json ignorado (${label}): JSON roto, ${describeError(error)}`)
      return
    }
    if (plan === null) {
      ctx.log(`plan.json ignorado (${label}): no encaja con la versión 1 de plan-card.md`)
      return
    }
    showPlan(plan, source)
  }

  const workspacePath = (workspaceId: string | null) => {
    if (workspaceId === null) return null
    const index = ctx.workspaces()
    return index.byId.get(canonicalWorkspaceId(workspaceId, index))?.path ?? null
  }

  // Cuando un agente se para (también un chat de Orca, que no avisa de sus herramientas), los
  // plan.json nuevos de su workspace.
  const scanPlans = async (source: PlanSource) => {
    const path = workspacePath(source.workspaceId)
    if (path === null) return
    const since = plansSeen.get(path) ?? startedAt
    let files
    try {
      files = await ctx.system.readPlans(path, since)
    } catch (error) {
      ctx.log(`plan.json de ${cleanLabel(path, 120)} no leídos: ${describeError(error)}`)
      return
    }
    if (files.length === 0) return
    plansSeen.set(path, Math.max(since, ...files.map(({ mtimeMs }) => mtimeMs)))
    for (const file of files) learnPlan(cleanLabel(file.path, 120) ?? 'plan.json', file.content, source)
  }

  const onAgent = ({ key, agent, state, at }: KitEvents['agent']) => {
    if (agent === null || (state !== 'blocked' && state !== 'waiting')) {
      dismissed.delete(key)
      remove(key)
      return
    }
    const terminalId = agent.terminalId ?? null
    if (state === 'waiting') {
      void scanPlans({ agent: agent.agent ?? null, terminalId, workspaceId: agent.workspaceId, at })
    }
    if (dismissed.get(key) === state) return
    dismissed.delete(key)
    const previous = entries.get(key)
    const since = agent.since ?? at
    const changed = previous?.item.kind !== state || previous.item.since !== since
    const { unit } = agent
    // Un chat que coordina un run con plan: se le responde por el buzón de ese run.
    const orcaRun = terminalId === null && agent.workspaceId !== null ? (coordinatorRuns.get(agent.workspaceId) ?? null) : null
    const item: NoticeItem = {
      id: key,
      kind: state,
      title: agentName(agent),
      agent: agent.agent ?? null,
      workspace: ctx.workspaceName(agent.workspaceId),
      unit: unit ? agentName({ ...agent, title: null }) : null,
      since,
      context: changed ? [] : (previous?.item.context ?? []),
      ...route(terminalId, orcaRun),
      plan: null
    }
    entries.set(key, { item, terminalId, workspaceId: agent.workspaceId, run: unit?.run ?? null, orcaRun })
    publish()
    if (changed && terminalId !== null) void loadContext(key, terminalId, since)
  }

  const onTool = (event: KitEvents['tool']) => {
    if (event.tool !== 'Write') return
    const input = event.input
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return
    const { file_path: file, content } = input
    if (typeof file !== 'string' || planPathRun(file) === null) return
    // Visto por el hook: cuando el agente se pare no se vuelve a sacar del disco.
    const path = workspacePath(event.workspaceId)
    if (path !== null) plansSeen.set(path, Date.now())
    learnPlan(cleanLabel(file, 120) ?? 'plan.json', content, {
      agent: event.agent,
      terminalId: event.terminalId,
      workspaceId: event.workspaceId,
      at: event.at
    })
  }

  ctx.on('agent', onAgent)
  ctx.on('tool', onTool)
  ctx.on('workspaceRemoved', ({ workspaceId }) => {
    for (const [id, entry] of entries) {
      if (entry.item.kind !== 'plan' && entry.workspaceId === workspaceId) entries.delete(id)
    }
    coordinatorRuns.delete(workspaceId)
    for (const key of dismissed.keys()) if (!ctx.agents.has(key)) dismissed.delete(key)
    publish()
  })

  ctx.panels.handle('notices.list', () => ({ items: items() }))

  ctx.panels.handle('notices.reply', async (input) => {
    const id: unknown = input?.id
    const entry = typeof id === 'string' ? entries.get(id) : undefined
    if (!entry) throw invalidParams('ese aviso ya no existe')
    const { terminalId, orcaRun } = entry
    if (!entry.item.canReply || (terminalId === null && orcaRun === null)) {
      throw invalidParams('a ese aviso no se le puede escribir desde aquí')
    }
    const text = replyText(input?.text)
    const { title } = entry.item
    if (terminalId !== null) {
      const { accepted } = await ctx.host.call('terminal.sendText', { terminalId, text, enter: true })
      if (!accepted) {
        throw Object.assign(new Error('el terminal no aceptó el texto: puede que ya se haya cerrado'), { code: 'unavailable' })
      }
    } else if (orcaRun !== null) {
      await ctx.system.sendToRun(orcaRun, `Respuesta desde el panel: ${title}`, text)
    }
    // Respondido: no vuelve hasta que el agente cambie de estado (un evento repetido no lo resucita).
    if (entry.item.kind !== 'plan') dismissed.set(entry.item.id, entry.item.kind)
    entries.delete(entry.item.id)
    publish()
    const agentKey = entry.item.kind !== 'plan' ? entry.item.id : terminalId === null ? null : `t:${terminalId}`
    ctx.emit('action', {
      kind: 'reply',
      title: `Respuesta a ${title}`,
      detail: cleanLabel(text, DETAIL_MAX),
      agentKey,
      run: entry.run,
      at: Date.now()
    })
    const where = terminalId !== null ? 'a su terminal' : 'al chat del coordinador'
    return { message: `Enviado ${where}: ${title}.` }
  })

  ctx.panels.handle('notices.dismiss', (input) => {
    const id: unknown = input?.id
    const entry = typeof id === 'string' ? entries.get(id) : undefined
    if (!entry) throw invalidParams('ese aviso ya no existe')
    if (entry.item.kind !== 'plan') dismissed.set(entry.item.id, entry.item.kind)
    remove(entry.item.id)
    return { message: `Descartado: ${entry.item.title}.` }
  })
}
