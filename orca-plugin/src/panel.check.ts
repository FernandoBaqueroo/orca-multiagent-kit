// Escenarios de `orca plugin check` y de `orca plugin shot . --scenario <nombre>`: el panel con una
// acción en curso, una que pregunta y una que falló, sin lanzar nada de verdad.
import { defineCheck } from 'orca/testing'
import type { ActionView } from './protocol.ts'

const action = (patch: Partial<ActionView>): { action: ActionView } => ({
  action: {
    id: 'a1',
    kind: 'omk',
    title: 'omk update',
    state: 'running',
    detail: null,
    startedAt: Date.now() - 40_000,
    endedAt: null,
    lines: [
      '  ◆ ORCA MULTIAGENT KIT  v1.7.0',
      '    Claude Code · Codex',
      '',
      '  ✓ Fuente única en ~/.agents     núcleo · 31 reglas · 6 skills · extensión de spec-kit',
      '      + actualizada de v1.6.0 a v1.7.0',
      '  ✓ Claude Code',
      '  ✓ Proyecto app',
      '      + AGENTS.md actualizado (tu contenido se conserva)',
      '      = ORCHESTRATION.md ya existía: se conserva'
    ],
    canAnswer: false,
    ...patch
  }
})

export default defineCheck({
  'sin-accion': {},
  'accion-en-curso': { requests: { 'kit.action': action({}) } },
  'accion-pregunta': {
    requests: {
      'kit.action': action({
        state: 'asking',
        detail: 'omk pregunta antes de seguir: lee en la salida lo que pide y contesta aquí o en su terminal.',
        canAnswer: true,
        lines: [
          '  ◆ Plugin de Orca',
          '',
          '  Orca pide tu aprobación para Orca Multiagent Kit 0.7.0',
          '      · Runs its own code in a separate Node.js process.',
          '      · terminal:send: Type and run commands in your terminals, local and SSH',
          '      · terminal:read: Read the output of your terminals',
          '  › ¿Apruebas este acceso? [s/N]'
        ]
      })
    }
  },
  'accion-fallo': {
    requests: {
      'kit.action': action({
        title: 'omk verify',
        state: 'failed',
        detail: 'Terminó con errores (código 1): míralos en la salida.',
        endedAt: Date.now() - 5000,
        lines: [
          '  ◆ VERIFICACIÓN',
          '    Claude Code',
          '',
          '  ✓ núcleo en ~/.agents/AGENTS.md (v1.7.0)',
          '  ✗ Claude Code: skills copiadas en vez de enlazadas (acabarán divergiendo; ejecuta omk install): orca',
          '',
          '  ✗ 1 fallo  repáralos con omk install'
        ]
      })
    }
  }
})
