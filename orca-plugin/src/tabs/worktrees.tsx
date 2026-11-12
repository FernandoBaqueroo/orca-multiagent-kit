// Pestaña Worktrees: los worktrees de la orquestación por run, sus agentes y su modelo.
import { atom, Badge, Box, Button, Card, Collapsible, EmptyState, plugin, read, Row, Select, set, Stack, Text, type PanelContext } from 'orca'
import { CLAUDE_MODELS } from '../models.ts'
import { ask, busy, describeError } from '../panel-state.ts'
import type { WorktreeAgent, WorktreeGroup, WorktreeItem } from '../protocol.ts'
import { AgentIcon } from '../ui/agent-icon.tsx'

// El estado en español que da el worker (los de kit.ts): solo entonces se le puede escribir.
const WAITING = 'esperando'

const groups = atom<WorktreeGroup[] | null>(null)
// Por qué no se pudo leer la lista, para decirlo en la propia pestaña en vez de en el aviso de arriba.
const loadError = atom<string | null>(null)
// El modelo elegido en cada Select, por agente, hasta que se pulsa «Cambiar modelo».
const chosen = atom<Record<string, string>>({})

export function setupWorktrees(ctx: PanelContext): void {
  ctx.subscriptions.push(plugin.on('worktrees.changed', (view) => set(groups, view.groups)))
  void plugin
    .request('worktrees.list')
    .then((view) => set(groups, view.groups))
    .catch((error: unknown) => set(loadError, describeError(error)))
}

const openWorktree = (workspaceId: string) => ask('open-worktree', () => plugin.request('worktrees.open', { workspaceId }))

const modelOf = (agent: WorktreeAgent) =>
  read(chosen)[agent.id] ?? (CLAUDE_MODELS.some(({ value }) => value === agent.model) ? agent.model : null) ?? CLAUDE_MODELS[0]?.value ?? ''

const setModel = (agent: WorktreeAgent) =>
  ask('model', () => plugin.request('worktrees.model', { id: agent.id, model: modelOf(agent) }))

function noModelChange(agent: WorktreeAgent): string | null {
  if (!agent.canSetModel) return 'Es un chat de Orca: cambia el modelo desde su chat.'
  if (agent.state !== WAITING) return 'Espera a que termine su turno para cambiarle el modelo.'
  return null
}

function AgentRow({ agent }: { agent: WorktreeAgent }) {
  const working = read(busy) !== null
  const why = noModelChange(agent)
  return (
    <Stack gap="xs">
      <Row gap="xs" align="center" wrap>
        <AgentIcon agent={agent.agent} />
        <Text weight="semibold" size="sm">
          {agent.title}
        </Text>
        <Badge tone={agent.blocked ? 'warning' : 'neutral'}>{agent.state}</Badge>
        <Badge tone="neutral">{agent.model ?? 'modelo no informado'}</Badge>
      </Row>
      {agent.agent === 'claude' ? (
        <Row gap="xs" align="end" wrap>
          {agent.canSetModel ? (
            <Select
              label={`Modelo de ${agent.title}`}
              value={modelOf(agent)}
              options={CLAUDE_MODELS}
              onChange={(value) => set(chosen, { ...read(chosen), [agent.id]: value })}
            />
          ) : null}
          {agent.canSetModel ? (
            <Button variant="outline" size="sm" disabled={working || why !== null} onPress={() => setModel(agent)}>
              Cambiar modelo
            </Button>
          ) : null}
          {why === null ? null : (
            <Text muted size="xs">
              {why}
            </Text>
          )}
        </Row>
      ) : null}
    </Stack>
  )
}

function Worktree({ item }: { item: WorktreeItem }) {
  const working = read(busy) !== null
  // Como en la lista de worktrees de Orca: el logo del agente delante del nombre.
  return (
    <Row gap="xs" align="start">
      <Box paddingY="sm">
        <AgentIcon agent={item.agents[0]?.agent ?? null} />
      </Box>
      <Box grow>
        <Collapsible
          title={item.name}
          description={[item.branch, item.unit].filter((part): part is string => Boolean(part)).join(' · ')}
          defaultOpen={item.agents.some((agent) => agent.blocked)}
        >
          <Stack gap="sm">
            <Row gap="xs">
              <Button variant="outline" size="sm" icon="open-external" disabled={working} onPress={() => openWorktree(item.workspaceId)}>
                Abrir worktree
              </Button>
            </Row>
            {item.agents.map((agent) => (
              <AgentRow agent={agent} />
            ))}
          </Stack>
        </Collapsible>
      </Box>
    </Row>
  )
}

export function Worktrees() {
  const view = read(groups)
  const failure = read(loadError)
  if (view === null || view.length === 0) {
    return (
      <Card title="Worktrees" description="Los que crea la orquestación, por run.">
        <Stack gap="xs">
          <EmptyState icon="branch" title="Ningún worktree" description="Aparecen en cuanto el coordinador lanza unidades." />
          {failure === null ? null : (
            <Text muted size="xs">
              No pude leer los worktrees: {failure}
            </Text>
          )}
        </Stack>
      </Card>
    )
  }
  return (
    <Stack gap="md">
      {view.map((group) => (
        <Card title={group.title} description={`${group.worktrees.length} worktree${group.worktrees.length === 1 ? '' : 's'}`}>
          <Stack gap="xs">
            {group.worktrees.map((item) => (
              <Worktree item={item} />
            ))}
          </Stack>
        </Card>
      ))}
    </Stack>
  )
}
