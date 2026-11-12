// La pestaña Avisos del worker, cargada con el núcleo contra un host simulado.
import { afterEach, assert, hostError, mockHost, mountWorker, test, type TestWorker } from 'orca/testing'
import type { NoticeItem } from '../protocol.ts'
import * as main from '../worker.ts'

const PLAN = {
  version: 1,
  run: '20261107-recargas',
  source: 'spec-kit 003-recargas',
  autonomy: 'semi',
  base: null,
  integration: 'feat/003-recargas',
  merge: 'feat/003-recargas → main',
  units: [
    { round: 0, id: 'U0', title: 'setup', role: 'Hefesto', level: 'alto', agent: 'coordinador', model: null, resource: 'inline', files: '7', depends: null },
    { round: 1, id: 'U2', title: 'recarga', role: 'Ariadna', level: 'alto', agent: 'claude', model: '<alto>', resource: 'worker', files: '11', depends: 'U0' }
  ],
  notes: ['modelos: nuevo']
}
const PLAN_PATH = 'C:\\repo\\.work\\runs\\r1\\plan.json'

let worker: TestWorker | undefined
afterEach(async () => {
  await worker?.deactivate()
  worker = undefined
})

const start = async (results: Record<string, unknown> = {}) => {
  worker = await mountWorker(main, {
    host: mockHost({
      results: {
        'workspace.readContext': { branch: 'main', displayName: 'app', terminals: [] },
        'workspace.list': {
          workspaces: [{ id: 'w1', kind: 'worktree', name: 'app', path: '/repo/app', branch: 'refs/heads/main', hostId: null }],
          truncated: false
        },
        'agents.list': { agents: [] },
        'terminal.read': { lines: [], truncated: false },
        'terminal.sendText': { accepted: true },
        'notifications.show': { delivered: true },
        'statusBar.update': { ok: true },
        ...results
      }
    })
  })
  return worker
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 5))
const list = async (w: TestWorker) => ((await w.request('notices.list')) as { items: NoticeItem[] }).items
const status = (terminalId: string, state: 'working' | 'blocked' | 'waiting' | 'done', receivedAt: number) => ({
  workspaceId: 'w1',
  paneKey: `p-${terminalId}`,
  terminalId,
  state,
  receivedAt,
  title: `agente ${terminalId}`
})
// `terminalId: null` es un coordinador sin terminal: Orca no manda el campo.
const write = (path: string, content: string, terminalId: string | null = 't1', tool = 'Write') =>
  ({ agent: 'claude', workspaceId: 'w1', ...(terminalId === null ? {} : { terminalId }), tool, input: { file_path: path, content } }) as never

test('un Write de plan.json enseña la tarjeta, avisa y la deja en el historial', async () => {
  const w = await start()
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, JSON.stringify(PLAN)))
  const [notice, ...rest] = await list(w)
  assert.equal(rest.length, 0)
  assert.equal(notice?.id, 'plan:20261107-recargas')
  assert.equal(notice?.kind, 'plan')
  assert.equal(notice?.canReply, true)
  assert.equal(notice?.plan?.units.length, 2)
  assert.deepEqual(w.host.callsOf('notifications.show'), [
    { title: 'Plan listo: 20261107-recargas', body: '2 unidades en 2 rondas. Confírmalo en Avisos.' }
  ])
  assert.equal(w.posts.filter((post) => post.event === 'notices.changed').length, 1)
  assert.deepEqual(w.refusals, [])
})

test('otro tool, otra ruta o un JSON roto no hacen nada; lo roto queda en el log', async () => {
  const w = await start()
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, JSON.stringify(PLAN), 't1', 'Edit'))
  await w.hooks.fire('agent.tool.after', write('C:\\repo\\notas.json', JSON.stringify(PLAN)))
  await w.hooks.fire('agent.tool.after', { agent: 'claude', workspaceId: 'w1', terminalId: 't1', tool: 'Write', input: 'x' } as never)
  assert.deepEqual(await list(w), [])
  assert.equal(w.logs.length, 0)
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, '{ roto'))
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, JSON.stringify({ ...PLAN, version: 9 })))
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, 'x'.repeat(70 * 1024)))
  assert.deepEqual(await list(w), [])
  assert.equal(w.logs.filter((line) => line.startsWith('plan.json ignorado')).length, 3)
  assert.equal(w.host.callsOf('notifications.show').length, 0)
})

test('un plan nuevo del mismo run sustituye al anterior; sin terminal no se puede responder', async () => {
  const w = await start()
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, JSON.stringify(PLAN)))
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, JSON.stringify({ ...PLAN, units: [PLAN.units[0]] }), null))
  const items = await list(w)
  assert.equal(items.length, 1)
  assert.equal(items[0]?.plan?.units.length, 1)
  assert.equal(items[0]?.canReply, false)
  await assert.rejects(w.request('notices.reply', { id: 'plan:20261107-recargas', text: 'sí' }), /no se le puede escribir/)
})

test('«sí» y «cambia: …» se escriben en el terminal del coordinador y quitan el aviso', async () => {
  const w = await start()
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, JSON.stringify(PLAN), 't7'))
  const result = await w.request('notices.reply', { id: 'plan:20261107-recargas', text: 'sí' })
  assert.deepEqual(w.host.callsOf('terminal.sendText'), [{ terminalId: 't7', text: 'sí', enter: true }])
  assert.match(result.message, /Enviado a su terminal: Plan de rondas/)
  assert.deepEqual(await list(w), [])
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, JSON.stringify(PLAN), 't7'))
  await w.request('notices.reply', { id: 'plan:20261107-recargas', text: 'cambia: sin la ronda 2' })
  assert.equal((w.host.callsOf('terminal.sendText')[1] as { text: string }).text, 'cambia: sin la ronda 2')
})

test('un agente bloqueado sale con su contexto limpio y desaparece al volver a trabajar', async () => {
  const lines = ['\u001b[31mrojo\u001b[0m', '', 'x\u0007y', ...Array.from({ length: 20 }, (_, i) => `línea ${i}`), 'z'.repeat(300)]
  const w = await start({ 'terminal.read': { lines, truncated: false } })
  await w.emit('agent.status.changed', status('t1', 'blocked', 1000))
  await settle()
  const [notice] = await list(w)
  assert.equal(notice?.id, 't:t1')
  assert.equal(notice?.kind, 'blocked')
  assert.equal(notice?.workspace, 'app')
  assert.equal(notice?.canReply, true)
  assert.equal(notice?.context.length, 12)
  assert.equal(notice?.context.at(-1)?.length, 200)
  assert.equal(notice?.context.at(-2), 'línea 19')
  assert.deepEqual(w.host.callsOf('terminal.read'), [{ terminalId: 't1', maxLines: 40 }])
  await w.emit('agent.status.changed', status('t1', 'working', 2000))
  assert.deepEqual(await list(w), [])
  await w.emit('agent.status.changed', status('t1', 'waiting', 3000))
  assert.equal((await list(w))[0]?.kind, 'waiting')
  await w.emit('agent.status.changed', status('t1', 'done', 4000))
  assert.deepEqual(await list(w), [])
})

test('un fallo al leer el terminal se registra y el aviso sale sin contexto', async () => {
  const w = await start({
    'terminal.read': () => {
      throw hostError('unavailable', 'sin terminal')
    }
  })
  await w.emit('agent.status.changed', status('t1', 'waiting', 1000))
  await settle()
  const [notice] = await list(w)
  assert.deepEqual(notice?.context, [])
  assert.match(w.logs.join('\n'), /contexto de t:t1 no leído/)
})

test('un chat de Orca sin terminal sale pero no admite respuesta', async () => {
  const w = await start()
  await w.emit('agent.status.changed', {
    workspaceId: 'w1',
    paneKey: 'structured-agent-session-claude_abc:1',
    state: 'blocked',
    receivedAt: 1000
  })
  const [notice] = await list(w)
  assert.equal(notice?.id, 'p:structured-agent-session-claude_abc:1')
  assert.equal(notice?.agent, 'claude')
  assert.equal(notice?.canReply, false)
  assert.deepEqual(notice?.context, [])
  assert.equal(w.host.callsOf('terminal.read').length, 0)
  await assert.rejects(w.request('notices.reply', { id: notice?.id ?? '', text: 'hola' }), /no se le puede escribir/)
})

test('el orden es planes, bloqueados y esperando, y dentro el más antiguo primero', async () => {
  const w = await start()
  await w.emit('agent.status.changed', status('t1', 'waiting', 1000))
  await w.emit('agent.status.changed', status('t2', 'blocked', 3000))
  await w.emit('agent.status.changed', status('t3', 'blocked', 2000))
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, JSON.stringify(PLAN)))
  assert.deepEqual((await list(w)).map((item) => item.id), ['plan:20261107-recargas', 't:t3', 't:t2', 't:t1'])
})

test('una unidad del kit lleva su nombre de unidad', async () => {
  const w = await start()
  await w.hooks.fire('agent.prompt.before', {
    agent: 'claude',
    terminalId: 't1',
    prompt: 'UNIT: U2 — Pagos     RUN: r1     BASE: abc\nROL: Ariadna · código — nivel alto',
    inputKind: 'orchestration'
  })
  await w.emit('agent.status.changed', status('t1', 'blocked', 1000))
  const [notice] = await list(w)
  assert.equal(notice?.unit, 'U2 · Ariadna — Pagos')
  assert.equal(notice?.title, 'U2 · Ariadna — Pagos')
})

test('responder limpia el texto, quita el aviso y no lo deja volver con el mismo estado', async () => {
  const w = await start()
  await w.emit('agent.status.changed', status('t1', 'blocked', 1000))
  const result = await w.request('notices.reply', { id: 't:t1', text: '  dale\u001b[31m\nahora\ty ya\r\n  ' })
  assert.deepEqual(w.host.callsOf('terminal.sendText'), [{ terminalId: 't1', text: 'dale[31m ahora y ya', enter: true }])
  assert.equal(result.message, 'Enviado a su terminal: agente t1.')
  await w.emit('agent.status.changed', status('t1', 'blocked', 1500))
  assert.deepEqual(await list(w), [])
  await w.emit('agent.status.changed', status('t1', 'waiting', 2000))
  assert.equal((await list(w)).length, 1)
})

test('responder rechaza ids desconocidos, textos vacíos o largos y no textos', async () => {
  const w = await start()
  await w.emit('agent.status.changed', status('t1', 'blocked', 1000))
  await assert.rejects(w.request('notices.reply', { id: 't:otro', text: 'hola' }), /ya no existe/)
  await assert.rejects(w.request('notices.reply', { id: 't1', text: 'hola' }), /ya no existe/)
  for (const text of ['', '  \n\t ', '\u001b\u0007', 'x'.repeat(2001), 5 as never]) {
    await assert.rejects(w.request('notices.reply', { id: 't:t1', text }), (error: unknown) => (error as { code?: string }).code === 'invalid_params')
  }
  assert.equal(w.host.callsOf('terminal.sendText').length, 0)
  assert.equal((await list(w)).length, 1)
  await w.request('notices.reply', { id: 't:t1', text: 'x'.repeat(2000) })
  assert.equal(w.host.callsOf('terminal.sendText').length, 1)
})

test('si el terminal no acepta el texto, el aviso se queda y el error es claro', async () => {
  const w = await start({ 'terminal.sendText': { accepted: false } })
  await w.emit('agent.status.changed', status('t1', 'blocked', 1000))
  await assert.rejects(w.request('notices.reply', { id: 't:t1', text: 'hola' }), /no aceptó el texto/)
  assert.equal((await list(w)).length, 1)
})

test('descartar quita el aviso; el de un agente no vuelve hasta que cambie su estado', async () => {
  const w = await start()
  await w.emit('agent.status.changed', status('t1', 'blocked', 1000))
  await w.request('notices.dismiss', { id: 't:t1' })
  assert.deepEqual(await list(w), [])
  await w.emit('agent.status.changed', status('t1', 'blocked', 1200))
  assert.deepEqual(await list(w), [])
  await w.emit('agent.status.changed', status('t1', 'working', 1500))
  await w.emit('agent.status.changed', status('t1', 'blocked', 2000))
  assert.equal((await list(w)).length, 1)
  await assert.rejects(w.request('notices.dismiss', { id: 'nada' }), /ya no existe/)
})

test('un plan descartado no vuelve hasta que llegue otro plan.json', async () => {
  const w = await start()
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, JSON.stringify(PLAN)))
  await w.request('notices.dismiss', { id: 'plan:20261107-recargas' })
  assert.deepEqual(await list(w), [])
  await w.emit('agent.status.changed', status('t1', 'blocked', 1000))
  assert.equal((await list(w)).length, 1)
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, JSON.stringify(PLAN)))
  assert.equal((await list(w)).length, 2)
})

test('al quitar un workspace salen sus avisos de agente, no los planes', async () => {
  const w = await start()
  await w.emit('agent.status.changed', status('t1', 'blocked', 1000))
  await w.hooks.fire('agent.tool.after', write(PLAN_PATH, JSON.stringify(PLAN)))
  await w.emit('workspace.removed', { workspaceId: 'w1', kind: 'worktree', path: '/repo/app' })
  assert.deepEqual((await list(w)).map((item) => item.id), ['plan:20261107-recargas'])
})

test('notices.changed solo se publica cuando cambia lo que se ve', async () => {
  const w = await start()
  const changes = () => w.posts.filter((post) => post.event === 'notices.changed').length
  await w.emit('agent.status.changed', status('t1', 'blocked', 1000))
  await settle()
  const before = changes()
  await w.emit('agent.status.changed', status('t1', 'blocked', 1000))
  assert.equal(changes(), before)
})

// Un coordinador que corre como chat de Orca: sin terminal ni hook de herramientas. El plan sale
// del disco cuando se para, y la respuesta va al buzón de su run de Orca.
const CHAT_PANE = 'structured-agent-session-claude_abc:1'
const chatStatus = (state: 'working' | 'waiting', receivedAt: number) => ({ workspaceId: 'w1', paneKey: CHAT_PANE, state, receivedAt })

const withSystem = (plans: { mtimeMs: number; content: string }[]) => {
  const sent: { orcaRun: string; subject: string; body: string }[] = []
  const reads: { path: string; since: number }[] = []
  const previous = main.hostSystem.current
  main.hostSystem.current = {
    readPlans: async (path, since) => {
      reads.push({ path, since })
      return plans.filter((plan) => plan.mtimeMs > since).map((plan) => ({ path: `${path}/.work/runs/r1/plan.json`, ...plan }))
    },
    sendToRun: async (orcaRun, subject, body) => {
      sent.push({ orcaRun, subject, body })
    }
  }
  return { sent, reads, restore: () => (main.hostSystem.current = previous) }
}

test('con el coordinador en un chat, el plan sale del disco al pararse y «sí» va al buzón de su run', async () => {
  const later = Date.now() + 60_000
  const system = withSystem([{ mtimeMs: later, content: JSON.stringify({ ...PLAN, orcaRun: 'run_4fbb2d2e147c' }) }])
  try {
    const w = await start()
    await w.emit('agent.status.changed', chatStatus('waiting', 1))
    await settle()
    const [plan, chat] = await list(w)
    assert.equal(plan?.kind, 'plan')
    assert.equal(plan?.via, 'run')
    assert.equal(plan?.canReply, true)
    assert.deepEqual(system.reads.map(({ path }) => path), ['/repo/app'])
    // El chat del coordinador también se puede contestar: va al mismo buzón.
    await w.emit('agent.status.changed', chatStatus('working', 2))
    await w.emit('agent.status.changed', chatStatus('waiting', 3))
    await settle()
    assert.equal((await list(w)).find(({ kind }) => kind === 'waiting')?.via, 'run')
    assert.ok(chat === undefined || chat.kind === 'waiting')
    const result = await w.request('notices.reply', { id: plan?.id ?? '', text: 'sí' })
    assert.match(result.message, /al chat del coordinador/)
    assert.deepEqual(system.sent, [{ orcaRun: 'run_4fbb2d2e147c', subject: 'Respuesta desde el panel: Plan de rondas · 20261107-recargas', body: 'sí' }])
    assert.equal(w.host.callsOf('terminal.sendText').length, 0)
    // Pararse otra vez no lo saca de nuevo: ese plan.json ya se vio.
    await w.emit('agent.status.changed', chatStatus('working', 4))
    await w.emit('agent.status.changed', chatStatus('waiting', 5))
    await settle()
    assert.equal((await list(w)).filter(({ kind }) => kind === 'plan').length, 0)
  } finally {
    system.restore()
  }
})

test('un plan.json de antes de arrancar el plugin no sale, y sin run de Orca el chat no se puede contestar', async () => {
  const system = withSystem([{ mtimeMs: 1, content: JSON.stringify(PLAN) }])
  try {
    const w = await start()
    await w.emit('agent.status.changed', chatStatus('waiting', 1))
    await settle()
    const items = await list(w)
    assert.deepEqual(items.map(({ kind }) => kind), ['waiting'])
    assert.equal(items[0]?.canReply, false)
    assert.equal(items[0]?.via, null)
    await assert.rejects(w.request('notices.reply', { id: items[0]?.id ?? '', text: 'hola' }), /no se le puede escribir/)
    assert.deepEqual(system.sent, [])
  } finally {
    system.restore()
  }
})

test('si Orca no entrega la respuesta, se dice y el aviso se queda', async () => {
  const later = Date.now() + 60_000
  const system = withSystem([{ mtimeMs: later, content: JSON.stringify({ ...PLAN, orcaRun: 'run_4fbb2d2e147c' }) }])
  main.hostSystem.current = {
    ...main.hostSystem.current,
    sendToRun: async () => {
      throw Object.assign(new Error('Orca no entregó el mensaje (runtime_unavailable: x)'), { code: 'unavailable' })
    }
  }
  try {
    const w = await start()
    await w.emit('agent.status.changed', chatStatus('waiting', 1))
    await settle()
    const [plan] = await list(w)
    await assert.rejects(w.request('notices.reply', { id: plan?.id ?? '', text: 'sí' }), /no entregó/)
    assert.equal((await list(w))[0]?.kind, 'plan')
  } finally {
    system.restore()
  }
})
