// Autonomía de la skill orca: el nivel del proyecto (pestaña Equipo, `ORCHESTRATION.md` §0) y el
// que se quiera para un solo run (pestaña Repartir).
import { atom, Button, Card, plugin, read, Select, set, Stack, Text } from 'orca'
import { AUTONOMY_LEVELS, isAutonomy, type Autonomy } from '../kit.ts'
import { ask, busy } from '../panel-state.ts'

// Orca no admite una opción con valor vacío; este no puede ser un nivel.
const PROJECT_LEVEL = { value: '(proyecto)', label: 'La del proyecto (ORCHESTRATION.md)' }
const LEVEL_OPTIONS = AUTONOMY_LEVELS.map(({ id, label }) => ({ value: id, label }))

/** El nivel que se guardará en el proyecto; el panel lo recuerda entre sesiones. */
const projectAutonomy = atom<Autonomy>('autonomy', 'semi', {
  persist: 'plugin',
  version: 1,
  migrate: (stored) => (isAutonomy(stored) ? stored : 'semi')
})

/** El nivel solo para el próximo run que se reparta; `null` = el del proyecto. */
export const runAutonomy = atom<Autonomy | null>(null)

const hint = (level: Autonomy) => AUTONOMY_LEVELS.find(({ id }) => id === level)?.hint ?? ''

const saveAutonomy = () => ask('autonomy', () => plugin.request('team.autonomy', { autonomy: read(projectAutonomy) }))

export function AutonomyCard() {
  const level = read(projectAutonomy)
  const working = read(busy) !== null
  return (
    <Card
      title="Autonomía"
      description="Cuántas veces te pregunta el coordinador. Va a ORCHESTRATION.md §0 del proyecto activo."
    >
      <Stack gap="sm">
        <Select
          label="Nivel"
          value={level}
          options={LEVEL_OPTIONS}
          onChange={(value) => {
            if (isAutonomy(value)) set(projectAutonomy, value)
          }}
        />
        <Text size="sm" muted>
          {hint(level)} En ningún nivel se mergea a la rama por defecto, se hace push ni se borra nada sin preguntarte.
        </Text>
        <Button icon="check" disabled={working} onPress={saveAutonomy}>
          {read(busy) === 'autonomy' ? 'Guardando…' : 'Guardar en el proyecto'}
        </Button>
      </Stack>
    </Card>
  )
}

export function AutonomyOverride() {
  const level = read(runAutonomy)
  return (
    <Stack gap="xs">
      <Select
        label="Autonomía de este run"
        value={level ?? PROJECT_LEVEL.value}
        options={[PROJECT_LEVEL, ...LEVEL_OPTIONS]}
        onChange={(value) => set(runAutonomy, isAutonomy(value) ? value : null)}
      />
      {level === null ? null : (
        <Text size="xs" muted>
          {hint(level)}
        </Text>
      )}
    </Stack>
  )
}
