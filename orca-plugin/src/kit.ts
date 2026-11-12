// Lógica pura del plugin: sin llamadas a Orca, para poder probarla sin host.

export const CONTRACT_PATH = '~/.agents/skills/orca/references/worker-contract.md'

/** Qué despachos de orquestación reciben la referencia al contrato del worker. */
export type ContractHintMode = 'kit' | 'all' | 'off'

export const CONTRACT_HINT_MODES: readonly ContractHintMode[] = ['kit', 'all', 'off']

export const CONTRACT_HINT =
  `[Orca Multiagent Kit] Contrato del worker: lee y aplica ${CONTRACT_PATH} ` +
  '(arranque, implementación, verificación y el formato fijo del informe, que va en el body de ' +
  'worker_done). Si ese fichero no existe en este host, sigue solo las instrucciones de arriba.'

// Cabecera del mensaje de despacho que escribe la skill `orca` (skills/orca/SKILL.md §5).
const KIT_UNIT_LINE = /^\s*UNIT:\s*U\d+\b/m
const KIT_RUN_FIELD = /\bRUN:\s*\S+/

export function parseContractHintMode(value: unknown): ContractHintMode {
  return CONTRACT_HINT_MODES.find((mode) => mode === value) ?? 'kit'
}

export function isKitDispatch(prompt: string): boolean {
  return KIT_UNIT_LINE.test(prompt) && KIT_RUN_FIELD.test(prompt)
}

/**
 * Devuelve el prompt con la referencia al contrato añadida, o `null` si no hay que tocarlo:
 * solo despachos de orquestación, nunca dos veces y nunca si el coordinador ya lo citó.
 */
export function withContractHint(
  prompt: string,
  inputKind: string,
  mode: ContractHintMode
): string | null {
  if (mode === 'off' || inputKind !== 'orchestration') return null
  if (mode === 'kit' && !isKitDispatch(prompt)) return null
  if (prompt.includes('worker-contract.md')) return null
  return `${prompt.trimEnd()}\n\n${CONTRACT_HINT}`
}

export const ORCHESTRATE_HINT =
  '[Orca Multiagent Kit] Antes de empezar, aplica la skill orca (~/.agents/skills/orca/SKILL.md) a esta ' +
  'tarea: decide si compensa repartirla entre agentes y, si compensa, repártela. La entrada es este prompt ' +
  '(adaptador de chat): no hace falta spec-kit. Si no compensa, hazla tú directamente.'

// Prompts que ya pasan por la skill orca (Repartir del panel, un despacho, el propio aviso) o que
// son de kit-init: no se les añade nada. «orca-cli» u «orchestration» no cuentan como la skill orca.
const ALREADY_ROUTED = /skill\s+`?orca`?(?![\w-])|kit-init|^inicializa el proyecto$|\[Orca Multiagent Kit\] Antes de empezar/im

/**
 * Devuelve el prompt de arranque con la indicación de pasar por la skill orca, o `null` si no
 * hay que tocarlo: solo prompts con los que Orca arranca un agente (crear un worktree con tarea,
 * una pestaña nueva, una issue), nunca lo que escribe una persona ni los despachos.
 */
export function withOrchestrateHint(prompt: string, inputKind: string, enabled: boolean): string | null {
  if (!enabled || inputKind !== 'launch' || prompt.trim() === '') return null
  if (isKitDispatch(prompt) || ALREADY_ROUTED.test(prompt.trim())) return null
  return `${prompt.trimEnd()}\n\n${ORCHESTRATE_HINT}`
}

// Mensajes de "comando no encontrado" de bash, zsh, fish, cmd y PowerShell (inglés y español).
const MISSING_COMMAND =
  /command not found|not recognized|unknown command|no se reconoce|orden no encontrada|no se encontr[oó] la orden/i

/** Si la salida del terminal dice que `omk` no existe en el PATH. */
export function isMissingCommand(lines: readonly string[], command = 'omk'): boolean {
  const name = new RegExp(`(^|[^\\w-])${command}([^\\w-]|$)`)
  return lines.some((line) => name.test(line) && MISSING_COMMAND.test(line))
}

export type PollOptions = {
  attempts: number
  delayMs: number
  sleep: (ms: number) => Promise<void>
}

/** Lee la salida hasta `attempts` veces, esperando `delayMs` antes de cada lectura. */
export async function pollUntil(
  read: () => Promise<readonly string[]>,
  matches: (lines: readonly string[]) => boolean,
  options: PollOptions
): Promise<boolean> {
  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    await options.sleep(options.delayMs)
    if (matches(await read())) return true
  }
  return false
}

export const INSTALL_HINT =
  'Instálalo con `npm install -g orca-multiagent-kit` o con el ejecutable de la última release (lo deja en el PATH), ' +
  'reinicia Orca y vuelve a lanzar el comando.'

export type FocusedWorkspace = { branch: string; displayName: string }
export type WorkspaceEntry = { id: string; name: string; branch: string | null }

/**
 * Id del workspace enfocado. `workspace.readContext` no da el id, así que se cruza con
 * `workspace.list` por nombre y rama; si no hay exactamente una coincidencia, `null`:
 * mejor no actuar que lanzar algo en otro workspace.
 */
export function resolveFocusedWorkspaceId(
  focused: FocusedWorkspace | null,
  workspaces: readonly WorkspaceEntry[]
): string | null {
  if (!focused) return null
  // Orca da la rama unas veces como `main` y otras como `refs/heads/main`.
  const branch = (name: string | null) => (name ?? '').replace(/^refs\/heads\//, '')
  const matches = workspaces.filter(
    (w) => w.name === focused.displayName && branch(w.branch) === branch(focused.branch)
  )
  return matches.length === 1 ? (matches[0]?.id ?? null) : null
}

/** Acciones del kit que lanzan la paleta y el panel. */
export type KitAction = 'verify' | 'update' | 'init'

export const KIT_ACTIONS: readonly KitAction[] = ['verify', 'update', 'init']

export function isKitAction(value: unknown): value is KitAction {
  return KIT_ACTIONS.some((action) => action === value)
}

const AGENT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

export function isValidAgentId(value: unknown): value is string {
  return typeof value === 'string' && AGENT_ID.test(value)
}

/**
 * Agentes del catálogo de Orca que ofrecen los desplegables del panel: ids que acepta
 * `agent.launch` (los de `orca agent launch --agent`). Orca tiene más; estos son los habituales.
 */
export const KNOWN_AGENTS: readonly { id: string; label: string }[] = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'gemini', label: 'Gemini CLI' },
  { id: 'antigravity', label: 'Antigravity' },
  { id: 'copilot', label: 'GitHub Copilot' },
  { id: 'cursor', label: 'Cursor' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'amp', label: 'Amp' },
  { id: 'droid', label: 'Droid' },
  { id: 'grok', label: 'Grok' },
  { id: 'kimi', label: 'Kimi' },
  { id: 'qwen-code', label: 'Qwen Code' },
  { id: 'aider', label: 'Aider' },
  { id: 'goose', label: 'Goose' },
  { id: 'cline', label: 'Cline' },
  { id: 'kiro', label: 'Kiro' },
  { id: 'devin', label: 'Devin' }
]

export function agentLabel(id: string): string {
  return KNOWN_AGENTS.find((agent) => agent.id === id)?.label ?? id
}

/** Opciones de un desplegable de agentes: el catálogo y, si no están en él, los valores actuales. */
export function agentOptions(current: readonly string[] = []): { value: string; label: string }[] {
  const options = KNOWN_AGENTS.map(({ id, label }) => ({ value: id, label }))
  for (const id of current) {
    if (isValidAgentId(id) && !options.some((option) => option.value === id)) options.push({ value: id, label: id })
  }
  return options
}

export type AgentState = 'working' | 'blocked' | 'waiting' | 'done'

/** Lo que el despacho de la skill `orca` dice de su unidad: cabecera UNIT/RUN y línea ROL. */
export type UnitInfo = { unit: string; title: string | null; run: string; role: string | null }

/** Un agente tal como lo sigue el worker: lo que cuenta Orca más lo aprendido de sus hooks. */
export type TrackedAgent = {
  workspaceId: string | null
  /** El título que da Orca, si da alguno. */
  title: string | null
  state: AgentState
  /** Id del agente (claude, codex…), de `agents.list` o de los hooks. */
  agent?: string | null
  unit?: UnitInfo | null
  /** Desde cuándo está en este estado, en ms desde epoch. */
  since?: number | null
  /** Su terminal; `null` en un chat de Orca. */
  terminalId?: string | null
  /** Cómo acabó el último turno del agente principal, si Orca lo dice. */
  outcome?: string | null
  /** Cuándo llegó el último evento suyo. */
  updatedAt?: number | null
}

const LABEL_MAX = 80
const UNIT_HEADER = /^[ \t]*UNIT:[ \t]*(U\d+)\b([^\n]*)/m
const RUN_VALUE = /\bRUN:[ \t]*(\S+)/
// «ROL: Ariadna · código sensible · nivel alto — …»: el nombre del rol abre la línea.
const ROLE_LINE = /^[ \t]*ROL:[ \t]*(\p{L}[\p{L}\p{M}-]*)/mu

/**
 * Texto apto para una etiqueta: una línea, sin caracteres de control ni de formato (el título
 * de un terminal y los despachos los escribe un agente) y acotado. `null` si no queda nada.
 */
export function cleanLabel(text: string, max = LABEL_MAX): string | null {
  const clean = text.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/g, ' ').trim()
  if (clean === '') return null
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

/** La unidad de un despacho de la skill `orca` (skills/orca/SKILL.md §5), o `null` si no lo es. */
export function parseDispatch(prompt: string): UnitInfo | null {
  const header = UNIT_HEADER.exec(prompt)
  if (!header) return null
  const [, unit = '', rest = ''] = header
  const runInHeader = RUN_VALUE.exec(rest)
  const run = cleanLabel((runInHeader ?? RUN_VALUE.exec(prompt))?.[1] ?? '', 60)
  if (run === null) return null
  const title = runInHeader ? rest.slice(0, runInHeader.index) : rest
  const role = ROLE_LINE.exec(prompt)?.[1]
  return {
    unit,
    title: cleanLabel(title.replace(/^\s*[—–-]\s*/, '')),
    run,
    role: role === undefined ? null : cleanLabel(role, 30)
  }
}

/** Una ruta comparable entre las formas que usa Orca (`C:\x`, `C:/x/`). */
export function normalizePath(path: string): string {
  const slashes = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-z]:\//i.test(slashes) ? slashes.toLowerCase() : slashes
}

export type WorkspaceInfo = { name: string; path: string; branch: string | null; kind: string | null }

/** Los workspaces de `workspace.list`: sus datos por id y el id por ruta. */
export type WorkspaceIndex = { byId: Map<string, WorkspaceInfo>; byPath: Map<string, string> }

export function indexWorkspaces(
  workspaces: readonly { id: string; name: string; path: string; branch?: string | null; kind?: string | null }[]
): WorkspaceIndex {
  const index: WorkspaceIndex = { byId: new Map(), byPath: new Map() }
  for (const { id, name, path, branch = null, kind = null } of workspaces) {
    index.byId.set(id, {
      name: cleanLabel(name, 60) ?? id,
      path,
      branch: branch ? branch.replace(/^refs\/heads\//, '') : null,
      kind
    })
    index.byPath.set(normalizePath(path), id)
  }
  return index
}

/**
 * El id con el que `workspace.list` conoce un workspace. Los eventos de agentes lo dan a veces
 * como `<repo>::<ruta>` y la lista como `identity:…`: entonces se cruzan por la ruta. Sin
 * coincidencia, el id tal cual.
 */
export function canonicalWorkspaceId(id: string, index: WorkspaceIndex): string {
  if (index.byId.has(id)) return id
  const separator = id.indexOf('::')
  if (separator === -1) return id
  return index.byPath.get(normalizePath(id.slice(separator + 2))) ?? id
}

// Los chats de agente de Orca no tienen terminal; su panel se llama
// «structured-agent-session-<agente>_<sesión>:…». Si Orca cambia el formato, no se reconoce y ya.
const STRUCTURED_SESSION = /^structured-agent-session-([a-z0-9][a-z0-9-]*?)_/

/** El agente de un chat de Orca, sacado de su panel, o `null`. */
export function agentFromPaneKey(paneKey: string): string | null {
  return STRUCTURED_SESSION.exec(paneKey)?.[1] ?? null
}

/** El nombre de un agente: su unidad del kit, el título de Orca o, como mínimo, qué agente es. */
export function agentName(agent: TrackedAgent): string {
  const { unit } = agent
  if (unit) {
    const head = unit.role ? `${unit.unit} · ${unit.role}` : unit.unit
    return unit.title ? `${head} — ${unit.title}` : head
  }
  return agent.title ?? agent.agent ?? 'agente sin título'
}

export type AgentSummary = {
  text: string
  tone: 'neutral' | 'accent' | 'warning'
  tooltip: string
}

export type AgentLine = {
  /** Clave del agente en el worker: el panel la devuelve para abrir su workspace. */
  id: string
  title: string
  /** Id del agente (claude, codex…), para su icono; `null` si no se sabe. */
  agent?: string | null
  state: string
  blocked: boolean
  /** Qué agente es y en qué workspace, lo que se sepa: «codex · palolo». */
  detail: string
  since: number | null
  canOpen: boolean
  /** Todo lo que se sabe del agente, para su ficha en el panel. */
  facts: { label: string; value: string }[]
}

/** Agentes de un mismo run del kit o, fuera del kit, de un mismo workspace. */
export type AgentGroup = { title: string; agents: AgentLine[] }

type ActiveState = Exclude<AgentState, 'done'>

const STATE_LABEL: Record<ActiveState, [string, string]> = {
  working: ['trabajando', 'trabajando'],
  blocked: ['bloqueado', 'bloqueados'],
  waiting: ['esperando', 'esperando']
}

// Primero lo que necesita a la persona.
const STATE_RANK: Record<ActiveState, number> = { blocked: 0, waiting: 1, working: 2 }

const TOOLTIP_AGENTS = 6

const OUTCOME_LABEL: Record<string, string> = {
  success: 'terminó bien',
  failure: 'falló',
  cancellation: 'cancelado',
  superseded: 'sustituido',
  interruption: 'interrumpido',
  unconfirmed: 'sin confirmar'
}

/** La ficha de un agente: solo lo que se sabe, en el orden en que se lee. */
function agentFacts(agent: TrackedAgent, title: string, workspace: WorkspaceInfo | null): AgentLine['facts'] {
  const { unit } = agent
  const level = unit?.role ? TEAM_ROLES.find(({ name }) => name === unit.role)?.level : undefined
  const facts: [string, string | null | undefined][] = [
    ['Agente', agent.agent ? agentLabel(agent.agent) : null],
    ['Unidad', unit ? (unit.title ? `${unit.unit} — ${unit.title}` : unit.unit) : null],
    ['Rol', unit?.role ? (level ? `${unit.role} · nivel ${level}` : unit.role) : null],
    ['Run', unit?.run],
    ['Título en Orca', agent.title && agent.title !== title ? agent.title : null],
    ['Workspace', workspace?.name],
    ['Rama', workspace?.branch],
    ['Carpeta', workspace?.path],
    ['Dónde corre', agent.terminalId ? `terminal ${agent.terminalId}` : agent.terminalId === null ? 'chat de Orca' : null],
    ['Último turno', agent.outcome ? (OUTCOME_LABEL[agent.outcome] ?? agent.outcome) : null]
  ]
  return facts.flatMap(([label, value]) => (value ? [{ label, value }] : []))
}

/** Los agentes activos por run o workspace; los grupos y sus agentes, primero los bloqueados. */
export function groupAgents(
  agents: Iterable<readonly [string, TrackedAgent]>,
  workspaces: ReadonlyMap<string, WorkspaceInfo>
): AgentGroup[] {
  const rows: { group: string; rank: number; line: AgentLine }[] = []
  for (const [id, agent] of agents) {
    if (agent.state === 'done') continue
    const info = agent.workspaceId ? (workspaces.get(agent.workspaceId) ?? null) : null
    const workspace = info?.name ?? null
    const title = agentName(agent)
    const detail = [agent.agent === title ? null : agent.agent, workspace]
      .filter((part): part is string => Boolean(part))
      .join(' · ')
    rows.push({
      group: agent.unit
        ? `RUN ${agent.unit.run}`
        : (workspace ?? (agent.workspaceId ? 'Workspace sin nombre' : 'Sin workspace')),
      rank: STATE_RANK[agent.state],
      line: {
        id,
        title,
        agent: agent.agent ?? null,
        state: STATE_LABEL[agent.state][0],
        blocked: agent.state === 'blocked',
        detail,
        since: agent.since ?? null,
        canOpen: agent.workspaceId !== null,
        facts: agentFacts(agent, title, info)
      }
    })
  }
  rows.sort((a, b) => a.rank - b.rank || a.line.title.localeCompare(b.line.title, 'es'))
  const groups = new Map<string, AgentLine[]>()
  for (const { group, line } of rows) {
    const lines = groups.get(group)
    if (lines) lines.push(line)
    else groups.set(group, [line])
  }
  return [...groups].map(([title, lines]) => ({ title, agents: lines }))
}

export function summarizeAgents(
  agents: Iterable<TrackedAgent>,
  groups: readonly AgentGroup[] = []
): AgentSummary {
  const counts = { working: 0, blocked: 0, waiting: 0 }
  for (const agent of agents) {
    if (agent.state !== 'done') counts[agent.state] += 1
  }
  const parts = (Object.keys(counts) as (keyof typeof counts)[])
    .filter((state) => counts[state] > 0)
    .map((state) => `${counts[state]} ${STATE_LABEL[state][counts[state] === 1 ? 0 : 1]}`)
  const tone = counts.blocked > 0 ? 'warning' : counts.working > 0 ? 'accent' : 'neutral'
  if (parts.length === 0) {
    return { text: 'MAW', tone, tooltip: 'Orca Multiagent Kit: ningún agente activo' }
  }
  const named = groups.flatMap((group) => group.agents).map(({ title, state }) => `${title}: ${state}`)
  const more = named.length > TOOLTIP_AGENTS ? [`… y ${named.length - TOOLTIP_AGENTS} más`] : []
  return {
    text: `MAW · ${parts.join(' · ')}`,
    tone,
    tooltip: [
      `Orca Multiagent Kit: ${parts.join(', ')} en todos los workspaces`,
      ...named.slice(0, TOOLTIP_AGENTS),
      ...more
    ].join('\n')
  }
}

/** Una línea por agente activo, para el comando «estado de los agentes». */
export function describeAgents(groups: readonly AgentGroup[]): string {
  const lines = groups.flatMap(({ agents }) =>
    agents.map(({ title, state, detail }) => `- ${title}: ${state}${detail ? ` (${detail})` : ''}`)
  )
  return lines.length > 0 ? lines.join('\n') : 'Ningún agente activo.'
}

export type Notice = { title: string; body: string }

/** El aviso de un agente que acaba de bloquearse, o `null` si ya lo estaba o no lo está. */
export function blockedNotice(
  previous: AgentState | undefined,
  agent: TrackedAgent,
  workspace: string | null
): Notice | null {
  if (agent.state !== 'blocked' || previous === 'blocked') return null
  return {
    title: `${agentName(agent)}: bloqueado`,
    body: workspace ? `En ${workspace}. Necesita tu respuesta en Orca.` : 'Necesita tu respuesta en Orca.'
  }
}

/** Por run del kit: las unidades que siguen activas y las que ya terminaron en esta tanda. */
export type RunProgress = Map<string, { active: Set<string>; finished: number }>

/**
 * Anota el estado de una unidad. Si con ella terminan todas las lanzadas del run, devuelve el
 * aviso y la tanda vuelve a cero: la ronda siguiente avisa otra vez.
 */
export function trackRun(runs: RunProgress, run: string, id: string, state: AgentState): Notice | null {
  const progress = runs.get(run)
  if (state !== 'done') {
    if (progress) progress.active.add(id)
    else runs.set(run, { active: new Set([id]), finished: 0 })
    return null
  }
  if (!progress?.active.delete(id)) return null
  progress.finished += 1
  if (progress.active.size > 0) return null
  runs.delete(run)
  const { finished } = progress
  return {
    title: `RUN ${run}: unidades terminadas`,
    body:
      `${finished === 1 ? 'La unidad lanzada ha' : `Las ${finished} unidades lanzadas han`} terminado. ` +
      'Vuelve al coordinador para revisar e integrar.'
  }
}

/** Olvida una unidad sin avisar: su workspace ya no existe. */
export function forgetRunUnit(runs: RunProgress, id: string): void {
  for (const [run, progress] of runs) {
    progress.active.delete(id)
    if (progress.active.size === 0) runs.delete(run)
  }
}

/** Roles de Olimpo que se fijan a un proveedor (skills/orca/references/olimpo.md); Hefesto es el coordinador. */
export const TEAM_ROLES = [
  { id: 'dedalo', name: 'Dédalo', work: 'arquitectura', level: 'alto' },
  { id: 'casandra', name: 'Casandra', work: 'seguridad', level: 'alto' },
  { id: 'temis', name: 'Temis', work: 'normativa', level: 'alto' },
  { id: 'ariadna', name: 'Ariadna', work: 'código sensible', level: 'alto' },
  { id: 'persefone', name: 'Perséfone', work: 'datos', level: 'medio' },
  { id: 'proteo', name: 'Proteo', work: 'implementación', level: 'medio' },
  { id: 'narciso', name: 'Narciso', work: 'interfaz', level: 'medio' },
  { id: 'icaro', name: 'Ícaro', work: 'integraciones', level: 'medio' },
  { id: 'argos', name: 'Argos', work: 'verificación', level: 'medio' },
  { id: 'atlas', name: 'Atlas', work: 'plataforma', level: 'medio' },
  { id: 'clio', name: 'Clío', work: 'mecánico', level: 'bajo' }
] as const

export type RoleId = (typeof TEAM_ROLES)[number]['id']

/** Qué unidades revisa otro proveedor: `ORCHESTRATION.md` §1 «Revisión cruzada». */
export type CrossReview = 'sensibles' | 'todas' | 'nunca'

export const CROSS_REVIEW: readonly CrossReview[] = ['sensibles', 'todas', 'nunca']

export type RoleLevel = 'alto' | 'medio' | 'bajo'

export const ROLE_LEVELS: readonly RoleLevel[] = ['alto', 'medio', 'bajo']

/** Quién revisa lo que hace un rol propio (columna «Revisión» de `olimpo.md`). */
export type CustomReview = 'propia' | 'cross' | 'argos' | 'casandra'

export const CUSTOM_REVIEWS: readonly { id: CustomReview; label: string }[] = [
  { id: 'propia', label: 'Propia' },
  { id: 'cross', label: 'Cruzada (otro proveedor)' },
  { id: 'argos', label: 'Argos (verificación)' },
  { id: 'casandra', label: 'Casandra (seguridad)' }
]

/** Un rol propio del proyecto: va a la tabla «Roles propios del proyecto» de `ORCHESTRATION.md` §1. */
export type CustomRole = {
  name: string
  work: string
  level: RoleLevel
  review: CustomReview
  guard: string
  /** Proveedor fijado, o `null` para que lo elija el coordinador. */
  provider: string | null
}

export const CUSTOM_ROLES_MAX = 10
export const ROLE_WORK_MAX = 80
export const ROLE_GUARD_MAX = 120
const ROLE_NAME = /^\p{L}[\p{L}\p{M}\p{N} -]{0,29}$/u
const RESERVED_ROLE_NAMES = ['Hefesto', ...TEAM_ROLES.map(({ name }) => name)].map((name) => name.toLocaleLowerCase('es'))

/** Si `name` vale como nombre de un rol nuevo: letras, números, espacios y guiones, y que no exista ya. */
export function isValidRoleName(name: string, others: readonly string[] = []): boolean {
  const key = name.trim().toLocaleLowerCase('es')
  return (
    ROLE_NAME.test(name.trim()) &&
    !RESERVED_ROLE_NAMES.includes(key) &&
    !others.some((other) => other.trim().toLocaleLowerCase('es') === key)
  )
}

/** Texto libre para una celda de tabla Markdown: una línea, sin `|`, `<` ni `>`, acotado. */
export function cellText(text: string, max: number): string | null {
  return cleanLabel(text.replace(/[|<>]/g, ' '), max)
}

function parseCustomRole(value: unknown, providers: readonly string[], others: readonly string[]): CustomRole | null {
  if (typeof value !== 'object' || value === null) return null
  const { name, work, level, review, guard, provider } = value as Record<string, unknown>
  if (typeof name !== 'string' || !isValidRoleName(name, others)) return null
  const cleanWork = typeof work === 'string' ? cellText(work, ROLE_WORK_MAX) : null
  const cleanGuard = typeof guard === 'string' ? (cellText(guard, ROLE_GUARD_MAX) ?? '') : null
  const roleLevel = ROLE_LEVELS.find((candidate) => candidate === level)
  const roleReview = CUSTOM_REVIEWS.find((candidate) => candidate.id === review)?.id
  if (!cleanWork || cleanGuard === null || !roleLevel || !roleReview) return null
  if (provider !== null && (!isValidAgentId(provider) || !providers.includes(provider))) return null
  return { name: name.trim(), work: cleanWork, level: roleLevel, review: roleReview, guard: cleanGuard, provider }
}

export type Team = {
  /** Quién coordina (Hefesto) al orquestar desde el panel. No va a ORCHESTRATION.md. */
  coordinator: string
  providers: string[]
  cross: CrossReview
  /** Proveedor fijado por rol; un rol ausente lo elige el coordinador. */
  roles: Partial<Record<RoleId, string>>
  custom: CustomRole[]
}

export type TeamPreset = 'claude' | 'claude-codex' | 'codex-claude'

const everyRole = (provider: string, overrides: Partial<Record<RoleId, string>>) =>
  Object.fromEntries(TEAM_ROLES.map(({ id }) => [id, overrides[id] ?? provider])) as Record<RoleId, string>

export const TEAM_PRESETS: Readonly<Record<TeamPreset, { label: string; team: Team }>> = {
  claude: {
    label: 'Solo Claude',
    team: { coordinator: 'claude', providers: ['claude'], cross: 'sensibles', roles: {}, custom: [] }
  },
  'claude-codex': {
    label: 'Claude + Codex revisor',
    team: {
      coordinator: 'claude',
      providers: ['claude', 'codex'],
      cross: 'sensibles',
      roles: everyRole('claude', { casandra: 'codex' }),
      custom: []
    }
  },
  'codex-claude': {
    label: 'Codex + Claude revisor',
    team: {
      coordinator: 'codex',
      providers: ['codex', 'claude'],
      cross: 'sensibles',
      roles: everyRole('codex', { casandra: 'claude' }),
      custom: []
    }
  }
}

export function isRoleId(value: unknown): value is RoleId {
  return TEAM_ROLES.some(({ id }) => id === value)
}

const MAX_PROVIDERS = 8

/**
 * Un equipo que llega del panel, validado entero: ids de agente, revisión cruzada conocida,
 * cada rol con un proveedor activo y roles propios bien formados. `null` ante cualquier otra cosa.
 */
export function parseTeam(value: unknown): Team | null {
  if (typeof value !== 'object' || value === null) return null
  const { coordinator, providers, cross, roles, custom } = value as Record<string, unknown>
  if (!isValidAgentId(coordinator)) return null
  if (!Array.isArray(providers) || providers.length === 0 || providers.length > MAX_PROVIDERS) return null
  if (!providers.every(isValidAgentId) || new Set(providers).size !== providers.length) return null
  const crossReview = CROSS_REVIEW.find((mode) => mode === cross)
  if (!crossReview) return null
  if (typeof roles !== 'object' || roles === null || Array.isArray(roles)) return null
  const fixed: Partial<Record<RoleId, string>> = {}
  for (const [role, provider] of Object.entries(roles)) {
    if (!isRoleId(role) || !isValidAgentId(provider) || !providers.includes(provider)) return null
    fixed[role] = provider
  }
  if (!Array.isArray(custom) || custom.length > CUSTOM_ROLES_MAX) return null
  const own: CustomRole[] = []
  for (const role of custom) {
    const parsed = parseCustomRole(role, providers, own.map(({ name }) => name))
    if (!parsed) return null
    own.push(parsed)
  }
  return { coordinator, providers: [...providers], cross: crossReview, roles: fixed, custom: own }
}

/** El equipo tal como se edita en el panel. */
export type TeamDraft = Team & { preset: TeamPreset | 'custom' }

export function draftFromPreset(id: TeamPreset): TeamDraft {
  const { team } = TEAM_PRESETS[id]
  return { ...team, preset: id, providers: [...team.providers], roles: { ...team.roles }, custom: [] }
}

/**
 * Un borrador guardado por una versión anterior del panel (proveedores como texto, sin roles
 * propios) o dañado, convertido al formato de ahora. Lo que no se entiende vuelve a «Solo Claude».
 */
export function normalizeDraft(value: unknown): TeamDraft {
  const base = draftFromPreset('claude')
  if (typeof value !== 'object' || value === null) return base
  const old = value as Record<string, unknown>
  const providers = (
    Array.isArray(old.providers) ? old.providers : typeof old.providers === 'string' ? old.providers.split(/[\s,]+/) : []
  ).filter(isValidAgentId)
  const active = providers.length > 0 ? [...new Set(providers)] : base.providers
  const roles = typeof old.roles === 'object' && old.roles !== null ? Object.entries(old.roles) : []
  const draft: TeamDraft = {
    ...base,
    preset: 'custom',
    coordinator: isValidAgentId(old.coordinator) ? old.coordinator : base.coordinator,
    providers: active,
    cross: CROSS_REVIEW.find((mode) => mode === old.cross) ?? base.cross,
    roles: Object.fromEntries(
      roles.filter(([role, provider]) => isRoleId(role) && typeof provider === 'string' && active.includes(provider))
    ),
    custom: Array.isArray(old.custom) ? (old.custom as CustomRole[]) : []
  }
  return teamFromDraft(draft) ? draft : base
}

export function emptyCustomRole(): CustomRole {
  return { name: '', work: '', level: 'medio', review: 'propia', guard: '', provider: null }
}

/**
 * El equipo de un borrador, o `null` si no es válido. Un rol cuyo proveedor ya no está entre
 * los activos vuelve a «lo elige el coordinador».
 */
export function teamFromDraft(draft: TeamDraft): Team | null {
  const { providers } = draft
  const roles = Object.fromEntries(
    Object.entries(draft.roles).filter(([, provider]) => provider !== undefined && providers.includes(provider))
  )
  const custom = draft.custom.map((role) => ({
    ...role,
    provider: role.provider !== null && providers.includes(role.provider) ? role.provider : null
  }))
  return parseTeam({ coordinator: draft.coordinator, providers, cross: draft.cross, roles, custom })
}

/** El equipo en JSON y base64url: llega al terminal sin un solo carácter que un shell interprete. */
export function encodeTeam(team: Team): string {
  const { providers, cross, roles, custom } = team
  const bytes = new TextEncoder().encode(JSON.stringify({ v: 1, providers, cross, roles, custom }))
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// cmd.exe corta las órdenes de más de 8191 caracteres.
export const TEAM_COMMAND_MAX = 7000

/**
 * La orden que deja el equipo en `ORCHESTRATION.md` §1 del proyecto, o `null` si no cabe en un
 * terminal. Solo lleva base64url de un equipo que `parseTeam` ya validó; `omk team` lo valida otra vez.
 */
export function teamCommand(team: Team): string | null {
  const command = `omk team set --data ${encodeTeam(team)}`
  return command.length > TEAM_COMMAND_MAX ? null : command
}

/** Cuántas confirmaciones pide la skill `orca` antes de seguir sola (`ORCHESTRATION.md` §0). */
export type Autonomy = 'manual' | 'semi' | 'auto'

export const AUTONOMY_LEVELS: readonly { id: Autonomy; label: string; hint: string }[] = [
  { id: 'manual', label: 'Manual', hint: 'Confirmas el plan, cada ronda, cada merge y la limpieza.' },
  { id: 'semi', label: 'Semi', hint: 'Confirmas el plan, el merge final y la limpieza.' },
  { id: 'auto', label: 'Auto', hint: 'Solo confirmas el merge final y la limpieza; el plan se enseña sin esperar.' }
]

export function isAutonomy(value: unknown): value is Autonomy {
  return AUTONOMY_LEVELS.some(({ id }) => id === value)
}

/** La orden que deja el nivel en `ORCHESTRATION.md` §0: un literal por nivel, nada más. */
export function autonomyCommand(level: Autonomy): string {
  return `omk team set --autonomy ${level}`
}

export const TASK_MAX = 4000

/** De dónde sale el trabajo que se reparte. spec-kit es una opción, nunca un requisito. */
export type TaskSource = 'chat' | 'plan' | 'speckit'

export const TASK_SOURCES: readonly { id: TaskSource; label: string }[] = [
  { id: 'chat', label: 'Lo que escribo aquí' },
  { id: 'plan', label: 'Un plan del repo (planes/*.md)' },
  { id: 'speckit', label: 'Tareas de spec-kit (specs/…/tasks.md)' }
]

const SOURCE_PROMPT: Record<TaskSource, string> = {
  chat: 'Usa la skill orca para repartir esta tarea entre agentes. La entrada es este texto (adaptador de chat): no hace falta spec-kit.',
  plan: 'Usa la skill orca para repartir entre agentes el plan del repo (planes/*.md o .plans/*.md, adaptador plan-file): no hace falta spec-kit.',
  speckit: 'Usa la skill orca para repartir entre agentes las tareas de spec-kit (specs/<feature>/tasks.md, adaptador speckit).'
}

/**
 * El prompt para que el coordinador orqueste, o `null` si no vale. Con «lo que escribo aquí» la
 * tarea es obligatoria; con un plan o spec-kit es una indicación opcional (qué plan, qué feature).
 * Un nivel de autonomía cambia el de `ORCHESTRATION.md` solo para ese run; sin él, manda el fichero.
 */
export function orchestratePrompt(task: unknown, source: unknown = 'chat', autonomy: unknown = null): string | null {
  if (typeof task !== 'string') return null
  const from = TASK_SOURCES.find(({ id }) => id === source)?.id
  if (!from) return null
  if (autonomy !== null && autonomy !== undefined && !isAutonomy(autonomy)) return null
  // Saltos de línea y tabuladores sí; el resto de caracteres de control, no.
  const clean = task.replace(/\r\n?/g, '\n').replace(/[^\P{Cc}\n\t]/gu, ' ').trim()
  if (clean.length > TASK_MAX || (from === 'chat' && clean === '')) return null
  const head = isAutonomy(autonomy)
    ? `${SOURCE_PROMPT[from]} Autonomía de este run: ${autonomy} (manda sobre ORCHESTRATION.md §0 solo en este run).`
    : SOURCE_PROMPT[from]
  if (clean === '') return head
  return `${head}\n\n${from === 'chat' ? clean : `Indicaciones: ${clean}`}`
}
