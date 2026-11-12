// El reparto de sucesos entre el núcleo del worker y las pestañas.
import { assert, test } from 'orca/testing'
import { createBus } from './context.ts'

const runDone = (run: string) => ({ run, notice: { title: run, body: '' }, at: 1 })

test('reparte cada suceso a sus oyentes en orden de registro', () => {
  const bus = createBus(() => assert.fail('nadie falla'))
  const seen: string[] = []
  bus.on('runDone', ({ run }) => seen.push(`a:${run}`))
  bus.on('runDone', ({ run }) => seen.push(`b:${run}`))
  bus.on('workspaceRemoved', () => seen.push('otro'))
  bus.emit('runDone', runDone('r1'))
  assert.deepEqual(seen, ['a:r1', 'b:r1'])
})

test('un oyente que falla queda en el log y no corta a los demás', () => {
  const logs: string[] = []
  const bus = createBus((message) => logs.push(message))
  const seen: string[] = []
  bus.on('runDone', () => {
    throw new Error('roto')
  })
  bus.on('runDone', ({ run }) => seen.push(run))
  bus.emit('runDone', runDone('r2'))
  assert.deepEqual(seen, ['r2'])
  assert.deepEqual(logs, ['oyente de «runDone» falló: roto'])
})

test('sin oyentes no pasa nada', () => {
  createBus(() => assert.fail('nadie falla')).emit('runDone', runDone('r3'))
})
