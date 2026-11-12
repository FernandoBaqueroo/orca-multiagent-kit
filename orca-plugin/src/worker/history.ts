// Pestaña Historial: despachos, bloqueos, finales de unidad, runs terminados y lo que la persona
// hace desde el panel, guardados en el almacén del plugin (`history.v1`, lo más reciente primero).
import type { JsonValue } from 'orca/worker'
import { cleanLabel, type TrackedAgent, type UnitInfo } from '../kit.ts'
import type { HistoryEntry, HistoryKind, Tone } from '../protocol.ts'
import type { KitContext, KitEvents } from './context.ts'

export const HISTORY_KEY = 'history.v1'
export const HISTORY_MAX = 200
const TITLE_MAX = 120
const DETAIL_MAX = 200

const KINDS: readonly HistoryKind[] = ['kit', 'dispatch','state', 'outcome', 'run', 'plan', 'orchestrate', 'reply', 'model', 'autonomy']
const TONES: readonly Tone[] = ['neutral', 'accent', 'success', 'warning', 'danger']

const text = (value: unknown, max: number): string | null => (typeof value === 'string' ? cleanLabel(value, max) : null)

/** Una entrada guardada, o `null` si no tiene la forma de una: lo dañado no llega al panel. */
function parseEntry(value: unknown): HistoryEntry | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const { id, at, kind, tone } = raw
  if (typeof id !== 'string' || id === '' || id.length > 60) return null
  if (typeof at !== 'number' || !Number.isFinite(at)) return null
  if (!KINDS.includes(kind as HistoryKind) || !TONES.includes(tone as Tone)) return null
  const title = text(raw.title, TITLE_MAX)
  if (title === null) return null
  return {
    id,
    at,
    kind: kind as HistoryKind,
    tone: tone as Tone,
    title,
    detail: text(raw.detail, DETAIL_MAX),
    run: text(raw.run, 60),
    unit: text(raw.unit, 60),
    agent: text(raw.agent, 40),
    workspace: text(raw.workspace, 60)
  }
}

/** «U1 · Proteo — Avisos» a partir de lo que dice el despacho. */
function unitLabel(info: UnitInfo): string {
  const head = [info.unit, info.role].filter(Boolean).join(' · ')
  return info.title ? `${head} — ${info.title}` : head
}

export function registerHistory(ctx: KitContext): void {
  let items: HistoryEntry[] = []
  let counter = 0
  let dirty = false
  let draining: Promise<void> | null = null

  const loaded = (async () => {
    try {
      const stored = await ctx.storage.get(HISTORY_KEY)
      if (stored === null) return
      if (!Array.isArray(stored)) {
        ctx.log('historial: «history.v1» no es una lista; se descarta')
        return
      }
      const valid = stored.flatMap((value) => parseEntry(value) ?? [])
      if (valid.length < stored.length) ctx.log(`historial: ${stored.length - valid.length} entradas dañadas descartadas`)
      // Lo apuntado mientras se leía es más reciente que lo guardado.
      items = [...items, ...valid].slice(0, HISTORY_MAX)
    } catch (error) {
      ctx.log(`historial: no pude leer «${HISTORY_KEY}»: ${error instanceof Error ? error.message : String(error)}`)
    }
  })()

  // Una escritura en curso y, como mucho, una más detrás que recoge todo lo apuntado entretanto.
  const drain = async (): Promise<void> => {
    while (dirty) {
      dirty = false
      try {
        await ctx.storage.set(HISTORY_KEY, items as unknown as JsonValue)
      } catch (error) {
        ctx.log(`historial: no pude guardar: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    draining = null
  }
  const save = (): Promise<void> => {
    dirty = true
    draining ??= drain()
    return draining
  }

  const changed = () => ctx.panels.post('history.changed', { items })

  const record = (
    at: number,
    entry: Pick<HistoryEntry, 'kind' | 'tone'> & {
      title: string
      detail?: string | null
      run?: string | null
      unit?: string | null
      agent?: string | null
      workspaceId?: string | null
    }
  ): void => {
    const title = cleanLabel(entry.title, TITLE_MAX)
    if (title === null) return
    const next: HistoryEntry = {
      id: `${at}-${(counter += 1)}`,
      at,
      kind: entry.kind,
      tone: entry.tone,
      title,
      detail: entry.detail ? cleanLabel(entry.detail, DETAIL_MAX) : null,
      run: entry.run ? cleanLabel(entry.run, 60) : null,
      unit: entry.unit ? cleanLabel(entry.unit, 60) : null,
      agent: entry.agent ? cleanLabel(entry.agent, 40) : null,
      workspace: ctx.workspaceName(entry.workspaceId ?? null)
    }
    items = [next, ...items].slice(0, HISTORY_MAX)
    changed()
    void loaded.then(save)
  }

  ctx.on('dispatch', ({ key, terminalId, unit, agent, at }) =>
    record(at, {
      kind: 'dispatch',
      tone: 'accent',
      title: `${unitLabel(unit)} despachado`,
      run: unit.run,
      unit: unit.unit,
      agent,
      workspaceId: ctx.terminals.get(terminalId)?.workspaceId ?? ctx.agents.get(key)?.workspaceId ?? null
    })
  )

  ctx.on('agent', ({ previous, agent, outcome, at }: KitEvents['agent']) => {
    const tracked: TrackedAgent | undefined = agent ?? previous
    const unit = tracked?.unit
    if (!tracked || !unit) return
    const base = { run: unit.run, unit: unit.unit, agent: tracked.agent ?? null, workspaceId: tracked.workspaceId }
    if (agent === null) {
      const tone: Tone = outcome === 'success' ? 'success' : outcome === 'failure' ? 'danger' : 'neutral'
      record(at, {
        ...base,
        kind: 'outcome',
        tone,
        title: `${unitLabel(unit)} ${outcome === 'failure' ? 'falló' : 'terminó'}`,
        detail: outcome
      })
    } else if (agent.state === 'blocked' && previous?.state !== 'blocked') {
      record(at, { ...base, kind: 'state', tone: 'warning', title: `${unitLabel(unit)} bloqueado`, detail: agent.title })
    }
  })

  ctx.on('runDone', ({ run, notice, at }) =>
    record(at, { kind: 'run', tone: 'success', title: notice.title, detail: notice.body, run })
  )

  ctx.on('action', ({ kind, tone, title, detail, agentKey, run, at }) => {
    const tracked = agentKey === null ? undefined : ctx.agents.get(agentKey)
    record(at, {
      kind,
      tone: tone ?? 'accent',
      title,
      detail,
      run: run ?? tracked?.unit?.run ?? null,
      unit: tracked?.unit?.unit ?? null,
      agent: tracked?.agent ?? null,
      workspaceId: tracked?.workspaceId ?? null
    })
  })

  ctx.panels.handle('history.list', async () => {
    await loaded
    return { items }
  })
  ctx.panels.handle('history.clear', async () => {
    await loaded
    items = []
    changed()
    await save()
    return { message: 'Historial vaciado.' }
  })
}
