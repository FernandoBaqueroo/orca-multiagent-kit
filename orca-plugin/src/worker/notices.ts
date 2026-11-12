// Pestaña Avisos: lo que espera a la persona (planes de rondas por confirmar, agentes bloqueados o
// esperando) y sus respuestas, que se escriben en el terminal del agente.
// U0 deja el contrato: la lista vacía y las respuestas rechazadas. U1 la implementa.
import type { KitContext } from './context.ts'

const notReady = () => Object.assign(new Error('los avisos aún no están disponibles'), { code: 'invalid_params' })

export function registerNotices(ctx: KitContext): void {
  ctx.panels.handle('notices.list', () => ({ items: [] }))
  ctx.panels.handle('notices.reply', () => {
    throw notReady()
  })
  ctx.panels.handle('notices.dismiss', () => {
    throw notReady()
  })
}
