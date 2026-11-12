// El logo del agente (Claude, Codex…) delante de su nombre, como en las listas de Orca.
import { Image } from 'orca'
import { agentIcon } from '../icons.ts'
import { agentLabel } from '../kit.ts'

export function AgentIcon({ agent }: { agent: string | null | undefined }) {
  return <Image src={agentIcon(agent)} alt={agent ? agentLabel(agent) : 'Agente'} size="xs" rounded />
}
