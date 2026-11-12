// Icono de cada agente en el panel (assets/agents/, ver su README). Los que no tienen logo propio
// llevan el genérico, como un agente que Orca no conoce.

const ICON_DIR = 'assets/agents'

const AGENT_ICONS: ReadonlyMap<string, string> = new Map([
  ['claude', 'claude'],
  ['codex', 'openai'],
  ['gemini', 'gemini'],
  ['antigravity', 'google'],
  ['copilot', 'copilot'],
  ['grok', 'grok']
])

/** Ruta del icono de un agente dentro del plugin; el genérico si no se sabe cuál es. */
export function agentIcon(agent: string | null | undefined): string {
  const file = (agent && AGENT_ICONS.get(agent)) || 'agent'
  return `${ICON_DIR}/${file}.png`
}
