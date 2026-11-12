// La pestaña Historial tal como la dibuja Orca, con el worker sustituido.
import { afterEach, assert, mockHost, mount, test, type TestPanel } from 'orca/testing'
import type { AgentsView, HistoryEntry } from '../protocol.ts'
import * as panel from '../panel.tsx'

const NO_AGENTS: AgentsView = { text: 'MAW', tone: 'neutral', tooltip: 'ninguno', groups: [] }
const entry = (id: string, kind: HistoryEntry['kind'], title: string): HistoryEntry => ({
  id,
  at: Date.now(),
  kind,
  tone: 'accent',
  title,
  detail: 'detalle',
  run: 'r1',
  unit: 'U1',
  agent: 'claude',
  workspace: 'app'
})
const ITEMS = [entry('3', 'reply', 'Respondiste'), entry('2', 'dispatch', 'U1 despachado')]

let view: TestPanel | undefined
afterEach(async () => {
  await view?.unmount()
  view = undefined
})

const open = async (items: HistoryEntry[]) => {
  const calls: string[] = []
  const host = mockHost({
    requests: {
      'agents.summary': () => NO_AGENTS,
      'history.list': () => ({ items }),
      'history.clear': () => {
        calls.push('history.clear')
        return { message: 'Historial vaciado.' }
      }
    }
  })
  view = await mount(panel, { host })
  await view.select({ label: 'Secciones' }, 'history')
  return { calls, host }
}
const clean = () => {
  assert.deepEqual(view?.errors, [])
  assert.deepEqual(view?.warnings, [])
  assert.deepEqual(view?.refusals, [])
}

test('vacío enseña el estado vacío', async () => {
  await open([])
  assert.ok(view?.find({ label: 'Sin historial' }))
  clean()
})

test('lista las entradas y filtra por tipo', async () => {
  await open(ITEMS)
  assert.ok(view?.find({ text: 'Respondiste' }))
  assert.ok(view?.find({ text: 'U1 despachado' }))
  await view?.select({ label: 'Mostrar' }, 'mine')
  assert.ok(view?.find({ text: 'Respondiste' }))
  assert.equal(view?.find({ text: 'U1 despachado' }), null)
  await view?.select({ label: 'Mostrar' }, 'runs')
  assert.equal(view?.find({ text: 'Respondiste' }), null)
  assert.ok(view?.find({ text: 'U1 despachado' }))
  clean()
})

test('vaciar pide confirmación en dos pasos', async () => {
  const { calls } = await open(ITEMS)
  await view?.press({ text: 'Vaciar historial' })
  assert.deepEqual(calls, [])
  await view?.press({ text: '¿Seguro? Vaciar' })
  assert.deepEqual(calls, ['history.clear'])
  clean()
})
