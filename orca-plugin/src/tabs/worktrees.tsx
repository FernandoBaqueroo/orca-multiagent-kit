// Pestaña Worktrees: los worktrees de la orquestación por run, sus agentes y su modelo.
// U0 deja la pestaña vacía con su contrato (`worktrees.*` en src/protocol.ts). U2 la implementa.
import { Card, EmptyState, type PanelContext } from 'orca'

export function setupWorktrees(_ctx: PanelContext): void {}

export function Worktrees() {
  return (
    <Card title="Worktrees" description="Los que crea la orquestación, por run.">
      <EmptyState icon="branch" title="Ningún worktree" description="Aparecen en cuanto el coordinador lanza unidades." />
    </Card>
  )
}
