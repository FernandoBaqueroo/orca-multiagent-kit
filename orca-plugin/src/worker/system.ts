// Lo que el worker hace fuera de la API de Orca, para que funcione también con agentes que corren
// como chat de Orca (sin terminal: la API no puede escribirles ni avisa de sus herramientas):
// - leer los `plan.json` de la skill orca del disco, y
// - mandar la respuesta de la persona al buzón del run con `orca orchestration send`, que Orca
//   entrega en el chat del coordinador.
// Nunca pasa por una shell: `execFile` con los argumentos tal cual. Los tests lo sustituyen.

/** Un `plan.json` de `<workspace>/.work/runs/<run>/`. */
export type PlanFile = { path: string; mtimeMs: number; content: string }

export type KitSystem = {
  /** Los `plan.json` de un workspace, cambiados después de `since` (ms desde epoch). */
  readPlans(workspacePath: string, since: number): Promise<PlanFile[]>
  /** Manda `body` al buzón del run de Orca `orcaRun`: le llega al coordinador en su chat. */
  sendToRun(orcaRun: string, subject: string, body: string): Promise<void>
}

export const PLAN_FILE_MAX = 64 * 1024
// Un id de run de Orca (`run_4fbb2d2e147c`) y una carpeta de run del kit (`20261112-plugin-avisos`).
export const ORCA_RUN = /^run_[a-z0-9]{4,40}$/
const KIT_RUN = /^(?!\.+$)[\w.-]{1,80}$/
const RUNS_MAX = 50
const SEND_TIMEOUT_MS = 20_000

// Lo que falta es lo normal (no hay run, ni plan, ni esa ruta en esta plataforma); otro error sube.
const isMissing = (error: unknown) => {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'ENOENT' || code === 'ENOTDIR'
}

/** La CLI de Orca que viene con la app que ejecuta este worker. */
async function orcaCli(): Promise<string> {
  const path = await import('node:path')
  const fs = await import('node:fs/promises')
  const app = path.dirname(process.execPath)
  const candidates =
    process.platform === 'win32'
      ? [path.join(app, 'resources', 'bin', 'orca.exe')]
      : [path.join(app, 'resources', 'bin', 'orca'), path.join(app, '..', 'Resources', 'bin', 'orca')]
  for (const file of candidates) {
    try {
      await fs.access(file)
      return file
    } catch (error) {
      if (!isMissing(error)) throw error
    }
  }
  throw Object.assign(new Error('no encuentro la CLI de Orca junto a la app'), { code: 'unavailable' })
}

/**
 * El entorno de la CLI. Orca arranca el worker con un entorno mínimo (sin `APPDATA` ni `HOME`), y
 * sin ellos la CLI no encuentra el runtime. Se completan desde la carpeta del usuario.
 */
async function cliEnv(): Promise<Record<string, string | undefined>> {
  const os = await import('node:os')
  const path = await import('node:path')
  const home = os.homedir()
  const env: Record<string, string | undefined> = { ...process.env, HOME: process.env.HOME ?? home }
  delete env.ELECTRON_RUN_AS_NODE
  if (process.platform === 'win32') {
    env.USERPROFILE ??= home
    env.APPDATA ??= path.join(home, 'AppData', 'Roaming')
    env.LOCALAPPDATA ??= path.join(home, 'AppData', 'Local')
  }
  return env
}

export function createNodeSystem(): KitSystem {
  return {
    async readPlans(workspacePath, since) {
      const fs = await import('node:fs/promises')
      const path = await import('node:path')
      const runsDir = path.join(workspacePath, '.work', 'runs')
      let runs: string[]
      try {
        runs = await fs.readdir(runsDir)
      } catch (error) {
        // Sin `.work/runs/` no hay planes: es lo normal fuera de un run del kit.
        if (isMissing(error)) return []
        throw error
      }
      const plans: PlanFile[] = []
      for (const run of runs.filter((name) => KIT_RUN.test(name)).slice(-RUNS_MAX)) {
        const file = path.join(runsDir, run, 'plan.json')
        try {
          // `lstat`: un enlace simbólico no cuenta, solo un fichero de verdad dentro del run.
          const stat = await fs.lstat(file)
          if (!stat.isFile() || stat.size > PLAN_FILE_MAX || stat.mtimeMs <= since) continue
          plans.push({ path: file, mtimeMs: stat.mtimeMs, content: await fs.readFile(file, 'utf8') })
        } catch (error) {
          // Ese run no tiene plan.json (o desapareció mientras se leía).
          if (!isMissing(error)) throw error
        }
      }
      return plans
    },

    async sendToRun(orcaRun, subject, body) {
      if (!ORCA_RUN.test(orcaRun)) throw Object.assign(new Error('id de run de Orca no válido'), { code: 'invalid_params' })
      const [cp, cli, env] = await Promise.all([import('node:child_process'), orcaCli(), cliEnv()])
      const handle = `run:${orcaRun}`
      // `--from` el propio run: el plugin no es un terminal de Orca y la CLI pide un remitente.
      const args = ['orchestration', 'send', '--from', handle, '--to', handle, '--subject', subject, '--body', body, '--json']
      const stdout = await new Promise<string>((resolve, reject) => {
        cp.execFile(cli, args, { timeout: SEND_TIMEOUT_MS, windowsHide: true, env, maxBuffer: 1024 * 1024 }, (error, out) =>
          error && !out ? reject(error) : resolve(out)
        )
      })
      let reply: { ok?: boolean; error?: { code?: string; message?: string } }
      try {
        reply = JSON.parse(stdout) as typeof reply
      } catch {
        throw Object.assign(new Error('la CLI de Orca no respondió en JSON'), { code: 'unavailable' })
      }
      if (reply.ok !== true) {
        const message = `${reply.error?.code ?? 'error'}: ${String(reply.error?.message ?? '').split('\n')[0]}`
        throw Object.assign(new Error(`Orca no entregó el mensaje (${message})`), { code: 'unavailable' })
      }
    }
  }
}
