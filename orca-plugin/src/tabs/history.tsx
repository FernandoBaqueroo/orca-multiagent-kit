// Pestaña Historial: lo que ha pasado en los runs y lo que se ha hecho desde el panel.
// U0 deja la pestaña vacía con su contrato (`history.*` en src/protocol.ts). U3 la implementa.
import { Card, EmptyState, type PanelContext } from 'orca'

export function setupHistory(_ctx: PanelContext): void {}

export function History() {
  return (
    <Card title="Historial" description="Despachos, estados y runs.">
      <EmptyState icon="calendar" title="Sin historial" description="Se va llenando con cada despacho y cada run." />
    </Card>
  )
}
