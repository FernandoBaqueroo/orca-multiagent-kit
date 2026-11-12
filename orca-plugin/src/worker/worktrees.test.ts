// La pestaña Worktrees en el worker: qué worktrees salen, el modelo de cada agente y los cambios.
import { afterEach, assert, mockHost, mountWorker, test, type TestWorker } from 'orca/testing'
import type { WorktreeGroup } from '../protocol.ts'
import * as main from '../worker.ts'

const workspace = (id: string, name: string, kind: 'worktree' | 'folder' = 'worktree') => ({
  id,
  kind,
  name,
  path: `/repo/${name}`,
  branch: `refs/heads/feat/${name}`,
  hostId: null
})

const RESULTS = {
  'workspace.readContext': { branch: 'main', displayName: 'app', terminals: [] },
  'workspace.list': {
    workspaces: [
      workspace('w1', 'app'),
      workspace('w2', 'u1-login'),
      workspace('w3', 'u2-pagos'),
      workspace('w4', 'otro-run'),
      workspace('w5', 'carpeta', 'folder')
    ],
    truncated: false
  },
  'agents.list': { agents: [] },
  'workspace.open': { opened: true },
  'terminal.sendText': { accepted: true },
  'notifications.show': { delivered: true },
  'statusBar.update': { ok: true }
}

let worker: TestWorker | undefined
afterEach(async () => {
  await worker?.deactivate()
  worker = undefined
})

const start = async () => {
  worker = await mountWorker(main, { host: mockHost({ results: RESULTS, settings: {} }) })
  return worker
}

const spec = (unit: string, title: string, run: string) =>
  `UNIT: ${unit} — ${title}     RUN: ${run}     BASE: abc123\nROL: Proteo · implementación · nivel medio — una unidad cada vez`

type State = 'working' | 'blocked' | 'waiting' | 'done'
const status = (terminalId: string, workspaceId: string, state: State, receivedAt: number) => ({
  workspaceId,
  paneKey: `p-${terminalId}`,
  terminalId,
  state,
  receivedAt
})
const launch = (terminalId: string, workspaceId: string, command: string, agent = 'claude') =>
  ({ agent, workspaceId, workspaceKind: 'worktree', terminalId, command, env: {} }) as const

const dispatch = (w: TestWorker, terminalId: string, text: string) =>
  w.hooks.fire('agent.prompt.before', { agent: 'claude', terminalId, prompt: text, inputKind: 'orchestration' })

// Dos unidades del mismo run en dos worktrees, la primera con `--model sonnet`.
const twoUnits = async (w: TestWorker) => {
  await w.hooks.fire('agent.launch.before', launch('t1', 'w2', 'claude --model sonnet --permission-mode plan'))
  await w.hooks.fire('agent.launch.before', launch('t2', 'w3', 'claude'))
  await dispatch(w, 't1', spec('U1', 'Login', '20261112-auth'))
  await dispatch(w, 't2', spec('U2', 'Pagos', '20261112-auth'))
  await w.emit('agent.status.changed', status('t1', 'w2', 'working', 1))
  await w.emit('agent.status.changed', status('t2', 'w3', 'waiting', 2))
}

const list = async (w: TestWorker) => ((await w.request('worktrees.list')) as { groups: WorktreeGroup[] }).groups

test('dos unidades de un run salen bajo RUN con su agente y el modelo de su orden de arranque', async () => {
  const w = await start()
  await twoUnits(w)
  const groups = await list(w)
  assert.deepEqual(groups.map((g) => g.title), ['RUN 20261112-auth'])
  const [first, second] = groups[0]?.worktrees ?? []
  assert.equal(first?.name, 'u1-login')
  assert.equal(first?.branch, 'feat/u1-login')
  assert.equal(first?.unit, 'U1 — Login')
  assert.deepEqual(first?.agents, [
    { id: 't:t1', agent: 'claude', title: 'U1 · Proteo — Login', state: 'trabajando', blocked: false, model: 'sonnet', canSetModel: true }
  ])
  assert.equal(second?.name, 'u2-pagos')
  assert.equal(second?.agents[0]?.model, null)
})

test('los worktrees con agentes fuera del kit van a «Otros», tras los runs; las carpetas no salen', async () => {
  const w = await start()
  await twoUnits(w)
  await w.emit('agent.status.changed', status('t3', 'w4', 'blocked', 3))
  await w.emit('agent.status.changed', status('t4', 'w5', 'working', 4))
  const groups = await list(w)
  assert.deepEqual(groups.map((g) => g.title), ['RUN 20261112-auth', 'Otros worktrees con agentes'])
  const others = groups[1]?.worktrees ?? []
  assert.deepEqual(others.map((item) => item.name), ['otro-run'])
  assert.equal(others[0]?.agents[0]?.blocked, true)
})

test('el run más reciente va primero', async () => {
  const w = await start()
  await w.hooks.fire('agent.launch.before', launch('t1', 'w3', 'claude'))
  await w.hooks.fire('agent.launch.before', launch('t2', 'w2', 'claude'))
  await dispatch(w, 't1', spec('U1', 'A', '20261101-vieja'))
  await dispatch(w, 't2', spec('U2', 'B', '20261112-nueva'))
  assert.deepEqual((await list(w)).map((g) => g.title), ['RUN 20261112-nueva', 'RUN 20261101-vieja'])
})

test('un chat de Orca sale en su worktree sin poder cambiar el modelo', async () => {
  const w = await start()
  await w.emit('agent.status.changed', {
    workspaceId: 'w2',
    paneKey: 'structured-agent-session-claude_abc:1',
    state: 'waiting',
    receivedAt: 1
  })
  const [agent] = (await list(w))[0]?.worktrees[0]?.agents ?? []
  assert.equal(agent?.agent, 'claude')
  assert.equal(agent?.canSetModel, false)
  assert.equal(agent?.model, null)
  await assert.rejects(w.request('worktrees.model', { id: agent?.id ?? '', model: 'opus' }), /terminal/)
  assert.equal(w.host.callsOf('terminal.sendText').length, 0)
})

test('cambiar el modelo de un agente que espera manda /model e Intro a su terminal', async () => {
  const w = await start()
  await twoUnits(w)
  const reply = await w.request('worktrees.model', { id: 't:t2', model: 'opus' })
  assert.match(reply.message, /opus/)
  assert.deepEqual(w.host.callsOf('terminal.sendText'), [{ terminalId: 't2', text: '/model opus', enter: true }])
  assert.equal((await list(w))[0]?.worktrees[1]?.agents[0]?.model, 'opus')
  assert.ok(w.posts.some((p) => p.event === 'worktrees.changed'))
})

test('trabajando o bloqueado, o con un modelo hostil, se rechaza sin enviar nada', async () => {
  const w = await start()
  await twoUnits(w)
  await assert.rejects(w.request('worktrees.model', { id: 't:t1', model: 'opus' }), /espera a que termine su turno/)
  await w.emit('agent.status.changed', status('t1', 'w2', 'blocked', 5))
  await assert.rejects(w.request('worktrees.model', { id: 't:t1', model: 'opus' }), /espera a que termine su turno/)
  for (const model of ['opus; rm -rf /', 'opus\nrm', '', 'Opus']) {
    await assert.rejects(w.request('worktrees.model', { id: 't:t2', model }), /modelo no válido/)
  }
  await assert.rejects(w.request('worktrees.model', { id: 't:nadie', model: 'opus' }), /ya no está activo/)
  assert.equal(w.host.callsOf('terminal.sendText').length, 0)
})

test('abrir solo vale para un worktree de la lista', async () => {
  const w = await start()
  await twoUnits(w)
  assert.deepEqual(await w.request('worktrees.open', { workspaceId: 'w3' }), { message: 'Abierto u2-pagos.' })
  assert.deepEqual(w.host.callsOf('workspace.open'), [{ workspaceId: 'w3' }])
  await assert.rejects(w.request('worktrees.open', { workspaceId: 'w1' }), /ya no está en la lista/)
  await assert.rejects(w.request('worktrees.open', { workspaceId: 'w5' }), /ya no está en la lista/)
  assert.equal(w.host.callsOf('workspace.open').length, 1)
})

test('publica worktrees.changed solo cuando cambia y quita el workspace borrado', async () => {
  const w = await start()
  await twoUnits(w)
  const count = () => w.posts.filter((p) => p.event === 'worktrees.changed').length
  const before = count()
  await w.emit('agent.status.changed', status('t2', 'w3', 'waiting', 9))
  assert.equal(count(), before)
  await w.emit('workspace.removed', { workspaceId: 'w3', kind: 'worktree', path: '/repo/u2-pagos' })
  assert.equal(count(), before + 1)
  assert.deepEqual((await list(w))[0]?.worktrees.map((item) => item.name), ['u1-login'])
})
