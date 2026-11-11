// Contrato entre el panel (src/panel.tsx) y el worker (src/worker.ts), declarado una sola vez.
import type { AgentLine, AgentSummary, KitAction } from './kit.ts'

/** Lo que el panel muestra de los agentes: el resumen de la barra y cada agente activo. */
export type AgentsView = AgentSummary & { agents: AgentLine[] }

declare module 'orca' {
  interface PluginRequests {
    /** Ejecuta una acción del kit en el workspace activo y responde qué ha hecho. */
    'kit.run': { input: { action: KitAction }; output: { message: string } }
    /** Los agentes activos, como los cuenta la barra de estado. */
    'agents.summary': { output: AgentsView }
  }
  interface PluginPanelEvents {
    /** Se envía a los paneles abiertos cuando cambia lo que cuentan los agentes. */
    'agents.changed': AgentsView
  }
}
