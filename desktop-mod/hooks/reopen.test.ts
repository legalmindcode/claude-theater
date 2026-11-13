// THE REOPEN (register.tsx; pane-mark.ts): the desktop app ends the engine process of a conversation that sat idle
// while memory is short, and of every conversation when it restarts, and starts a new one when the person returns —
// with the same conversation id, but with no pane: the pane roster is the process's own. So the poll mirrors the
// roster into one `$.store` key per conversation (written when the pane is first found SHOWN, deleted when it is no
// longer listed), and a new process, REOPEN_DELAY_MS after session.start, opens the pane again when its
// conversation's mark is there, not too old, and no pane is listed. Desktop only: under the terminal nothing changes.
//
// A SECOND PROCESS in these tests is a fresh test (a fresh module: its memory is empty, as a new process's is) whose
// store is seeded with the mark and whose roster starts empty (`captured.paneOpen = false`). The mirror is never
// awaited by the poll, so a test lets it land with a clock step before it reads the store.
//
// WHAT THE KIT CANNOT SHOW (the live checks): that the new process reads the SAME id through `$.session.id()`; that
// the app-hosted engine's session.start does not say `terminal`; that an unasked opening made from a timer is placed
// by the desktop page; that the roster is not emptied while the process dies (the session.end guard below is the
// insurance); two processes writing the store at once (the engine's lock).

import { expect, test } from 'claude-code/testing'

import type { Agent } from './model'
import { CLIENT_RETRY_MS, PANE_ENDED_ASKS, PANE_FORGET_TRIES, PANE_MARKS_MAX, PANE_MARK_TTL_MS, PERSONA_EMOJI, POLL_MS, REOPEN_DELAY_MS, STORE_PANE_PREFIX } from './model'
import { OFFICE_LOG_PREFIX, officeLogKey, type OfficeLogEntry } from './office-log'
import { OFFICE_KEY } from './office-props'
import { T0, beneath } from './test-kit'

/** This conversation's mark (the kit's $.session.id answers `test-session`). */
const KEY = `${STORE_PANE_PREFIX}test-session`
const PANE = {
  plugin: 'agent-theater', component: 'Pane', requestId: 'agent-theater',
  props: { title: 'T', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const THEATER = { command: 'theater', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const
const PREFS = () => ({ prefs: { lang: 'he', muted: false, showDone: false, pins: [] } })
const DESKTOP_START = { cwd: 'C:/x', surface: 'desktop', isInteractive: true } as const
/** How the app-hosted engine starts (read in the engine's code: no surface yet, not interactive). */
const HOSTED_START = { cwd: 'C:/x', surface: null, isInteractive: false } as const
/** Every $.state key the mod declares (types/index.d.ts): the mark adds none. */
const STATE_KEYS = ['payload', 'scanError', 'view', 'tick', 'prefs', 'sessionId', 'paneOpened']
const SPAWN = (id: string) => ({ tool_use_id: id, prompt: 'Read it.', description: `desc ${id}`, subagentType: 'Explore', parentModel: 'opus' })
const END = (reason: 'clear' | 'resume' | 'logout' | 'prompt_input_exit' | 'other') => ({ reason, sessionId: 'test-session', resume: { id: 'test-session' } })

function agent(over: Partial<Agent> & { id: string }): Agent {
  return {
    persona_id: 3, emoji: PERSONA_EMOJI[3] ?? '', role: '', subagent_type: 'Explore', status: 'running', tool: 'Read', phase: 'tool',
    task: `Task of ${over.id}.`, task_short: `Task of ${over.id}.`, result: null, start_ms: T0 - 30_000, end_ms: null,
    session: 'sess-aaa', session_full: 'sess-aaaa-1111-frontend', cwd: '/home/dev/acme-web', project: '/home/dev/acme-web', mtime_ms: T0 - 1000,
    is_session: false, closed: false, is_workflow: false, truncated: false, model: 'claude-opus-5-5', ...over,
  }
}
/** A lead and one helper at work: an office the Client draws. */
const office = (): Agent[] => [agent({ id: 'lead-a', is_session: true, tool: '', phase: 'thinking', topic: 'Ship it.' }), agent({ id: 'a1', role: 'map the tokens', persona_id: 7 })]

/** THE RECORD's entries (office-log.ts) as the store holds them, in the order written. */
function recordOf(store: Record<string, unknown>): Array<OfficeLogEntry & { key: string }> {
  const part = (k: string): [number, number] => {
    const p = k.slice(OFFICE_LOG_PREFIX.length).split(':')
    return [Number(p[0]), Number(p[p.length - 1])]
  }
  return Object.keys(store).filter(k => k.startsWith(OFFICE_LOG_PREFIX))
    .sort((a, b) => part(a)[0] - part(b)[0] || part(a)[1] - part(b)[1])
    .map(k => ({ key: k, ...(store[k] as OfficeLogEntry) }))
}
const paneKeys = (store: Record<string, unknown>): string[] => Object.keys(store).filter(k => k.startsWith(STORE_PANE_PREFIX))

// (every test here mounts or polls through the kit for mocked minutes: the budgets are load headroom, as register.test.ts's)

test('THE MARK: the poll that first finds the pane shown writes this conversation\'s mark — ONE $.store write, no $.state key of its own — and nothing more is written to the store while the pane stays (raised again twice, two minutes of polls)', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], PREFS())
  on('agent.spawn', ($, e) => ({ model: 'haiku', agentId: `live-${e.tool_use_id}` }))
  captured.paneOpen = false // a new conversation: no pane yet
  await $.session.start(DESKTOP_START)
  await clock.advance(POLL_MS * 3)
  expect(paneKeys(captured.store)).toEqual([])
  expect(captured.opens).toEqual([])

  await $.agent.spawn(SPAWN('t1') as Parameters<typeof $.agent.spawn>[0]) // the first subagent: the auto-open, as before
  await clock.settle()
  expect(captured.opens.length).toBeGreaterThanOrEqual(1)
  expect(captured.store[KEY]).toEqual({ at: T0 + POLL_MS * 3 })
  expect(captured.storeWrites[KEY]).toBe(1)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await $.command.run(THEATER)
  await $.command.run(THEATER)
  for (let i = 0; i < 24; i++) await clock.advance(POLL_MS)
  expect(captured.storeWrites[KEY]).toBe(1)
  expect(captured.seq.filter(s => s === `store:${KEY}`)).toHaveLength(1)
  expect(captured.storeDeleteTries).toEqual({})
  expect(captured.toasts).toEqual([])
  // the mark is the store's alone, never a $.state key
  expect(Object.keys(captured.writes).filter(k => !STATE_KEYS.includes(k))).toEqual([])
  expect(paneKeys(captured.store)).toEqual([KEY])
  await ui.unmount()
})

test('THE BUDGETS HOLD: a desktop office up for five quiet minutes writes $.state exactly as before the mark existed — one payload, the prefs and the session id at the start — redraws nothing after its first draw, and the store gains the mark alone, written once', { timeoutMs: 60_000 }, async ($, on) => {
  // (an empty office: the kit's scan reads an empty ~/.claude, and a fixture it does not scan would be published anew every poll)
  const { captured, clock } = beneath(on, () => [], PREFS())
  await $.session.start(DESKTOP_START)
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await clock.advance(POLL_MS)
  const draws = captured.prefsReads
  for (let i = 0; i < 60; i++) await clock.advance(POLL_MS)
  expect(captured.writes).toEqual({ payload: 1, scanError: 0, view: 0, tick: 0, prefs: 1, sessionId: 1 })
  expect(captured.prefsReads).toBe(draws)
  expect(captured.storeWrites).toEqual({ [KEY]: 1 })
  expect(captured.seq.filter(s => s.startsWith('store:'))).toEqual([`store:${KEY}`])
  expect(captured.storeDeleteTries).toEqual({})
  expect(captured.store[KEY]).toEqual({ at: T0 })
  await ui.unmount()
})

test('THE PERSON CLOSES THE PANE: the first poll that finds it no longer listed deletes the mark, once; a listing that cannot be read, and a pane listed but shown by nothing, delete nothing; opened again, it is marked again', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], PREFS())
  await $.session.start(DESKTOP_START)
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toEqual({ at: T0 })
  expect(captured.storeWrites[KEY]).toBe(1)

  // not a close: the listing fails; then the pane is listed but nothing shows it
  captured.panesDown = true
  await clock.advance(POLL_MS * 2)
  captured.panesDown = false
  captured.paneShown = false
  await clock.advance(POLL_MS * 2)
  captured.paneShown = true
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toEqual({ at: T0 })
  expect(captured.storeDeleteTries).toEqual({})
  expect(captured.storeWrites[KEY]).toBe(1)

  captured.paneOpen = false // the person's close
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toBeUndefined()
  expect(captured.storeDeletes[KEY]).toBe(1)
  const opens = captured.opens.length
  for (let i = 0; i < 12; i++) await clock.advance(POLL_MS)
  expect(captured.storeDeleteTries[KEY]).toBe(1) // once
  expect(captured.opens.length).toBe(opens) // closed stays closed
  expect(captured.toasts).toEqual([])

  await $.command.run(THEATER) // the person opens it again
  await clock.settle()
  expect(captured.store[KEY]).toEqual({ at: clock.now() })
  expect(captured.storeWrites[KEY]).toBe(2)
})

test('THE SECOND PROCESS: the mark is in the store and no pane is listed — the pane is opened again REOPEN_DELAY_MS after session.start, not before, ONCE, with no `focus`, no toast and no chime; the mark is dated anew, THE RECORD gains one `reopen` entry, and the office fills', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => office(), { ...PREFS(), [KEY]: { at: T0 - 3_600_000 } })
  captured.paneOpen = false // a new process: the engine's pane roster is empty
  await $.session.start(HOSTED_START)
  await $.session.start(HOSTED_START) // (raised again in one process — an enable, a reload: still one reopen)
  expect(captured.opens).toEqual([])
  await clock.advance(REOPEN_DELAY_MS - 1)
  expect(captured.opens).toEqual([])
  expect(captured.store[KEY]).toEqual({ at: T0 - 3_600_000 }) // the polls before the reopen leave the mark alone
  expect(captured.storeWrites[KEY]).toBeUndefined()
  expect(recordOf(captured.store)).toEqual([])
  await clock.advance(1)
  await clock.settle()
  // ONE opening (two session.starts, one timer) and the first publish retitling it in place, as at any opening
  expect(captured.opens.length).toBeGreaterThanOrEqual(1)
  expect(captured.opens.length).toBeLessThanOrEqual(2)
  expect(captured.openArgs.every(a => a.id === 'agent-theater' && a.focus === undefined)).toBe(true)
  expect(captured.toasts).toEqual([])
  expect(captured.plays).toBe(0)
  expect(captured.storeWrites[KEY]).toBe(1)
  expect(captured.store[KEY]).toEqual({ at: T0 + REOPEN_DELAY_MS })
  // THE RECORD: one `reopen` entry, under a key the key function builds, holding the time and the conversation alone
  const rec = recordOf(captured.store)
  expect(rec).toHaveLength(1)
  const { key, ...entry } = rec[0]!
  expect(entry).toEqual({ t: T0 + REOPEN_DELAY_MS, sid: 'test-session', k: 'reopen' })
  expect(key).toBe(officeLogKey(T0 + REOPEN_DELAY_MS, 'test-session', Number(key.slice(key.lastIndexOf(':') + 1))))

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await clock.advance(POLL_MS)
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  expect(captured.writes.payload).toBeGreaterThanOrEqual(1)
  const opens = captured.opens.length
  for (let i = 0; i < 12; i++) await clock.advance(POLL_MS)
  expect(captured.opens.length).toBe(opens)
  expect(captured.storeWrites[KEY]).toBe(1)
  expect(recordOf(captured.store)).toHaveLength(1)
  expect(captured.toasts).toEqual([])
  await ui.unmount()
})

test('NEVER BY THIS PATH: a new conversation (no mark of its own, another conversation\'s there), an unreadable mark, an expired mark (deleted) — nothing opens, nothing is recorded', { timeoutMs: 60_000 }, async ($, on) => {
  const other = `${STORE_PANE_PREFIX}another-session`
  const { captured, clock } = beneath(on, () => [], { ...PREFS(), [other]: { at: T0 - 1000 } })
  captured.paneOpen = false
  await $.session.start(DESKTOP_START)
  await clock.advance(REOPEN_DELAY_MS * 4)
  expect(captured.opens).toEqual([])
  expect(Object.keys(captured.storeWrites).filter(k => k.startsWith(STORE_PANE_PREFIX))).toEqual([])
  expect(captured.store[other]).toEqual({ at: T0 - 1000 }) // not this conversation's to touch

  captured.store[KEY] = { at: 'yesterday' }
  await $.session.start(DESKTOP_START)
  await clock.advance(REOPEN_DELAY_MS * 2)
  expect(captured.opens).toEqual([])
  expect(captured.store[KEY]).toEqual({ at: 'yesterday' })

  captured.store[KEY] = { at: clock.now() - PANE_MARK_TTL_MS - 60_000 }
  await $.session.start(DESKTOP_START)
  await clock.advance(REOPEN_DELAY_MS * 2)
  expect(captured.opens).toEqual([])
  expect(captured.store[KEY]).toBeUndefined()
  expect(captured.storeDeletes).toEqual({ [KEY]: 1 })
  expect(recordOf(captured.store)).toEqual([])
  expect(captured.toasts).toEqual([])
})

test('A RELOAD OF THE MODULE (the mark there, the pane still listed): the reopen opens nothing and records nothing; the fresh module takes the mark over at its first poll (one write), so a later close still deletes it', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], { ...PREFS(), [KEY]: { at: T0 - 60_000 } })
  await $.session.start(DESKTOP_START)
  await clock.advance(POLL_MS)
  const opens = captured.opens.length // (the poll's own retitle of the listed pane, as before)
  await clock.advance(REOPEN_DELAY_MS * 2)
  expect(captured.opens.length).toBe(opens)
  expect(captured.storeWrites[KEY]).toBe(1)
  expect(captured.store[KEY]).toEqual({ at: T0 })
  expect(recordOf(captured.store)).toEqual([])
  captured.paneOpen = false
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toBeUndefined()
})

test('THE PENDING REOPEN YIELDS: a pane the person opened with /theater inside the delay and then closed is not opened by the timer, and its mark stays deleted', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], { ...PREFS(), [KEY]: { at: T0 - 60_000 } })
  captured.paneOpen = false
  await $.session.start(DESKTOP_START)
  await clock.advance(3000)
  await $.command.run(THEATER)
  await clock.settle()
  const opens = captured.opens.length
  expect(opens).toBeGreaterThanOrEqual(1)
  expect(captured.store[KEY]).toEqual({ at: T0 + 3000 })
  captured.paneOpen = false // ... and the person closes it again, still inside the delay
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toBeUndefined()
  await clock.advance(REOPEN_DELAY_MS * 2)
  expect(captured.opens.length).toBe(opens)
  expect(captured.store[KEY]).toBeUndefined()
  expect(recordOf(captured.store)).toEqual([])
})

test('THE TERMINAL IS UNCHANGED: under the REPL (session.start says `terminal`) a mark in the store opens nothing, a shown pane writes none and a closed one deletes none', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], { ...PREFS(), [KEY]: { at: T0 - 60_000 } })
  captured.paneOpen = false
  await $.session.start({ cwd: 'C:/x', surface: 'terminal', isInteractive: true })
  await clock.advance(REOPEN_DELAY_MS * 2)
  expect(captured.opens).toEqual([])
  await $.command.run(THEATER)
  await clock.advance(POLL_MS * 2)
  captured.paneOpen = false
  await clock.advance(POLL_MS * 2)
  expect(captured.storeWrites[KEY]).toBeUndefined()
  expect(captured.storeDeleteTries).toEqual({})
  expect(captured.store[KEY]).toEqual({ at: T0 - 60_000 })
  expect(recordOf(captured.store)).toEqual([])
})

test('A PANE NO SURFACE SHOWS (a `-p` run, a subagent of a headless run: listed, shown by nothing) writes no mark; once a surface shows it the next poll writes it', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], PREFS())
  captured.paneShown = false
  await $.session.start(HOSTED_START)
  await $.command.run(THEATER)
  await clock.advance(POLL_MS * 3)
  expect(paneKeys(captured.store)).toEqual([])
  expect(captured.storeWrites[KEY]).toBeUndefined()
  captured.paneShown = true
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toEqual({ at: clock.now() })
  expect(captured.storeWrites[KEY]).toBe(1)
})

test('REOPENED WHERE NO SURFACE SHOWS IT YET (the conversation was started again in the background): the mark is dated anew at once, so the close of a pane this process never saw shown still deletes it', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], { ...PREFS(), [KEY]: { at: T0 - 3_600_000 } })
  captured.paneOpen = false
  captured.paneShown = false
  await $.session.start(HOSTED_START)
  await clock.advance(REOPEN_DELAY_MS) // (opened: listed, shown by nothing)
  await clock.settle()
  expect(captured.opens.length).toBe(1)
  expect(captured.store[KEY]).toEqual({ at: T0 + REOPEN_DELAY_MS })
  expect(captured.storeWrites[KEY]).toBe(1)
  expect(recordOf(captured.store).map(e => e.k)).toEqual(['reopen'])
  captured.paneShown = true // the page attaches and shows it ...
  captured.paneOpen = false // ... and the person closes it before any poll saw it shown
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toBeUndefined()
  expect(captured.storeWrites[KEY]).toBe(1)
})

test('THE REOPEN THAT THE HOST DOES NOT TAKE: `$.ui.open` answering `{ isPlaced: false }` with no pane listed after it, or rejecting — the old mark is left as it was, nothing is recorded, no toast, and no second attempt is made', { timeoutMs: 60_000 }, async ($, on) => {
  const seeded = { at: T0 - 3_600_000 }
  const { captured, clock } = beneath(on, () => [], { ...PREFS(), [KEY]: seeded })
  captured.paneOpen = false
  captured.openAnswer = 'refused'
  await $.session.start(DESKTOP_START)
  await clock.advance(REOPEN_DELAY_MS)
  await clock.settle()
  expect(captured.opens.length).toBe(1) // asked once
  await clock.advance(REOPEN_DELAY_MS * 3)
  expect(captured.opens.length).toBe(1) // never again
  expect(captured.store[KEY]).toEqual(seeded)
  expect(captured.storeWrites[KEY]).toBeUndefined()
  expect(captured.storeDeleteTries).toEqual({})
  expect(recordOf(captured.store)).toEqual([])
  expect(captured.toasts).toEqual([])

  // the same with an opening that rejects (session.start raised again in this process arms one more timer)
  captured.openAnswer = 'down'
  await $.session.start(DESKTOP_START)
  await clock.advance(REOPEN_DELAY_MS * 3)
  expect(captured.opens.length).toBe(1)
  expect(captured.store[KEY]).toEqual(seeded)
  expect(captured.storeWrites[KEY]).toBeUndefined()
  expect(recordOf(captured.store)).toEqual([])
  expect(captured.toasts).toEqual([])
  expect(captured.writes.scanError).toBe(0)
})

test('A SLOW STORE NEVER HOLDS THE OFFICE: with the mark\'s write pending beneath, the very poll that asked for it publishes the office, the Client is drawn and the next polls publish too; the mark lands when the store answers', { timeoutMs: 60_000 }, async ($, on) => {
  let agents = office()
  const { captured, clock } = beneath(on, () => agents, PREFS())
  let release: () => void = () => undefined
  captured.hold[KEY] = new Promise<void>(resolve => { release = resolve })
  await $.session.start(DESKTOP_START)
  await clock.settle()
  // the first poll: the mark asked for and held, the office published all the same — within ONE poll
  expect(captured.seq).toContain(`held:${KEY}`)
  expect(captured.store[KEY]).toBeUndefined()
  expect(captured.writes.payload).toBe(1)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  // ... and the polls after it are not held either: an arrival is published while the store still has not answered
  agents = [...office(), agent({ id: 'a2', role: 'draft the guide', persona_id: 11 })]
  await clock.advance(POLL_MS * 2)
  expect(captured.writes.payload).toBeGreaterThanOrEqual(2)
  expect(captured.store[KEY]).toBeUndefined()
  expect(captured.writes.scanError).toBe(0)
  release()
  await clock.settle()
  expect(captured.store[KEY]).toEqual({ at: T0 })
  expect(captured.storeWrites[KEY]).toBe(1)
  await ui.unmount()
})

test('A PANE CLOSED WHILE ITS MARK WAS STILL BEING WRITTEN leaves no mark: the write that lands after the close is taken back', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], PREFS())
  let release: () => void = () => undefined
  captured.hold[KEY] = new Promise<void>(resolve => { release = resolve })
  await $.session.start(DESKTOP_START)
  await clock.settle()
  expect(captured.seq).toContain(`held:${KEY}`)
  captured.paneOpen = false // closed before the store answered
  await clock.advance(POLL_MS)
  release()
  await clock.settle()
  expect(captured.storeWrites[KEY]).toBe(1) // the late write did land ...
  expect(captured.store[KEY]).toBeUndefined() // ... and was deleted: a closed pane keeps no mark
})

test('A STORE THAT REFUSES THE MARK loses the mark and nothing else: no toast, no scan error, the office is published — and the write is not tried again in this process', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => office(), PREFS())
  const refused = Promise.reject(new Error('disk full'))
  refused.catch(() => undefined) // (observed here too: the kit's hook takes it later)
  captured.hold[KEY] = refused
  await $.session.start(DESKTOP_START)
  await clock.settle()
  expect(captured.seq).toContain(`held:${KEY}`)
  expect(captured.writes.payload).toBe(1)
  for (let i = 0; i < 12; i++) await clock.advance(POLL_MS)
  expect(captured.seq.filter(s => s === `held:${KEY}` || s === `store:${KEY}`)).toEqual([`held:${KEY}`])
  expect(captured.storeWrites[KEY]).toBeUndefined()
  expect(captured.store[KEY]).toBeUndefined()
  expect(captured.toasts).toEqual([])
  expect(captured.writes.scanError).toBe(0)
})

test('A DELETE THE STORE REFUSED IS TRIED AGAIN on the next polls — the mark of a closed pane must not stay — PANE_FORGET_TRIES times at most, so a broken store is not hammered', { timeoutMs: 60_000 }, async ($, on) => {
  expect(PANE_FORGET_TRIES).toBe(3)
  const { captured, clock } = beneath(on, () => [], PREFS())
  await $.session.start(DESKTOP_START)
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toBeDefined()

  captured.storeDeleteFails = 1 // the lock is not won once
  captured.paneOpen = false
  await clock.advance(POLL_MS)
  expect(captured.storeDeleteTries[KEY]).toBe(1)
  expect(captured.store[KEY]).toBeDefined()
  await clock.advance(POLL_MS) // the following poll
  expect(captured.storeDeleteTries[KEY]).toBe(2)
  expect(captured.store[KEY]).toBeUndefined()
  for (let i = 0; i < 6; i++) await clock.advance(POLL_MS)
  expect(captured.storeDeleteTries[KEY]).toBe(2) // done: no more

  // a store that refuses every delete: three tries for one close, then the mod lets go
  await $.command.run(THEATER)
  await clock.settle()
  expect(captured.storeWrites[KEY]).toBe(2)
  captured.storeDeleteFails = 99
  captured.paneOpen = false
  for (let i = 0; i < 12; i++) await clock.advance(POLL_MS)
  expect(captured.storeDeleteTries[KEY]).toBe(2 + PANE_FORGET_TRIES)
  expect(captured.store[KEY]).toBeDefined()
  expect(captured.toasts).toEqual([])
  expect(captured.writes.scanError).toBe(0)
})

test('A FALL RIGHT AFTER A REOPEN DOES NOT TOAST: the person did not ask for the pane at that moment — the text cards show, the fall is recorded and the Client is tried again as ever; after a /theater of the person\'s own a fall toasts again', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => office(), { ...PREFS(), [KEY]: { at: T0 - 3_600_000 } })
  captured.paneOpen = false
  await $.session.start(HOSTED_START)
  await clock.advance(REOPEN_DELAY_MS)
  await clock.settle()
  expect(captured.opens.length).toBeGreaterThanOrEqual(1)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  // the fall (register.test.ts's: the settings open, then an engine scroll offset past the bound a surface draws a Box at)
  const FAULTED = { ...PANE.props, scroll: { offset: 20_000, bodyRows: 40 } }
  await ui.press({ key: 'help' })
  await ui.redraw(FAULTED)
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  expect(await ui.find({ key: 'open:a1' })).toBeDefined() // the text cards
  expect(captured.toasts).toEqual([]) // silent
  expect(recordOf(captured.store).map(e => e.k === 'fault' ? `fault:${e.retry}` : e.k)).toEqual(['reopen', 'fault:1'])
  // the retry, unchanged: the Client is back CLIENT_RETRY_MS later
  await ui.redraw({ ...PANE.props })
  await clock.advance(CLIENT_RETRY_MS)
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  expect(recordOf(captured.store).map(e => e.k)).toEqual(['reopen', 'fault', 'up'])
  expect(captured.toasts).toEqual([])
  // the person's own /theater: told again at the next fall
  await $.command.run(THEATER)
  await ui.redraw(FAULTED)
  expect(captured.toasts).toHaveLength(1)
  // (reset: the flag is the plugin bundle's module memory)
  await ui.redraw({ ...PANE.props })
  await $.command.run(THEATER)
  await ui.unmount()
})

test('REOPENED, THEN CLOSED BY THE PERSON: the first subagent of that process does not open the pane again (he closed it; the band\'s button and /theater remain) — and its mark is gone, so the next process leaves it closed too', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], { ...PREFS(), [KEY]: { at: T0 - 3_600_000 } })
  on('agent.spawn', ($, e) => ({ model: 'haiku', agentId: `live-${e.tool_use_id}` }))
  captured.paneOpen = false
  await $.session.start(HOSTED_START)
  await clock.advance(REOPEN_DELAY_MS)
  await clock.settle()
  expect(captured.opens.length).toBeGreaterThanOrEqual(1)
  expect(captured.store[KEY]).toEqual({ at: T0 + REOPEN_DELAY_MS })
  captured.paneOpen = false // the person closes the reopened pane
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toBeUndefined()
  const opens = captured.opens.length
  await $.agent.spawn(SPAWN('t1') as Parameters<typeof $.agent.spawn>[0])
  await clock.settle()
  await clock.advance(POLL_MS * 2)
  expect(captured.opens.length).toBe(opens)
  expect(captured.store[KEY]).toBeUndefined()
  // /theater is still his way back
  await $.command.run(THEATER)
  await clock.settle()
  expect(captured.opens.length).toBeGreaterThan(opens)
  expect(captured.store[KEY]).toBeDefined()
})

test('THE SESSION\'S END STOPS THE MIRROR: after session.end (an exit, a signal) a roster that empties while the process dies deletes no mark', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], PREFS())
  await $.session.start(DESKTOP_START)
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toEqual({ at: T0 })
  await $.session.end(END('other'))
  captured.paneOpen = false // the roster emptied on the way down
  await clock.advance(POLL_MS * 4)
  expect(captured.store[KEY]).toEqual({ at: T0 })
  expect(captured.storeDeleteTries).toEqual({})
  expect(captured.storeWrites[KEY]).toBe(1)
})

test('A PENDING REOPEN IS DROPPED BY THE SESSION\'S END: a process that ends inside the delay opens no pane and leaves the mark for the next one', { timeoutMs: 60_000 }, async ($, on) => {
  const seeded = { at: T0 - 3_600_000 }
  const { captured, clock } = beneath(on, () => [], { ...PREFS(), [KEY]: seeded })
  captured.paneOpen = false
  await $.session.start(HOSTED_START)
  await clock.advance(POLL_MS)
  await $.session.end(END('other'))
  await clock.advance(REOPEN_DELAY_MS * 2)
  expect(captured.opens).toEqual([])
  expect(captured.store[KEY]).toEqual(seeded)
  expect(recordOf(captured.store)).toEqual([])
})

test('/clear (session.end `clear`): the process goes on under a NEW conversation id with the pane still up — the next poll marks the new id (one write), the old id\'s mark is left alone, and a close then deletes the new one', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], PREFS())
  await $.session.start(DESKTOP_START)
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toEqual({ at: T0 })
  const next = `${STORE_PANE_PREFIX}next-session`
  await $.session.end(END('clear'))
  captured.sessionId = 'next-session'
  await clock.advance(POLL_MS)
  expect(captured.store[next]).toEqual({ at: clock.now() })
  expect(captured.storeWrites[next]).toBe(1)
  expect(captured.store[KEY]).toEqual({ at: T0 })
  for (let i = 0; i < 6; i++) await clock.advance(POLL_MS)
  expect(captured.storeWrites[next]).toBe(1)
  captured.paneOpen = false
  await clock.advance(POLL_MS)
  expect(captured.store[next]).toBeUndefined()
  expect(captured.store[KEY]).toEqual({ at: T0 }) // the cleared conversation's: not this one's to delete
  expect(captured.storeDeleteTries).toEqual({ [next]: 1 })
})

test('THE PENDING REOPEN YIELDS EVEN WITH THE MARK STILL IN THE STORE: a pane the person opened with /theater inside the delay and then closed, whose delete the store refused every time, is not opened by the timer — the process saw it shown, and that alone decides', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], { ...PREFS(), [KEY]: { at: T0 - 60_000 } })
  captured.paneOpen = false
  await $.session.start(DESKTOP_START)
  await clock.advance(3000)
  await $.command.run(THEATER)
  await clock.settle()
  const opens = captured.opens.length
  expect(opens).toBeGreaterThanOrEqual(1)
  captured.storeDeleteFails = 99 // the store's lock is never won
  captured.paneOpen = false // the person closes it, still inside the delay
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toBeDefined() // (the mark the timer would read is there, fresh, and no pane is listed)
  await clock.advance(REOPEN_DELAY_MS * 2)
  expect(captured.opens.length).toBe(opens)
  expect(recordOf(captured.store)).toEqual([])
  expect(captured.toasts).toEqual([])
})

test('A REOPEN THE HOST DID NOT TAKE SILENCES NOTHING: the opening rejected, so the person was never shown a pane — when the first subagent then opens the office and it falls, the fall toasts as at any opening', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => office(), { ...PREFS(), [KEY]: { at: T0 - 3_600_000 } })
  on('agent.spawn', ($, e) => ({ model: 'haiku', agentId: `live-${e.tool_use_id}` }))
  captured.paneOpen = false
  captured.openAnswer = 'down'
  await $.session.start(DESKTOP_START)
  await clock.advance(REOPEN_DELAY_MS)
  await clock.settle()
  expect(captured.paneOpen).toBe(false) // the reopen opened nothing
  expect(captured.toasts).toEqual([])
  captured.openAnswer = 'placed'
  await $.agent.spawn(SPAWN('t1') as Parameters<typeof $.agent.spawn>[0]) // the first subagent: the auto-open
  await clock.settle()
  expect(captured.opens.length).toBeGreaterThanOrEqual(1)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  await ui.press({ key: 'help' })
  await ui.redraw({ ...PANE.props, scroll: { offset: 20_000, bodyRows: 40 } }) // the fall, as in the test above
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  expect(captured.toasts).toHaveLength(1)
  // (reset: the flag is the plugin bundle's module memory)
  await ui.redraw({ ...PANE.props })
  await $.command.run(THEATER)
  await ui.unmount()
})

test('A CONVERSATION ID THAT CANNOT BE READ when the pane is first found shown: no mark yet, nothing thrown — and the first poll that can read it writes the mark, ONCE', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], PREFS())
  captured.sessionIdDown = true
  await $.session.start(DESKTOP_START)
  await clock.advance(POLL_MS) // two polls with the pane shown and no id
  expect(paneKeys(captured.store)).toEqual([])
  expect(captured.storeWrites).toEqual({})
  captured.sessionIdDown = false
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toEqual({ at: clock.now() })
  expect(captured.storeWrites[KEY]).toBe(1)
  for (let i = 0; i < 24; i++) await clock.advance(POLL_MS)
  expect(captured.storeWrites[KEY]).toBe(1)
  expect(captured.storeDeleteTries).toEqual({})
  expect(captured.writes.scanError).toBe(0)
})

test('A CONVERSATION ID THAT CANNOT BE READ when the pane is closed: the mark an earlier process left is deleted by the first poll that can read the id — however long that takes — and the pending reopen opens nothing meanwhile', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], { ...PREFS(), [KEY]: { at: T0 - 60_000 } })
  captured.sessionIdDown = true
  await $.session.start(DESKTOP_START) // (a reload: the pane is listed and shown)
  await clock.advance(POLL_MS)
  const opens = captured.opens.length
  captured.paneOpen = false // the person's close, the id still unreadable
  for (let i = 0; i < 12; i++) await clock.advance(POLL_MS) // (past the reopen's delay too)
  expect(captured.store[KEY]).toEqual({ at: T0 - 60_000 })
  expect(captured.storeDeleteTries).toEqual({}) // no key, so no store call: nothing to count against PANE_FORGET_TRIES
  expect(captured.opens.length).toBe(opens)
  captured.sessionIdDown = false
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toBeUndefined()
  expect(captured.storeDeletes).toEqual({ [KEY]: 1 })
  for (let i = 0; i < 6; i++) await clock.advance(POLL_MS)
  expect(captured.storeDeleteTries).toEqual({ [KEY]: 1 })
  expect(captured.storeWrites[KEY]).toBeUndefined()
  expect(captured.opens.length).toBe(opens)
})

test('/clear, A POLL BEFORE THE ENGINE SWITCHES THE ID: `$.session.id()` still answers the ended conversation for a moment after the hook — that poll marks nothing and caches nothing, and the first poll under the new id marks it (one write); the ended conversation\'s mark is neither rewritten nor deleted', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => [], PREFS())
  await $.session.start(DESKTOP_START)
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toEqual({ at: T0 })
  const next = `${STORE_PANE_PREFIX}next-session`
  await $.session.end(END('clear'))
  await clock.advance(POLL_MS) // the id not switched yet
  expect(captured.storeWrites).toEqual({ [KEY]: 1 })
  captured.sessionId = 'next-session'
  await clock.advance(POLL_MS)
  expect(captured.store[next]).toEqual({ at: clock.now() })
  for (let i = 0; i < 6; i++) await clock.advance(POLL_MS)
  expect(captured.storeWrites).toEqual({ [KEY]: 1, [next]: 1 })
  captured.paneOpen = false
  await clock.advance(POLL_MS)
  expect(captured.store[next]).toBeUndefined()
  expect(captured.store[KEY]).toEqual({ at: T0 })
  expect(captured.storeDeleteTries).toEqual({ [next]: 1 })
})

test('/clear ON AN ENGINE THAT KEEPS THE ID (not what its types say): the ended id is refused PANE_ENDED_ASKS times and then taken as this conversation\'s again — the mark is written anew and a close still deletes it, so no closed pane is left marked', { timeoutMs: 60_000 }, async ($, on) => {
  expect(PANE_ENDED_ASKS).toBe(3)
  const { captured, clock } = beneath(on, () => [], PREFS())
  await $.session.start(DESKTOP_START)
  await clock.advance(POLL_MS)
  await $.session.end(END('clear'))
  await clock.advance(POLL_MS * PANE_ENDED_ASKS)
  expect(captured.storeWrites[KEY]).toBe(1)
  await clock.advance(POLL_MS)
  expect(captured.storeWrites[KEY]).toBe(2)
  expect(captured.store[KEY]).toEqual({ at: clock.now() })
  captured.paneOpen = false
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toBeUndefined()
  expect(captured.storeDeleteTries).toEqual({ [KEY]: 1 })
})

test('session.end `resume` (another conversation takes this process over): as a /clear — the mirror goes on under the new id, so the pane still shown is marked for it, and its close deletes the mark an earlier process of THAT conversation left; the ended conversation\'s mark stays', { timeoutMs: 60_000 }, async ($, on) => {
  const next = `${STORE_PANE_PREFIX}next-session`
  const { captured, clock } = beneath(on, () => [], { ...PREFS(), [next]: { at: T0 - 60_000 } })
  await $.session.start(DESKTOP_START)
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toEqual({ at: T0 })
  await $.session.end(END('resume'))
  captured.sessionId = 'next-session'
  await clock.advance(POLL_MS)
  expect(captured.store[next]).toEqual({ at: clock.now() })
  expect(captured.storeWrites).toEqual({ [KEY]: 1, [next]: 1 })
  captured.paneOpen = false
  await clock.advance(POLL_MS * 3)
  expect(captured.store[next]).toBeUndefined()
  expect(captured.storeDeleteTries).toEqual({ [next]: 1 })
  expect(captured.store[KEY]).toEqual({ at: T0 })
})

test('THE SWEEP: with PANE_MARKS_MAX marks or fewer in the store a new mark reads and deletes nothing more; past that the expired and the unreadable marks of other conversations go — never a fresh one, never this conversation\'s, never a key that is no mark', { timeoutMs: 60_000 }, async ($, on) => {
  const seeded: Record<string, unknown> = { ...PREFS(), 'office-log:0000000000001:x:1': { t: 1, sid: 'x', k: 'asked' } }
  for (let i = 0; i < PANE_MARKS_MAX - 3; i++) seeded[`${STORE_PANE_PREFIX}fresh-${i}`] = { at: T0 - 1000 - i }
  seeded[`${STORE_PANE_PREFIX}old`] = { at: T0 - PANE_MARK_TTL_MS - 1000 }
  seeded[`${STORE_PANE_PREFIX}bad`] = 'x'
  const { captured, clock } = beneath(on, () => [], seeded)
  await $.session.start(DESKTOP_START)
  await clock.advance(POLL_MS)
  expect(captured.store[KEY]).toEqual({ at: T0 }) // the 200th mark: at the bound, two dead ones among them
  expect(captured.storeDeleteTries).toEqual({})
  expect(paneKeys(captured.store)).toHaveLength(PANE_MARKS_MAX)

  // the pane closed and shown again with two more conversations' marks in the store: 202 listed
  captured.paneOpen = false
  await clock.advance(POLL_MS)
  expect(captured.storeDeletes).toEqual({ [KEY]: 1 })
  captured.store[`${STORE_PANE_PREFIX}fresh-a`] = { at: T0 - 5 }
  captured.store[`${STORE_PANE_PREFIX}fresh-b`] = { at: T0 - 6 }
  captured.paneOpen = true
  await clock.advance(POLL_MS)
  await clock.settle()
  expect(captured.store[KEY]).toEqual({ at: clock.now() })
  expect(captured.store[`${STORE_PANE_PREFIX}old`]).toBeUndefined()
  expect(captured.store[`${STORE_PANE_PREFIX}bad`]).toBeUndefined()
  expect(captured.storeDeletes).toEqual({ [KEY]: 1, [`${STORE_PANE_PREFIX}old`]: 1, [`${STORE_PANE_PREFIX}bad`]: 1 })
  // the fresh ones all stay — 200 of them now, and no oldest-first pass would have run had there been more
  expect(paneKeys(captured.store)).toHaveLength(PANE_MARKS_MAX)
  expect(captured.store.prefs).toBeDefined()
  expect(captured.store['office-log:0000000000001:x:1']).toBeDefined()
  expect(captured.toasts).toEqual([])
})
