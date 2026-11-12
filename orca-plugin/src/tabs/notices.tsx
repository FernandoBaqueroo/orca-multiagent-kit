// Pestaña Avisos: planes de rondas por confirmar y agentes que esperan a la persona, con la
// respuesta que se les escribe en su terminal.
// U0 deja la pestaña vacía con su contrato (`notices.*` en src/protocol.ts). U1 la implementa.
import { Card, EmptyState, type PanelContext } from 'orca'

export function setupNotices(_ctx: PanelContext): void {}

export function Notices() {
  return (
    <Card title="Avisos" description="Lo que espera tu respuesta.">
      <EmptyState icon="bell" title="Nada pendiente" description="Aquí aparecen los planes por confirmar y los agentes que esperan." />
    </Card>
  )
}
