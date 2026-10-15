// The hooks module of clawd-music: session start and end, the band above the
// prompt, the Claude Music pane, and the slash commands. Everything the
// person sees goes through panes, bands, status, toasts and commands; no
// prompt text is injected and no skill or agent is shipped.
//
// The engine's $ is used only in this file. makeIo() turns it into the narrow
// Io door the other modules take, so no module outside this file receives $.
// The state atoms are declared here too, with literal references, because the
// engine's state library reads only references it can see in this file.

import type { EngineInterface, Register } from 'claude-code'
import { atom, read, update } from 'claude-code'
import { bandTree } from '../src/band'
import { COMMAND_SPECS, registerCommands, runCommand } from '../src/commands'
import { endSession, ensureTicker, noteStaleSession, startSession } from '../src/controller'
import type { Io } from '../src/io'
import { paneTree } from '../src/pane'
import { INITIAL_ANIM, INITIAL_CATALOG, INITIAL_PANE, INITIAL_PLAYER, INITIAL_SESSION, INITIAL_TOOLS } from '../src/state'

const playerAtom = atom({ plugin: 'clawd-music', key: 'player' } as const, INITIAL_PLAYER)
const animAtom = atom({ plugin: 'clawd-music', key: 'anim' } as const, INITIAL_ANIM)
const catalogAtom = atom({ plugin: 'clawd-music', key: 'catalog' } as const, INITIAL_CATALOG)
const toolsAtom = atom({ plugin: 'clawd-music', key: 'tools' } as const, INITIAL_TOOLS)
const paneAtom = atom({ plugin: 'clawd-music', key: 'pane' } as const, INITIAL_PANE)
const sessionAtom = atom({ plugin: 'clawd-music', key: 'session' } as const, INITIAL_SESSION)

function makeIo($: EngineInterface): Io {
  return {
    pluginRoot: $.plugin.root,
    readText: path => $.fs.read(path),
    now: () => $.clock.now(),
    player: {
      read: () => read($, playerAtom),
      update: change => update($, playerAtom, change),
    },
    anim: {
      read: () => read($, animAtom),
      update: change => update($, animAtom, change),
    },
    catalog: {
      read: () => read($, catalogAtom),
      update: change => update($, catalogAtom, change),
    },
    tools: {
      read: () => read($, toolsAtom),
      update: change => update($, toolsAtom, change),
    },
    pane: {
      read: () => read($, paneAtom),
      update: change => update($, paneAtom, change),
    },
    session: {
      read: () => read($, sessionAtom),
      update: change => update($, sessionAtom, change),
    },
    exists: path => $.fs.exists(path),
    envPath: () => $.env.get('PATH'),
    envSystemRoot: () => $.env.get('SystemRoot'),
    run: (argv, timeoutMs) => $.process.run([...argv], { timeoutMs }),
    spawn: argv => $.process.spawn({ argv: [...argv] }),
    getStore: key => $.store.get(key),
    setStore: (key, value) => $.store.set(key, value),
    toast: (text, timeoutMs) => $.ui.toast(text, { timeoutMs }),
    status: text => $.ui.status(text),
    debug: text => $.ui.log(text, { to: 'debug' }),
    after: (ms, fn) => $.clock.after(ms, fn),
    every: (ms, fn) => $.clock.every(ms, fn),
    open: async args => {
      const opened = await $.ui.open({
        id: args.id,
        title: args.title,
        focus: true,
        closeOnEscape: true,
        rows: args.rows,
        columns: args.columns,
      })
      return opened.isPlaced ? { isPlaced: true, reason: '' } : { isPlaced: false, reason: opened.reason }
    },
    registerCommand: async spec => {
      await $.command.register(spec)
    },
  }
}

export const register: Register = (on, _options) => {
  on('session.start', async ($, e, next) => {
    const io = makeIo($)
    await registerCommands(io)
    await startSession(io, e)
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await endSession(makeIo($), e.reason)
    return next(e)
  })

  // The render hooks start the ticker when it is not running: after a hot
  // reload no session.start follows, and drawing is what runs again first.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const io = makeIo($)
    ensureTicker(io)
    noteStaleSession(io)
    const tree = await bandTree(io, $.ui.resolve(e), e)
    return tree ?? next(e)
  })

  on('ui.render', { component: 'Pane', requestId: 'claude-music' }, async ($, e) => {
    const io = makeIo($)
    ensureTicker(io)
    noteStaleSession(io)
    if (e.surface === 'mobile') return paneTree(io, $.ui.resolve(e), null, e.props.bodyColumns)
    const table = $.ui.resolve(e)
    return paneTree(io, table, table.Input, e.props.bodyColumns)
  })

  for (const spec of COMMAND_SPECS) {
    // The handler is async: a command.run hook's catch must answer a promise of the hook's result.
    on('command.run', { command: spec.name }, ($, e) => runCommand(makeIo($), spec.name, e.args)).catch(async () => ({
      text: `Claude Music: /${spec.name} failed; see the debug log.`,
    }))
  }
}
