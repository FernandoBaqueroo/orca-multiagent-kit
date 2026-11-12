import { assert, test } from 'orca/testing'
import { agentIcon } from './icons.ts'

test('cada agente conocido tiene su logo y el resto el genérico', () => {
  assert.equal(agentIcon('claude'), 'assets/agents/claude.png')
  assert.equal(agentIcon('codex'), 'assets/agents/openai.png')
  assert.equal(agentIcon('antigravity'), 'assets/agents/google.png')
  assert.equal(agentIcon('aider'), 'assets/agents/agent.png')
  assert.equal(agentIcon(null), 'assets/agents/agent.png')
  // Un id raro nunca sale de la carpeta de iconos.
  assert.equal(agentIcon('../../etc/passwd'), 'assets/agents/agent.png')
  assert.equal(agentIcon('constructor'), 'assets/agents/agent.png')
})
