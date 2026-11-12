// Panel lateral del kit en pestañas: lo que espera tu respuesta (Avisos), los agentes activos con
// su ficha, los worktrees de la orquestación, repartir una tarea entre agentes, el historial, el
// equipo de roles del proyecto y el kit (acciones y ajustes del plugin). Avisos, Worktrees e
// Historial viven en src/tabs/; el estado que comparten todas, en src/panel-state.ts. Encima de
// las pestañas va la acción en curso (src/ui/action-card.tsx): lo que se lanza desde aquí se ve aquí.
// Los ajustes son los mismos de Settings → Plugins → Orca Multiagent Kit: cambiarlos aquí o allí
// es lo mismo, y el worker se entera por `settings.onDidChange`.
// Orca transpila este fichero al cargarlo: no hay paso de build.
import {
  atom,
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Checkbox,
  Code,
  Collapsible,
  EmptyState,
  Heading,
  Input,
  KeyValue,
  plugin,
  read,
  RelativeTime,
  Row,
  Select,
  set,
  settings,
  Stack,
  Switch,
  Tab,
  Tabs,
  Text,
  Textarea,
  type PanelContext
} from 'orca'
import {
  CROSS_REVIEW,
  CUSTOM_REVIEWS,
  CUSTOM_ROLES_MAX,
  ROLE_GUARD_MAX,
  ROLE_LEVELS,
  ROLE_WORK_MAX,
  TASK_MAX,
  TASK_SOURCES,
  TEAM_PRESETS,
  TEAM_ROLES,
  agentLabel,
  agentOptions,
  draftFromPreset,
  emptyCustomRole,
  isValidAgentId,
  isValidRoleName,
  normalizeDraft,
  parseContractHintMode,
  teamFromDraft,
  type AgentLine,
  type ContractHintMode,
  type CrossReview,
  type CustomRole,
  type KitAction,
  type RoleId,
  type TaskSource,
  type TeamDraft,
  type TeamPreset
} from './kit.ts'
import { ask, busy, describeError, outcome } from './panel-state.ts'
import type { AgentsView } from './protocol.ts'
import { AutonomyCard, AutonomyOverride, runAutonomy } from './tabs/autonomy.tsx'
import { History, setupHistory } from './tabs/history.tsx'
import { Notices, noticesLabel, setupNotices } from './tabs/notices.tsx'
import { Worktrees, setupWorktrees } from './tabs/worktrees.tsx'
import { ActionCard, setupAction } from './ui/action-card.tsx'
import { AgentIcon } from './ui/agent-icon.tsx'

type Preferences = {
  contractHint: ContractHintMode
  autoOrchestrate: boolean
  statusBar: boolean
  notify: boolean
  initAgent: string
}

const DEFAULTS: Preferences = {
  contractHint: 'kit',
  autoOrchestrate: true,
  statusBar: true,
  notify: true,
  initAgent: 'claude'
}

const CONTRACT_OPTIONS: readonly { value: ContractHintMode; label: string }[] = [
  { value: 'kit', label: 'Solo despachos del kit' },
  { value: 'all', label: 'Todos los despachos' },
  { value: 'off', label: 'Desactivado' }
]

const ACTIONS: readonly { action: KitAction; label: string; hint: string }[] = [
  { action: 'verify', label: 'Verificar instalación', hint: 'omk verify: comprueba enlaces, imports y copias divergentes' },
  { action: 'init', label: 'Inicializar proyecto', hint: 'el agente de inicializar con «inicializa el proyecto»' },
  {
    action: 'update',
    label: 'Actualizar kit',
    hint: 'omk update: el paquete, ~/.agents, este proyecto (con los apartados nuevos de ORCHESTRATION.md) y este plugin'
  }
]

const PRESET_OPTIONS: readonly { value: TeamPreset | 'custom'; label: string }[] = [
  ...(Object.keys(TEAM_PRESETS) as TeamPreset[]).map((id) => ({ value: id, label: TEAM_PRESETS[id].label })),
  { value: 'custom', label: 'Personalizado' }
]

const CROSS_LABEL: Record<CrossReview, string> = {
  sensibles: 'Unidades L y sensibles',
  todas: 'Todas las unidades',
  nunca: 'Nunca'
}
const CROSS_OPTIONS = CROSS_REVIEW.map((value) => ({ value, label: CROSS_LABEL[value] }))
const LEVEL_OPTIONS = ROLE_LEVELS.map((value) => ({ value, label: `Nivel ${value}` }))
const REVIEW_OPTIONS = CUSTOM_REVIEWS.map(({ id, label }) => ({ value: id, label }))
const SOURCE_OPTIONS = TASK_SOURCES.map(({ id, label }) => ({ value: id, label }))
// Orca no admite una opción con valor vacío; este no puede ser un id de agente.
const AUTO_ROLE = { value: '(auto)', label: 'Lo elige el coordinador' }

const SOURCE_FIELD: Record<TaskSource, { label: string; placeholder: string }> = {
  chat: { label: 'Qué quieres hacer', placeholder: 'Login con Google y su pantalla de ajustes' },
  plan: { label: 'Qué plan (opcional)', placeholder: 'planes/sprint-3.md' },
  speckit: { label: 'Qué feature (opcional)', placeholder: '003-recargas' }
}

const preferences = atom<Preferences>(DEFAULTS)
const agents = atom<AgentsView | null>(null)
const team = atom<TeamDraft>('team', draftFromPreset('claude'), {
  persist: 'plugin',
  version: 2,
  migrate: (stored) => normalizeDraft(stored)
})
const task = atom('')
const source = atom<TaskSource>('chat')

function fromSettings(values: Record<string, unknown>): Preferences {
  return {
    contractHint: parseContractHintMode(values.contractHint),
    autoOrchestrate: values.autoOrchestrate !== false,
    statusBar: values.statusBar !== false,
    notify: values.notify !== false,
    initAgent: isValidAgentId(values.initAgent) ? values.initAgent : DEFAULTS.initAgent
  }
}

async function loadPreferences(): Promise<void> {
  try {
    set(preferences, fromSettings(await settings.get()))
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

// Lo que lanzan estas peticiones se sigue en la tarjeta de la acción en curso, no en el aviso.
const TRACKED = { tracked: true }

const run = (action: KitAction) => ask(action, () => plugin.request('kit.run', { action }), TRACKED)

const openAgent = (id: string) => ask('open', () => plugin.request('agents.open', { id }))

async function orchestrate(): Promise<void> {
  const autonomy = read(runAutonomy)
  const sent = await ask(
    'orchestrate',
    () =>
      plugin.request('team.orchestrate', {
        agent: read(team).coordinator,
        task: read(task),
        source: read(source),
        ...(autonomy ? { autonomy } : {})
      }),
    TRACKED
  )
  if (sent) set(task, '')
}

async function applyTeam(): Promise<void> {
  const ready = teamFromDraft(read(team))
  if (!ready) {
    set(outcome, { tone: 'danger', text: 'El equipo no es válido: revisa los proveedores y los roles propios.' })
    return
  }
  await ask('team', () => plugin.request('team.apply', { team: ready }), TRACKED)
}

const showTeam = () => ask('team', () => plugin.request('team.show'), TRACKED)

// Cualquier cambio a mano convierte el equipo en personalizado; el coordinador no cuenta.
const editTeam = (patch: Partial<TeamDraft>) => set(team, { ...read(team), ...patch, preset: 'custom' })
const setCoordinator = (coordinator: string) => {
  if (isValidAgentId(coordinator)) set(team, { ...read(team), coordinator })
}

function choosePreset(value: string): void {
  if (value === 'custom') set(team, { ...read(team), preset: 'custom' })
  else if (value in TEAM_PRESETS) set(team, { ...draftFromPreset(value as TeamPreset), custom: read(team).custom })
}

function toggleProvider(id: string, on: boolean): void {
  const { providers } = read(team)
  const next = on ? [...providers, id] : providers.filter((provider) => provider !== id)
  if (next.length > 0) editTeam({ providers: [...new Set(next)] })
}

function setRole(role: RoleId, provider: string): void {
  const roles = { ...read(team).roles }
  if (provider === AUTO_ROLE.value) delete roles[role]
  else roles[role] = provider
  editTeam({ roles })
}

function editCustom(index: number, patch: Partial<CustomRole>): void {
  editTeam({ custom: read(team).custom.map((role, i) => (i === index ? { ...role, ...patch } : role)) })
}

const addCustom = () => editTeam({ custom: [...read(team).custom, emptyCustomRole()] })
const removeCustom = (index: number) => editTeam({ custom: read(team).custom.filter((_, i) => i !== index) })

export function setup(ctx: PanelContext): void {
  ctx.subscriptions.push(plugin.on('agents.changed', (view) => set(agents, view)))
  ctx.subscriptions.push(settings.onDidChange(() => void loadPreferences()))
  void loadPreferences()
  setupNotices(ctx)
  setupWorktrees(ctx)
  setupHistory(ctx)
  setupAction(ctx)
  void plugin
    .request('agents.summary')
    .then((view) => set(agents, view))
    .catch((error: unknown) => set(outcome, { tone: 'danger', text: `Agentes no leídos: ${describeError(error)}` }))
}

function AgentCard({ agent }: { agent: AgentLine }) {
  const working = read(busy) !== null
  // Como en la lista de worktrees de Orca: el logo del agente delante del nombre.
  return (
    <Row gap="xs" align="start">
      <Box paddingY="sm">
        <AgentIcon agent={agent.agent} />
      </Box>
      <Box grow>
        <Collapsible
          title={agent.title}
          description={agent.detail ? `${agent.state} · ${agent.detail}` : agent.state}
          defaultOpen={agent.blocked}
        >
          <Stack gap="sm">
            <Row gap="xs" align="center" wrap>
              <Badge tone={agent.blocked ? 'warning' : 'neutral'}>{agent.state}</Badge>
              {agent.since === null ? null : (
                <Text muted size="xs">
                  desde <RelativeTime at={agent.since} />
                </Text>
              )}
            </Row>
            {agent.facts.length > 0 ? <KeyValue label={`Datos de ${agent.title}`} items={agent.facts} /> : null}
            {agent.canOpen ? (
              <Button variant="outline" size="sm" icon="open-external" disabled={working} onPress={() => openAgent(agent.id)}>
                Ir a su workspace
              </Button>
            ) : null}
          </Stack>
        </Collapsible>
      </Box>
    </Row>
  )
}

function Agents() {
  const view = read(agents)
  return (
    <Card title="Agentes activos" description={view && view.groups.length > 0 ? view.text : 'En todos los workspaces.'}>
      {view === null ? (
        <Text muted>Cargando…</Text>
      ) : view.groups.length === 0 ? (
        <EmptyState
          icon="agent"
          title="Ningún agente activo"
          description="Aparecen aquí en cuanto uno trabaja, espera o se bloquea."
        />
      ) : (
        <Stack gap="md">
          {view.groups.map((group) => (
            <Stack gap="xs">
              <Text weight="semibold" size="sm">
                {group.title}
              </Text>
              {group.agents.map((agent) => (
                <AgentCard agent={agent} />
              ))}
            </Stack>
          ))}
        </Stack>
      )}
    </Card>
  )
}

function Orchestrate() {
  const text = read(task)
  const from = read(source)
  const { coordinator } = read(team)
  const field = SOURCE_FIELD[from]
  const working = read(busy) !== null
  return (
    <Card
      title="Repartir una tarea entre agentes"
      description="Abre un agente coordinador en el workspace activo con la skill orca. No necesita spec-kit."
    >
      <Stack gap="md">
        <Text size="sm" muted>
          El coordinador lee la tarea, decide si compensa repartirla, te enseña el plan de rondas para que lo
          confirmes y lanza un agente por unidad, cada uno en su worktree y con su rol del equipo. Al terminar lo
          integra y te pide confirmar el merge. Los agentes aparecen en la pestaña Agentes.
        </Text>
        <Text size="sm" muted>
          No hace falta venir aquí: con el ajuste «Repartir al lanzar un agente con tarea» (pestaña Kit), cualquier
          agente que Orca arranca con una tarea, por ejemplo al crear un worktree, pasa primero por la skill orca.
        </Text>
        <Select
          label="De dónde sale el trabajo"
          value={from}
          options={SOURCE_OPTIONS}
          onChange={(value) => {
            const next = TASK_SOURCES.find(({ id }) => id === value)?.id
            if (next) set(source, next)
          }}
        />
        <Textarea
          label={field.label}
          rows={4}
          maxLength={TASK_MAX}
          value={text}
          placeholder={field.placeholder}
          onChange={(value) => set(task, value)}
          onSubmit={() => orchestrate()}
        />
        <Select label="Coordinador" value={coordinator} options={agentOptions([coordinator])} onChange={setCoordinator} />
        <AutonomyOverride />
        <Button icon="play" disabled={working || (from === 'chat' && text.trim() === '')} onPress={orchestrate}>
          {read(busy) === 'orchestrate' ? 'Lanzando…' : 'Repartir'}
        </Button>
      </Stack>
    </Card>
  )
}

type CustomRoleEditorProps = { role: CustomRole; index: number; others: string[]; providers: string[] }

function CustomRoleEditor({ role, index, others, providers }: CustomRoleEditorProps) {
  const nameOk = isValidRoleName(role.name, others)
  const providerOptions = [AUTO_ROLE, ...providers.map((id) => ({ value: id, label: agentLabel(id) }))]
  return (
    <Collapsible
      title={role.name.trim() || 'Rol nuevo'}
      description={role.work.trim() || 'Sin describir'}
      defaultOpen={!nameOk || role.work.trim() === ''}
    >
      <Stack gap="sm">
        <Input
          label="Nombre del rol"
          value={role.name}
          maxLength={30}
          placeholder="Hermes"
          invalid={!nameOk}
          onChange={(value) => editCustom(index, { name: value })}
        />
        <Input
          label="Qué hace"
          value={role.work}
          maxLength={ROLE_WORK_MAX}
          placeholder="Traducciones y textos de la interfaz"
          invalid={role.work.trim() === ''}
          onChange={(value) => editCustom(index, { work: value })}
        />
        <Select
          label="Nivel de modelo"
          value={role.level}
          options={LEVEL_OPTIONS}
          onChange={(value) => {
            const level = ROLE_LEVELS.find((candidate) => candidate === value)
            if (level) editCustom(index, { level })
          }}
        />
        <Select
          label="Revisión"
          value={role.review}
          options={REVIEW_OPTIONS}
          onChange={(value) => {
            const review = CUSTOM_REVIEWS.find((candidate) => candidate.id === value)?.id
            if (review) editCustom(index, { review })
          }}
        />
        <Select
          label="Proveedor"
          value={role.provider !== null && providers.includes(role.provider) ? role.provider : AUTO_ROLE.value}
          options={providerOptions}
          onChange={(value) => editCustom(index, { provider: value === AUTO_ROLE.value ? null : value })}
        />
        <Input
          label="Guardarraíl (opcional)"
          value={role.guard}
          maxLength={ROLE_GUARD_MAX}
          placeholder="No cambia textos legales sin revisión"
          onChange={(value) => editCustom(index, { guard: value })}
        />
        <Button variant="ghost" tone="danger" size="sm" icon="delete" onPress={() => removeCustom(index)}>
          Quitar rol
        </Button>
      </Stack>
    </Collapsible>
  )
}

function Team() {
  const draft = read(team)
  const { providers } = draft
  const providerOptions = [AUTO_ROLE, ...providers.map((id) => ({ value: id, label: agentLabel(id) }))]
  const fixed = TEAM_ROLES.filter(({ id }) => providers.includes(draft.roles[id] ?? '')).length
  const working = read(busy) !== null
  const ready = teamFromDraft(draft) !== null
  return (
    <Stack gap="md">
      <AutonomyCard />
      <Card
        title="Equipo"
        description="Quién hace cada rol. «Aplicar» lo escribe en ORCHESTRATION.md §1 del proyecto activo, que la skill orca lee al repartir."
      >
        <Stack gap="md">
          <Select label="Equipo predefinido" value={draft.preset} options={PRESET_OPTIONS} onChange={choosePreset} />
          <Collapsible title="Proveedores activos" description={providers.map(agentLabel).join(', ')}>
            <Stack gap="xs">
              {agentOptions(providers).map(({ value, label }) => (
                <Checkbox
                  label={label}
                  checked={providers.includes(value)}
                  disabled={providers.length === 1 && providers.includes(value)}
                  onChange={(on) => toggleProvider(value, on)}
                />
              ))}
            </Stack>
          </Collapsible>
          <Select
            label="Revisión cruzada"
            value={draft.cross}
            options={CROSS_OPTIONS}
            onChange={(value) => {
              const cross = CROSS_REVIEW.find((mode) => mode === value)
              if (cross) editTeam({ cross })
            }}
          />
          <Collapsible
            title="Roles de Olimpo"
            description={fixed === 0 ? 'Todos los elige el coordinador' : `${fixed} de ${TEAM_ROLES.length} fijados`}
          >
            <Stack gap="sm">
              {TEAM_ROLES.map((role) => {
                const provider = draft.roles[role.id] ?? AUTO_ROLE.value
                return (
                  <Select
                    label={`${role.name} · ${role.work} (nivel ${role.level})`}
                    value={providers.includes(provider) ? provider : AUTO_ROLE.value}
                    options={providerOptions}
                    onChange={(value) => setRole(role.id, value)}
                  />
                )
              })}
            </Stack>
          </Collapsible>
        </Stack>
      </Card>
      <Card title="Roles propios" description="Roles de este proyecto que no están en Olimpo. Van a la tabla «Roles propios del proyecto».">
        <Stack gap="sm">
          {draft.custom.length === 0 ? (
            <Text muted size="sm">
              Ninguno todavía.
            </Text>
          ) : null}
          {draft.custom.map((role, index) => (
            <CustomRoleEditor
              role={role}
              index={index}
              others={draft.custom.filter((_, i) => i !== index).map(({ name }) => name)}
              providers={providers}
            />
          ))}
          <Button variant="outline" icon="add" disabled={draft.custom.length >= CUSTOM_ROLES_MAX} onPress={addCustom}>
            Añadir rol
          </Button>
        </Stack>
      </Card>
      <Row gap="xs" wrap>
        <Button icon="check" disabled={working || !ready} onPress={applyTeam}>
          {read(busy) === 'team' ? 'Aplicando…' : 'Aplicar al proyecto'}
        </Button>
        <Button variant="outline" icon="file-text" disabled={working} onPress={showTeam}>
          Ver el del proyecto
        </Button>
      </Row>
    </Stack>
  )
}

function Actions() {
  const current = read(busy)
  return (
    <Card title="Acciones" description="Se ejecutan en el workspace activo. Su estado y su salida salen arriba, sobre las pestañas.">
      <Stack gap="sm">
        {ACTIONS.map(({ action, label, hint }) => (
          <Button
            icon={action === 'verify' ? 'check' : action === 'init' ? 'play' : 'refresh'}
            tooltip={hint}
            disabled={current !== null}
            onPress={() => run(action)}
          >
            {current === action ? `${label}…` : label}
          </Button>
        ))}
      </Stack>
    </Card>
  )
}

function Settings() {
  const prefs = read(preferences)
  return (
    <Card title="Ajustes" description="Los mismos que Settings → Plugins → Orca Multiagent Kit.">
      <Stack gap="md">
        <Select
          label="Contrato del worker en los despachos"
          value={prefs.contractHint}
          options={CONTRACT_OPTIONS}
          onChange={(value) => save('contractHint', parseContractHintMode(value))}
        />
        <Switch
          label="Repartir al lanzar un agente con tarea"
          checked={prefs.autoOrchestrate}
          onChange={(on) => save('autoOrchestrate', on)}
        />
        <Switch label="Agentes en la barra de estado" checked={prefs.statusBar} onChange={(on) => save('statusBar', on)} />
        <Switch label="Avisos de agentes" checked={prefs.notify} onChange={(on) => save('notify', on)} />
        <Select
          label="Agente para inicializar"
          value={prefs.initAgent}
          options={agentOptions([prefs.initAgent])}
          onChange={(value) => {
            if (isValidAgentId(value)) void save('initAgent', value)
          }}
        />
      </Stack>
    </Card>
  )
}

export default function Panel() {
  const last = read(outcome)
  return (
    <Stack gap="md">
      <Heading>Orca Multiagent Kit</Heading>
      {last ? (
        <Callout
          tone={last.tone}
          icon={last.tone === 'success' ? 'check' : 'error'}
          title={last.tone === 'success' ? 'Hecho' : 'No se pudo'}
        >
          <Stack gap="xs">
            <Text>{last.text}</Text>
            <Button variant="ghost" size="sm" icon="close" onPress={() => set(outcome, null)}>
              Cerrar
            </Button>
          </Stack>
        </Callout>
      ) : null}
      <ActionCard />
      <Tabs label="Secciones" defaultValue="notices">
        <Tab value="notices" label={noticesLabel()} icon="bell">
          <Notices />
        </Tab>
        <Tab value="agents" label="Agentes" icon="agent">
          <Agents />
        </Tab>
        <Tab value="worktrees" label="Worktrees" icon="branch">
          <Worktrees />
        </Tab>
        <Tab value="orchestrate" label="Repartir" icon="play">
          <Orchestrate />
        </Tab>
        <Tab value="history" label="Historial" icon="calendar">
          <History />
        </Tab>
        <Tab value="team" label="Equipo" icon="settings">
          <Team />
        </Tab>
        <Tab value="kit" label="Kit" icon="wrench">
          <Stack gap="md">
            <Actions />
            <Settings />
            <Text muted size="xs">
              «Actualizar kit» pone al día el paquete, <Code>~/.agents</Code>, el proyecto activo y este plugin; si
              el plugin nuevo pide más acceso, te lo pregunta arriba. Desde un terminal: <Code>omk setup</Code>{' '}
              prepara el entorno la primera vez, <Code>omk team</Code> enseña el equipo del proyecto y{' '}
              <Code>omk plugin status</Code> muestra el plugin.
            </Text>
          </Stack>
        </Tab>
      </Tabs>
    </Stack>
  )
}
