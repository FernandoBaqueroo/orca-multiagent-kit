import { assert, describe, test } from 'orca/testing'
import {
  CONTRACT_HINT,
  ORCHESTRATE_HINT,
  TASK_MAX,
  TEAM_PRESETS,
  TEAM_ROLES,
  agentFromPaneKey,
  agentLabel,
  agentOptions,
  agentName,
  canonicalWorkspaceId,
  blockedNotice,
  cellText,
  cleanLabel,
  describeAgents,
  draftFromPreset,
  emptyCustomRole,
  encodeTeam,
  forgetRunUnit,
  groupAgents,
  indexWorkspaces,
  isKitDispatch,
  isMissingCommand,
  isValidAgentId,
  isValidRoleName,
  normalizeDraft,
  normalizePath,
  orchestratePrompt,
  AUTONOMY_LEVELS,
  autonomyCommand,
  isAutonomy,
  parseContractHintMode,
  parseDispatch,
  parseTeam,
  OUTPUT_LINE_MAX,
  exitCodeOf,
  isYesNoPrompt,
  lacksExitMarker,
  outputLines,
  resolveFocusedWorkspaceId,
  summarizeAgents,
  teamCommand,
  teamFromDraft,
  trackRun,
  withContractHint,
  withOrchestrateHint,
  type CustomRole,
  type RunProgress,
  type Team,
  type TrackedAgent
} from './kit.ts'

const KIT_SPEC = 'UNIT: U2 — Endpoint POST /recargas     RUN: 20261107-recargas     BASE: abc123\n...'

describe('withContractHint', () => {
  test('añade la referencia a un despacho de la skill orca', () => {
    assert.equal(withContractHint(KIT_SPEC, 'orchestration', 'kit'), `${KIT_SPEC}\n\n${CONTRACT_HINT}`)
  })

  test('no toca despachos ajenos al kit en modo kit, sí en modo all', () => {
    const foreign = 'Task T1 · Dispatch D1\nRevisa el PR 42 y responde con worker_done.'
    assert.equal(withContractHint(foreign, 'orchestration', 'kit'), null)
    assert.equal(withContractHint(foreign, 'orchestration', 'all'), `${foreign}\n\n${CONTRACT_HINT}`)
  })

  test('nunca toca prompts que no son despachos de orquestación', () => {
    assert.equal(withContractHint(KIT_SPEC, 'launch', 'all'), null)
    assert.equal(withContractHint(KIT_SPEC, 'driving', 'all'), null)
  })

  test('desactivado no cambia nada', () => {
    assert.equal(withContractHint(KIT_SPEC, 'orchestration', 'off'), null)
  })

  test('es idempotente y respeta un contrato ya citado', () => {
    const once = withContractHint(KIT_SPEC, 'orchestration', 'kit') ?? ''
    assert.equal(withContractHint(once, 'orchestration', 'kit'), null)
    const cited = `${KIT_SPEC}\nContrato: skills/orca/references/worker-contract.md`
    assert.equal(withContractHint(cited, 'orchestration', 'all'), null)
  })

  test('detecta la cabecera del kit solo con UNIT y RUN', () => {
    assert.equal(isKitDispatch(KIT_SPEC), true)
    assert.equal(isKitDispatch('UNIT: U2 sin run'), false)
    assert.equal(isKitDispatch('RUN: x pero sin unidad'), false)
    assert.equal(isKitDispatch('la UNIT: U2 va en mitad de la línea RUN: x'), false)
  })

  test('reconoce el despacho con las líneas ROL y SETUP de Olimpo', () => {
    const dispatch = [
      'UNIT: U2 — Recarga con tarjeta     RUN: 20261107-recargas     BASE: 5d6e7f8     PUERTO DEV: 3102',
      'ROL: Ariadna · código sensible · nivel alto — tests de casos límite antes que el código',
      '### UNIT: U2 — Recarga con tarjeta',
      'SETUP: /repo · copiar .env.local · pnpm install'
    ].join('\n')
    assert.equal(isKitDispatch(dispatch), true)
    assert.equal(withContractHint(dispatch, 'orchestration', 'kit'), `${dispatch}\n\n${CONTRACT_HINT}`)
  })
})

describe('withOrchestrateHint', () => {
  const task = 'Añade login con Google y su pantalla de ajustes'

  test('un prompt de arranque pasa primero por la skill orca, sin spec-kit', () => {
    assert.equal(withOrchestrateHint(task, 'launch', true), `${task}\n\n${ORCHESTRATE_HINT}`)
    assert.match(ORCHESTRATE_HINT, /no hace falta spec-kit/)
  })

  test('nunca toca despachos, lo que escribe una persona ni nada con el ajuste apagado', () => {
    assert.equal(withOrchestrateHint(task, 'orchestration', true), null)
    assert.equal(withOrchestrateHint(task, 'driving', true), null)
    assert.equal(withOrchestrateHint(task, 'launch', false), null)
    assert.equal(withOrchestrateHint('   ', 'launch', true), null)
  })

  test('no repite lo que ya va por la skill orca ni toca kit-init ni un despacho del kit', () => {
    for (const prompt of [
      'Usa la skill orca para repartir esta tarea entre agentes.\n\nLogin',
      'usa la skill `orca` con el plan',
      'inicializa el proyecto',
      'Ejecuta kit-init',
      'UNIT: U1 — Login     RUN: r1     BASE: abc',
      withOrchestrateHint(task, 'launch', true) ?? ''
    ]) {
      assert.equal(withOrchestrateHint(prompt, 'launch', true), null, prompt)
    }
  })

  test('mencionar otras skills con «orca» en el nombre no cuenta', () => {
    assert.ok(withOrchestrateHint('Con la skill orca-cli abre un terminal', 'launch', true))
    assert.ok(withOrchestrateHint('inicializa el proyecto y añade tests', 'launch', true))
  })
})

describe('parseContractHintMode', () => {
  test('acepta los tres modos y vuelve a kit ante cualquier otra cosa', () => {
    assert.equal(parseContractHintMode('all'), 'all')
    assert.equal(parseContractHintMode('off'), 'off')
    assert.equal(parseContractHintMode('kit'), 'kit')
    assert.equal(parseContractHintMode('ALL'), 'kit')
    assert.equal(parseContractHintMode(undefined), 'kit')
    assert.equal(parseContractHintMode(3), 'kit')
  })
})

describe('isMissingCommand', () => {
  const cases: [string, string][] = [
    ['bash', 'bash: omk: command not found'],
    ['zsh', 'zsh: command not found: omk'],
    ['fish', 'fish: Unknown command: omk'],
    ['cmd', "'omk' is not recognized as an internal or external command,"],
    ['cmd es', "'omk' no se reconoce como un comando interno o externo,"],
    ['pwsh', "omk: The term 'omk' is not recognized as a name of a cmdlet, function, script file"],
    ['pwsh es', "omk : El término 'omk' no se reconoce como nombre de un cmdlet"],
    ['bash es', 'bash: omk: orden no encontrada']
  ]
  for (const [shell, line] of cases) {
    test(`reconoce el error de ${shell}`, () => {
      assert.equal(isMissingCommand(['$ omk verify', line]), true)
    })
  }

  test('no confunde la salida normal de omk ni otros comandos', () => {
    assert.equal(isMissingCommand(['$ omk verify', '[kit] OK  CLAUDE.md importa AGENTS.md']), false)
    assert.equal(isMissingCommand(['bash: omkx: command not found']), false)
    assert.equal(isMissingCommand(['bash: git: command not found']), false)
    assert.equal(isMissingCommand([]), false)
  })
})

describe('resolveFocusedWorkspaceId', () => {
  const workspaces = [
    { id: 'w1', name: 'app', branch: 'main' },
    { id: 'w2', name: 'app', branch: 'feat/x' },
    { id: 'w3', name: 'notas', branch: null }
  ]

  test('cruza nombre y rama', () => {
    assert.equal(resolveFocusedWorkspaceId({ displayName: 'app', branch: 'feat/x' }, workspaces), 'w2')
  })

  test('una carpeta sin rama casa con branch vacío', () => {
    assert.equal(resolveFocusedWorkspaceId({ displayName: 'notas', branch: '' }, workspaces), 'w3')
  })

  test('sin foco, sin coincidencia o con coincidencia ambigua no adivina', () => {
    assert.equal(resolveFocusedWorkspaceId(null, workspaces), null)
    assert.equal(resolveFocusedWorkspaceId({ displayName: 'otro', branch: 'main' }, workspaces), null)
    const twice = [...workspaces, { id: 'w4', name: 'app', branch: 'main' }]
    assert.equal(resolveFocusedWorkspaceId({ displayName: 'app', branch: 'main' }, twice), null)
  })
})

describe('isValidAgentId', () => {
  test('acepta ids simples y rechaza lo demás', () => {
    assert.equal(isValidAgentId('claude'), true)
    assert.equal(isValidAgentId('cursor-agent'), true)
    assert.equal(isValidAgentId(''), false)
    assert.equal(isValidAgentId('claude; rm -rf ~'), false)
    assert.equal(isValidAgentId('Claude'), false)
    assert.equal(isValidAgentId('a'.repeat(41)), false)
    assert.equal(isValidAgentId(null), false)
  })
})

const DISPATCH = [
  'UNIT: U2 — Recarga con tarjeta     RUN: 20261107-recargas     BASE: 5d6e7f8     PUERTO DEV: 3102',
  'ROL: Ariadna · código sensible · nivel alto — tests de casos límite antes que el código',
  '### UNIT: U2 — Recarga con tarjeta'
].join('\n')

describe('parseDispatch', () => {
  test('saca unidad, título, run y rol del despacho de la skill orca', () => {
    assert.deepEqual(parseDispatch(DISPATCH), {
      unit: 'U2',
      title: 'Recarga con tarjeta',
      run: '20261107-recargas',
      role: 'Ariadna'
    })
  })

  test('sin línea ROL ni título sigue sirviendo', () => {
    assert.deepEqual(parseDispatch('UNIT: U7     RUN: r1     BASE: abc'), {
      unit: 'U7', title: null, run: 'r1', role: null
    })
  })

  test('acepta roles con tilde y RUN en otra línea', () => {
    const info = parseDispatch('UNIT: U3 — Índices\nRUN: r9\nROL: Clío · mecánico · nivel bajo')
    assert.equal(info?.role, 'Clío')
    assert.equal(info?.run, 'r9')
    assert.equal(info?.title, 'Índices')
  })

  test('no es un despacho del kit sin UNIT al principio de línea o sin RUN', () => {
    assert.equal(parseDispatch('Revisa el PR 42'), null)
    assert.equal(parseDispatch('UNIT: U2 — sin run'), null)
    assert.equal(parseDispatch('la UNIT: U2 va en mitad RUN: x'), null)
  })

  test('limpia caracteres de control y acota el título', () => {
    const info = parseDispatch(`UNIT: U1 — Pagos\u001b[31m‮ ${'x'.repeat(200)}     RUN: r1`)
    assert.ok(info?.title)
    assert.equal(/[\u001b‮]/.test(info?.title ?? ''), false)
    assert.ok((info?.title ?? '').length <= 80)
  })
})

describe('cleanLabel', () => {
  test('una línea, sin control y acotada', () => {
    assert.equal(cleanLabel('  hola\n\tmundo  '), 'hola mundo')
    assert.equal(cleanLabel('\u0007​'), null)
    assert.equal(cleanLabel('abcdef', 4), 'abc…')
  })
})

describe('workspaces', () => {
  const index = indexWorkspaces([
    { id: 'identity:wt2:local:1', name: 'Palolo', path: 'C:\\Users\\ruben\\palolo' },
    { id: 'w2', name: 'app', path: '/repo/app' }
  ])

  test('normalizePath iguala barras, barra final y mayúsculas de una unidad de Windows', () => {
    assert.equal(normalizePath('C:\\Users\\X\\'), 'c:/users/x')
    assert.equal(normalizePath('/Repo/App/'), '/Repo/App')
  })

  test('canonicalWorkspaceId cruza el formato repo::ruta con el id de la lista', () => {
    assert.equal(canonicalWorkspaceId('repo::C:/Users/ruben/palolo', index), 'identity:wt2:local:1')
    assert.equal(canonicalWorkspaceId('w2', index), 'w2')
    assert.equal(canonicalWorkspaceId('repo::/otra', index), 'repo::/otra')
    assert.equal(canonicalWorkspaceId('suelto', index), 'suelto')
    assert.deepEqual(index.byId.get('identity:wt2:local:1'), {
      name: 'Palolo', path: 'C:\\Users\\ruben\\palolo', branch: null, kind: null
    })
  })

  test('la rama pierde refs/heads/', () => {
    const withBranch = indexWorkspaces([{ id: 'w', name: 'w', path: '/w', branch: 'refs/heads/feat/x', kind: 'worktree' }])
    assert.equal(withBranch.byId.get('w')?.branch, 'feat/x')
  })

  test('agentFromPaneKey reconoce los chats de agente de Orca', () => {
    assert.equal(agentFromPaneKey('structured-agent-session-claude_66ff6cb8_21b6:1224'), 'claude')
    assert.equal(agentFromPaneKey('structured-agent-session-cursor-agent_1:2'), 'cursor-agent')
    assert.equal(agentFromPaneKey('pane-7'), null)
  })
})

describe('agentName', () => {
  const base: TrackedAgent = { workspaceId: null, title: null, state: 'working' }

  test('la unidad del kit gana al título de Orca', () => {
    const unit = { unit: 'U2', title: 'Pagos', run: 'r1', role: 'Ariadna' }
    assert.equal(agentName({ ...base, title: 'claude', unit }), 'U2 · Ariadna — Pagos')
    assert.equal(agentName({ ...base, unit: { ...unit, role: null, title: null } }), 'U2')
  })

  test('sin unidad: el título de Orca, luego el id del agente', () => {
    assert.equal(agentName({ ...base, title: 'Arreglar login', agent: 'codex' }), 'Arreglar login')
    assert.equal(agentName({ ...base, agent: 'codex' }), 'codex')
    assert.equal(agentName(base), 'agente sin título')
  })
})

describe('groupAgents', () => {
  const info = (name: string, branch: string | null = null) => ({ name, path: `/repo/${name}`, branch, kind: 'worktree' })
  const workspaces = new Map([['w1', info('palolo', 'main')], ['w2', info('u2-pagos', 'feat/u2')]])
  const unit = (id: string, title: string) => ({ unit: id, title, run: 'r1', role: 'Proteo' })

  test('agrupa por run del kit o por workspace y pone primero lo bloqueado', () => {
    const groups = groupAgents(
      [
        ['t:1', { workspaceId: 'w1', title: null, state: 'working', agent: 'claude', since: 5 }],
        ['t:2', { workspaceId: 'w2', title: null, state: 'blocked', agent: 'codex', unit: unit('U2', 'Pagos') }],
        ['t:3', { workspaceId: 'w2', title: null, state: 'working', agent: 'claude', unit: unit('U1', 'Login') }],
        ['t:4', { workspaceId: null, title: 'suelto', state: 'waiting' }],
        ['t:5', { workspaceId: 'w1', title: null, state: 'done' }]
      ],
      workspaces
    )
    assert.deepEqual(
      groups.map((g) => [g.title, g.agents.map((a) => a.title)]),
      [
        ['RUN r1', ['U2 · Proteo — Pagos', 'U1 · Proteo — Login']],
        ['Sin workspace', ['suelto']],
        ['palolo', ['claude']]
      ]
    )
    const [blocked] = groups[0]?.agents ?? []
    assert.equal(blocked?.detail, 'codex · u2-pagos')
    assert.equal(blocked?.blocked, true)
    assert.equal(blocked?.canOpen, true)
    // El id del agente no se repite en el detalle cuando ya es su nombre.
    assert.equal(groups[2]?.agents[0]?.detail, 'palolo')
    assert.equal(groups[2]?.agents[0]?.since, 5)
    assert.equal(groups[1]?.agents[0]?.canOpen, false)
  })

  test('la ficha junta todo lo que se sabe del agente', () => {
    const [group] = groupAgents(
      [
        ['t:2', {
          workspaceId: 'w2', title: 'Implementando pagos', state: 'blocked', agent: 'codex',
          unit: { unit: 'U2', title: 'Pagos', run: 'r1', role: 'Ariadna' }, terminalId: 't2', outcome: 'failure'
        }]
      ],
      workspaces
    )
    assert.deepEqual(group?.agents[0]?.facts, [
      { label: 'Agente', value: 'Codex' },
      { label: 'Unidad', value: 'U2 — Pagos' },
      { label: 'Rol', value: 'Ariadna · nivel alto' },
      { label: 'Run', value: 'r1' },
      { label: 'Título en Orca', value: 'Implementando pagos' },
      { label: 'Workspace', value: 'u2-pagos' },
      { label: 'Rama', value: 'feat/u2' },
      { label: 'Carpeta', value: '/repo/u2-pagos' },
      { label: 'Dónde corre', value: 'terminal t2' },
      { label: 'Último turno', value: 'falló' }
    ])
  })

  test('un chat de Orca lo dice y la ficha no inventa lo que no sabe', () => {
    const [group] = groupAgents([['p:x', { workspaceId: null, title: null, state: 'working', terminalId: null }]], workspaces)
    assert.deepEqual(group?.agents[0]?.facts, [{ label: 'Dónde corre', value: 'chat de Orca' }])
  })

  test('un workspace aún sin nombre no se confunde con ninguno', () => {
    const groups = groupAgents([['t:1', { workspaceId: 'w9', title: 'x', state: 'working' }]], workspaces)
    assert.equal(groups[0]?.title, 'Workspace sin nombre')
  })
})

describe('summarizeAgents', () => {
  test('sin agentes activos', () => {
    const summary = summarizeAgents([{ workspaceId: null, title: 'x', state: 'done' }])
    assert.deepEqual(summary, { text: 'MAW', tone: 'neutral', tooltip: 'Orca Multiagent Kit: ningún agente activo' })
  })

  test('cuenta por estado, en singular y plural, y avisa si hay bloqueados', () => {
    const summary = summarizeAgents([
      { workspaceId: 'a', title: 'U1', state: 'working' },
      { workspaceId: 'b', title: 'U2', state: 'working' },
      { workspaceId: 'c', title: 'U3', state: 'blocked' }
    ])
    assert.equal(summary.text, 'MAW · 2 trabajando · 1 bloqueado')
    assert.equal(summary.tone, 'warning')
  })

  test('solo trabajando es accent', () => {
    assert.equal(summarizeAgents([{ workspaceId: null, title: null, state: 'working' }]).tone, 'accent')
  })

  test('el tooltip nombra a los agentes, como mucho seis', () => {
    const agents: [string, TrackedAgent][] = Array.from({ length: 8 }, (_, i) => [
      `t:${i}`,
      { workspaceId: null, title: `A${i}`, state: 'working' }
    ])
    const tooltip = summarizeAgents(agents.map(([, a]) => a), groupAgents(agents, new Map())).tooltip.split('\n')
    assert.equal(tooltip[0], 'Orca Multiagent Kit: 8 trabajando en todos los workspaces')
    assert.equal(tooltip[1], 'A0: trabajando')
    assert.equal(tooltip.length, 8)
    assert.equal(tooltip.at(-1), '… y 2 más')
  })
})

describe('describeAgents', () => {
  test('una línea por agente activo, con agente y workspace si se saben', () => {
    const groups = groupAgents(
      [
        ['t:1', { workspaceId: null, title: 'U1 login', state: 'waiting' }],
        ['t:2', { workspaceId: 'w1', title: null, state: 'blocked', agent: 'codex' }],
        ['t:3', { workspaceId: null, title: 'viejo', state: 'done' }]
      ],
      new Map([['w1', { name: 'app', path: '/app', branch: null, kind: null }]])
    )
    assert.equal(describeAgents(groups), '- codex: bloqueado (app)\n- U1 login: esperando')
    assert.equal(describeAgents([]), 'Ningún agente activo.')
  })
})

describe('blockedNotice', () => {
  const blocked: TrackedAgent = { workspaceId: 'w1', title: 'U1 login', state: 'blocked' }

  test('avisa solo al pasar a bloqueado', () => {
    assert.deepEqual(blockedNotice('working', blocked, 'app'), {
      title: 'U1 login: bloqueado',
      body: 'En app. Necesita tu respuesta en Orca.'
    })
    assert.equal(blockedNotice(undefined, blocked, null)?.body, 'Necesita tu respuesta en Orca.')
    assert.equal(blockedNotice('blocked', blocked, 'app'), null)
    assert.equal(blockedNotice('blocked', { ...blocked, state: 'working' }, 'app'), null)
  })
})

describe('trackRun', () => {
  test('avisa una vez cuando terminan todas las unidades lanzadas, y vuelve a contar', () => {
    const runs: RunProgress = new Map()
    assert.equal(trackRun(runs, 'r1', 't:1', 'working'), null)
    assert.equal(trackRun(runs, 'r1', 't:2', 'working'), null)
    assert.equal(trackRun(runs, 'r1', 't:1', 'done'), null)
    assert.equal(trackRun(runs, 'r1', 't:1', 'done'), null)
    assert.deepEqual(trackRun(runs, 'r1', 't:2', 'done'), {
      title: 'RUN r1: unidades terminadas',
      body: 'Las 2 unidades lanzadas han terminado. Vuelve al coordinador para revisar e integrar.'
    })
    assert.equal(runs.size, 0)
    trackRun(runs, 'r1', 't:3', 'blocked')
    assert.match(trackRun(runs, 'r1', 't:3', 'done')?.body ?? '', /^La unidad lanzada ha terminado/)
  })

  test('un done de una unidad que no se vio activa no avisa ni deja rastro', () => {
    const runs: RunProgress = new Map()
    assert.equal(trackRun(runs, 'r1', 't:1', 'done'), null)
    assert.equal(runs.size, 0)
  })

  test('olvidar una unidad no avisa', () => {
    const runs: RunProgress = new Map()
    trackRun(runs, 'r1', 't:1', 'working')
    forgetRunUnit(runs, 't:1')
    assert.equal(runs.size, 0)
  })
})

describe('agentes conocidos', () => {
  test('los desplegables ofrecen el catálogo y conservan un valor que no está en él', () => {
    const ids = agentOptions().map(({ value }) => value)
    assert.ok(ids.includes('claude') && ids.includes('codex'))
    assert.ok(ids.every(isValidAgentId))
    assert.equal(agentOptions(['mi-agente']).at(-1)?.value, 'mi-agente')
    assert.equal(agentOptions(['rm -rf']).length, ids.length)
    assert.equal(agentLabel('claude'), 'Claude Code')
    assert.equal(agentLabel('mi-agente'), 'mi-agente')
  })
})

describe('equipo', () => {
  const hermes: CustomRole = { name: 'Hermes', work: 'Traducciones', level: 'bajo', review: 'argos', guard: '', provider: 'codex' }
  const base = { coordinator: 'claude', providers: ['claude', 'codex'], cross: 'todas', roles: { casandra: 'codex' }, custom: [] }

  test('los roles son los de Olimpo menos Hefesto, con ids ASCII', () => {
    assert.equal(TEAM_ROLES.length, 11)
    assert.ok(TEAM_ROLES.every(({ id }) => /^[a-z]+$/.test(id)))
  })

  test('parseTeam valida el equipo entero', () => {
    assert.deepEqual(parseTeam(base), base)
    assert.equal(parseTeam({ ...base, roles: { casandra: 'gemini' } }), null)
    assert.equal(parseTeam({ ...base, roles: { hefesto: 'claude' } }), null)
    assert.equal(parseTeam({ ...base, cross: 'a veces' }), null)
    assert.equal(parseTeam({ ...base, providers: ['claude', 'claude'] }), null)
    assert.equal(parseTeam({ ...base, providers: [] }), null)
    assert.equal(parseTeam({ ...base, coordinator: 'x y' }), null)
    assert.equal(parseTeam({ ...base, roles: ['codex'] }), null)
    assert.equal(parseTeam({ ...base, custom: undefined }), null)
    assert.equal(parseTeam(null), null)
  })

  test('los roles propios se validan y su texto se limpia para la tabla', () => {
    const team = parseTeam({ ...base, custom: [{ ...hermes, work: ' Textos | <b>UI</b> ', guard: 'sin\nsaltos' }] })
    assert.deepEqual(team?.custom, [{ ...hermes, work: 'Textos b UI /b', guard: 'sin saltos' }])
    for (const bad of [
      { ...hermes, name: 'Ariadna' },
      { ...hermes, name: 'hefesto' },
      { ...hermes, name: '' },
      { ...hermes, name: 'Rol; rm -rf' },
      { ...hermes, work: '  ' },
      { ...hermes, level: 'máximo' },
      { ...hermes, review: 'nadie' },
      { ...hermes, provider: 'gemini' }
    ]) {
      assert.equal(parseTeam({ ...base, custom: [bad] }), null, JSON.stringify(bad))
    }
    assert.equal(parseTeam({ ...base, custom: [hermes, { ...hermes, name: 'hermes' }] }), null)
    assert.equal(parseTeam({ ...base, custom: Array.from({ length: 11 }, (_, i) => ({ ...hermes, name: `Rol ${i}` })) }), null)
  })

  test('isValidRoleName y cellText', () => {
    assert.equal(isValidRoleName('Hermes'), true)
    assert.equal(isValidRoleName('Iris 2'), true)
    assert.equal(isValidRoleName('Clío'), false)
    assert.equal(isValidRoleName('Hermes', ['hermes']), false)
    assert.equal(cellText('a | b > c', 80), 'a b c')
    assert.equal(cellText('   ', 80), null)
  })

  test('teamCommand manda el equipo en base64url, sin nada que un shell interprete', () => {
    const team = parseTeam({ ...base, custom: [{ ...hermes, work: 'Textos y "comillas" $(x) `y`' }] }) as Team
    const command = teamCommand(team)
    assert.match(command ?? '', /^omk team set --data [A-Za-z0-9_-]+$/)
    const encoded = encodeTeam(team).replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0))
    assert.deepEqual(JSON.parse(new TextDecoder().decode(bytes)), {
      v: 1, providers: team.providers, cross: team.cross, roles: team.roles, custom: team.custom
    })
  })

  test('teamCommand se niega si la orden no cabe en un terminal', () => {
    // «€» ocupa tres bytes: diez roles propios con los textos al máximo no caben en cmd.exe.
    const custom = Array.from({ length: 10 }, (_, i) => ({ ...hermes, name: `Rol ${i}`, work: '€'.repeat(80), guard: '€'.repeat(120) }))
    const team = parseTeam({ ...base, roles: TEAM_PRESETS['claude-codex'].team.roles, custom }) as Team
    assert.ok(team)
    assert.equal(teamCommand(team), null)
    assert.ok(teamCommand({ ...team, custom: team.custom.slice(0, 2) }))
  })

  test('los equipos predefinidos son válidos y Casandra revisa con el otro proveedor', () => {
    for (const id of Object.keys(TEAM_PRESETS) as (keyof typeof TEAM_PRESETS)[]) {
      assert.ok(teamFromDraft(draftFromPreset(id)), id)
    }
    assert.equal(TEAM_PRESETS['claude-codex'].team.roles.casandra, 'codex')
    assert.equal(TEAM_PRESETS['claude-codex'].team.roles.proteo, 'claude')
    assert.deepEqual(draftFromPreset('claude').providers, ['claude'])
  })

  test('teamFromDraft suelta los proveedores que ya no están activos', () => {
    const draft = { ...draftFromPreset('claude-codex'), providers: ['claude'], custom: [{ ...hermes }] }
    const team = teamFromDraft(draft)
    assert.deepEqual(team?.providers, ['claude'])
    assert.equal(team?.roles.casandra, undefined)
    assert.equal(team?.roles.proteo, 'claude')
    assert.equal(team?.custom[0]?.provider, null)
    assert.equal(teamFromDraft({ ...draft, custom: [emptyCustomRole()] }), null)
  })

  test('normalizeDraft lee borradores antiguos o dañados', () => {
    const old = normalizeDraft({ preset: 'custom', coordinator: 'codex', providers: 'claude, codex', cross: 'todas', roles: { argos: 'codex' } })
    assert.deepEqual(old.providers, ['claude', 'codex'])
    assert.equal(old.coordinator, 'codex')
    assert.equal(old.roles.argos, 'codex')
    assert.deepEqual(old.custom, [])
    assert.deepEqual(normalizeDraft(42), draftFromPreset('claude'))
    const broken = normalizeDraft({ providers: 'x;y', roles: { argos: 'gemini', hefesto: 'claude' } })
    assert.deepEqual([broken.providers, broken.roles], [['claude'], {}])
  })
})

describe('orchestratePrompt', () => {
  test('desde el chat pide la skill orca con la tarea limpia y sin spec-kit', () => {
    const prompt = orchestratePrompt('  Login con Google\r\ny ajustes\u0007 ')
    assert.match(prompt ?? '', /^Usa la skill orca/)
    assert.match(prompt ?? '', /no hace falta spec-kit/)
    assert.ok(prompt?.endsWith('\n\nLogin con Google\ny ajustes'))
  })

  test('con un plan o spec-kit la indicación es opcional', () => {
    assert.match(orchestratePrompt('', 'plan') ?? '', /plan-file\): no hace falta spec-kit\.$/)
    assert.match(orchestratePrompt('003-recargas', 'speckit') ?? '', /adaptador speckit\)\.\n\nIndicaciones: 003-recargas$/)
  })

  test('rechaza vacía en el chat, demasiado larga, entrada desconocida o que no es texto', () => {
    assert.equal(orchestratePrompt('   '), null)
    assert.equal(orchestratePrompt('x'.repeat(TASK_MAX + 1), 'plan'), null)
    assert.equal(orchestratePrompt('algo', 'jira'), null)
    assert.equal(orchestratePrompt(42), null)
  })

  test('una autonomía para el run se dice en el prompt; sin ella manda ORCHESTRATION.md', () => {
    assert.match(orchestratePrompt('Login', 'chat', 'auto') ?? '', /Autonomía de este run: auto \(manda sobre ORCHESTRATION\.md §0 solo en este run\)\.\n\nLogin$/)
    assert.ok(!/Autonomía/.test(orchestratePrompt('Login', 'chat', null) ?? ''))
    assert.ok(!/Autonomía/.test(orchestratePrompt('Login') ?? ''))
    assert.equal(orchestratePrompt('Login', 'chat', 'total'), null)
    assert.equal(orchestratePrompt('Login', 'chat', 'auto; rm -rf ~'), null)
  })
})

describe('autonomía', () => {
  test('solo los tres niveles, y cada uno con su orden literal', () => {
    assert.deepEqual(AUTONOMY_LEVELS.map(({ id }) => id), ['manual', 'semi', 'auto'])
    assert.equal(isAutonomy('semi'), true)
    assert.equal(isAutonomy('Semi'), false)
    assert.equal(isAutonomy(undefined), false)
    assert.equal(autonomyCommand('manual'), 'omk team set --autonomy manual')
  })
})

describe('salida de un comando omk en su terminal', () => {
  test('la línea de cierre da el código de salida; sin ella, nada', () => {
    assert.equal(exitCodeOf(['PS C:\\repo> omk verify --exit-marker', '  ✓ Todo correcto', '', '[omk:fin] verify salida=0']), 0)
    assert.equal(exitCodeOf(['[omk:fin] update salida=1', 'PS C:\\repo>']), 1)
    assert.equal(exitCodeOf(['\u001b[32m[omk:fin] team salida=2\u001b[0m']), 2)
    // La orden tecleada lleva la opción, no la línea de cierre.
    assert.equal(exitCodeOf(['$ omk update --exit-marker', '  ✓ Fuente única en ~/.agents']), null)
    assert.equal(exitCodeOf(['[omk:fin] update salida=', '[omk:fin] salida=0', '[omk:fin] update salida=1234']), null)
    assert.equal(exitCodeOf([]), null)
  })

  test('reconoce un omk anterior a la línea de cierre', () => {
    assert.equal(lacksExitMarker(['  Opcion desconocida: --exit-marker']), true)
    assert.equal(lacksExitMarker(['omk team: opción desconocida para omk team: --exit-marker']), true)
    assert.equal(lacksExitMarker(['omk: comando desconocido: --exit-marker']), true)
    assert.equal(lacksExitMarker(['$ omk verify --exit-marker', '  ✓ núcleo en ~/.agents/AGENTS.md']), false)
  })

  test('una pregunta de sí o no solo cuenta si es lo último', () => {
    assert.equal(isYesNoPrompt(['  Orca pide tu aprobación', '  › ¿Apruebas este acceso? [s/N] ', '']), true)
    assert.equal(isYesNoPrompt(['  › ¿Apruebas este acceso? [s/N] s', '  ✓ Plugin instalado']), false)
    assert.equal(isYesNoPrompt([]), false)
  })

  test('limpia la salida: sin escapes ni control, con sangría, sin la línea de cierre y acotada', () => {
    assert.deepEqual(
      outputLines(['\u001b[1m  ✓ Hecho\u001b[0m\u0007', '    + models.md\u202e creado', '[omk:fin] update salida=0', '', '  ']),
      ['  ✓ Hecho', '    + models.md  creado']
    )
    assert.equal(outputLines([`${'x'.repeat(OUTPUT_LINE_MAX)}yz`])[0]?.length, OUTPUT_LINE_MAX)
    assert.deepEqual(outputLines(['a', 'b', 'c'], 2), ['b', 'c'])
    // Un spinner leído como salida acumulada: cuenta el último fotograma, no todos pegados.
    assert.deepEqual(outputLines(['\r  ⠋ Claude Code…\r  ⠙ Claude Code…\r  ✓ Claude Code\r']), ['  ✓ Claude Code'])
  })
})
