// Lo poco de Node que usa src/worker/system.ts. El worker es `trusted-worker`: Orca lo ejecuta en
// Node, pero sus tipos no traen los de Node. Solo se declara lo que se usa.
declare const process: {
  readonly execPath: string
  readonly platform: string
  readonly env: Record<string, string | undefined>
}

declare module 'node:fs/promises' {
  export function readdir(path: string): Promise<string[]>
  export function lstat(path: string): Promise<{ isFile(): boolean; isDirectory(): boolean; size: number; mtimeMs: number }>
  export function readFile(path: string, encoding: 'utf8'): Promise<string>
  export function access(path: string): Promise<void>
  // Solo para los tests de src/worker/system.test.ts.
  export function mkdtemp(prefix: string): Promise<string>
  export function mkdir(path: string, options: { recursive: true }): Promise<unknown>
  export function writeFile(path: string, data: string): Promise<void>
  export function utimes(path: string, atime: number, mtime: number): Promise<void>
  export function symlink(target: string, path: string): Promise<void>
  export function rm(path: string, options: { recursive: true; force: true }): Promise<void>
}

declare module 'node:path' {
  export function join(...parts: string[]): string
  export function dirname(path: string): string
}

declare module 'node:os' {
  export function homedir(): string
  export function tmpdir(): string
}

declare module 'node:child_process' {
  export function execFile(
    file: string,
    args: readonly string[],
    options: { timeout: number; windowsHide: boolean; env: Record<string, string | undefined>; maxBuffer: number },
    callback: (error: (Error & { code?: unknown }) | null, stdout: string, stderr: string) => void
  ): unknown
}
