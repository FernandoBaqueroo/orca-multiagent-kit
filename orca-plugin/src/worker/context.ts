// Lo que el núcleo del worker (src/worker.ts) comparte con cada pestaña: el host, el estado que
// ya sigue (agentes, terminales y workspaces) y los sucesos que oye una sola vez de Orca. Cada
// pestaña (src/worker/notices.ts, worktrees.ts, history.ts) se registra con `register(ctx)`.
import type { JsonValue, OrcaWorkerApi } from 'orca/worker'
import type { Notice, TrackedAgent, UnitInfo, WorkspaceIndex } from '../kit.ts'

/** Lo que los hooks enseñan de un terminal antes, o además, de sus cambios de estado. */
export type TerminalInfo = { agent?: string; unit?: UnitInfo; workspaceId?: string }

/** Los sucesos que el núcleo reparte; `at` es ms desde epoch. */
export type KitEvents = {
  /** Un agente cambió de estado. `agent` es `null` cuando terminó (`done`) y deja de seguirse. */
  agent: {
    key: string
    previous: TrackedAgent | undefined
    agent: TrackedAgent | null
    /** El último estado que contó Orca, también cuando `agent` es `null`. */
    state: TrackedAgent['state']
    /** Cómo acabó el turno del agente principal, si Orca lo dice. */
    outcome: string | null
    at: number
  }
  /** Un despacho de la skill `orca` llegó al terminal de un agente. */
  dispatch: { key: string; terminalId: string; unit: UnitInfo; agent: string | null; at: number }
  /** Orca va a arrancar un agente en un terminal: `command` es la orden tal cual. */
  launch: { terminalId: string; agent: string; workspaceId: string | null; command: string; at: number }
  /** Un agente terminó una llamada a una herramienta (hook `agent.tool.after`; hoy, Claude Code). */
  tool: { agent: string; workspaceId: string | null; terminalId: string | null; tool: string; input: JsonValue; at: number }
  /** Orca quitó un workspace: lo que se recuerde de él sobra. */
  workspaceRemoved: { workspaceId: string; at: number }
  /** Terminaron todas las unidades lanzadas de un run del kit (el aviso de `trackRun`). */
  runDone: { run: string; notice: Notice; at: number }
  /** La persona hizo algo desde el panel que conviene dejar en el historial. */
  action: {
    kind: 'orchestrate' | 'reply' | 'model' | 'autonomy' | 'plan'
    title: string
    detail: string | null
    /** Clave del agente afectado (`t:<terminal>`), si lo hay. */
    agentKey: string | null
    run: string | null
    at: number
  }
}

export type KitEventName = keyof KitEvents

export type KitContext = {
  host: OrcaWorkerApi['host']
  panels: OrcaWorkerApi['panels']
  storage: OrcaWorkerApi['storage']
  log(message: string): void
  /** Notificación de escritorio, si la persona no desactivó «Avisos de agentes». */
  notify(title: string, body: string): void
  /** Los agentes que sigue el núcleo, por clave (`t:<terminal>` o `p:<panel>`). Solo lectura. */
  agents: ReadonlyMap<string, TrackedAgent>
  /** Lo que se sabe de cada terminal por los hooks. Solo lectura. */
  terminals: ReadonlyMap<string, TerminalInfo>
  workspaces(): WorkspaceIndex
  /** El nombre de un workspace; si no se conoce, pide la lista una vez y devuelve `null`. */
  workspaceName(workspaceId: string | null): string | null
  /** Vuelve a pedir `workspace.list` (una sola petición a la vez). */
  refreshWorkspaces(): Promise<void>
  on<E extends KitEventName>(event: E, listener: (payload: KitEvents[E]) => void): void
  emit<E extends KitEventName>(event: E, payload: KitEvents[E]): void
}

type Listener = (payload: never) => void

/**
 * Reparto de sucesos en orden de registro. Un oyente que falla no corta a los demás: su error
 * queda en el log del plugin con el suceso que lo causó.
 */
export function createBus(log: (message: string) => void): Pick<KitContext, 'on' | 'emit'> {
  const listeners = new Map<KitEventName, Listener[]>()
  return {
    on(event, listener) {
      listeners.set(event, [...(listeners.get(event) ?? []), listener as Listener])
    },
    emit(event, payload) {
      for (const listener of listeners.get(event) ?? []) {
        try {
          ;(listener as (value: typeof payload) => void)(payload)
        } catch (error) {
          log(`oyente de «${event}» falló: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }
}
