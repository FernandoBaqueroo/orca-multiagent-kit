// Pestaña Worktrees: los worktrees que crea la orquestación, agrupados por run, con sus agentes y
// el modelo de cada uno.
// U0 deja el contrato: la lista vacía y los cambios rechazados. U2 la implementa.
import type { KitContext } from './context.ts'

const notReady = () => Object.assign(new Error('los worktrees aún no están disponibles'), { code: 'invalid_params' })

export function registerWorktrees(ctx: KitContext): void {
  ctx.panels.handle('worktrees.list', () => ({ groups: [] }))
  ctx.panels.handle('worktrees.open', () => {
    throw notReady()
  })
  ctx.panels.handle('worktrees.model', () => {
    throw notReady()
  })
}
