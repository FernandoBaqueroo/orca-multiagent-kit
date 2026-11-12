import { assert, test } from 'orca/testing'
import { agentIcon } from './icons.ts'

test('cada agente conocido tiene su logo y el resto el genérico', () => {
  assert.equal(agentIcon('claude'), 'assets/logos/claude.png')
  assert.equal(agentIcon('codex'), 'assets/logos/codex.png')
  assert.equal(agentIcon('antigravity'), 'assets/logos/antigravity.png')
  assert.equal(agentIcon('aider'), 'assets/logos/aider.png')
  assert.equal(agentIcon('zcode'), 'assets/logos/agent.png')
  assert.equal(agentIcon(null), 'assets/logos/agent.png')
  // Un id raro nunca sale de la carpeta de iconos.
  assert.equal(agentIcon('../../etc/passwd'), 'assets/logos/agent.png')
  assert.equal(agentIcon('constructor'), 'assets/logos/agent.png')
})
