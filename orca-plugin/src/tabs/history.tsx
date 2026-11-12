// Pestaña Historial: lo que ha pasado en los runs y lo que se ha hecho desde el panel
// (`history.*` en src/protocol.ts; el worker lo guarda en src/worker/history.ts).
import { atom, Badge, Button, Card, EmptyState, plugin, read, RelativeTime, Row, Select, set, Stack, Text, type PanelContext } from 'orca'
import { ask, busy, describeError, outcome } from '../panel-state.ts'
import type { HistoryEntry, HistoryKind } from '../protocol.ts'
import { AgentIcon } from '../ui/agent-icon.tsx'

type Filter = 'all' | 'runs' | 'mine'

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'Todo' },
  { value: 'runs', label: 'Runs y unidades' },
  { value: 'mine', label: 'Lo que hiciste tú' }
]

const KIND_LABEL: Record<HistoryKind, string> = {
  dispatch: 'Despacho',
  state: 'Estado',
  outcome: 'Final',
  run: 'Run',
  plan: 'Plan',
  orchestrate: 'Reparto',
  reply: 'Respuesta',
  model: 'Modelo',
  autonomy: 'Autonomía'
}

const RUN_KINDS: readonly HistoryKind[] = ['dispatch', 'state', 'outcome', 'run']

const entries = atom<HistoryEntry[]>([])
const filter = atom<Filter>('all')
const confirming = atom(false)

function visible(items: readonly HistoryEntry[], by: Filter): HistoryEntry[] {
  if (by === 'all') return [...items]
  return items.filter((entry) => RUN_KINDS.includes(entry.kind) === (by === 'runs'))
}

async function clear(): Promise<void> {
  if (!read(confirming)) {
    set(confirming, true)
    return
  }
  set(confirming, false)
  await ask('history', () => plugin.request('history.clear'))
}

export function setupHistory(ctx: PanelContext): void {
  set(entries, [])
  set(confirming, false)
  ctx.subscriptions.push(plugin.on('history.changed', ({ items }) => set(entries, items)))
  void plugin
    .request('history.list')
    .then(({ items }) => set(entries, items))
    .catch((error: unknown) => set(outcome, { tone: 'danger', text: `Historial no leído: ${describeError(error)}` }))
}

function Entry({ entry }: { entry: HistoryEntry }) {
  const where = [entry.run, entry.unit].filter(Boolean).join(' · ')
  return (
    <Stack gap="xs">
      <Row gap="xs" align="center" wrap>
        <Badge tone={entry.tone}>{KIND_LABEL[entry.kind]}</Badge>
        {entry.agent === null ? null : <AgentIcon agent={entry.agent} />}
        <Text>{entry.title}</Text>
      </Row>
      {entry.detail === null ? null : (
        <Text muted size="sm">
          {entry.detail}
        </Text>
      )}
      <Text muted size="xs">
        {where === '' ? null : `${where} · `}
        <RelativeTime at={entry.at} />
      </Text>
    </Stack>
  )
}

export function History() {
  const all = read(entries)
  const by = read(filter)
  const shown = visible(all, by)
  const working = read(busy) !== null
  const sure = read(confirming)
  if (all.length === 0) {
    return (
      <Card title="Historial" description="Despachos, estados y runs.">
        <EmptyState icon="calendar" title="Sin historial" description="Se va llenando con cada despacho y cada run." />
      </Card>
    )
  }
  return (
    <Card title="Historial" description="Despachos, estados y runs.">
      <Stack gap="md">
        <Row gap="sm" align="end" wrap>
          <Select
            label="Mostrar"
            value={by}
            options={FILTERS}
            onChange={(value) => {
              const next = FILTERS.find((option) => option.value === value)?.value
              if (next) set(filter, next)
            }}
          />
          <Button variant={sure ? 'solid' : 'outline'} tone={sure ? 'danger' : undefined} size="sm" icon="delete" disabled={working} onPress={clear}>
            {sure ? '¿Seguro? Vaciar' : 'Vaciar historial'}
          </Button>
        </Row>
        {shown.length === 0 ? (
          <EmptyState icon="calendar" title="Nada que mostrar" description="Ninguna entrada coincide con este filtro." />
        ) : (
          shown.map((entry) => <Entry key={entry.id} entry={entry} />)
        )}
      </Stack>
    </Card>
  )
}
