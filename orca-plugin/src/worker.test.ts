// El worker tal como lo carga Orca, contra un host simulado con las capacidades del manifiesto.
import { afterEach, assert, hostError, mockHost, mountWorker, test, type TestWorker } from 'orca/testing'
import { CONTRACT_HINT } from './kit.ts'
import * as main from './worker.ts'

const KIT_SPEC = 'UNIT: U1 — Login     RUN: 20261107-auth     BASE: abc123'

const baseResults = (overrides: Record<string, unknown> = {}) => ({
  'workspace.readContext': { branch: 'main', displayName: 'app', terminals: [] },
  'workspace.list': {
    workspaces: [{ id: 'w1', kind: 'worktree', name: 'app', path: '/repo/app', branch: 'main', hostId: null }],
    truncated: false
  },
  'agents.list': { agents: [] },
  'terminal.create': { terminalId: 't9' },
  'terminal.read': { lines: [], truncated: false },
  'agent.launch': { terminalId: 't10' },
  'notifications.show': { delivered: true },
  'statusBar.update': { ok: true },
  ...overrides
})

let worker: TestWorker | undefined
afterEach(async () => {
  await worker?.deactivate()
  worker = undefined
})

const start = async (options: { results?: Record<string, unknown>; settings?: Record<string, string | boolean> } = {}) => {
  worker = await mountWorker(main, {
    host: mockHost({ results: baseResults(options.results), settings: options.settings ?? {} })
  })
  return worker
}

const prompt = (text: string, inputKind: 'orchestration' | 'launch' | 'driving' = 'orchestration') => ({
  agent: 'claude',
  terminalId: 't1',
  prompt: text,
  inputKind
})

test('añade el contrato del worker a un despacho del kit', async () => {
  const w = await start()
  assert.deepEqual(await w.hooks.fire('agent.prompt.before', prompt(KIT_SPEC)), {
    kind: 'continue',
    event: prompt(`${KIT_SPEC}\n\n${CONTRACT_HINT}`)
  })
})

test('deja intactos los prompts que no son despachos del kit', async () => {
  const w = await start()
  for (const event of [prompt('Revisa el PR 42'), prompt(KIT_SPEC, 'launch')]) {
    assert.deepEqual(await w.hooks.fire('agent.prompt.before', event), { kind: 'continue', event })
  }
})

test('el ajuste off desactiva el hook', async () => {
  const w = await start({ settings: { contractHint: 'off' } })
  const event = prompt(KIT_SPEC)
  assert.deepEqual(await w.hooks.fire('agent.prompt.before', event), { kind: 'continue', event })
})

test('verificar abre un terminal con el literal omk verify en el workspace activo', async () => {
  const w = await start()
  const result = await w.command('kit.verify')
  assert.deepEqual(w.host.callsOf('terminal.create'), [
    { workspaceId: 'w1', title: 'omk verify', command: 'omk verify' }
  ])
  assert.equal(result, 'Ejecutando `omk verify` en un terminal nuevo del workspace activo.')
  assert.deepEqual(w.refusals, [])
})

test('actualizar usa omk update', async () => {
  const w = await start()
  await w.command('kit.update')
  assert.equal((w.host.callsOf('terminal.create')[0] as { command: string }).command, 'omk update')
})

test('sin workspace identificable no ejecuta nada y lo avisa', async () => {
  const w = await start({ results: { 'workspace.readContext': null } })
  const result = await w.command('kit.verify')
  assert.equal(w.host.callsOf('terminal.create').length, 0)
  assert.equal(w.host.callsOf('notifications.show').length, 1)
  assert.match(String(result), /No identifico el workspace activo/)
})

test('un fallo de Orca al crear el terminal se notifica, no se calla', async () => {
  const w = await start({
    results: {
      'terminal.create': () => {
        throw hostError('action_failed', 'sin pty')
      }
    }
  })
  const result = await w.command('kit.verify')
  assert.match(String(result), /^omk verify: action_failed: sin pty/)
  assert.equal(w.host.callsOf('notifications.show').length, 1)
})

test('inicializar lanza el agente configurado con «inicializa el proyecto»', async () => {
  const w = await start({ settings: { initAgent: 'codex' } })
  await w.command('kit.init')
  assert.deepEqual(w.host.callsOf('agent.launch'), [
    { workspaceId: 'w1', agent: 'codex', prompt: 'inicializa el proyecto' }
  ])
})

test('inicializar rechaza un id de agente no válido sin lanzar nada', async () => {
  const w = await start({ settings: { initAgent: 'claude; rm -rf ~' } })
  const result = await w.command('kit.init')
  assert.equal(w.host.callsOf('agent.launch').length, 0)
  assert.match(String(result), /no es un id de agente válido/)
})

test('la barra de estado sigue los cambios de estado de los agentes', async () => {
  const w = await start()
  await w.emit('agent.status.changed', {
    workspaceId: 'w1', paneKey: 'p1', terminalId: 't1', title: 'U1 login', state: 'working', receivedAt: 1
  })
  await w.emit('agent.status.changed', {
    workspaceId: 'w2', paneKey: 'p2', terminalId: 't2', title: 'U2 pagos', state: 'blocked', receivedAt: 2
  })
  const last = () => w.host.callsOf('statusBar.update').at(-1)
  assert.deepEqual(last(), {
    id: 'agents',
    visible: true,
    text: 'MAW · 1 trabajando · 1 bloqueado',
    tone: 'warning',
    tooltip: 'Orca Multiagent Kit: 1 trabajando, 1 bloqueado en todos los workspaces'
  })
  assert.equal(await w.command('agents.status'), '- U1 login: trabajando\n- U2 pagos: bloqueado')

  await w.emit('workspace.removed', { workspaceId: 'w2', kind: 'worktree', path: '/repo/u2' })
  await w.emit('agent.status.changed', {
    workspaceId: 'w1', paneKey: 'p1', terminalId: 't1', state: 'done', receivedAt: 3
  })
  assert.equal((last() as { text: string }).text, 'MAW')
  assert.deepEqual(w.refusals, [])
})

test('la barra parte de los agentes que ya existen y se oculta si se desactiva', async () => {
  const seeded = await start({
    results: {
      'agents.list': {
        agents: [{ terminalId: 't1', title: 'U1', agent: 'claude', state: 'working', stateStartedAt: 0 }]
      }
    }
  })
  assert.equal((seeded.host.callsOf('statusBar.update').at(-1) as { text: string }).text, 'MAW · 1 trabajando')
  await seeded.deactivate()

  const hidden = await start({ settings: { statusBar: false } })
  assert.deepEqual(hidden.host.callsOf('statusBar.update').at(-1), { id: 'agents', visible: false })
})
