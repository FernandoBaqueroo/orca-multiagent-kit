// La pestaña Avisos tal como la dibuja Orca, con el worker sustituido por respuestas fijas.
import { afterEach, assert, hostError, mockHost, mount, test, type TestPanel } from 'orca/testing'
import type { NoticeItem } from '../protocol.ts'
import * as panel from '../panel.tsx'

const PLAN: NoticeItem = {
  id: 'plan:r1',
  kind: 'plan',
  title: 'Plan de rondas · r1',
  agent: 'claude',
  workspace: 'app',
  unit: null,
  since: 1000,
  context: [],
  canReply: true,
  plan: {
    run: 'r1',
    source: 'spec-kit 003-recargas',
    autonomy: 'semi',
    base: 'origin/main @ 1a2b3c4',
    integration: 'feat/003-recargas',
    merge: 'feat/003-recargas → main',
    units: [
      { round: 0, id: 'U0', title: 'setup', role: 'Hefesto', level: 'alto', agent: 'coordinador', model: null, resource: 'inline', files: '7', depends: null },
      { round: 1, id: 'U2', title: 'recarga con tarjeta', role: 'Ariadna', level: 'medio', agent: 'claude', model: 'opus', resource: 'worker', files: '11', depends: 'U0' },
      { round: 1, id: 'U3', title: 'revisión', role: null, level: null, agent: 'codex', model: null, resource: 'manual', files: null, depends: null }
    ],
    notes: ['modelos: nuevo en antigravity']
  }
}
const BLOCKED: NoticeItem = {
  id: 't:2',
  kind: 'blocked',
  title: 'U2 · Ariadna — Pagos',
  agent: 'codex',
  workspace: 'app',
  unit: 'U2 · Ariadna — Pagos',
  since: 2000,
  context: ['Allow edit to src/pay.ts? (y/n)', '> '],
  canReply: true,
  plan: null
}
const CHAT: NoticeItem = { ...BLOCKED, id: 'p:structured-agent-session-claude_a:1', kind: 'waiting', title: 'chat', context: [], canReply: false }

type Requests = Record<string, (input: never) => unknown>
let view: TestPanel | undefined
afterEach(async () => {
  await view?.unmount()
  view = undefined
})

const open = async (items: NoticeItem[], requests: Requests = {}) => {
  const calls: { name: string; input: unknown }[] = []
  const answer = (name: string) => (input: unknown) => {
    calls.push({ name, input })
    return { message: `hecho: ${name}` }
  }
  const host = mockHost({
    requests: {
      'agents.summary': { text: 'MAW', tone: 'neutral', tooltip: 'ninguno', groups: [] },
      'notices.list': { items },
      'notices.reply': answer('notices.reply'),
      'notices.dismiss': answer('notices.dismiss'),
      'agents.open': answer('agents.open'),
      ...requests
    }
  })
  view = await mount(panel, { host })
  await view.select({ label: 'Secciones' }, 'notices')
  return { view, calls }
}
const text = (v: TestPanel) => JSON.stringify(v.tree())
const clean = (v: TestPanel) => {
  assert.deepEqual(v.errors, [])
  assert.deepEqual(v.warnings, [])
  assert.deepEqual(v.refusals, [])
}

test('sin avisos sale el estado vacío', async () => {
  const { view } = await open([])
  assert.match(view.summary().join(' '), /Nada pendiente/)
  clean(view)
})

test('la tarjeta del plan enseña cabecera, rondas, unidades y notas', async () => {
  const { view } = await open([PLAN])
  const all = text(view)
  for (const expected of [/Plan de rondas · r1/, /spec-kit 003-recargas/, /Ronda 0/, /Ronda 1/, /recarga con tarjeta/, /Ariadna · medio/, /opus/, /depende de: U0/, /Notas/, /modelos: nuevo/, /Merge final/]) {
    assert.match(all, expected)
  }
  assert.equal(view.find({ text: 'Pedir cambio' })?.disabled, true)
  clean(view)
})

test('«Sí, lánzalo» responde sí y «Pedir cambio» responde cambia: …', async () => {
  const { view, calls } = await open([PLAN])
  await view.press({ text: 'Sí, lánzalo' })
  await view.type({ label: '¿Qué cambio?' }, ' sin la ronda 2 ')
  await view.press({ text: 'Pedir cambio' })
  assert.deepEqual(calls, [
    { name: 'notices.reply', input: { id: 'plan:r1', text: 'sí' } },
    { name: 'notices.reply', input: { id: 'plan:r1', text: 'cambia: sin la ronda 2' } }
  ])
  assert.equal(view.valueOf({ label: '¿Qué cambio?' }), '')
  clean(view)
})

test('el aviso desaparece cuando el worker lo quita', async () => {
  const { view } = await open([PLAN])
  await view.post('notices.changed', { items: [] })
  assert.match(view.summary().join(' '), /Nada pendiente/)
  clean(view)
})

test('sin canReply los controles salen deshabilitados y lo explica', async () => {
  const { view } = await open([{ ...PLAN, canReply: false }, CHAT])
  assert.equal(view.find({ text: 'Sí, lánzalo' })?.disabled, true)
  assert.equal(view.findAll({ text: 'Responde en el chat del agente.' }).length > 0, true)
  assert.equal(view.find({ text: 'Enviar' })?.disabled, true)
  assert.equal(view.find({ text: 'Ir a su workspace' })?.disabled, false)
  clean(view)
})

test('un agente bloqueado enseña su contexto y se le responde', async () => {
  const { view, calls } = await open([BLOCKED])
  const all = text(view)
  assert.match(all, /necesita tu permiso/)
  assert.match(all, /app/)
  await view.toggle({ text: /Lo último del terminal/ })
  assert.match(text(view), /Allow edit to src\/pay\.ts/)
  assert.equal(view.find({ text: 'Enviar' })?.disabled, true)
  await view.type({ label: 'Respuesta para U2 · Ariadna — Pagos' }, 'y')
  await view.press({ text: 'Enviar' })
  assert.deepEqual(calls, [{ name: 'notices.reply', input: { id: 't:2', text: 'y' } }])
  assert.equal(view.valueOf({ label: 'Respuesta para U2 · Ariadna — Pagos' }), '')
  clean(view)
})

test('ir a su workspace y descartar usan el id del aviso', async () => {
  const { view, calls } = await open([BLOCKED])
  await view.press({ text: 'Ir a su workspace' })
  await view.press({ text: 'Descartar' })
  assert.deepEqual(calls, [
    { name: 'agents.open', input: { id: 't:2' } },
    { name: 'notices.dismiss', input: { id: 't:2' } }
  ])
  clean(view)
})

test('un error de la respuesta sale arriba y la caja conserva el texto', async () => {
  const { view } = await open([BLOCKED], {
    'notices.reply': () => {
      throw hostError('unavailable', 'el terminal no aceptó el texto')
    }
  })
  await view.type({ label: 'Respuesta para U2 · Ariadna — Pagos' }, 'y')
  await view.press({ text: 'Enviar' })
  assert.match(text(view), /no aceptó el texto/)
  assert.equal(view.valueOf({ label: 'Respuesta para U2 · Ariadna — Pagos' }), 'y')
  assert.deepEqual(view.errors, [])
})

test('si la lista no se puede leer sale el error', async () => {
  const { view } = await open([], {
    'notices.list': () => {
      throw hostError('unavailable', 'sin worker')
    }
  })
  assert.match(text(view), /Avisos no leídos/)
  assert.deepEqual(view.errors, [])
})
