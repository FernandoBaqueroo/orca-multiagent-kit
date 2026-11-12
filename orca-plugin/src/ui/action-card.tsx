// La acción en curso, encima de las pestañas: el comando `omk` o el agente que se acaba de lanzar
// desde el panel o la paleta, con su estado, lo último de su terminal y, si `omk` pregunta antes
// de seguir, los botones para contestarle (`kit.action`, `kit.answer` y `kit.dismiss` en
// src/protocol.ts; el worker lo sigue en src/worker/actions.ts).
import {
  atom,
  Badge,
  Button,
  Card,
  CodeView,
  Collapsible,
  plugin,
  read,
  RelativeTime,
  Row,
  set,
  Spinner,
  Stack,
  Text,
  type PanelContext
} from 'orca'
import { ask, busy, describeError, outcome } from '../panel-state.ts'
import type { ActionState, ActionView, Tone } from '../protocol.ts'

// Las líneas que se ven sin desplegar nada: el final de la salida, que es donde está el resultado.
const TAIL_LINES = 14
// Cuando `omk` pregunta, más: lo que pide aprobar (el acceso del plugin) va justo antes de la pregunta.
const ASKING_LINES = 30

const STATE: Record<ActionState, { tone: Tone; text: string }> = {
  running: { tone: 'accent', text: 'en curso' },
  asking: { tone: 'warning', text: 'espera tu respuesta' },
  done: { tone: 'success', text: 'terminado' },
  failed: { tone: 'danger', text: 'falló' },
  lost: { tone: 'neutral', text: 'sin seguimiento' }
}

const WHERE: Record<ActionView['kind'], string> = {
  omk: 'Se ejecuta en un terminal del workspace activo; aquí va su salida.',
  agent: 'El agente trabaja en su terminal del workspace activo; aquí va lo último que pinta.'
}

const action = atom<ActionView | null>(null)

export function setupAction(ctx: PanelContext): void {
  set(action, null)
  ctx.subscriptions.push(plugin.on('action.changed', ({ action: next }) => set(action, next)))
  void plugin
    .request('kit.action')
    .then(({ action: current }) => set(action, current))
    .catch((error: unknown) => set(outcome, { tone: 'danger', text: `Acción en curso no leída: ${describeError(error)}` }))
}

const answer = (id: string, approve: boolean) =>
  ask('answer', () => plugin.request('kit.answer', { id, approve }), { tracked: true })

const dismiss = (id: string) => ask('dismiss', () => plugin.request('kit.dismiss', { id }), { tracked: true })

export function ActionCard() {
  const view = read(action)
  if (view === null) return null
  const working = read(busy) !== null
  const badge = STATE[view.state]
  const ended = view.endedAt !== null
  const tail = view.lines.slice(view.canAnswer ? -ASKING_LINES : -TAIL_LINES)
  return (
    <Card title={view.title} description={WHERE[view.kind]}>
      <Stack gap="sm">
        <Row gap="xs" align="center" wrap>
          {view.state === 'running' ? <Spinner label="En curso" labelHidden /> : null}
          <Badge tone={badge.tone}>{badge.text}</Badge>
          <Text muted size="xs">
            {ended ? 'acabó ' : 'empezó '}
            <RelativeTime at={view.endedAt ?? view.startedAt} />
          </Text>
        </Row>
        {view.detail === null ? null : (
          <Text size="sm" tone={view.state === 'failed' ? 'danger' : undefined}>
            {view.detail}
          </Text>
        )}
        {tail.length === 0 ? (
          <Text muted size="sm">
            Sin salida todavía.
          </Text>
        ) : (
          <CodeView label={`Salida de ${view.title}`} code={tail.join('\n')} wrap maxHeight="none" />
        )}
        {view.lines.length > tail.length ? (
          <Collapsible title="Salida completa" description={`${view.lines.length} líneas`}>
            <CodeView label={`Salida completa de ${view.title}`} code={view.lines.join('\n')} wrap maxHeight="lg" />
          </Collapsible>
        ) : null}
        <Row gap="xs" wrap>
          {view.canAnswer ? (
            <Button icon="check" disabled={working} onPress={() => answer(view.id, true)}>
              Aprobar
            </Button>
          ) : null}
          {view.canAnswer ? (
            <Button variant="outline" tone="danger" icon="close" disabled={working} onPress={() => answer(view.id, false)}>
              Rechazar
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" icon="close" disabled={working} onPress={() => dismiss(view.id)}>
            {ended ? 'Quitar' : 'Dejar de seguir'}
          </Button>
        </Row>
      </Stack>
    </Card>
  )
}
