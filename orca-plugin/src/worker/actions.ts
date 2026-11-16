// La acción del kit en curso: el terminal que abre «verificar», «actualizar» u «omk team», o el del
// agente de «inicializar» y «repartir», seguido hasta que acaba para enseñarlo en el panel (estado,
// últimas líneas y, si `omk` pregunta, la respuesta). Una cada vez: la última que se lanza.
// Lo que se sigue se guarda (`action.v1`): «actualizar» reinicia este worker al cambiar el plugin,
// y el worker nuevo retoma el mismo terminal.
import {
  INSTALL_HINT,
  OLD_OMK_HINT,
  TASK_MAX,
  cleanLabel,
  exitCodeOf,
  isMissingCommand,
  isYesNoPrompt,
  lacksExitMarker,
  missedTask,
  outputLines,
  setupScreenOf
} from '../kit.ts'
import type { ActionState, ActionView } from '../protocol.ts'
import type { KitContext } from './context.ts'

export const ACTION_KEY = 'action.v1'

/** Cada cuánto se lee el terminal y cuánto se sigue una acción; los tests lo acortan. */
export const actionTiming = {
  omkPollMs: 1000,
  agentPollMs: 2500,
  /** Un `omk update` con npm lento cabe de sobra. */
  omkMaxMs: 20 * 60_000,
  agentMaxMs: 45 * 60_000,
  /** Cuánto se espera a que Orca cuente el primer estado de un agente recién lanzado. */
  agentStartMs: 90_000,
  /**
   * Si la tarea no le llegó al agente: cuánto tiene que llevar en su caja de entrada vacía, y cuánto
   * desde el lanzamiento, antes de escribírsela (Orca la escribe al arrancar y no debe llegar dos veces).
   */
  taskIdleMs: 8_000,
  taskAfterMs: 15_000
}

const READ_LINES = 400
const AGENT_LINES = 24
const TITLE_MAX = 60

type Kind = ActionView['kind']

// Lo que se guarda para retomar la acción si el worker se reinicia.
// `task`: con lo que se lanzó el agente, para escribírsela si no le llegó.
type Stored = { id: string; kind: Kind; title: string; terminalId: string; startedAt: number; task?: string }

// `passed`: las pantallas de arranque ya contestadas; su texto puede seguir un rato en las últimas
// líneas del terminal y no deben volver a pedir respuesta. `retyped`: la tarea ya se escribió una vez.
type Current = Stored & { view: ActionView; notified: boolean; passed: Set<string>; retyped: boolean; idleSince: number | null }

export type ActionTracker = {
  /** Sigue un comando `omk` lanzado con la opción de la línea de cierre en ese terminal. */
  omk(terminalId: string, title: string): void
  /** Sigue al agente lanzado en ese terminal con `task`. */
  agent(terminalId: string, title: string, task: string): void
}

const invalidParams = (message: string) => Object.assign(new Error(message), { code: 'invalid_params' })
const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error))

function parseStored(value: unknown): Stored | null {
  if (typeof value !== 'object' || value === null) return null
  const { id, kind, title, terminalId, startedAt, task } = value as Record<string, unknown>
  if (typeof id !== 'string' || id === '' || id.length > 40) return null
  if (kind !== 'omk' && kind !== 'agent') return null
  if (typeof terminalId !== 'string' || terminalId === '' || terminalId.length > 200) return null
  if (typeof startedAt !== 'number' || !Number.isFinite(startedAt)) return null
  const clean = typeof title === 'string' ? cleanLabel(title, TITLE_MAX) : null
  if (task !== undefined && (typeof task !== 'string' || task.length > TASK_MAX)) return null
  return clean === null ? null : { id, kind, title: clean, terminalId, startedAt, ...(task === undefined ? {} : { task }) }
}

const minutes = (ms: number) => Math.round(ms / 60_000)

export function registerActions(ctx: KitContext, sleep: (ms: number) => Promise<void>): ActionTracker {
  let current: Current | null = null
  let counter = 0
  let posted = 'null'

  const publish = () => {
    const action = current?.view ?? null
    const serialized = JSON.stringify(action)
    if (serialized === posted) return
    posted = serialized
    ctx.panels.post('action.changed', { action })
  }

  const store = (stored: Stored | null) => {
    const write = stored === null ? ctx.storage.delete(ACTION_KEY) : ctx.storage.set(ACTION_KEY, stored)
    void write.catch((error: unknown) => ctx.log(`acción: no pude guardar «${ACTION_KEY}»: ${describeError(error)}`))
  }

  // Si `action` sigue siendo la que se sigue: otra más nueva o un «dejar de seguir» la sustituyen.
  const live = (action: Current) => current === action

  const show = (action: Current, patch: Partial<Pick<ActionView, 'state' | 'detail' | 'lines' | 'canAnswer' | 'setup'>>) => {
    if (!live(action)) return
    action.view = { ...action.view, ...patch }
    publish()
  }

  const finish = (action: Current, state: Exclude<ActionState, 'running' | 'asking'>, detail: string, lines?: string[]) => {
    if (!live(action)) return
    action.view = { ...action.view, state, detail, canAnswer: false, setup: null, endedAt: Date.now(), ...(lines ? { lines } : {}) }
    publish()
    store(null)
    if (action.kind !== 'omk' || state === 'lost') return
    ctx.emit('action', {
      kind: 'kit',
      tone: state === 'done' ? 'success' : 'danger',
      title: `${action.title} ${state === 'done' ? 'terminó bien' : 'falló'}`,
      detail,
      agentKey: null,
      run: null,
      at: Date.now()
    })
  }

  const readTerminal = async (terminalId: string, maxLines: number) =>
    (await ctx.host.call('terminal.read', { terminalId, maxLines })).lines

  const followOmk = async (action: Current) => {
    const deadline = action.startedAt + actionTiming.omkMaxMs
    while (live(action)) {
      await sleep(actionTiming.omkPollMs)
      if (!live(action)) return
      let raw: string[]
      try {
        raw = await readTerminal(action.terminalId, READ_LINES)
      } catch (error) {
        finish(action, 'lost', `No puedo leer su terminal (${describeError(error)}): puede que se haya cerrado.`)
        return
      }
      const lines = outputLines(raw)
      const code = exitCodeOf(raw)
      if (code !== null) {
        if (code === 0) finish(action, 'done', 'Terminó sin errores.', lines)
        else finish(action, 'failed', `Terminó con errores (código ${code}): míralos en la salida.`, lines)
        return
      }
      if (isMissingCommand(raw)) {
        finish(action, 'failed', `omk no está instalado o no está en el PATH. ${INSTALL_HINT}`, lines)
        ctx.notify('omk no está instalado', INSTALL_HINT)
        return
      }
      if (lacksExitMarker(raw)) {
        finish(action, 'failed', OLD_OMK_HINT, lines)
        return
      }
      if (Date.now() > deadline) {
        finish(action, 'lost', `Lleva más de ${minutes(actionTiming.omkMaxMs)} min: dejo de seguirlo. Sigue en su terminal.`, lines)
        return
      }
      if (isYesNoPrompt(lines)) {
        show(action, { state: 'asking', detail: 'omk pregunta antes de seguir: lee en la salida lo que pide y contesta aquí o en su terminal.', lines, canAnswer: true })
        if (!action.notified && live(action)) {
          action.notified = true
          ctx.notify(`${action.title} espera tu respuesta`, 'Contéstale en el panel Multiagent Kit.')
        }
      } else {
        show(action, { state: 'running', detail: null, lines, canAnswer: false })
      }
    }
  }

  // Escribe en el terminal del agente de esta acción (y solo en él). Devuelve si Orca lo aceptó.
  const press = async (action: Current, text: string, enter = false) => {
    try {
      const { accepted } = await ctx.host.call('terminal.sendText', { terminalId: action.terminalId, text, enter })
      if (!accepted) ctx.log(`acción: el terminal de ${action.title} no aceptó lo escrito`)
      return accepted
    } catch (error) {
      ctx.log(`acción: no pude escribir en el terminal de ${action.title}: ${describeError(error)}`)
      return false
    }
  }

  const followAgent = async (action: Current) => {
    const key = `t:${action.terminalId}`
    const deadline = action.startedAt + actionTiming.agentMaxMs
    let seen = false
    let unreadable = false
    while (live(action)) {
      await sleep(actionTiming.agentPollMs)
      if (!live(action)) return
      let lines = action.view.lines
      try {
        lines = outputLines(await readTerminal(action.terminalId, READ_LINES), AGENT_LINES)
      } catch (error) {
        // Sin su salida se sigue igual con su estado; el fallo se apunta una vez.
        if (!unreadable) ctx.log(`acción: no leo el terminal de ${action.title}: ${describeError(error)}`)
        unreadable = true
      }
      const agent = ctx.agents.get(key)
      if (agent) seen = true
      if (!agent && seen) {
        finish(action, 'done', 'El agente ha terminado.', lines)
        return
      }
      // Antes de que Orca lo cuente, el CLI puede estar parado en una pantalla de arranque (el tema
      // la primera vez, confiar en la carpeta, iniciar sesión): espera a la persona, no está perdido.
      const found = agent ? null : setupScreenOf(lines)
      const screen = found && !action.passed.has(found.kind) ? found : null
      // El tema de colores no decide nada: se sigue solo con el que está marcado.
      if (screen?.kind === 'theme') {
        action.passed.add('theme')
        if (await press(action, '\r')) show(action, { state: 'running', detail: 'Primer arranque del agente: elegido el tema marcado. Sigue arrancando…', lines, setup: null })
        continue
      }
      if (screen && Date.now() <= deadline) {
        const where = screen.button ? 'Contesta aquí o en su terminal.' : 'Hazlo en su terminal.'
        show(action, { state: 'asking', detail: `El agente espera en su terminal a ${screen.ask}. ${where}`, lines, setup: screen })
        if (!action.notified && live(action)) {
          action.notified = true
          ctx.notify(`${action.title} espera tu respuesta`, 'Su CLI está en una pantalla de arranque: míralo en el panel Multiagent Kit.')
        }
        continue
      }
      // Arrancado sin su tarea: se la escribe una vez, cuando lleva un rato quieto en su caja vacía.
      if (!agent && action.task && !action.retyped && missedTask(lines, action.task)) {
        const now = Date.now()
        action.idleSince ??= now
        if (now - action.idleSince >= actionTiming.taskIdleMs && now - action.startedAt >= actionTiming.taskAfterMs) {
          action.retyped = true
          if (await press(action, action.task, true)) show(action, { state: 'running', detail: 'La tarea no le llegó al arrancar: se la he escrito.', lines, setup: null })
        }
        continue
      }
      action.idleSince = null
      if (!agent && Date.now() > action.startedAt + actionTiming.agentStartMs) {
        finish(action, 'lost', 'Orca no cuenta nada de este agente: búscalo en la pestaña Agentes o en su terminal.', lines)
        return
      }
      if (Date.now() > deadline) {
        finish(action, 'lost', `Lleva más de ${minutes(actionTiming.agentMaxMs)} min: dejo de seguirlo. Está en la pestaña Agentes.`, lines)
        return
      }
      if (agent?.state === 'blocked') {
        show(action, { state: 'asking', detail: 'Pide permiso para seguir: respóndele en la pestaña Avisos.', lines, setup: null })
      } else if (agent?.state === 'waiting') {
        show(action, { state: 'asking', detail: 'Ha parado y espera instrucciones: su informe o su pregunta están en la pestaña Avisos.', lines, setup: null })
      } else {
        show(action, { state: 'running', detail: agent ? 'Trabajando.' : 'Arrancando…', lines, setup: null })
      }
    }
  }

  const follow = (action: Current) => {
    const run = action.kind === 'omk' ? followOmk(action) : followAgent(action)
    void run.catch((error: unknown) => {
      ctx.log(`acción: dejé de seguir ${action.title}: ${describeError(error)}`)
      finish(action, 'lost', `Dejé de seguirlo por un fallo del plugin (${describeError(error)}).`)
    })
  }

  const begin = (stored: Stored, detail: string | null) => {
    const action: Current = {
      ...stored,
      notified: false,
      passed: new Set(),
      retyped: false,
      idleSince: null,
      view: {
        id: stored.id,
        kind: stored.kind,
        title: stored.title,
        state: 'running',
        detail,
        startedAt: stored.startedAt,
        endedAt: null,
        lines: [],
        canAnswer: false,
        setup: null
      }
    }
    current = action
    publish()
    follow(action)
  }

  const start = (kind: Kind, terminalId: string, title: string, task?: string) => {
    const startedAt = Date.now()
    const stored: Stored = {
      id: `${startedAt}-${(counter += 1)}`,
      kind,
      title: cleanLabel(title, TITLE_MAX) ?? kind,
      terminalId,
      startedAt,
      ...(task === undefined ? {} : { task: task.slice(0, TASK_MAX) })
    }
    store(stored)
    begin(stored, kind === 'omk' ? null : 'Arrancando…')
  }

  // Lo que se seguía antes de un reinicio del worker, si aún está dentro de su plazo.
  const restored = (async () => {
    let value: unknown
    try {
      value = await ctx.storage.get(ACTION_KEY)
    } catch (error) {
      ctx.log(`acción: no pude leer «${ACTION_KEY}»: ${describeError(error)}`)
      return
    }
    if (value === null || current !== null) return
    const stored = parseStored(value)
    const maxMs = stored?.kind === 'agent' ? actionTiming.agentMaxMs : actionTiming.omkMaxMs
    if (stored === null || Date.now() - stored.startedAt > maxMs) {
      store(null)
      return
    }
    begin(stored, 'Retomado tras reiniciarse el plugin.')
  })()

  ctx.panels.handle('kit.action', async () => {
    await restored
    return { action: current?.view ?? null }
  })

  ctx.panels.handle('kit.answer', async (input) => {
    const id: unknown = input?.id
    const approve: unknown = input?.approve
    const action = current
    if (!action || action.view.id !== id || !action.view.canAnswer) throw invalidParams('esa acción ya no espera una respuesta')
    if (typeof approve !== 'boolean') throw invalidParams('la respuesta tiene que ser sí o no')
    // La pregunta pudo contestarse en el terminal desde la última lectura: si omk ya no pregunta,
    // la letra acabaría en el shell.
    const raw = await readTerminal(action.terminalId, READ_LINES)
    if (exitCodeOf(raw) !== null || !isYesNoPrompt(outputLines(raw))) {
      throw Object.assign(new Error('omk ya no está preguntando: mira su salida'), { code: 'conflict' })
    }
    // Solo una letra fija, y solo al terminal que abrió el propio worker para esta acción.
    const { accepted } = await ctx.host.call('terminal.sendText', { terminalId: action.terminalId, text: approve ? 's' : 'n', enter: true })
    if (!accepted) {
      throw Object.assign(new Error('el terminal no aceptó la respuesta: puede que ya se haya cerrado'), { code: 'unavailable' })
    }
    show(action, { state: 'running', detail: approve ? 'Aprobado: sigue.' : 'Rechazado.', canAnswer: false })
    return { message: approve ? 'Aprobado.' : 'Rechazado.' }
  })

  ctx.panels.handle('kit.continue', async (input) => {
    const id: unknown = input?.id
    const action = current
    const setup = action?.view.setup
    if (!action || action.view.id !== id || !setup || setup.button === null) {
      throw invalidParams('esa acción no está en una pantalla de arranque que se pueda seguir desde aquí')
    }
    // Pudo contestarse en el terminal desde la última lectura: el Intro solo va si la misma pantalla
    // sigue ahí, para no mandárselo al agente ya arrancado.
    const now = setupScreenOf(outputLines(await readTerminal(action.terminalId, READ_LINES), AGENT_LINES))
    if (now?.kind !== setup.kind || action.passed.has(setup.kind)) {
      throw Object.assign(new Error('el agente ya no está en esa pantalla: mira su salida'), { code: 'conflict' })
    }
    // Solo Intro, y solo al terminal del agente que lanzó esta acción.
    const { accepted } = await ctx.host.call('terminal.sendText', { terminalId: action.terminalId, text: '\r', enter: false })
    if (!accepted) {
      throw Object.assign(new Error('el terminal no aceptó el Intro: puede que ya se haya cerrado'), { code: 'unavailable' })
    }
    action.passed.add(setup.kind)
    show(action, { state: 'running', detail: 'Hecho: el agente sigue arrancando.', setup: null })
    return { message: `${setup.button}: hecho.` }
  })

  ctx.panels.handle('kit.dismiss', (input) => {
    const id: unknown = input?.id
    if (!current || current.view.id !== id) throw invalidParams('esa acción ya no está en el panel')
    const { title } = current
    current = null
    publish()
    store(null)
    return { message: `${title}: ya no se sigue.` }
  })

  return {
    omk: (terminalId, title) => start('omk', terminalId, title),
    agent: (terminalId, title, task) => start('agent', terminalId, title, task)
  }
}
