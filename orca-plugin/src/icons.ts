// Logo de cada agente en el panel: los mismos que pinta Orca junto a sus worktrees y chats
// (assets/logos/, ver su README). Un agente sin logo propio lleva el genérico.

const ICON_DIR = 'assets/logos'

const AGENT_LOGOS: ReadonlySet<string> = new Set([
  'aider',
  'amp',
  'antigravity',
  'claude',
  'cline',
  'codex',
  'copilot',
  'cursor',
  'devin',
  'droid',
  'gemini',
  'goose',
  'grok',
  'kimi',
  'kiro',
  'opencode',
  'qwen-code'
])

/** Ruta del logo de un agente dentro del plugin; el genérico si no se sabe cuál es. */
export function agentIcon(agent: string | null | undefined): string {
  const file = agent && AGENT_LOGOS.has(agent) ? agent : 'agent'
  return `${ICON_DIR}/${file}.png`
}
