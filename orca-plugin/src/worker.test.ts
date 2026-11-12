// El worker tal como lo carga Orca, contra un host simulado con las capacidades del manifiesto.
import { afterEach, assert, hostError, mockHost, mountWorker, test, type TestWorker } from 'orca/testing'
import { CONTRACT_HINT, ORCHESTRATE_HINT, encodeTeam, orchestratePrompt, type Team } from './kit.ts'
import type { AgentsView } from './protocol.ts'
import * as main from './worker.ts'

const KIT_SPEC = 'UNIT: U1 — Login     RUN: 20261107-auth     BASE: abc123'
const KIT_DISPATCH = `${KIT_SPEC}\nROL: Proteo · implementación · nivel medio — una unidad cada vez`

const baseResults = (overrides: Record<string, unknown> = {}) => ({
  'workspace.readContext': { branch: 'main', displayName: 'app', terminals: [] },
  'workspace.list': {
    workspaces: [{ id: 'w1', kind: 'worktree', name: 'app', path: '/repo/app', branch: 'refs/heads/main', hostId: null }],
    truncated: false
  },
  'agents.list': { agents: [] },
  'terminal.create': { terminalId: 't9' },
  'terminal.read': { lines: [], truncated: false },
  'agent.launch': { terminalId: 't10' },
  'workspace.open': { opened: true },
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

const prompt = (text: string, inputKind: 'orchestration' | 'launch' | 'driving' = 'orchestration', terminalId = 't1') => ({
  agent: 'claude',
  terminalId,
  prompt: text,
  inputKind
})

type State = 'working' | 'blocked' | 'waiting' | 'done'
const status = (terminalId: string, state: State, receivedAt: number, extra: { title?: string; workspaceId?: string } = {}) => ({
  workspaceId: extra.workspaceId ?? 'w1',
  paneKey: `p-${terminalId}`,
  terminalId,
  state,
  receivedAt,
  ...(extra.title ? { title: extra.title } : {})
})

const summary = async (w: TestWorker) => (await w.request('agents.summary')) as AgentsView
const names = async (w: TestWorker) => (await summary(w)).groups.flatMap((g) => g.agents.map((a) => a.title))

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

test('un agente que Orca arranca con una tarea pasa primero por la skill orca', async () => {
  const w = await start()
  const task = prompt('Login con Google', 'launch')
  assert.deepEqual(await w.hooks.fire('agent.prompt.before', task), {
    kind: 'continue',
    event: prompt(`Login con Google\n\n${ORCHESTRATE_HINT}`, 'launch')
  })
  // Un despacho del kit lleva el contrato, no la indicación de repartir.
  const dispatch = await w.hooks.fire('agent.prompt.before', prompt(KIT_SPEC))
  assert.equal(dispatch.kind === 'continue' && dispatch.event.prompt.includes(ORCHESTRATE_HINT), false)
})

test('el ajuste autoOrchestrate apagado deja los prompts de arranque intactos', async () => {
  const w = await start({ settings: { autoOrchestrate: false } })
  const task = prompt('Login con Google', 'launch')
  assert.deepEqual(await w.hooks.fire('agent.prompt.before', task), { kind: 'continue', event: task })
})

test('el ajuste off desactiva el hook', async () => {
  const w = await start({ settings: { contractHint: 'off' } })
  const event = prompt(KIT_SPEC)
  assert.deepEqual(await w.hooks.fire('agent.prompt.before', event), { kind: 'continue', event })
})

test('verificar abre un terminal con el literal omk verify en el workspace activo', async () => {
  const w = await start()
  const result = await w.command('kit.verify')
  // `--exit-marker`: omk escribe al salir la línea con la que el plugin sabe que ha terminado.
  assert.deepEqual(w.host.callsOf('terminal.create'), [
    { workspaceId: 'w1', title: 'omk verify', command: 'omk verify --exit-marker' }
  ])
  assert.equal(result, 'Ejecutando `omk verify` en un terminal nuevo del workspace activo.')
  assert.deepEqual(w.refusals, [])
})

test('actualizar usa omk update', async () => {
  const w = await start()
  await w.command('kit.update')
  assert.equal((w.host.callsOf('terminal.create')[0] as { command: string }).command, 'omk update --exit-marker')
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

test('desde el panel, un fallo vuelve como error con su código, no como respuesta', async () => {
  const w = await start({ results: { 'workspace.readContext': null } })
  await assert.rejects(
    w.request('kit.run', { action: 'verify' }),
    (error: unknown) => (error as { code?: string }).code === 'unavailable' && /No identifico el workspace activo/.test(String(error))
  )
  const bad = await start({ settings: { initAgent: 'claude; rm -rf ~' } })
  await assert.rejects(
    bad.request('kit.run', { action: 'init' }),
    (error: unknown) => (error as { code?: string }).code === 'invalid_params'
  )
  assert.equal(bad.host.callsOf('agent.launch').length, 0)
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
  await w.emit('agent.status.changed', status('t1', 'working', 1, { title: 'U1 login' }))
  await w.emit('agent.status.changed', status('t2', 'blocked', 2, { title: 'U2 pagos', workspaceId: 'w2' }))
  const last = () => w.host.callsOf('statusBar.update').at(-1)
  assert.deepEqual(last(), {
    id: 'agents',
    visible: true,
    text: 'MAW · 1 trabajando · 1 bloqueado',
    tone: 'warning',
    tooltip: 'Orca Multiagent Kit: 1 trabajando, 1 bloqueado en todos los workspaces\nU2 pagos: bloqueado\nU1 login: trabajando'
  })
  assert.equal(await w.command('agents.status'), '- U2 pagos: bloqueado\n- U1 login: trabajando (app)')

  await w.emit('workspace.removed', { workspaceId: 'w2', kind: 'worktree', path: '/repo/u2' })
  await w.emit('agent.status.changed', status('t1', 'done', 3))
  assert.equal((last() as { text: string }).text, 'MAW')
  assert.deepEqual(w.refusals, [])
})

test('un cambio de estado sin título no borra el nombre del agente', async () => {
  const w = await start()
  await w.emit('agent.status.changed', status('t1', 'working', 1, { title: 'Arreglar login' }))
  await w.emit('agent.status.changed', status('t1', 'waiting', 2))
  assert.deepEqual(await names(w), ['Arreglar login'])
})

test('un despacho del kit da nombre a su agente, llegue antes o después del estado', async () => {
  const w = await start()
  await w.hooks.fire('agent.prompt.before', prompt(KIT_DISPATCH, 'orchestration', 't1'))
  await w.emit('agent.status.changed', status('t1', 'working', 1))
  await w.emit('agent.status.changed', status('t2', 'working', 2))
  await w.hooks.fire('agent.prompt.before', prompt(KIT_DISPATCH.replace('U1 — Login', 'U2 — Pagos'), 'orchestration', 't2'))
  const view = await summary(w)
  assert.deepEqual(view.groups.map((g) => g.title), ['RUN 20261107-auth'])
  assert.deepEqual(await names(w), ['U1 · Proteo — Login', 'U2 · Proteo — Pagos'])
  assert.equal(view.groups[0]?.agents[0]?.detail, 'claude · app')
})

test('el hook de lanzamiento dice qué agente es aunque no tenga título', async () => {
  const w = await start()
  const launch = { agent: 'codex', workspaceId: 'w1', workspaceKind: 'worktree', terminalId: 't5', command: 'codex', env: {} } as const
  assert.deepEqual(await w.hooks.fire('agent.launch.before', launch), { kind: 'continue', event: launch })
  await w.emit('agent.status.changed', status('t5', 'working', 1))
  assert.equal(await w.command('agents.status'), '- codex: trabajando (app)')
})

test('los agentes que ya existen al arrancar llevan su agente y el workspace enfocado', async () => {
  const w = await start({
    results: {
      'agents.list': {
        agents: [{ terminalId: 't1', title: null, agent: 'claude', state: 'blocked', stateStartedAt: 7 }]
      }
    }
  })
  const [line] = (await summary(w)).groups[0]?.agents ?? []
  assert.equal(line?.title, 'claude')
  assert.equal(line?.detail, 'app')
  assert.equal(line?.since, 7)
  assert.deepEqual(line?.facts, [
    { label: 'Agente', value: 'Claude Code' },
    { label: 'Workspace', value: 'app' },
    { label: 'Rama', value: 'main' },
    { label: 'Carpeta', value: '/repo/app' },
    { label: 'Dónde corre', value: 'terminal t1' }
  ])
})

test('avisa cuando un agente se bloquea, una vez, y no si se desactiva', async () => {
  const w = await start()
  await w.emit('agent.status.changed', status('t1', 'working', 1, { title: 'U1 login' }))
  await w.emit('agent.status.changed', status('t1', 'blocked', 2))
  await w.emit('agent.status.changed', status('t1', 'blocked', 3))
  assert.deepEqual(w.host.callsOf('notifications.show'), [
    { title: 'U1 login: bloqueado', body: 'En app. Necesita tu respuesta en Orca.' }
  ])
  await w.deactivate()

  const quiet = await start({ settings: { notify: false } })
  await quiet.emit('agent.status.changed', status('t1', 'blocked', 1))
  assert.equal(quiet.host.callsOf('notifications.show').length, 0)
})

test('avisa cuando terminan todas las unidades lanzadas de un run', async () => {
  const w = await start()
  for (const [terminalId, unit] of [['t1', 'U1 — Login'], ['t2', 'U2 — Pagos']] as const) {
    await w.hooks.fire('agent.prompt.before', prompt(KIT_DISPATCH.replace('U1 — Login', unit), 'orchestration', terminalId))
    await w.emit('agent.status.changed', status(terminalId, 'working', 1))
  }
  await w.emit('agent.status.changed', status('t1', 'done', 2))
  assert.equal(w.host.callsOf('notifications.show').length, 0)
  await w.emit('agent.status.changed', status('t2', 'done', 3))
  assert.deepEqual(w.host.callsOf('notifications.show'), [
    {
      title: 'RUN 20261107-auth: unidades terminadas',
      body: 'Las 2 unidades lanzadas han terminado. Vuelve al coordinador para revisar e integrar.'
    }
  ])
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

test('el panel ejecuta las mismas acciones que la paleta', async () => {
  const w = await start()
  assert.deepEqual(await w.request('kit.run', { action: 'verify' }), {
    message: 'Ejecutando `omk verify` en un terminal nuevo del workspace activo.'
  })
  await w.request('kit.run', { action: 'init' })
  assert.equal(w.host.callsOf('terminal.create').length, 1)
  assert.equal(w.host.callsOf('agent.launch').length, 1)
})

test('el panel no puede pedir una acción fuera de la lista', async () => {
  const w = await start()
  for (const action of ['rm -rf ~', 'verify; omk update', undefined]) {
    await assert.rejects(
      // Simula lo que un panel podría enviar sin respetar el tipo declarado.
      w.request('kit.run', { action } as unknown as { action: 'verify' }),
      (error: unknown) => (error as { code?: string }).code === 'invalid_params'
    )
  }
  assert.equal(w.host.callsOf('terminal.create').length, 0)
  assert.equal(w.host.callsOf('agent.launch').length, 0)
})

test('el panel recibe los agentes y solo los cambios', async () => {
  const w = await start()
  assert.deepEqual(await w.request('agents.summary'), {
    text: 'MAW', tone: 'neutral', tooltip: 'Orca Multiagent Kit: ningún agente activo', groups: []
  })
  await w.emit('agent.status.changed', status('t1', 'working', 1, { title: 'U1 login' }))
  await w.emit('agent.status.changed', status('t1', 'working', 2, { title: 'U1 login' }))
  const changes = w.posts.filter((p) => p.event === 'agents.changed')
  // El arranque envía el estado vacío; el segundo evento no cambia nada y no se reenvía.
  assert.equal(changes.length, 2)
  const [group] = (changes.at(-1)?.payload as AgentsView).groups
  assert.equal(group?.title, 'app')
  assert.deepEqual(
    group?.agents.map(({ id, title, state, since, canOpen }) => ({ id, title, state, since, canOpen })),
    [{ id: 't:t1', title: 'U1 login', state: 'trabajando', since: 1, canOpen: true }]
  )
})

test('el panel abre el workspace de un agente activo y nada más', async () => {
  const w = await start()
  await w.emit('agent.status.changed', status('t1', 'working', 1))
  assert.deepEqual(await w.request('agents.open', { id: 't:t1' }), { message: 'Abierto app.' })
  assert.deepEqual(w.host.callsOf('workspace.open'), [{ workspaceId: 'w1' }])
  await assert.rejects(
    w.request('agents.open', { id: 't:nadie' }),
    (error: unknown) => (error as { code?: string }).code === 'invalid_params'
  )
  assert.deepEqual(w.refusals, [])
})

test('aplicar el equipo ejecuta omk team set con el equipo en base64url', async () => {
  const w = await start()
  const team: Team = {
    coordinator: 'claude',
    providers: ['claude', 'codex'],
    cross: 'todas',
    roles: { casandra: 'codex' },
    custom: [{ name: 'Hermes', work: 'Textos; $(rm -rf ~)', level: 'bajo', review: 'argos', guard: '', provider: null }]
  }
  await w.request('team.apply', { team })
  assert.deepEqual(w.host.callsOf('terminal.create'), [
    { workspaceId: 'w1', title: 'omk team set', command: `omk team set --data ${encodeTeam(team)} --exit-marker` }
  ])
  assert.match(
    (w.host.callsOf('terminal.create')[0] as { command: string }).command,
    /^omk team set --data [A-Za-z0-9_-]+ --exit-marker$/
  )
  await w.request('team.show')
  assert.equal((w.host.callsOf('terminal.create')[1] as { command: string }).command, 'omk team --exit-marker')
})

test('la autonomía del proyecto va con una orden literal y nada más', async () => {
  const w = await start()
  await w.request('team.autonomy', { autonomy: 'auto' })
  assert.deepEqual(w.host.callsOf('terminal.create'), [
    { workspaceId: 'w1', title: 'omk team set --autonomy auto', command: 'omk team set --autonomy auto --exit-marker' }
  ])
  for (const autonomy of ['total', 'auto; rm -rf ~', '', null]) {
    await assert.rejects(
      w.request('team.autonomy', { autonomy } as unknown as { autonomy: 'auto' }),
      (error: unknown) => (error as { code?: string }).code === 'invalid_params'
    )
  }
  assert.equal(w.host.callsOf('terminal.create').length, 1)
})

test('repartir con autonomía para el run la pasa en el prompt; una desconocida no lanza nada', async () => {
  const w = await start()
  await w.request('team.orchestrate', { agent: 'claude', task: 'Login', source: 'chat', autonomy: 'manual' })
  const [launch] = w.host.callsOf('agent.launch') as { prompt: string }[]
  assert.match(launch?.prompt ?? '', /Autonomía de este run: manual/)
  await assert.rejects(
    w.request('team.orchestrate', { agent: 'claude', task: 'Login', source: 'chat', autonomy: 'yolo' } as unknown as {
      agent: string
      task: string
      source: 'chat'
    }),
    (error: unknown) => (error as { code?: string }).code === 'invalid_params'
  )
  assert.equal(w.host.callsOf('agent.launch').length, 1)
})

test('un equipo con texto que no es un id no llega al terminal', async () => {
  const w = await start()
  const hostile = [
    { coordinator: 'claude', providers: ['claude; rm -rf ~'], cross: 'todas', roles: {}, custom: [] },
    { coordinator: 'claude', providers: ['claude'], cross: 'todas', roles: { casandra: 'claude && x' }, custom: [] },
    { coordinator: 'claude', providers: ['claude'], cross: '$(whoami)', roles: {}, custom: [] },
    { coordinator: 'claude', providers: ['claude'], cross: 'todas', roles: {}, custom: [{ name: 'Ariadna' }] }
  ]
  for (const team of hostile) {
    await assert.rejects(
      // Simula lo que un panel podría enviar sin respetar el tipo declarado.
      w.request('team.apply', { team } as unknown as { team: Team }),
      (error: unknown) => (error as { code?: string }).code === 'invalid_params'
    )
  }
  assert.equal(w.host.callsOf('terminal.create').length, 0)
})

test('orquestar lanza el coordinador con la skill orca, la entrada y la tarea', async () => {
  const w = await start()
  assert.deepEqual(await w.request('team.orchestrate', { agent: 'codex', task: 'Login con Google', source: 'chat' }), {
    message: 'Lanzado codex con la skill orca en el workspace activo.'
  })
  assert.deepEqual(w.host.callsOf('agent.launch'), [
    { workspaceId: 'w1', agent: 'codex', prompt: orchestratePrompt('Login con Google', 'chat') }
  ])
  await w.request('team.orchestrate', { agent: 'claude', task: '', source: 'plan' })
  assert.match((w.host.callsOf('agent.launch')[1] as { prompt: string }).prompt, /plan-file/)
  const bad = [
    { agent: 'codex', task: '  ', source: 'chat' },
    { agent: 'x y', task: 'algo', source: 'chat' },
    { agent: 'codex', task: 'algo', source: 'jira' }
  ]
  for (const input of bad) {
    await assert.rejects(
      // Simula lo que un panel podría enviar sin respetar el tipo declarado.
      w.request('team.orchestrate', input as unknown as { agent: string; task: string; source: 'chat' }),
      (error: unknown) => (error as { code?: string }).code === 'invalid_params'
    )
  }
  assert.equal(w.host.callsOf('agent.launch').length, 2)
})

test('un chat de Orca con el workspace en formato repo::ruta sale con su agente y su workspace', async () => {
  const w = await start()
  await w.emit('agent.status.changed', {
    workspaceId: 'repo-1::/repo/app/',
    paneKey: 'structured-agent-session-claude_66ff6cb8:1224b7d3',
    state: 'working',
    receivedAt: 1
  })
  assert.equal(await w.command('agents.status'), '- claude: trabajando (app)')
  const [line] = (await summary(w)).groups[0]?.agents ?? []
  assert.equal(line?.canOpen, true)
  await w.request('agents.open', { id: line?.id ?? '' })
  assert.deepEqual(w.host.callsOf('workspace.open'), [{ workspaceId: 'w1' }])
})

test('las pestañas nuevas responden con su contrato aunque estén vacías', async () => {
  const w = await start()
  assert.deepEqual(await w.request('notices.list'), { items: [] })
  assert.deepEqual(await w.request('worktrees.list'), { groups: [] })
  assert.deepEqual(await w.request('history.list'), { items: [] })
})

test('el hook agent.tool.after solo observa: nunca cambia ni para nada', async () => {
  const w = await start()
  const call = { agent: 'claude', workspaceId: 'w1', terminalId: 't1', tool: 'Write', input: { file_path: 'x' } }
  assert.deepEqual(await w.hooks.fire('agent.tool.after', call), { kind: 'continue', event: call })
  assert.deepEqual(w.logs.filter((line) => line.includes('falló')), [])
})
