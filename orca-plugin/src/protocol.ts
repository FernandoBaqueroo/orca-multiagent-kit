// Contrato entre el panel (src/panel.tsx y src/tabs/) y el worker (src/worker.ts y src/worker/),
// declarado una sola vez.
import type { AgentGroup, AgentSummary, Autonomy, KitAction, TaskSource, Team } from './kit.ts'

/** Lo que el panel muestra de los agentes: el resumen de la barra y los activos, agrupados. */
export type AgentsView = AgentSummary & { groups: AgentGroup[] }

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

/**
 * Una fila del plan de rondas de la skill `orca` (SKILL.md §3), tal como la escribe en
 * `.work/runs/<run>/plan.json` (skills/orca/references/plan-card.md).
 */
export type PlanUnit = {
  round: number
  /** «U2», «U2r». */
  id: string
  title: string
  /** Rol de Olimpo: «Ariadna». */
  role: string | null
  /** Nivel de modelo: alto, medio o bajo. */
  level: string | null
  /** Quién la hace: un id de agente o «coordinador». */
  agent: string
  model: string | null
  /** inline, subagente, worker o manual. */
  resource: string
  files: string | null
  depends: string | null
}

/** El plan de rondas que espera la confirmación 1, para pintarlo como tarjeta. */
export type PlanCard = {
  run: string
  /** De dónde sale el trabajo: «spec-kit 003-recargas», «chat». */
  source: string | null
  autonomy: string | null
  /** «origin/main @ 1a2b3c4 (main local iba 3 commits por detrás)». */
  base: string | null
  integration: string | null
  /** «feat/003-recargas → main». */
  merge: string | null
  units: PlanUnit[]
  /** Líneas sueltas del plan: `modelos:`, `ficha:`, avisos. */
  notes: string[]
}

/**
 * Algo que espera a la persona: un plan de rondas por confirmar, un agente bloqueado (pide permiso
 * o una respuesta) o uno que espera instrucciones.
 */
export type NoticeKind = 'plan' | 'blocked' | 'waiting'

export type NoticeItem = {
  /** Clave del aviso en el worker: el panel la devuelve para responder o descartarlo. */
  id: string
  kind: NoticeKind
  title: string
  /** Id del agente (claude, codex…), si se sabe. */
  agent: string | null
  workspace: string | null
  /** «U2 · Ariadna — Pagos», si es una unidad del kit. */
  unit: string | null
  since: number
  /** Las últimas líneas del terminal, limpias y acotadas: qué pregunta el agente. */
  context: string[]
  /** Si se le puede escribir: tiene terminal y Orca lo sigue. Un chat de Orca no. */
  canReply: boolean
  plan: PlanCard | null
}

export type WorktreeAgent = {
  /** Clave del agente en el worker (la de `AgentLine.id`). */
  id: string
  agent: string | null
  title: string
  state: string
  blocked: boolean
  /** El modelo con el que se lanzó o al que se cambió, si se sabe. */
  model: string | null
  /** Si el panel puede cambiarle el modelo (hoy, Claude Code con terminal). */
  canSetModel: boolean
}

export type WorktreeItem = {
  workspaceId: string
  name: string
  branch: string | null
  /** La unidad del kit que trabaja en él, si se sabe. */
  unit: string | null
  agents: WorktreeAgent[]
}

/** Los worktrees de un mismo run del kit o, sin run, los demás que ha creado la orquestación. */
export type WorktreeGroup = { run: string | null; title: string; worktrees: WorktreeItem[] }

export type HistoryKind =
  | 'dispatch'
  | 'state'
  | 'outcome'
  | 'run'
  | 'plan'
  | 'orchestrate'
  | 'reply'
  | 'model'
  | 'autonomy'

export type HistoryEntry = {
  id: string
  at: number
  kind: HistoryKind
  tone: Tone
  title: string
  detail: string | null
  run: string | null
  unit: string | null
  agent: string | null
  workspace: string | null
}

type Message = { message: string }

declare module 'orca' {
  interface PluginRequests {
    /** Ejecuta una acción del kit en el workspace activo y responde qué ha hecho. */
    'kit.run': { input: { action: KitAction }; output: Message }
    /** Los agentes activos, como los cuenta la barra de estado. */
    'agents.summary': { output: AgentsView }
    /** Muestra el workspace de un agente (`id` de una `AgentLine`). */
    'agents.open': { input: { id: string }; output: Message }
    /** Escribe el equipo en `ORCHESTRATION.md` del workspace activo con `omk team set`. */
    'team.apply': { input: { team: Team }; output: Message }
    /** Enseña en un terminal el equipo que tiene el proyecto (`omk team`). */
    'team.show': { output: Message }
    /** Escribe el nivel de autonomía en `ORCHESTRATION.md` §0 con `omk team set --autonomy`. */
    'team.autonomy': { input: { autonomy: Autonomy }; output: Message }
    /**
     * Lanza el coordinador con la skill `orca`, la entrada elegida y la tarea en el workspace
     * activo. `autonomy` cambia el nivel solo para ese run; sin él, manda `ORCHESTRATION.md`.
     */
    'team.orchestrate': {
      input: { agent: string; task: string; source: TaskSource; autonomy?: Autonomy | null }
      output: Message
    }
    /** Lo que espera a la persona, lo más urgente primero. */
    'notices.list': { output: { items: NoticeItem[] } }
    /**
     * Escribe `text` en el terminal del agente del aviso `id` y pulsa Intro, como si lo tecleara
     * la persona. Una sola línea; el worker la limpia y la acota.
     */
    'notices.reply': { input: { id: string; text: string }; output: Message }
    /** Quita un aviso de la lista sin responderlo. */
    'notices.dismiss': { input: { id: string }; output: Message }
    /** Los worktrees de la orquestación con sus agentes, agrupados por run. */
    'worktrees.list': { output: { groups: WorktreeGroup[] } }
    /** Muestra un worktree en Orca. */
    'worktrees.open': { input: { workspaceId: string }; output: Message }
    /** Cambia el modelo del agente `id` (de `WorktreeAgent.id`). */
    'worktrees.model': { input: { id: string; model: string }; output: Message }
    /** El historial de tareas y runs, lo más reciente primero. */
    'history.list': { output: { items: HistoryEntry[] } }
    /** Vacía el historial. */
    'history.clear': { output: Message }
  }
  interface PluginPanelEvents {
    /** Se envía a los paneles abiertos cuando cambia lo que cuentan los agentes. */
    'agents.changed': AgentsView
    'notices.changed': { items: NoticeItem[] }
    'worktrees.changed': { groups: WorktreeGroup[] }
    'history.changed': { items: HistoryEntry[] }
  }
}
