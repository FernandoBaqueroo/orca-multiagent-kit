// El panel tal como lo dibuja Orca, con el worker sustituido por respuestas fijas.
import { afterEach, assert, hostError, mockHost, mount, test, type TestPanel } from 'orca/testing'
import type { AgentsView } from './protocol.ts'
import * as panel from './panel.tsx'

const NO_AGENTS: AgentsView = { text: 'MAW', tone: 'neutral', tooltip: 'ninguno', agents: [] }
const TWO_AGENTS: AgentsView = {
  text: 'MAW · 1 trabajando · 1 bloqueado',
  tone: 'warning',
  tooltip: 'dos',
  agents: [
    { title: 'U1 login', state: 'trabajando' },
    { title: 'U2 pagos', state: 'bloqueado' }
  ]
}

type Requests = Record<string, (input: never) => unknown>

let view: TestPanel | undefined
afterEach(async () => {
  await view?.unmount()
  view = undefined
})

const open = async (options: { settings?: Record<string, string | boolean>; requests?: Requests } = {}) => {
  const runs: unknown[] = []
  const host = mockHost({
    settings: options.settings ?? {},
    requests: {
      'agents.summary': () => NO_AGENTS,
      'kit.run': (input: { action: string }) => {
        runs.push(input)
        return { message: `hecho: ${input.action}` }
      },
      ...options.requests
    }
  })
  view = await mount(panel, { host })
  return { view, host, runs }
}

test('muestra los ajustes guardados y los agentes del worker', async () => {
  const { view } = await open({
    settings: { contractHint: 'all', statusBar: false, initAgent: 'codex' },
    requests: { 'agents.summary': () => TWO_AGENTS }
  })
  assert.equal(view.valueOf({ label: 'Contrato del worker en los despachos' }), 'all')
  assert.equal(view.valueOf({ label: 'Agentes en la barra de estado' }), false)
  assert.equal(view.valueOf({ label: 'Agente para inicializar' }), 'codex')
  assert.ok(view.find({ label: 'U2 pagos' }))
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.refusals, [])
})

test('sin agentes activos lo dice', async () => {
  const { view } = await open()
  assert.match(view.summary().join(' '), /Ningún agente activo/)
})

test('cada botón pide su acción al worker y enseña la respuesta', async () => {
  const { view, runs } = await open()
  await view.press({ text: 'Verificar instalación' })
  await view.press({ text: 'Inicializar proyecto' })
  await view.press({ text: 'Actualizar kit' })
  assert.deepEqual(runs, [{ action: 'verify' }, { action: 'init' }, { action: 'update' }])
  assert.ok(view.find({ text: 'hecho: update' }))
})

test('un fallo del worker se enseña, no se calla', async () => {
  const { view } = await open({
    requests: {
      'kit.run': () => {
        throw hostError('action_failed', 'sin workspace')
      }
    }
  })
  await view.press({ text: 'Verificar instalación' })
  assert.match(view.summary().join(' '), /sin workspace/)
})

test('los controles guardan en los ajustes del plugin', async () => {
  const { view, host } = await open()
  await view.toggle({ label: 'Agentes en la barra de estado' })
  await view.select({ label: 'Contrato del worker en los despachos' }, 'off')
  await view.type({ label: 'Agente para inicializar' }, 'codex', { replace: true, submit: true })
  assert.deepEqual(host.data().settings, { statusBar: false, contractHint: 'off', initAgent: 'codex' })
})

test('no guarda un id de agente no válido', async () => {
  const { view, host } = await open()
  await view.type({ label: 'Agente para inicializar' }, 'rm -rf /', { replace: true, submit: true })
  assert.equal(host.data().settings.initAgent, undefined)
  assert.match(view.summary().join(' '), /no es un id de agente válido/)
})

test('se actualiza cuando el worker envía otros agentes', async () => {
  const { view } = await open()
  await view.post('agents.changed', TWO_AGENTS)
  assert.ok(view.find({ label: 'U1 login' }))
})
