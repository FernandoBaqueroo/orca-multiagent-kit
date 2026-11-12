// Pestaña Historial: despachos, cambios de estado, runs terminados y lo que la persona hace desde
// el panel, guardados en el almacén del plugin.
// U0 deja el contrato: el historial vacío. U3 lo implementa.
import type { KitContext } from './context.ts'

export function registerHistory(ctx: KitContext): void {
  ctx.panels.handle('history.list', () => ({ items: [] }))
  ctx.panels.handle('history.clear', () => ({ message: 'El historial ya está vacío.' }))
}
