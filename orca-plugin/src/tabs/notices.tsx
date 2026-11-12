// Pestaña Avisos: planes de rondas por confirmar y agentes que esperan a la persona, con la
// respuesta que se les escribe en su terminal (`notices.*` en src/protocol.ts).
import {
  atom,
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Code,
  Collapsible,
  EmptyState,
  KeyValue,
  plugin,
  read,
  RelativeTime,
  Row,
  set,
  Stack,
  Text,
  Textarea,
  type PanelContext
} from 'orca'
import { ask, busy, describeError, outcome } from '../panel-state.ts'
import type { NoticeItem, PlanCard, PlanUnit, Tone } from '../protocol.ts'
import { AgentIcon } from '../ui/agent-icon.tsx'
import { agentLabel } from '../kit.ts'

// «sí» + `cambia: ` caben en las 2000 letras que admite el worker.
const CHANGE_MAX = 1900
const NO_REPLY = 'Responde en el chat del agente.'

const notices = atom<NoticeItem[] | null>(null)
// Lo que se está escribiendo en la caja de cada aviso, por id; se vacía al enviar con éxito.
const drafts = atom<Record<string, string>>({})

const LEVEL_TONE: Record<string, Tone> = { alto: 'warning', medio: 'accent', bajo: 'neutral' }
const RESOURCE_TONE: Record<string, Tone> = { inline: 'neutral', worker: 'success', subagente: 'accent', manual: 'warning' }

const BLOCKED_BADGE: Record<NoticeItem['kind'], { tone: Tone; text: string }> = {
  plan: { tone: 'accent', text: 'plan por confirmar' },
  blocked: { tone: 'warning', text: 'necesita tu permiso' },
  waiting: { tone: 'accent', text: 'espera instrucciones' }
}

/** «Avisos» con cuántos esperan, para la etiqueta de su pestaña. */
export function noticesLabel(): string {
  const count = read(notices)?.length ?? 0
  return count > 0 ? `Avisos (${count})` : 'Avisos'
}

export function setupNotices(ctx: PanelContext): void {
  ctx.subscriptions.push(
    plugin.on('notices.changed', ({ items }) => {
      set(notices, items)
      const ids = new Set(items.map(({ id }) => id))
      const current = read(drafts)
      if (Object.keys(current).some((id) => !ids.has(id))) {
        set(drafts, Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))))
      }
    })
  )
  void plugin
    .request('notices.list')
    .then(({ items }) => set(notices, items))
    .catch((error: unknown) => set(outcome, { tone: 'danger', text: `Avisos no leídos: ${describeError(error)}` }))
}

const draftOf = (id: string) => read(drafts)[id] ?? ''
const setDraft = (id: string, text: string) => set(drafts, { ...read(drafts), [id]: text })

async function reply(id: string, text: string): Promise<void> {
  const sent = await ask(`notice:${id}`, () => plugin.request('notices.reply', { id, text }))
  if (sent) setDraft(id, '')
}

const dismiss = (id: string) => ask('dismiss', () => plugin.request('notices.dismiss', { id }))
const openAgent = (id: string) => ask('open', () => plugin.request('agents.open', { id }))

function UnitBox({ unit }: { unit: PlanUnit }) {
  const who = unit.model ? `${agentLabel(unit.agent)} · ${unit.model}` : agentLabel(unit.agent)
  const level = unit.level ?? ''
  const extras = [unit.files ? `ficheros: ${unit.files}` : null, unit.depends ? `depende de: ${unit.depends}` : null].filter(
    (line): line is string => line !== null
  )
  return (
    // Con título propio: sin él, Orca pone el de su tono («Advertencia», «Importante»).
    <Callout tone={LEVEL_TONE[level] ?? 'neutral'} title={`${unit.id} · ${unit.title}`}>
      <Box gap="xs">
        <Row gap="xs" align="center" wrap>
          {unit.role || unit.level ? (
            <Badge tone={LEVEL_TONE[level] ?? 'neutral'}>{[unit.role, unit.level].filter(Boolean).join(' · ')}</Badge>
          ) : null}
          <AgentIcon agent={unit.agent} />
          <Text size="sm">{who}</Text>
          <Badge tone={RESOURCE_TONE[unit.resource] ?? 'neutral'}>{unit.resource}</Badge>
        </Row>
        {extras.length > 0 ? (
          <Text muted size="xs">
            {extras.join(' · ')}
          </Text>
        ) : null}
      </Box>
    </Callout>
  )
}

function planFacts(plan: PlanCard) {
  const facts = [
    { label: 'Entrada', value: plan.source },
    { label: 'Autonomía', value: plan.autonomy },
    { label: 'Base', value: plan.base, code: true },
    { label: 'Integración', value: plan.integration, code: true },
    { label: 'Merge final', value: plan.merge, code: true }
  ]
  return facts.filter((fact) => fact.value !== null)
}

function Rounds({ plan }: { plan: PlanCard }) {
  const rounds = [...new Set(plan.units.map(({ round }) => round))].sort((a, b) => a - b)
  return (
    <Stack gap="md">
      {rounds.map((round) => (
        <Stack gap="xs">
          <Text weight="semibold" size="sm">{`Ronda ${round}`}</Text>
          {plan.units
            .filter((unit) => unit.round === round)
            .map((unit) => (
              <UnitBox unit={unit} />
            ))}
        </Stack>
      ))}
    </Stack>
  )
}

function PlanNotice({ notice, plan }: { notice: NoticeItem; plan: PlanCard }) {
  const working = read(busy) !== null
  const change = draftOf(notice.id)
  const facts = planFacts(plan)
  return (
    <Card title={`Plan de rondas · ${plan.run}`} description={`${plan.units.length} unidades`}>
      <Stack gap="md">
        <Row gap="xs" align="center" wrap>
          <Badge tone={BLOCKED_BADGE.plan.tone}>{BLOCKED_BADGE.plan.text}</Badge>
          <Text muted size="xs">
            desde <RelativeTime at={notice.since} />
          </Text>
        </Row>
        {facts.length > 0 ? <KeyValue label="Cabecera del plan" items={facts} /> : null}
        <Rounds plan={plan} />
        {plan.notes.length > 0 ? (
          <Callout tone="accent" icon="info" title="Notas">
            <Stack gap="xs">
              {plan.notes.map((note) => (
                <Text size="sm">{note}</Text>
              ))}
            </Stack>
          </Callout>
        ) : null}
        <Button icon="check" disabled={working || !notice.canReply} onPress={() => reply(notice.id, 'sí')}>
          Sí, lánzalo
        </Button>
        <Textarea
          label="¿Qué cambio?"
          rows={3}
          maxLength={CHANGE_MAX}
          value={change}
          disabled={!notice.canReply}
          onChange={(value) => setDraft(notice.id, value)}
        />
        <Row gap="xs" wrap>
          <Button
            variant="outline"
            icon="next"
            disabled={working || !notice.canReply || change.trim() === ''}
            onPress={() => reply(notice.id, `cambia: ${change.trim()}`)}
          >
            Pedir cambio
          </Button>
          <Button variant="ghost" size="sm" icon="close" disabled={working} onPress={() => dismiss(notice.id)}>
            Descartar
          </Button>
        </Row>
        {notice.canReply ? null : (
          <Text muted size="xs">
            {NO_REPLY}
          </Text>
        )}
      </Stack>
    </Card>
  )
}

function AgentNotice({ notice }: { notice: NoticeItem }) {
  const working = read(busy) !== null
  const text = draftOf(notice.id)
  const badge = BLOCKED_BADGE[notice.kind]
  const where = [notice.unit, notice.workspace].filter((part): part is string => part !== null)
  return (
    <Card title={notice.title} description={where.length > 0 ? where.join(' · ') : undefined}>
      <Stack gap="sm">
        <Row gap="xs" align="center" wrap>
          <AgentIcon agent={notice.agent} />
          <Badge tone={badge.tone}>{badge.text}</Badge>
          <Text muted size="xs">
            desde <RelativeTime at={notice.since} />
          </Text>
        </Row>
        {notice.context.length > 0 ? (
          <Collapsible title="Lo último del terminal">
            <Code block>{notice.context.join('\n')}</Code>
          </Collapsible>
        ) : null}
        <Textarea
          label={`Respuesta para ${notice.title}`}
          rows={2}
          maxLength={2000}
          value={text}
          disabled={!notice.canReply}
          onChange={(value) => setDraft(notice.id, value)}
        />
        <Row gap="xs" wrap>
          <Button
            icon="next"
            disabled={working || !notice.canReply || text.trim() === ''}
            onPress={() => reply(notice.id, text)}
          >
            Enviar
          </Button>
          <Button variant="outline" icon="open-external" disabled={working} onPress={() => openAgent(notice.id)}>
            Ir a su workspace
          </Button>
          <Button variant="ghost" size="sm" icon="close" disabled={working} onPress={() => dismiss(notice.id)}>
            Descartar
          </Button>
        </Row>
        {notice.canReply ? null : (
          <Text muted size="xs">
            {NO_REPLY}
          </Text>
        )}
      </Stack>
    </Card>
  )
}

export function Notices() {
  const items = read(notices)
  if (items === null) {
    return (
      <Card title="Avisos" description="Lo que espera tu respuesta.">
        <Text muted>Cargando…</Text>
      </Card>
    )
  }
  if (items.length === 0) {
    return (
      <Card title="Avisos" description="Lo que espera tu respuesta.">
        <EmptyState icon="bell" title="Nada pendiente" description="Aquí aparecen los planes por confirmar y los agentes que esperan." />
      </Card>
    )
  }
  return (
    <Stack gap="md">
      {items.map((notice) =>
        notice.plan ? <PlanNotice notice={notice} plan={notice.plan} /> : <AgentNotice notice={notice} />
      )}
    </Stack>
  )
}
