// La pestaña Worktrees tal como la dibuja Orca, con el worker sustituido por respuestas fijas.
import { afterEach, assert, mockHost, mount, test, type TestPanel } from 'orca/testing'
import type { AgentsView, WorktreeGroup } from '../protocol.ts'
import * as panel from '../panel.tsx'

const NO_AGENTS: AgentsView = { text: 'MAW', tone: 'neutral', tooltip: 'ninguno', groups: [] }

const GROUPS: WorktreeGroup[] = [
  {
    run: '20261112-auth',
    title: 'RUN 20261112-auth',
    worktrees: [
      {
        workspaceId: 'w2',
        name: 'u1-login',
        branch: 'feat/u1-login',
        unit: 'U1 — Login',
        agents: [
          { id: 't:t1', agent: 'claude', title: 'U1 · Proteo — Login', state: 'esperando', blocked: false, model: 'sonnet', canSetModel: true }
        ]
      },
      {
        workspaceId: 'w3',
        name: 'u2-pagos',
        branch: 'feat/u2-pagos',
        unit: 'U2 — Pagos',
        agents: [
          { id: 't:t2', agent: 'claude', title: 'U2 · Proteo — Pagos', state: 'trabajando', blocked: false, model: null, canSetModel: true },
          { id: 'p:chat', agent: 'claude', title: 'claude', state: 'bloqueado', blocked: true, model: null, canSetModel: false }
        ]
      }
    ]
  },
  {
    run: null,
    title: 'Otros worktrees con agentes',
    worktrees: [{ workspaceId: 'w4', name: 'otro', branch: null, unit: null, agents: [] }]
  }
]

let view: TestPanel | undefined
afterEach(async () => {
  await view?.unmount()
  view = undefined
})

const open = async (groups: WorktreeGroup[] = GROUPS) => {
  const calls: { name: string; input: unknown }[] = []
  const host = mockHost({
    settings: {},
    requests: {
      'agents.summary': () => NO_AGENTS,
      // Las demás pestañas también piden su lista al montar el panel.
      'notices.list': () => ({ items: [] }),
      'history.list': () => ({ items: [] }),
      'worktrees.list': () => ({ groups }),
      'worktrees.open': (input: { workspaceId: string }) => {
        calls.push({ name: 'worktrees.open', input })
        return { message: 'Abierto.' }
      },
      'worktrees.model': (input: { id: string; model: string }) => {
        calls.push({ name: 'worktrees.model', input })
        return { message: 'Pedido.' }
      }
    }
  })
  view = await mount(panel, { host })
  await view.select({ label: 'Secciones' }, 'worktrees')
  return { view, calls }
}

const clean = (v: TestPanel) => {
  assert.deepEqual(v.errors, [])
  assert.deepEqual(v.warnings, [])
  assert.deepEqual(v.refusals, [])
}

test('una tarjeta por run con sus worktrees, agentes, estado y modelo', async () => {
  const { view } = await open()
  const text = JSON.stringify(view.tree())
  assert.match(text, /RUN 20261112-auth/)
  assert.match(text, /Otros worktrees con agentes/)
  assert.match(text, /feat\/u1-login · U1 — Login/)
  // El bloqueado sale abierto: se ve su fila sin pulsar nada.
  assert.match(text, /bloqueado/)
  assert.match(text, /modelo no informado/)
  clean(view)
})

test('abrir un worktree pide su id al worker', async () => {
  const { view, calls } = await open()
  await view.press({ text: 'Abrir worktree' })
  assert.equal(calls[0]?.name, 'worktrees.open')
  clean(view)
})

test('cambiar el modelo de quien espera manda el elegido', async () => {
  const { view, calls } = await open()
  await view.toggle({ label: 'u1-login' })
  assert.equal(view.valueOf({ label: 'Modelo de U1 · Proteo — Login' }), 'sonnet')
  await view.select({ label: 'Modelo de U1 · Proteo — Login' }, 'opus')
  await view.press({ text: 'Cambiar modelo' })
  assert.deepEqual(calls.filter((c) => c.name === 'worktrees.model'), [
    { name: 'worktrees.model', input: { id: 't:t1', model: 'opus' } }
  ])
  clean(view)
})

test('trabajando no se puede cambiar el modelo y lo explica; un chat de Orca, tampoco', async () => {
  const { view } = await open()
  const text = JSON.stringify(view.tree())
  assert.match(text, /Espera a que termine su turno/)
  assert.match(text, /Es un chat de Orca: cambia el modelo desde su chat/)
  const buttons = view.findAll({ type: 'Button', text: /Cambiar modelo/ })
  assert.equal(buttons.length, 1)
  assert.equal(buttons[0]?.props.disabled, true)
  clean(view)
})

test('sin worktrees enseña el vacío', async () => {
  const { view } = await open([])
  assert.match(view.summary().join(' '), /Ningún worktree/)
  clean(view)
})

test('se actualiza cuando el worker envía otros worktrees', async () => {
  const { view } = await open([])
  await view.post('worktrees.changed', { groups: GROUPS })
  assert.match(JSON.stringify(view.tree()), /RUN 20261112-auth/)
})
