// Contrato entre el panel (src/panel.tsx) y el worker (src/worker.ts), declarado una sola vez.
import type { AgentGroup, AgentSummary, KitAction, TaskSource, Team } from './kit.ts'

/** Lo que el panel muestra de los agentes: el resumen de la barra y los activos, agrupados. */
export type AgentsView = AgentSummary & { groups: AgentGroup[] }

declare module 'orca' {
  interface PluginRequests {
    /** Ejecuta una acción del kit en el workspace activo y responde qué ha hecho. */
    'kit.run': { input: { action: KitAction }; output: { message: string } }
    /** Los agentes activos, como los cuenta la barra de estado. */
    'agents.summary': { output: AgentsView }
    /** Muestra el workspace de un agente (`id` de una `AgentLine`). */
    'agents.open': { input: { id: string }; output: { message: string } }
    /** Escribe el equipo en `ORCHESTRATION.md` del workspace activo con `omk team set`. */
    'team.apply': { input: { team: Team }; output: { message: string } }
    /** Enseña en un terminal el equipo que tiene el proyecto (`omk team`). */
    'team.show': { output: { message: string } }
    /** Lanza el coordinador con la skill `orca`, la entrada elegida y la tarea en el workspace activo. */
    'team.orchestrate': { input: { agent: string; task: string; source: TaskSource }; output: { message: string } }
  }
  interface PluginPanelEvents {
    /** Se envía a los paneles abiertos cuando cambia lo que cuentan los agentes. */
    'agents.changed': AgentsView
  }
}
