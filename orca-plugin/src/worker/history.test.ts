// El historial del worker contra un almacén en memoria que se puede frenar y hacer fallar.
import { assert, test } from 'orca/testing'
import type { TrackedAgent } from '../kit.ts'
import type { HistoryEntry } from '../protocol.ts'
import { createBus, type KitContext } from './context.ts'
import { HISTORY_KEY, HISTORY_MAX, registerHistory } from './history.ts'

type Store = { data: Map<string, unknown>; sets: number; active: number; peak: number; fail: boolean; delay: boolean }
const newStore = (): Store => ({ data: new Map(), sets: 0, active: 0, peak: 0, fail: false, delay: false })

const setup = (store: Store, agents: Map<string, TrackedAgent> = new Map()) => {
  const logs: string[] = []
  const posts: HistoryEntry[][] = []
  const handlers = new Map<string, (input: unknown) => unknown>()
  const bus = createBus((message) => logs.push(message))
  const ctx = {
    ...bus,
    log: (message: string) => logs.push(message),
    agents,
    terminals: new Map([['t1', { workspaceId: 'w1' }]]),
    workspaceName: (id: string | null) => (id === 'w1' ? 'app' : null),
    storage: {
      get: async (key: string) => (store.data.has(key) ? store.data.get(key) : null),
      set: async (key: string, value: unknown) => {
        store.sets += 1
        store.active += 1
        store.peak = Math.max(store.peak, store.active)
        try {
          if (store.delay) await new Promise((resolve) => setTimeout(resolve, 5))
          if (store.fail) throw new Error('disco lleno')
          store.data.set(key, JSON.parse(JSON.stringify(value)))
        } finally {
          store.active -= 1
        }
      }
    },
    panels: {
      handle: (name: string, handler: (input: unknown) => unknown) => handlers.set(name, handler),
      post: (_event: string, payload: { items: HistoryEntry[] }) => posts.push(payload.items)
    }
  } as unknown as KitContext
  registerHistory(ctx)
  const call = (name: string) => handlers.get(name)?.(undefined) as Promise<{ items?: HistoryEntry[]; message?: string }>
  const list = async () => (await call('history.list')).items ?? []
  return { ctx, logs, posts, call, list }
}

const unit = { unit: 'U1', title: 'Avisos', run: 'r1', role: 'Proteo' }
const tracked = (state: TrackedAgent['state']): TrackedAgent => ({ workspaceId: 'w1', title: 'espera', state, agent: 'claude', unit })
const settle = () => new Promise((resolve) => setTimeout(resolve, 30))
const action = (title: string, at: number) =>
  ({ kind: 'plan', title, detail: null, agentKey: null, run: null, at }) as const

test('apunta despacho, bloqueo, final, run y acción, el último primero, y sobrevive al reinicio', async () => {
  const store = newStore()
  const first = setup(store)
  first.ctx.emit('dispatch', { key: 't:t1', terminalId: 't1', unit, agent: 'claude', at: 1 })
  first.ctx.emit('agent', { key: 't:t1', previous: tracked('working'), agent: tracked('blocked'), state: 'blocked', outcome: null, at: 2 })
  first.ctx.emit('agent', { key: 't:t1', previous: tracked('blocked'), agent: null, state: 'done', outcome: 'success', at: 3 })
  first.ctx.emit('runDone', { run: 'r1', notice: { title: 'Run r1 terminado', body: 'Todo listo' }, at: 4 })
  first.ctx.emit('action', { kind: 'reply', title: 'Respuesta a U1', detail: 'sí', agentKey: null, run: 'r1', at: 5 })
  await settle()

  const again = setup(store)
  const items = await again.list()
  assert.deepEqual(items.map((i) => i.kind), ['reply', 'run', 'outcome', 'state', 'dispatch'])
  assert.deepEqual(items.map((i) => i.tone), ['accent', 'success', 'success', 'warning', 'accent'])
  assert.equal(items[4]?.title, 'U1 · Proteo — Avisos despachado')
  assert.equal(items[4]?.workspace, 'app')
  assert.equal(items[2]?.title, 'U1 · Proteo — Avisos terminó')
  assert.equal(new Set(items.map((i) => i.id)).size, 5)
})

test('un fallo termina en danger, otro final en neutral, y lo que no es del kit no se apunta', async () => {
  const s = setup(newStore())
  s.ctx.emit('agent', { key: 'a', previous: tracked('working'), agent: null, state: 'done', outcome: 'failure', at: 1 })
  s.ctx.emit('agent', { key: 'b', previous: tracked('working'), agent: null, state: 'done', outcome: null, at: 2 })
  s.ctx.emit('agent', { key: 'c', previous: { ...tracked('working'), unit: null }, agent: null, state: 'done', outcome: 'success', at: 3 })
  s.ctx.emit('agent', { key: 'd', previous: tracked('blocked'), agent: tracked('blocked'), state: 'blocked', outcome: null, at: 4 })
  assert.deepEqual((await s.list()).map((i) => i.tone), ['neutral', 'danger'])
})

test('guarda las 200 más recientes', async () => {
  const s = setup(newStore())
  for (let at = 1; at <= HISTORY_MAX + 5; at += 1) s.ctx.emit('action', action(`plan ${at}`, at))
  const items = await s.list()
  assert.equal(items.length, HISTORY_MAX)
  assert.equal(items[0]?.title, `plan ${HISTORY_MAX + 5}`)
  assert.equal(items.at(-1)?.title, 'plan 6')
})

test('un history.v1 dañado no rompe el arranque y se descarta entrada a entrada', async () => {
  const bad = newStore()
  bad.data.set(HISTORY_KEY, { no: 'lista' })
  const a = setup(bad)
  assert.deepEqual(await a.list(), [])
  assert.equal(a.logs.length, 1)

  const mixed = newStore()
  const good = { id: '9-1', at: 9, kind: 'run', tone: 'success', title: 'ok', detail: null, run: null, unit: null, agent: null, workspace: null }
  mixed.data.set(HISTORY_KEY, [good, 7, { ...good, kind: 'otro' }, null])
  const b = setup(mixed)
  assert.deepEqual((await b.list()).map((i) => i.id), ['9-1'])
  assert.equal(b.logs.length, 1)
})

test('una ráfaga de 20 sucesos nunca tiene dos escrituras a la vez y deja guardado lo último', async () => {
  const store = newStore()
  store.delay = true
  const s = setup(store)
  for (let at = 1; at <= 20; at += 1) s.ctx.emit('action', action(`m${at}`, at))
  await new Promise((resolve) => setTimeout(resolve, 100))
  assert.equal(store.peak, 1)
  assert.ok(store.sets <= 2, `escrituras: ${store.sets}`)
  assert.equal((store.data.get(HISTORY_KEY) as HistoryEntry[])[0]?.title, 'm20')
  assert.equal(s.posts.length, 20)
})

test('un fallo de escritura va al log y no pierde lo que hay en memoria', async () => {
  const store = newStore()
  store.fail = true
  const s = setup(store)
  s.ctx.emit('action', action('uno', 1))
  await settle()
  assert.ok(s.logs.some((l) => l.includes('disco lleno')))
  assert.equal((await s.list()).length, 1)
  store.fail = false
  s.ctx.emit('action', action('dos', 2))
  await settle()
  assert.equal((store.data.get(HISTORY_KEY) as HistoryEntry[]).length, 2)
})

test('limpia y acota los textos', async () => {
  const s = setup(newStore())
  s.ctx.emit('action', { ...action(`a\u0007\n${'b'.repeat(300)}`, 1), detail: 'x'.repeat(500) })
  const [entry] = await s.list()
  assert.ok(entry && entry.title.length <= 120 && !/[\u0007\n]/.test(entry.title))
  assert.ok(entry && (entry.detail?.length ?? 0) <= 200)
})

test('history.clear vacía, guarda y avisa', async () => {
  const store = newStore()
  const s = setup(store)
  s.ctx.emit('action', action('uno', 1))
  assert.equal((await s.call('history.clear')).message, 'Historial vaciado.')
  assert.deepEqual(store.data.get(HISTORY_KEY), [])
  assert.deepEqual(await s.list(), [])
  assert.deepEqual(s.posts.at(-1), [])
})
