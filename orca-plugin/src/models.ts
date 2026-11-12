// Modelos de Claude Code: leer el de la orden de arranque y validar el que la persona elige.
// Solo hay alias de nivel; los ids con versión los decide Claude Code, no este plugin.

/** Los alias que acepta `/model` en Claude Code, con el nivel del kit al que equivalen. */
export const CLAUDE_MODELS: readonly { value: string; label: string }[] = [
  { value: 'opus', label: 'Opus · nivel alto' },
  { value: 'sonnet', label: 'Sonnet · nivel medio' },
  { value: 'haiku', label: 'Haiku · nivel bajo' }
]

// Un id de modelo: minúsculas, dígitos y `._-`; el sufijo `[1m]` (contexto largo) es opcional.
const MODEL_ID = /^[a-z0-9][a-z0-9._-]{0,63}(\[1m\])?$/
// `--model x`, `--model=x`, y el valor entre comillas simples o dobles.
const MODEL_FLAG = /(?:^|\s)--model(?:=|\s+)(?:"([^"]*)"|'([^']*)'|(\S+))/

/**
 * Si `value` es un alias de la lista o un id de modelo. Es lo único que se escribe en el terminal
 * de un agente: nada de espacios, `;` ni saltos de línea.
 */
export function isModelId(value: unknown): value is string {
  return typeof value === 'string' && (CLAUDE_MODELS.some((model) => model.value === value) || MODEL_ID.test(value))
}

/** El modelo con el que se lanzó un agente, leído de `--model` en su orden de arranque. */
export function modelFromCommand(command: string): string | null {
  const match = MODEL_FLAG.exec(command)
  const value = match?.[1] ?? match?.[2] ?? match?.[3]
  return isModelId(value) ? value : null
}
