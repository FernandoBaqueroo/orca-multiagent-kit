// El panel tal como lo dibuja Orca, con el worker sustituido por respuestas fijas.
import { afterEach, assert, hostError, mockHost, mount, test, type TestPanel } from 'orca/testing'
import type { Team } from './kit.ts'
import type { AgentsView } from './protocol.ts'
import * as panel from './panel.tsx'

const NO_AGENTS: AgentsView = { text: 'MAW', tone: 'neutral', tooltip: 'ninguno', groups: [] }
const TWO_AGENTS: AgentsView = {
  text: 'MAW · 1 trabajando · 1 bloqueado',
  tone: 'warning',
  tooltip: 'dos',
  groups: [
    {
      title: 'RUN r1',
      agents: [
        {
          id: 't:2',
          title: 'U2 · Ariadna — Pagos',
          state: 'bloqueado',
          blocked: true,
          detail: 'codex · u2',
          since: 1,
          canOpen: true,
          facts: [
            { label: 'Agente', value: 'Codex' },
            { label: 'Rama', value: 'feat/u2' }
          ]
        }
      ]
    },
    {
      title: 'app',
      agents: [
        { id: 'p:1', title: 'claude', state: 'trabajando', blocked: false, detail: 'app', since: null, canOpen: false, facts: [] }
      ]
    }
  ]
}

type Requests = Record<string, (input: never) => unknown>

let view: TestPanel | undefined
afterEach(async () => {
  await view?.unmount()
  view = undefined
})

const open = async (options: { settings?: Record<string, string | boolean>; requests?: Requests } = {}) => {
  const calls: { name: string; input: unknown }[] = []
  const answer = (name: string) => (input: unknown) => {
    calls.push({ name, input })
    return { message: `hecho: ${name}` }
  }
  const host = mockHost({
    settings: options.settings ?? {},
    requests: {
      'agents.summary': () => NO_AGENTS,
      'notices.list': () => ({ items: [] }),
      'worktrees.list': () => ({ groups: [] }),
      'history.list': () => ({ items: [] }),
      'kit.run': (input: { action: string }) => {
        calls.push({ name: 'kit.run', input })
        return { message: `hecho: ${input.action}` }
      },
      'agents.open': answer('agents.open'),
      'team.apply': answer('team.apply'),
      'team.show': answer('team.show'),
      'team.orchestrate': answer('team.orchestrate'),
      ...options.requests
    }
  })
  view = await mount(panel, { host })
  return { view, host, calls }
}

type TabId = 'notices' | 'agents' | 'worktrees' | 'orchestrate' | 'history' | 'team' | 'kit'
const tab = (v: TestPanel, value: TabId) => v.select({ label: 'Secciones' }, value)
const applied = (calls: { name: string; input: unknown }[]) =>
  (calls.find((c) => c.name === 'team.apply')?.input as { team: Team }).team
const text = (v: TestPanel) => JSON.stringify(v.tree())

test('cada agente tiene su ficha y un botón para ir a su workspace', async () => {
  const { view, calls } = await open({ requests: { 'agents.summary': () => TWO_AGENTS } })
  await tab(view, 'agents')
  assert.match(text(view), /RUN r1/)
  // Los bloqueados salen abiertos: se ve su ficha sin pulsar nada.
  assert.match(text(view), /feat\/u2/)
  await view.press({ text: 'Ir a su workspace' })
  assert.deepEqual(calls, [{ name: 'agents.open', input: { id: 't:2' } }])
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.warnings, [])
  assert.deepEqual(view.refusals, [])
})

test('sin agentes activos lo dice', async () => {
  const { view } = await open()
  // El panel abre en Avisos: lo que espera respuesta va primero.
  assert.match(view.summary().join(' '), /Nada pendiente/)
  await tab(view, 'agents')
  assert.match(view.summary().join(' '), /Ningún agente activo/)
})

test('se actualiza cuando el worker envía otros agentes', async () => {
  const { view } = await open()
  await view.post('agents.changed', TWO_AGENTS)
  assert.match(text(view), /U2 · Ariadna — Pagos/)
})

test('repartir manda la tarea, la entrada y el coordinador elegido, y vacía el cuadro', async () => {
  const { view, calls } = await open()
  await tab(view, 'orchestrate')
  assert.match(text(view), /No necesita spec-kit/)
  await view.select({ label: 'Coordinador' }, 'codex')
  await view.type({ label: 'Qué quieres hacer' }, 'Login con Google')
  await view.press({ text: 'Repartir' })
  assert.deepEqual(calls, [
    { name: 'team.orchestrate', input: { agent: 'codex', task: 'Login con Google', source: 'chat' } }
  ])
  assert.equal(view.valueOf({ label: 'Qué quieres hacer' }), '')
  assert.deepEqual(view.warnings, [])
})

test('repartir con otra autonomía solo para ese run la manda al worker', async () => {
  const { view, calls } = await open()
  await tab(view, 'orchestrate')
  await view.select({ label: 'Autonomía de este run' }, 'auto')
  await view.type({ label: 'Qué quieres hacer' }, 'Login')
  await view.press({ text: 'Repartir' })
  assert.deepEqual(calls, [
    { name: 'team.orchestrate', input: { agent: 'claude', task: 'Login', source: 'chat', autonomy: 'auto' } }
  ])
  await view.select({ label: 'Autonomía de este run' }, '(proyecto)')
})

test('la autonomía del proyecto se elige y se guarda con omk team', async () => {
  const { view, calls } = await open({ requests: { 'team.autonomy': (input: unknown) => (calls.push({ name: 'team.autonomy', input }), { message: 'ok' }) } })
  await tab(view, 'team')
  await view.select({ label: 'Nivel' }, 'manual')
  assert.match(text(view), /cada ronda, cada merge/)
  await view.press({ text: 'Guardar en el proyecto' })
  assert.deepEqual(calls, [{ name: 'team.autonomy', input: { autonomy: 'manual' } }])
  assert.deepEqual(view.warnings, [])
})

test('con un plan del repo no hace falta escribir nada', async () => {
  const { view, calls } = await open()
  await tab(view, 'orchestrate')
  assert.equal(view.find({ text: 'Repartir' })?.props.disabled, true)
  await view.select({ label: 'De dónde sale el trabajo' }, 'plan')
  assert.ok(view.find({ label: 'Qué plan (opcional)' }))
  await view.press({ text: 'Repartir' })
  assert.deepEqual(calls[0]?.input, { agent: 'claude', task: '', source: 'plan' })
})

test('un equipo predefinido marca proveedores y roles, y se aplica', async () => {
  const { view, calls } = await open()
  await tab(view, 'team')
  await view.select({ label: 'Equipo predefinido' }, 'claude-codex')
  await view.toggle({ label: 'Proveedores activos' })
  assert.equal(view.valueOf({ label: 'Codex' }), true)
  assert.equal(view.valueOf({ label: 'Gemini CLI' }), false)
  await view.toggle({ label: 'Roles de Olimpo' })
  assert.equal(view.valueOf({ label: 'Casandra · seguridad (nivel alto)' }), 'codex')
  await view.press({ text: 'Aplicar al proyecto' })
  const team = applied(calls)
  assert.deepEqual(team.providers, ['claude', 'codex'])
  assert.equal(team.roles.casandra, 'codex')
  assert.deepEqual(view.warnings, [])
})

test('quitar un proveedor deja el equipo personalizado y suelta sus roles; el último no se puede quitar', async () => {
  const { view, calls } = await open()
  await tab(view, 'team')
  await view.select({ label: 'Equipo predefinido' }, 'claude-codex')
  await view.toggle({ label: 'Proveedores activos' })
  await view.toggle({ label: 'Codex' })
  assert.equal(view.valueOf({ label: 'Equipo predefinido' }), 'custom')
  assert.equal(view.find({ label: 'Claude Code' })?.props.disabled, true)
  await view.toggle({ label: 'Roles de Olimpo' })
  assert.equal(view.valueOf({ label: 'Casandra · seguridad (nivel alto)' }), '(auto)')
  await view.select({ label: 'Argos · verificación (nivel medio)' }, '(auto)')
  await view.press({ text: 'Aplicar al proyecto' })
  const team = applied(calls)
  assert.deepEqual(team.providers, ['claude'])
  assert.equal(team.roles.casandra, undefined)
  assert.equal(team.roles.argos, undefined)
  assert.equal(team.roles.proteo, 'claude')
})

test('se añaden roles propios y no se aplica hasta que están completos', async () => {
  const { view, calls } = await open()
  await tab(view, 'team')
  await view.press({ text: 'Añadir rol' })
  assert.equal(view.find({ text: 'Aplicar al proyecto' })?.props.disabled, true)
  await view.type({ label: 'Nombre del rol' }, 'Ariadna')
  await view.type({ label: 'Qué hace' }, 'Traducciones')
  assert.equal(view.find({ text: 'Aplicar al proyecto' })?.props.disabled, true)
  await view.type({ label: 'Nombre del rol' }, 'Hermes', { replace: true })
  await view.select({ label: 'Nivel de modelo' }, 'bajo')
  await view.select({ label: 'Revisión' }, 'argos')
  await view.press({ text: 'Aplicar al proyecto' })
  assert.deepEqual(applied(calls).custom, [
    { name: 'Hermes', work: 'Traducciones', level: 'bajo', review: 'argos', guard: '', provider: null }
  ])
  await view.press({ text: 'Quitar rol' })
  assert.match(text(view), /Ninguno todavía/)
  await view.press({ text: 'Ver el del proyecto' })
  assert.equal(calls.at(-1)?.name, 'team.show')
})

test('muestra los ajustes guardados', async () => {
  const { view } = await open({ settings: { contractHint: 'all', statusBar: false, notify: false, initAgent: 'codex' } })
  await tab(view, 'kit')
  assert.equal(view.valueOf({ label: 'Contrato del worker en los despachos' }), 'all')
  assert.equal(view.valueOf({ label: 'Agentes en la barra de estado' }), false)
  assert.equal(view.valueOf({ label: 'Avisos de agentes' }), false)
  assert.equal(view.valueOf({ label: 'Agente para inicializar' }), 'codex')
  assert.deepEqual(view.errors, [])
})

test('cada botón pide su acción al worker y enseña la respuesta', async () => {
  const { view, calls } = await open()
  await tab(view, 'kit')
  await view.press({ text: 'Verificar instalación' })
  await view.press({ text: 'Inicializar proyecto' })
  await view.press({ text: 'Actualizar kit' })
  assert.deepEqual(calls.map((c) => c.input), [{ action: 'verify' }, { action: 'init' }, { action: 'update' }])
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
  await tab(view, 'kit')
  await view.press({ text: 'Verificar instalación' })
  assert.match(view.summary().join(' '), /Callout danger "No se pudo"/)
  assert.match(text(view), /sin workspace/)
})

test('el resultado de una acción tiene título propio y se cierra', async () => {
  const { view } = await open()
  await tab(view, 'kit')
  await view.press({ text: 'Verificar instalación' })
  // Sin título, Orca pinta un Callout como un «Consejo» de Markdown.
  assert.match(view.summary().join(' '), /Callout success "Hecho"/)
  await view.press({ text: 'Cerrar' })
  assert.equal(/Callout/.test(view.summary().join(' ')), false)
})

test('los controles guardan en los ajustes del plugin; el agente se elige de una lista', async () => {
  const { view, host } = await open()
  await tab(view, 'kit')
  await view.toggle({ label: 'Agentes en la barra de estado' })
  await view.toggle({ label: 'Avisos de agentes' })
  await view.toggle({ label: 'Repartir al lanzar un agente con tarea' })
  await view.select({ label: 'Contrato del worker en los despachos' }, 'off')
  await view.select({ label: 'Agente para inicializar' }, 'codex')
  assert.deepEqual(host.data().settings, {
    statusBar: false, notify: false, autoOrchestrate: false, contractHint: 'off', initAgent: 'codex'
  })
})

test('un agente guardado que no está en la lista sigue saliendo', async () => {
  const { view } = await open({ settings: { initAgent: 'mi-agente' } })
  await tab(view, 'kit')
  assert.equal(view.valueOf({ label: 'Agente para inicializar' }), 'mi-agente')
  assert.deepEqual(view.warnings, [])
})

test('Avisos, Worktrees e Historial tienen su pestaña', async () => {
  const { view } = await open()
  await tab(view, 'notices')
  assert.match(text(view), /Nada pendiente/)
  await tab(view, 'worktrees')
  assert.match(text(view), /Ningún worktree/)
  await tab(view, 'history')
  assert.match(text(view), /Sin historial/)
  assert.deepEqual(view.errors, [])
  assert.deepEqual(view.warnings, [])
})

test('cada agente lleva el icono de su proveedor', async () => {
  const withAgent: AgentsView = {
    ...TWO_AGENTS,
    groups: TWO_AGENTS.groups.map((group) => ({
      ...group,
      agents: group.agents.map((agent) => ({ ...agent, agent: agent.id === 't:2' ? 'codex' : 'claude' }))
    }))
  }
  const { view } = await open({ requests: { 'agents.summary': () => withAgent } })
  assert.match(text(view), /assets\/logos\/codex\.png/)
  assert.deepEqual(view.warnings, [])
})
