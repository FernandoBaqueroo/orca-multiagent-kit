import { assert, describe, test } from 'orca/testing'
import {
  CONTRACT_HINT,
  describeAgents,
  isKitDispatch,
  isMissingCommand,
  isValidAgentId,
  parseContractHintMode,
  pollUntil,
  resolveFocusedWorkspaceId,
  summarizeAgents,
  withContractHint
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
})

describe('describeAgents', () => {
  test('una línea por agente activo', () => {
    assert.equal(
      describeAgents([
        { workspaceId: null, title: 'U1 login', state: 'waiting' },
        { workspaceId: null, title: null, state: 'blocked' },
        { workspaceId: null, title: 'viejo', state: 'done' }
      ]),
      '- U1 login: esperando\n- agente sin título: bloqueado'
    )
    assert.equal(describeAgents([]), 'Ningún agente activo.')
  })
})

describe('pollUntil', () => {
  const instant = { attempts: 3, delayMs: 10, sleep: async () => undefined }

  test('para en cuanto la salida coincide', async () => {
    let reads = 0
    const found = await pollUntil(async () => [String(++reads)], (lines) => lines[0] === '2', instant)
    assert.equal(found, true)
    assert.equal(reads, 2)
  })

  test('se rinde tras el número de intentos', async () => {
    let reads = 0
    const found = await pollUntil(async () => [String(++reads)], () => false, instant)
    assert.equal(found, false)
    assert.equal(reads, 3)
  })
})
