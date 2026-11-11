// Panel lateral del kit: las acciones de la paleta, los ajustes del plugin y los agentes activos.
// Los ajustes son los mismos de Settings → Plugins → Orca Multiagent Kit: cambiarlos aquí o allí
// es lo mismo, y el worker se entera por `settings.onDidChange`.
// Orca transpila este fichero al cargarlo: no hay paso de build.
import {
  atom,
  Button,
  Callout,
  Card,
  Code,
  EmptyState,
  Heading,
  Input,
  List,
  ListItem,
  plugin,
  read,
  Row,
  Select,
  set,
  settings,
  Stack,
  Switch,
  Text,
  type PanelContext
} from 'orca'
import { isValidAgentId, parseContractHintMode, type ContractHintMode, type KitAction } from './kit.ts'
import type { AgentsView } from './protocol.ts'

type Preferences = { contractHint: ContractHintMode; statusBar: boolean; initAgent: string }
type Outcome = { tone: 'success' | 'danger'; text: string }

const DEFAULTS: Preferences = { contractHint: 'kit', statusBar: true, initAgent: 'claude' }

const CONTRACT_OPTIONS: readonly { value: ContractHintMode; label: string }[] = [
  { value: 'kit', label: 'Solo despachos del kit' },
  { value: 'all', label: 'Todos los despachos' },
  { value: 'off', label: 'Desactivado' }
]

const ACTIONS: readonly { action: KitAction; label: string; hint: string }[] = [
  { action: 'verify', label: 'Verificar instalación', hint: 'omk verify en un terminal nuevo' },
  { action: 'init', label: 'Inicializar proyecto', hint: 'el agente de inicializar con «inicializa el proyecto»' },
  { action: 'update', label: 'Actualizar kit', hint: 'omk update en un terminal nuevo' }
]

const preferences = atom<Preferences>(DEFAULTS)
const agentDraft = atom(DEFAULTS.initAgent)
const agents = atom<AgentsView | null>(null)
const running = atom<KitAction | null>(null)
const outcome = atom<Outcome | null>(null)

// Los errores del host llevan `code` (host-api §Errors); el tipo de `catch` no lo sabe.
const describeError = (error: unknown) =>
  error instanceof Error ? `${(error as { code?: string }).code ?? 'error'}: ${error.message}` : String(error)

function fromSettings(values: Record<string, unknown>): Preferences {
  return {
    contractHint: parseContractHintMode(values.contractHint),
    statusBar: values.statusBar !== false,
    initAgent: typeof values.initAgent === 'string' ? values.initAgent : DEFAULTS.initAgent
  }
}

async function loadPreferences(): Promise<void> {
  try {
    const next = fromSettings(await settings.get())
    set(preferences, next)
    set(agentDraft, next.initAgent)
  } catch (error) {
    set(outcome, { tone: 'danger', text: `No pude leer los ajustes: ${describeError(error)}` })
  }
}

async function save(key: keyof Preferences, value: string | boolean): Promise<void> {
  try {
    await settings.set(key, value)
    set(preferences, { ...read(preferences), [key]: value })
    set(outcome, { tone: 'success', text: 'Ajuste guardado.' })
  } catch (error) {
    set(outcome, { tone: 'danger', text: `No se guardó el ajuste: ${describeError(error)}` })
  }
}

async function saveInitAgent(): Promise<void> {
  const value = read(agentDraft).trim()
  if (!isValidAgentId(value)) {
    set(outcome, { tone: 'danger', text: `«${value}» no es un id de agente válido (minúsculas, números y guiones).` })
    return
  }
  await save('initAgent', value)
}

async function run(action: KitAction): Promise<void> {
  set(running, action)
  try {
    const { message } = await plugin.request('kit.run', { action })
    set(outcome, { tone: 'success', text: message })
  } catch (error) {
    set(outcome, { tone: 'danger', text: describeError(error) })
  } finally {
    set(running, null)
  }
}

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(plugin.on('agents.changed', (view) => set(agents, view)))
  ctx.subscriptions.push(settings.onDidChange(() => void loadPreferences()))
  void loadPreferences()
  void plugin
    .request('agents.summary')
    .then((view) => set(agents, view))
    .catch((error: unknown) => set(outcome, { tone: 'danger', text: `Agentes no leídos: ${describeError(error)}` }))
}

function Actions() {
  const busy = read(running)
  return (
    <Card title="Acciones" description="Se ejecutan en el workspace activo.">
      <Stack gap="sm">
        {ACTIONS.map(({ action, label, hint }) => (
          <Button
            icon={action === 'verify' ? 'check' : action === 'init' ? 'play' : 'refresh'}
            tooltip={hint}
            disabled={busy !== null}
            onPress={() => run(action)}
          >
            {busy === action ? `${label}…` : label}
          </Button>
        ))}
      </Stack>
    </Card>
  )
}

function Settings() {
  const prefs = read(preferences)
  const draft = read(agentDraft)
  return (
    <Card title="Ajustes" description="Los mismos que Settings → Plugins → Orca Multiagent Kit.">
      <Stack gap="md">
        <Select
          label="Contrato del worker en los despachos"
          value={prefs.contractHint}
          options={CONTRACT_OPTIONS}
          onChange={(value) => save('contractHint', parseContractHintMode(value))}
        />
        <Switch label="Agentes en la barra de estado" checked={prefs.statusBar} onChange={(on) => save('statusBar', on)} />
        <Row gap="xs" align="end">
          <Input
            label="Agente para inicializar"
            value={draft}
            maxLength={40}
            placeholder={DEFAULTS.initAgent}
            invalid={!isValidAgentId(draft.trim())}
            onChange={(value) => set(agentDraft, value)}
            onSubmit={() => saveInitAgent()}
          />
          <Button variant="outline" disabled={draft.trim() === prefs.initAgent} onPress={saveInitAgent}>
            Guardar
          </Button>
        </Row>
      </Stack>
    </Card>
  )
}

function Agents() {
  const view = read(agents)
  return (
    <Card title="Agentes" description="En todos los workspaces.">
      {view === null ? (
        <Text muted>Cargando…</Text>
      ) : view.agents.length === 0 ? (
        <EmptyState icon="agent" title="Ningún agente activo" />
      ) : (
        <List label="Agentes activos">
          {view.agents.map(({ title, state }) => (
            <ListItem icon="agent" title={title} description={state} />
          ))}
        </List>
      )}
    </Card>
  )
}

export default function Panel() {
  const last = read(outcome)
  return (
    <Stack gap="md">
      <Heading>Orca Multiagent Kit</Heading>
      {last ? (
        <Callout tone={last.tone} icon={last.tone === 'success' ? 'check' : 'error'}>
          <Text>{last.text}</Text>
        </Callout>
      ) : null}
      <Actions />
      <Settings />
      <Agents />
      <Text muted size="xs">
        Desde un terminal: <Code>omk setup</Code> prepara todo el entorno y <Code>omk plugin status</Code> muestra el plugin.
      </Text>
    </Stack>
  )
}
