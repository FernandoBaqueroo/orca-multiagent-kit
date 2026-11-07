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
  'Instálalo con `npm install -g orca-multiagent-kit` (o `./install.sh` desde el zip) y vuelve a lanzar el comando.'

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
  const matches = workspaces.filter(
    (w) => w.name === focused.displayName && (w.branch ?? '') === focused.branch
  )
  return matches.length === 1 ? (matches[0]?.id ?? null) : null
}

const AGENT_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

export function isValidAgentId(value: unknown): value is string {
  return typeof value === 'string' && AGENT_ID.test(value)
}

export type AgentState = 'working' | 'blocked' | 'waiting' | 'done'
export type TrackedAgent = { workspaceId: string | null; title: string | null; state: AgentState }

export type AgentSummary = {
  text: string
  tone: 'neutral' | 'accent' | 'warning'
  tooltip: string
}

const STATE_LABEL: Record<Exclude<AgentState, 'done'>, [string, string]> = {
  working: ['trabajando', 'trabajando'],
  blocked: ['bloqueado', 'bloqueados'],
  waiting: ['esperando', 'esperando']
}

export function summarizeAgents(agents: Iterable<TrackedAgent>): AgentSummary {
  const counts = { working: 0, blocked: 0, waiting: 0 }
  for (const agent of agents) {
    if (agent.state !== 'done') counts[agent.state] += 1
  }
  const parts = (Object.keys(counts) as (keyof typeof counts)[])
    .filter((state) => counts[state] > 0)
    .map((state) => `${counts[state]} ${STATE_LABEL[state][counts[state] === 1 ? 0 : 1]}`)
  const tone = counts.blocked > 0 ? 'warning' : counts.working > 0 ? 'accent' : 'neutral'
  return {
    text: parts.length > 0 ? `MAW · ${parts.join(' · ')}` : 'MAW',
    tone,
    tooltip:
      parts.length > 0
        ? `Orca Multiagent Kit: ${parts.join(', ')} en todos los workspaces`
        : 'Orca Multiagent Kit: ningún agente activo'
  }
}

/** Una línea por agente activo, para el comando «estado de los agentes». */
export function describeAgents(agents: Iterable<TrackedAgent>): string {
  const lines: string[] = []
  for (const agent of agents) {
    if (agent.state === 'done') continue
    lines.push(`- ${agent.title ?? 'agente sin título'}: ${STATE_LABEL[agent.state][0]}`)
  }
  return lines.length > 0 ? lines.join('\n') : 'Ningún agente activo.'
}
