// El logo del agente (Claude, Codex…) delante de su nombre, del tamaño con que lo pinta Orca.
// `Image` solo tiene tamaños de 48 px para arriba: con Markdown la imagen sale a su tamaño.
import { Markdown } from 'orca'
import { agentIcon } from '../icons.ts'
import { agentLabel } from '../kit.ts'

const SIZE = 16

export function AgentIcon({ agent }: { agent: string | null | undefined }) {
  // `agentLabel` sale de una lista cerrada o de un id validado; aun así, nada de `<>"` en el alt.
  const alt = (agent ? agentLabel(agent) : 'Agente').replace(/[<>"&]/g, '')
  return <Markdown content={`<img src="${agentIcon(agent)}" alt="${alt}" width="${SIZE}" height="${SIZE}">`} />
}
