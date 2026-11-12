// Leer y validar el modelo de Claude Code.
import { assert, test } from 'orca/testing'
import { CLAUDE_MODELS, isModelId, modelFromCommand } from './models.ts'

test('lee --model de la orden de arranque, con espacio, con = y entre comillas', () => {
  assert.equal(modelFromCommand('claude --model sonnet --permission-mode plan'), 'sonnet')
  assert.equal(modelFromCommand('claude --model=opus'), 'opus')
  assert.equal(modelFromCommand('claude --model "haiku" -p x'), 'haiku')
  assert.equal(modelFromCommand("claude --model 'claude-test-9[1m]'"), 'claude-test-9[1m]')
})

test('sin --model, o con un valor que no es un modelo, no hay modelo', () => {
  assert.equal(modelFromCommand('claude --permission-mode plan'), null)
  assert.equal(modelFromCommand('claude --model'), null)
  assert.equal(modelFromCommand('claude --model "opus; rm -rf /"'), null)
  assert.equal(modelFromCommand('claude --model-x sonnet'), null)
  assert.equal(modelFromCommand('claude --modelo=sonnet'), null)
})

test('un modelo válido es un alias o un id acotado', () => {
  for (const { value } of CLAUDE_MODELS) assert.equal(isModelId(value), true)
  assert.equal(isModelId('modelo-x_1.2'), true)
  assert.equal(isModelId('modelo-x-1.2[1m]'), true)
  assert.equal(isModelId('a'.repeat(64)), true)
  for (const bad of ['', 'a'.repeat(65), 'Opus', 'opus; rm -rf /', 'opus\n', '-opus', 'opus[2m]', 'opus [1m]', 7, null]) {
    assert.equal(isModelId(bad), false, String(bad))
  }
})
