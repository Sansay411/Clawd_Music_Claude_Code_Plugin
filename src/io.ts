// The narrow door the modules use to reach the engine. hooks/register.tsx
// builds one from each hook's $ (the engine's own $ never leaves that file),
// so every module below stays free of $ and only sees these functions.

import type { Anim, Catalog, PaneState, Player, Session, Tools } from '../types'

export type Timer = { cancel: () => void }

export type Chunk = { stream: 'stdout' | 'stderr'; text: string }

export type Spawned = AsyncIterable<Chunk> & {
  readonly result: Promise<{ code: number | null; signal: string | null }>
}

export type RunResult = { exitCode: number; stdout: string; stderr: string }

export type OpenArgs = { id: string; title: string; rows: number; columns: number }

export type OpenOutcome = { isPlaced: boolean; reason: string }

export type CommandSpec = {
  name: string
  description: string
  argumentHint?: string
  immediate?: true
}

// One atom of the mod's state: read it, or write it with a change function.
export type Slot<T> = {
  read: () => Promise<T>
  update: (change: (value: T) => T) => Promise<T>
}

export type Io = {
  pluginRoot: string
  // Reads a text file by its absolute path (the plugin's own config).
  readText: (path: string) => Promise<string>
  now: () => Promise<number>
  player: Slot<Player>
  anim: Slot<Anim>
  catalog: Slot<Catalog>
  tools: Slot<Tools>
  pane: Slot<PaneState>
  session: Slot<Session>
  // Whether a file or folder exists at an absolute path (the engine's fs.exists).
  exists: (path: string) => Promise<boolean>
  // The process environment's PATH and SystemRoot, when set.
  envPath: () => Promise<string | undefined>
  envSystemRoot: () => Promise<string | undefined>
  run: (argv: readonly string[], timeoutMs: number) => Promise<RunResult>
  spawn: (argv: readonly string[]) => Spawned
  getStore: (key: string) => Promise<unknown>
  setStore: (key: string, value: unknown) => Promise<void>
  toast: (text: string, timeoutMs: number) => void
  status: (text: string | undefined) => void
  debug: (text: string) => void
  after: (ms: number, fn: () => void) => Timer
  every: (ms: number, fn: () => void) => Timer
  open: (args: OpenArgs) => Promise<OpenOutcome>
  registerCommand: (spec: CommandSpec) => Promise<void>
}
