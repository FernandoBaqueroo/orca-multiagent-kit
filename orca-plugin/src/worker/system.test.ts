// Lo que el worker lee del disco para los chats de Orca, contra una carpeta temporal de verdad.
import { afterEach, assert, test } from 'orca/testing'
import { mkdir, mkdtemp, rm, symlink, utimes, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createNodeSystem, PLAN_FILE_MAX } from './system.ts'

let dir: string | null = null
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true })
  dir = null
})

const plan = async (root: string, run: string, content: string, mtimeSeconds: number) => {
  await mkdir(join(root, '.work', 'runs', run), { recursive: true })
  const file = join(root, '.work', 'runs', run, 'plan.json')
  await writeFile(file, content)
  await utimes(file, mtimeSeconds, mtimeSeconds)
  return file
}

test('lee los plan.json nuevos de .work/runs y nada más', async () => {
  dir = await mkdtemp(join(tmpdir(), 'omk-plans-'))
  const old = 1_000_000
  const fresh = 2_000_000
  await plan(dir, 'viejo', '{"v":"viejo"}', old)
  const nuevo = await plan(dir, 'nuevo', '{"v":"nuevo"}', fresh)
  await plan(dir, 'enorme', 'x'.repeat(PLAN_FILE_MAX + 1), fresh)
  await plan(dir, 'con espacio', '{}', fresh)
  const plans = await createNodeSystem().readPlans(dir, (old + 1) * 1000)
  assert.deepEqual(plans.map(({ path, content }) => ({ path, content })), [{ path: nuevo, content: '{"v":"nuevo"}' }])
})

test('un enlace simbólico en lugar del plan.json no se sigue', async () => {
  dir = await mkdtemp(join(tmpdir(), 'omk-plans-'))
  await writeFile(join(dir, 'secreto.txt'), 'no')
  await mkdir(join(dir, '.work', 'runs', 'r1'), { recursive: true })
  try {
    await symlink(join(dir, 'secreto.txt'), join(dir, '.work', 'runs', 'r1', 'plan.json'))
  } catch (error) {
    // Windows sin modo desarrollador no deja crear enlaces: no hay nada que probar.
    assert.equal((error as { code?: unknown }).code, 'EPERM')
    return
  }
  assert.deepEqual(await createNodeSystem().readPlans(dir, 0), [])
})

test('sin .work/runs no hay planes', async () => {
  dir = await mkdtemp(join(tmpdir(), 'omk-plans-'))
  assert.deepEqual(await createNodeSystem().readPlans(dir, 0), [])
  assert.deepEqual(await createNodeSystem().readPlans(join(dir, 'no-existe'), 0), [])
})

test('un id de run que no es de Orca no llega a la CLI', async () => {
  for (const id of ['run_x; rm -rf ~', '--help', 'run:otro', '']) {
    await assert.rejects(createNodeSystem().sendToRun(id, 'asunto', 'sí'), /no válido/)
  }
})
