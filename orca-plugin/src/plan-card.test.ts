import { assert, test } from 'orca/testing'
import { parsePlan, planPathRun } from './plan-card.ts'

const unit = (extra: Record<string, unknown> = {}) => ({
  round: 1,
  id: 'U2',
  title: 'recarga con tarjeta (P1)',
  role: 'Ariadna',
  level: 'alto',
  agent: 'claude',
  model: null,
  resource: 'worker',
  files: '11',
  depends: 'U0',
  ...extra
})
const plan = (extra: Record<string, unknown> = {}) => ({
  version: 1,
  run: '20261107-recargas',
  source: 'spec-kit 003-recargas',
  autonomy: 'semi',
  base: null,
  integration: 'feat/003-recargas',
  merge: 'feat/003-recargas → main',
  units: [unit()],
  notes: ['modelos: nuevo'],
  ...extra
})

test('un plan válido sale tal cual, con lo que falte a null', () => {
  const parsed = parsePlan(plan())
  assert.equal(parsed?.run, '20261107-recargas')
  assert.equal(parsed?.base, null)
  assert.deepEqual(parsed?.units[0], unit())
  assert.deepEqual(parsed?.notes, ['modelos: nuevo'])
  const minimal = parsePlan({ version: 1, run: 'r1', units: [] })
  assert.deepEqual(minimal, { run: 'r1', source: null, autonomy: null, base: null, integration: null, merge: null, units: [], notes: [] })
})

test('limpia los textos y los acota a 200 caracteres', () => {
  const parsed = parsePlan(plan({ source: `a\u001b[31m\nb ${'x'.repeat(300)}` }))
  assert.equal(parsed?.source?.length, 200)
  assert.equal(/[\u0000-\u001f]/.test(parsed?.source ?? ''), false)
})

test('lo que no encaje da null, nunca lanza', () => {
  const invalid: unknown[] = [
    null,
    'texto',
    [],
    plan({ version: 2 }),
    plan({ version: undefined }),
    plan({ run: undefined }),
    plan({ run: 'con espacios' }),
    plan({ run: '..' }),
    plan({ run: 'a'.repeat(81) }),
    plan({ units: 'U1' }),
    plan({ units: [null] }),
    plan({ units: [unit({ round: '1' })] }),
    plan({ units: [unit({ round: -1 })] }),
    plan({ units: [unit({ round: 1.5 })] }),
    plan({ units: [unit({ id: 3 })] }),
    plan({ units: [unit({ title: '' })] }),
    plan({ units: [unit({ role: 7 })] }),
    plan({ units: [unit({ resource: undefined })] }),
    plan({ notes: 'una' }),
    plan({ notes: [1] }),
    plan({ merge: 4 })
  ]
  for (const value of invalid) assert.equal(parsePlan(value), null, JSON.stringify(value))
})

test('60 unidades caben; 61 se rechazan; las notas se quedan en 10', () => {
  assert.equal(parsePlan(plan({ units: Array.from({ length: 60 }, () => unit()) }))?.units.length, 60)
  assert.equal(parsePlan(plan({ units: Array.from({ length: 61 }, () => unit()) })), null)
  assert.equal(parsePlan(plan({ notes: Array.from({ length: 15 }, (_, i) => `n${i}`) }))?.notes.length, 10)
})

test('el run de la ruta de un plan.json, con / o con \\', () => {
  assert.equal(planPathRun('/repo/.work/runs/r1/plan.json'), 'r1')
  assert.equal(planPathRun('C:\\repo\\.work\\runs\\20261112-x.y\\plan.json'), '20261112-x.y')
  assert.equal(planPathRun('.work/runs/r1/plan.json'), 'r1')
  for (const path of [
    '/repo/.work/runs/r1/run.md',
    '/repo/.work/runs/plan.json',
    '/repo/.work/runs/../plan.json',
    '/repo/x.work/runs/r1/plan.json',
    '/repo/.work/runs/r 1/plan.json',
    '/repo/.work/runs/r1/sub/plan.json',
    ''
  ]) {
    assert.equal(planPathRun(path), null, path)
  }
})
