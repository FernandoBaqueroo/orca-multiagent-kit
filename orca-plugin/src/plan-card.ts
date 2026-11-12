// El `plan.json` de la skill orca (skills/orca/references/plan-card.md, versión 1) como PlanCard.
// Es un fichero que escribe un agente: se valida campo a campo y lo que no encaje se rechaza entero
// con `null`, nunca se lanza.
import { cleanLabel } from './kit.ts'
import type { PlanCard, PlanUnit } from './protocol.ts'

export const PLAN_UNITS_MAX = 60
export const PLAN_NOTES_MAX = 10
export const PLAN_TEXT_MAX = 200
const ROUND_MAX = 999

// Un id de run, que nunca es «.» ni «..».
const RUN = /^(?!\.+$)[\w.-]{1,80}$/
const PLAN_PATH = /(?:^|\/)\.work\/runs\/([^/]+)\/plan\.json$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** El run de una ruta `…/.work/runs/<run>/plan.json` (barras `/` o `\`), o `null`. */
export function planPathRun(path: string): string | null {
  const run = PLAN_PATH.exec(path.replace(/\\/g, '/'))?.[1]
  return run !== undefined && RUN.test(run) ? run : null
}

type Field = { ok: true; value: string | null } | { ok: false }

// Un texto opcional: ausente o `null` es `null`; un texto, limpio y acotado; otro tipo no encaja.
function optionalText(value: unknown): Field {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false }
  return { ok: true, value: cleanLabel(value, PLAN_TEXT_MAX) }
}

function requiredText(value: unknown): string | null {
  return typeof value === 'string' ? cleanLabel(value, PLAN_TEXT_MAX) : null
}

function parseUnit(value: unknown): PlanUnit | null {
  if (!isRecord(value)) return null
  const { round } = value
  if (typeof round !== 'number' || !Number.isInteger(round) || round < 0 || round > ROUND_MAX) return null
  const id = requiredText(value.id)
  const title = requiredText(value.title)
  const agent = requiredText(value.agent)
  const resource = requiredText(value.resource)
  if (id === null || title === null || agent === null || resource === null) return null
  const role = optionalText(value.role)
  const level = optionalText(value.level)
  const model = optionalText(value.model)
  // La tabla del plan da un número de ficheros: se acepta también como número.
  const files = optionalText(typeof value.files === 'number' && Number.isFinite(value.files) ? String(value.files) : value.files)
  const depends = optionalText(value.depends)
  if (!role.ok || !level.ok || !model.ok || !files.ok || !depends.ok) return null
  return {
    round,
    id,
    title,
    role: role.value,
    level: level.value,
    agent,
    model: model.value,
    resource,
    files: files.value,
    depends: depends.value
  }
}

/** El plan de rondas de un `plan.json`, o `null` si no es la versión 1 o algo no encaja. */
export function parsePlan(value: unknown): PlanCard | null {
  if (!isRecord(value) || value.version !== 1) return null
  const { run, units: rawUnits, notes: rawNotes } = value
  if (typeof run !== 'string' || !RUN.test(run)) return null
  if (!Array.isArray(rawUnits) || rawUnits.length > PLAN_UNITS_MAX) return null
  const units: PlanUnit[] = []
  for (const raw of rawUnits) {
    const unit = parseUnit(raw)
    if (unit === null) return null
    units.push(unit)
  }
  let notes: string[] = []
  if (rawNotes !== undefined && rawNotes !== null) {
    if (!Array.isArray(rawNotes) || !rawNotes.every((note) => typeof note === 'string')) return null
    notes = rawNotes
      .map((note) => cleanLabel(note, PLAN_TEXT_MAX))
      .filter((note): note is string => note !== null)
      .slice(0, PLAN_NOTES_MAX)
  }
  const source = optionalText(value.source)
  const autonomy = optionalText(value.autonomy)
  const base = optionalText(value.base)
  const integration = optionalText(value.integration)
  const merge = optionalText(value.merge)
  if (!source.ok || !autonomy.ok || !base.ok || !integration.ok || !merge.ok) return null
  return {
    run,
    source: source.value,
    autonomy: autonomy.value,
    base: base.value,
    integration: integration.value,
    merge: merge.value,
    units,
    notes
  }
}
