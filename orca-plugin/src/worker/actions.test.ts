// El seguimiento de la acción en curso, cargado con el núcleo contra un host simulado: el terminal
// de `omk` o del agente se lee hasta que acaba y el panel recibe cada cambio.
import { afterEach, assert, beforeEach, hostError, mockHost, mountWorker, test, type TestWorker } from 'orca/testing'
import type { JsonValue } from 'orca/worker'
import { INSTALL_HINT, OLD_OMK_HINT } from '../kit.ts'
import type { ActionView, HistoryEntry } from '../protocol.ts'
import * as main from '../worker.ts'
import { ACTION_KEY, actionTiming } from './actions.ts'

const REAL_TIMING = { ...actionTiming }

let worker: TestWorker | undefined
beforeEach(() => {
  Object.assign(actionTiming, { omkPollMs: 1, agentPollMs: 1 })
})
afterEach(async () => {
  await worker?.deactivate()
  worker = undefined
  Object.assign(actionTiming, REAL_TIMING)
})

type Options = { results?: Record<string, unknown>; storage?: Record<string, JsonValue>; settings?: Record<string, boolean> }

const start = async (lines: () => string[], options: Options = {}) => {
  worker = await mountWorker(main, {
    host: mockHost({
      results: {
        'workspace.readContext': { branch: 'main', displayName: 'app', terminals: [] },
        'workspace.list': {
          workspaces: [{ id: 'w1', kind: 'worktree', name: 'app', path: '/repo/app', branch: 'refs/heads/main', hostId: null }],
          truncated: false
        },
        'agents.list': { agents: [] },
        'terminal.create': { terminalId: 't9' },
        'terminal.read': () => ({ lines: lines(), truncated: false }),
        'terminal.sendText': { accepted: true },
        'agent.launch': { terminalId: 't10' },
        'notifications.show': { delivered: true },
        'statusBar.update': { ok: true },
        ...options.results
      },
      storage: options.storage ?? {},
      settings: options.settings ?? {}
    })
  })
  return worker
}

const current = async (w: TestWorker) => ((await w.request('kit.action')) as { action: ActionView | null }).action

// Espera a que la acción llegue a un estado: el seguimiento va por temporizadores.
const reach = async (w: TestWorker, state: ActionView['state']) => {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const action = await current(w)
    if (action?.state === state) return action
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  return assert.fail(`la acción no llegó a «${state}»: ${JSON.stringify(await current(w))}`)
}

const invalid = (error: unknown) => (error as { code?: string }).code === 'invalid_params'
const agentStatus = (state: 'working' | 'blocked' | 'waiting' | 'done', receivedAt: number) => ({
  workspaceId: 'w1',
  paneKey: 'p-t10',
  terminalId: 't10',
  state,
  receivedAt
})

test('sin nada lanzado no hay acción', async () => {
  const w = await start(() => [])
  assert.equal(await current(w), null)
})

test('verificar se sigue en su terminal hasta la línea de cierre y queda terminado', async () => {
  let output = ['PS C:\\repo> omk verify --exit-marker', '\u001b[32m  ✓\u001b[0m núcleo en ~/.agents/AGENTS.md']
  const w = await start(() => output)
  await w.request('kit.run', { action: 'verify' })
  const running = await reach(w, 'running')
  assert.equal(running.title, 'omk verify')
  assert.equal(running.kind, 'omk')
  assert.equal(running.endedAt, null)
  assert.equal(running.canAnswer, false)
  assert.deepEqual((w.host.data().storage[ACTION_KEY] as { terminalId: string }).terminalId, 't9')

  output = [...output, '  ✓ Todo correcto 14 comprobaciones', '', '[omk:fin] verify salida=0', 'PS C:\\repo>']
  const done = await reach(w, 'done')
  assert.equal(done.detail, 'Terminó sin errores.')
  assert.notEqual(done.endedAt, null)
  // Sin códigos de escape y sin la línea de cierre, que es para el plugin.
  assert.deepEqual(done.lines, [
    'PS C:\\repo> omk verify --exit-marker',
    '  ✓ núcleo en ~/.agents/AGENTS.md',
    '  ✓ Todo correcto 14 comprobaciones',
    '',
    'PS C:\\repo>'
  ])
  assert.equal(w.host.data().storage[ACTION_KEY], undefined)
  assert.deepEqual(w.posts.filter((p) => p.event === 'action.changed').map((p) => (p.payload as { action: ActionView }).action.state).at(-1), 'done')
  const history = ((await w.request('history.list')) as { items: HistoryEntry[] }).items
  assert.deepEqual(
    history.map(({ kind, tone, title }) => ({ kind, tone, title })),
    [{ kind: 'kit', tone: 'success', title: 'omk verify terminó bien' }]
  )
  assert.deepEqual(w.refusals, [])
})

test('un código de salida distinto de cero es un fallo, con su salida', async () => {
  const w = await start(() => ['  ✗ Claude Code: CLAUDE.md no importa el núcleo', '  ✗ 1 fallo', '[omk:fin] verify salida=1'])
  await w.request('kit.run', { action: 'verify' })
  const failed = await reach(w, 'failed')
  assert.match(failed.detail ?? '', /código 1/)
  assert.deepEqual(failed.lines, ['  ✗ Claude Code: CLAUDE.md no importa el núcleo', '  ✗ 1 fallo'])
  const [entry] = ((await w.request('history.list')) as { items: HistoryEntry[] }).items
  assert.equal(entry?.tone, 'danger')
  assert.equal(entry?.title, 'omk verify falló')
})

test('si omk no existe lo dice con cómo instalarlo y lo notifica', async () => {
  const w = await start(() => ["omk : The term 'omk' is not recognized as the name of a cmdlet"])
  await w.command('kit.update')
  const failed = await reach(w, 'failed')
  assert.match(failed.detail ?? '', /omk no está instalado/)
  assert.deepEqual(w.host.callsOf('notifications.show'), [{ title: 'omk no está instalado', body: INSTALL_HINT }])
})

test('un omk anterior a la línea de cierre se explica en vez de quedarse «en curso»', async () => {
  const w = await start(() => ['$ omk verify --exit-marker', 'Opcion desconocida: --exit-marker'])
  await w.request('kit.run', { action: 'verify' })
  assert.equal((await reach(w, 'failed')).detail, OLD_OMK_HINT)
})

test('si omk pregunta, el panel puede contestar sí o no en ese terminal y nada más', async () => {
  let output = ['  Orca pide tu aprobación para Orca Multiagent Kit 0.7.0', '      · terminal:send: …', '  › ¿Apruebas este acceso? [s/N] ']
  const w = await start(() => output)
  await w.request('kit.run', { action: 'update' })
  const asking = await reach(w, 'asking')
  assert.equal(asking.canAnswer, true)
  assert.deepEqual(w.host.callsOf('notifications.show'), [
    { title: 'omk update espera tu respuesta', body: 'Contéstale en el panel Multiagent Kit.' }
  ])
  for (const bad of [{ id: 'otra', approve: true }, { id: asking.id, approve: 's; rm -rf ~' }, { id: asking.id }]) {
    await assert.rejects(w.request('kit.answer', bad as unknown as { id: string; approve: boolean }), invalid)
  }
  assert.equal(w.host.callsOf('terminal.sendText').length, 0)

  assert.deepEqual(await w.request('kit.answer', { id: asking.id, approve: true }), { message: 'Aprobado.' })
  assert.deepEqual(w.host.callsOf('terminal.sendText'), [{ terminalId: 't9', text: 's', enter: true }])
  output = [...output.slice(0, 2), '  › ¿Apruebas este acceso? [s/N] s', '  ✓ Plugin local.multiagent-kit v0.7.0 instalado', '[omk:fin] update salida=0']
  await reach(w, 'done')
  // Ya terminada no admite respuestas, y el aviso de la pregunta sale una sola vez.
  await assert.rejects(w.request('kit.answer', { id: asking.id, approve: false }), invalid)
  assert.equal(w.host.callsOf('terminal.sendText').length, 1)
  assert.equal(w.host.callsOf('notifications.show').length, 1)
})

test('rechazar escribe una n', async () => {
  const w = await start(() => ['  › ¿Apruebas este acceso? [s/N] '])
  await w.request('kit.run', { action: 'update' })
  const asking = await reach(w, 'asking')
  await w.request('kit.answer', { id: asking.id, approve: false })
  assert.deepEqual(w.host.callsOf('terminal.sendText'), [{ terminalId: 't9', text: 'n', enter: true }])
})

test('si la pregunta ya se contestó en el terminal, la letra no llega al shell', async () => {
  let output = ['  › ¿Apruebas este acceso? [s/N] ']
  const w = await start(() => output)
  await w.request('kit.run', { action: 'update' })
  const asking = await reach(w, 'asking')
  // El seguimiento aún no ha vuelto a leer: el panel sigue enseñando la pregunta.
  Object.assign(actionTiming, { omkPollMs: 60_000 })
  await new Promise((resolve) => setTimeout(resolve, 10))
  output = ['  › ¿Apruebas este acceso? [s/N] n', '  ✗ Plugin sin instalar: no se aprobó el acceso.', '[omk:fin] update salida=1', 'PS C:\\repo>']
  await assert.rejects(
    w.request('kit.answer', { id: asking.id, approve: true }),
    (error: unknown) => (error as { code?: string }).code === 'conflict'
  )
  assert.equal(w.host.callsOf('terminal.sendText').length, 0)
})

test('si el terminal no acepta la respuesta, se dice', async () => {
  const w = await start(() => ['  › ¿Apruebas este acceso? [s/N] '], { results: { 'terminal.sendText': { accepted: false } } })
  await w.request('kit.run', { action: 'update' })
  const asking = await reach(w, 'asking')
  await assert.rejects(
    w.request('kit.answer', { id: asking.id, approve: true }),
    (error: unknown) => (error as { code?: string }).code === 'unavailable'
  )
})

test('dejar de seguir quita la acción; la siguiente la sustituye', async () => {
  const w = await start(() => ['  ⠋ Fuente única en ~/.agents…'])
  await w.request('kit.run', { action: 'update' })
  const first = await reach(w, 'running')
  await assert.rejects(w.request('kit.dismiss', { id: 'otra' }), invalid)
  assert.deepEqual(await w.request('kit.dismiss', { id: first.id }), { message: 'omk update: ya no se sigue.' })
  assert.equal(await current(w), null)
  assert.equal(w.host.data().storage[ACTION_KEY], undefined)
  assert.deepEqual(w.posts.filter((p) => p.event === 'action.changed').at(-1)?.payload, { action: null })

  await w.request('kit.run', { action: 'verify' })
  await w.request('team.show')
  const last = await reach(w, 'running')
  assert.equal(last.title, 'omk team')
  assert.notEqual(last.id, first.id)
})

test('si su terminal deja de poder leerse, queda sin seguimiento', async () => {
  const w = await start(() => [], {
    results: {
      'terminal.read': () => {
        throw hostError('action_failed', 'terminal cerrado')
      }
    }
  })
  await w.request('kit.run', { action: 'verify' })
  const lost = await reach(w, 'lost')
  assert.match(lost.detail ?? '', /terminal cerrado/)
  assert.deepEqual(((await w.request('history.list')) as { items: HistoryEntry[] }).items, [])
})

test('pasado su plazo deja de seguirse y lo dice', async () => {
  Object.assign(actionTiming, { omkMaxMs: 0 })
  const w = await start(() => ['  ⠋ npm install…'])
  await w.request('kit.run', { action: 'update' })
  const lost = await reach(w, 'lost')
  assert.match(lost.detail ?? '', /Sigue en su terminal/)
})

test('tras reiniciarse el worker (lo hace «actualizar» al cambiar el plugin) retoma el mismo terminal', async () => {
  const stored = { id: 'a1', kind: 'omk', title: 'omk update', terminalId: 't7', startedAt: Date.now() - 5000 }
  const w = await start(() => ['  ✓ Kit al día (v1.7.0)', '[omk:fin] update salida=0'], { storage: { [ACTION_KEY]: stored } })
  const done = await reach(w, 'done')
  assert.equal(done.id, 'a1')
  assert.equal(done.title, 'omk update')
  assert.deepEqual(w.host.callsOf('terminal.read').at(-1), { terminalId: 't7', maxLines: 400 })
  assert.equal(w.host.data().storage[ACTION_KEY], undefined)
})

test('lo guardado que caducó o no tiene forma de acción se descarta', async () => {
  const old = { id: 'a1', kind: 'omk', title: 'omk update', terminalId: 't7', startedAt: Date.now() - REAL_TIMING.omkMaxMs - 1000 }
  const values: JsonValue[] = [old, { id: 'a1', kind: 'shell', title: 'x', terminalId: 't7', startedAt: 1 }, 'omk update', { id: 'a1' }]
  for (const value of values) {
    const w = await start(() => [], { storage: { [ACTION_KEY]: value } })
    assert.equal(await current(w), null)
    await new Promise((resolve) => setTimeout(resolve, 5))
    assert.equal(w.host.data().storage[ACTION_KEY], undefined)
    assert.equal(w.host.callsOf('terminal.read').length, 0)
    await w.deactivate()
    worker = undefined
  }
})

test('inicializar sigue al agente: trabajando, esperando a la persona y terminado', async () => {
  const w = await start(() => ['● Leyendo AGENTS.md…', '\u001b[2m  esc to interrupt\u001b[0m'])
  await w.request('kit.run', { action: 'init' })
  const starting = await reach(w, 'running')
  assert.equal(starting.title, 'Inicializar proyecto · claude')
  assert.equal(starting.kind, 'agent')

  await w.emit('agent.status.changed', agentStatus('working', 1))
  for (let attempt = 0; attempt < 200 && (await current(w))?.detail !== 'Trabajando.'; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2))
  }
  const working = await current(w)
  assert.equal(working?.detail, 'Trabajando.')
  assert.deepEqual(working?.lines, ['● Leyendo AGENTS.md…', '  esc to interrupt'])

  await w.emit('agent.status.changed', agentStatus('waiting', 2))
  const waiting = await reach(w, 'asking')
  assert.match(waiting.detail ?? '', /Avisos/)
  // A un agente se le responde en Avisos, con su texto: aquí no hay sí o no que escribir.
  assert.equal(waiting.canAnswer, false)
  await assert.rejects(w.request('kit.answer', { id: waiting.id, approve: true }), invalid)

  await w.emit('agent.status.changed', agentStatus('done', 3))
  assert.equal((await reach(w, 'done')).detail, 'El agente ha terminado.')
  assert.equal(w.host.callsOf('terminal.sendText').length, 0)
})

test('repartir también se sigue, y un agente del que Orca no cuenta nada no se queda «arrancando»', async () => {
  Object.assign(actionTiming, { agentStartMs: 0 })
  const w = await start(() => [])
  await w.request('team.orchestrate', { agent: 'codex', task: 'Login', source: 'chat' })
  const lost = await reach(w, 'lost')
  assert.equal(lost.title, 'Repartir · codex')
  assert.match(lost.detail ?? '', /pestaña Agentes/)
})
