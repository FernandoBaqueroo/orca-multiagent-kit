// Estado que comparten todas las pestañas del panel: qué petición al worker está en curso y el
// aviso de arriba con su resultado.
import { atom, set } from 'orca'

export type Outcome = { tone: 'success' | 'danger'; text: string }

// Qué petición al worker está en curso: una cada vez.
export const busy = atom<string | null>(null)
export const outcome = atom<Outcome | null>(null)

// Los errores del host llevan `code` (host-api §Errors); el tipo de `catch` no lo sabe.
export const describeError = (error: unknown) =>
  error instanceof Error ? `${(error as { code?: string }).code ?? 'error'}: ${error.message}` : String(error)

/** Una petición al worker cada vez; su respuesta o su error quedan en el aviso de arriba. */
export async function ask(label: string, request: () => Promise<{ message: string }>): Promise<boolean> {
  set(busy, label)
  try {
    const { message } = await request()
    set(outcome, { tone: 'success', text: message })
    return true
  } catch (error) {
    set(outcome, { tone: 'danger', text: describeError(error) })
    return false
  } finally {
    set(busy, null)
  }
}
