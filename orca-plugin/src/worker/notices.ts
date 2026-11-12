// Pestaña Avisos: lo que espera a la persona (planes de rondas por confirmar, agentes bloqueados o
// esperando) y sus respuestas, que se escriben en el terminal del agente.
// Estado en memoria: un aviso por agente que espera (clave del núcleo) y uno por plan (`plan:<run>`).
import { agentName, cleanLabel, type TrackedAgent } from '../kit.ts'
import { parsePlan, planPathRun } from '../plan-card.ts'
import type { NoticeItem } from '../protocol.ts'
import type { KitContext, KitEvents } from './context.ts'

const CONTEXT_READ_LINES = 40
const CONTEXT_LINES = 12
const CONTEXT_LINE_MAX = 200
const PLAN_BYTES_MAX = 64 * 1024
const REPLY_MAX = 2000
const DETAIL_MAX = 120
const KIND_ORDER: Record<NoticeItem['kind'], number> = { plan: 0, blocked: 1, waiting: 2 }

// Códigos de escape de terminal (CSI y OSC) antes de quitar los demás caracteres de control.
const ANSI = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g

// Un aviso y lo que el panel no ve: el terminal al que se responde, su workspace y su run.
type Entry = {
  item: NoticeItem
  terminalId: string | null
  workspaceId: string | null
  run: string | null
}

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

export function registerNotices(ctx: KitContext): void {
  const entries = new Map<string, Entry>()
  // Avisos de agente descartados, con el estado en que se descartaron: no vuelven hasta que cambie.
  const dismissed = new Map<string, TrackedAgent['state']>()
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

  const onAgent = ({ key, agent, state, at }: KitEvents['agent']) => {
    if (agent === null || (state !== 'blocked' && state !== 'waiting')) {
      dismissed.delete(key)
      remove(key)
      return
    }
    if (dismissed.get(key) === state) return
    dismissed.delete(key)
    const previous = entries.get(key)
    const since = agent.since ?? at
    const changed = previous?.item.kind !== state || previous.item.since !== since
    const { unit } = agent
    const terminalId = agent.terminalId ?? null
    const item: NoticeItem = {
      id: key,
      kind: state,
      title: agentName(agent),
      agent: agent.agent ?? null,
      workspace: ctx.workspaceName(agent.workspaceId),
      unit: unit ? agentName({ ...agent, title: null }) : null,
      since,
      context: changed ? [] : (previous?.item.context ?? []),
      canReply: terminalId !== null,
      plan: null
    }
    entries.set(key, { item, terminalId, workspaceId: agent.workspaceId, run: unit?.run ?? null })
    publish()
    if (changed && terminalId !== null) void loadContext(key, terminalId, since)
  }

  const onTool = (event: KitEvents['tool']) => {
    if (event.tool !== 'Write') return
    const input = event.input
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return
    const { file_path: path, content } = input
    if (typeof path !== 'string' || planPathRun(path) === null) return
    if (typeof content !== 'string' || content.length > PLAN_BYTES_MAX) {
      ctx.log(`plan.json ignorado (${cleanLabel(path, 120)}): el contenido no es un texto de hasta 64 KB`)
      return
    }
    let plan
    try {
      plan = parsePlan(JSON.parse(content))
    } catch (error) {
      ctx.log(`plan.json ignorado (${cleanLabel(path, 120)}): JSON roto, ${describeError(error)}`)
      return
    }
    if (plan === null) {
      ctx.log(`plan.json ignorado (${cleanLabel(path, 120)}): no encaja con la versión 1 de plan-card.md`)
      return
    }
    const id = `plan:${plan.run}`
    const terminalId = event.terminalId
    const rounds = new Set(plan.units.map(({ round }) => round)).size
    const summary = `${plan.units.length} unidades en ${rounds} rondas`
    entries.set(id, {
      item: {
        id,
        kind: 'plan',
        title: `Plan de rondas · ${plan.run}`,
        agent: cleanLabel(event.agent, 40),
        workspace: ctx.workspaceName(event.workspaceId),
        unit: null,
        since: event.at,
        context: [],
        canReply: terminalId !== null,
        plan
      },
      terminalId,
      workspaceId: event.workspaceId,
      run: plan.run
    })
    publish()
    ctx.notify(`Plan listo: ${plan.run}`, `${summary}. Confírmalo en Avisos.`)
    ctx.emit('action', { kind: 'plan', title: `Plan listo: ${plan.run}`, detail: summary, agentKey: null, run: plan.run, at: event.at })
  }

  ctx.on('agent', onAgent)
  ctx.on('tool', onTool)
  ctx.on('workspaceRemoved', ({ workspaceId }) => {
    for (const [id, entry] of entries) {
      if (entry.item.kind !== 'plan' && entry.workspaceId === workspaceId) entries.delete(id)
    }
    for (const key of dismissed.keys()) if (!ctx.agents.has(key)) dismissed.delete(key)
    publish()
  })

  ctx.panels.handle('notices.list', () => ({ items: items() }))

  ctx.panels.handle('notices.reply', async (input) => {
    const id: unknown = input?.id
    const entry = typeof id === 'string' ? entries.get(id) : undefined
    if (!entry) throw invalidParams('ese aviso ya no existe')
    const { terminalId } = entry
    if (!entry.item.canReply || terminalId === null) throw invalidParams('a ese aviso no se le puede escribir desde aquí')
    const text = replyText(input?.text)
    const { accepted } = await ctx.host.call('terminal.sendText', { terminalId, text, enter: true })
    if (!accepted) throw Object.assign(new Error('el terminal no aceptó el texto: puede que ya se haya cerrado'), { code: 'unavailable' })
    const { title } = entry.item
    // Respondido: no vuelve hasta que el agente cambie de estado (un evento repetido no lo resucita).
    if (entry.item.kind !== 'plan') dismissed.set(entry.item.id, entry.item.kind)
    entries.delete(entry.item.id)
    publish()
    ctx.emit('action', {
      kind: 'reply',
      title: `Respuesta a ${title}`,
      detail: cleanLabel(text, DETAIL_MAX),
      agentKey: `t:${terminalId}`,
      run: entry.run,
      at: Date.now()
    })
    return { message: `Enviado a ${title}.` }
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
