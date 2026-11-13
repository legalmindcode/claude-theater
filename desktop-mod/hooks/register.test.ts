// The desktop office's way back into the hooks, driven through the kit on the
// real mount (Task 2.5): the office Client (office-client.tsx) POSTS what the
// person did — a toolbar Button, a letter key, a press on a row's or a room
// head's Button (phase B: every click in the office a native Button, pressed
// here by its key), the search Input — and the plugin's `ui.message` hook (ui.tsx) turns
// each post into the same prefs / view / $.store change the text cards' press
// makes, one atom per message; anything else it ignores. And the fallback: a
// `ui.fault` of the office (register.tsx) draws the text cards and toasts
// once; the Client is tried again by itself (CLIENT_RETRY_MS later, the gap
// doubled per retry up to CLIENT_RETRY_MAX_MS, CLIENT_RETRIES times per wave; a
// wave anew once the Client was up CLIENT_ALIVE_GAP_MS, or at a subagent spawn
// with the wave spent), and `/theater` tries it again at once. And THE RECORD
// (office-log.ts; register.tsx logOffice): each fall, each recovery — the
// fresh Client's mount note, heard by register.tsx's own `ui.message` hook —
// and each /theater run while the cards showed is one `$.store` key of its
// own, bounded, written beside the hooks' work and never in its way.
//
// A post is seen only by the posting plugin's own hooks (never a test hook
// beneath), so these tests read its effects: the store, the counted $.state
// writes beneath, and the Client's props on the next draw.

import { expect, test } from 'claude-code/testing'
import type { JsonValue } from 'claude-code'

import type { Agent } from './model'
import { CLIENT_ALIVE_GAP_MS, CLIENT_RETRIES, CLIENT_RETRY_MAX_MS, CLIENT_RETRY_MS, LOGO_ASSET, PERSONA_EMOJI, POLL_MS } from './model'
import { SEARCH_MAX } from './office-chrome'
import { logoMarkdown } from './office-layout'
import { SEARCH_DEBOUNCE_MS } from './office-client'
import { OFFICE_LOG_MAX, OFFICE_LOG_PREFIX, OFFICE_LOG_WHY_MAX, officeLogKey, type OfficeLogEntry } from './office-log'
import { OFFICE_KEY, type OfficeProps } from './office-props'
import { T0, beneath } from './test-kit'
import { FOCUS_ON_SELECTED } from './ui'

const SA = 'sess-aaaa-1111-frontend'
const SB = 'sess-bbbb-2222-research'
const PANE = {
  plugin: 'agent-theater', component: 'Pane', requestId: 'agent-theater',
  props: { title: 'T', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const THEATER = { command: 'theater', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } } as const

function agent(over: Partial<Agent> & { id: string }): Agent {
  return {
    persona_id: 3, emoji: PERSONA_EMOJI[3] ?? '', role: '', subagent_type: 'Explore', status: 'running', tool: 'Read', phase: 'tool',
    task: `Task of ${over.id}.`, task_short: `Task of ${over.id}.`, result: null, start_ms: T0 - 30_000, end_ms: null,
    session: SA.slice(0, 8), session_full: SA, cwd: '/home/dev/acme-web', project: '/home/dev/acme-web', mtime_ms: T0 - 1000,
    is_session: false, closed: false, is_workflow: false, truncated: false, model: 'claude-opus-5-5', ...over,
  }
}

/** The $.store the tests start from: Hebrew, the chime on, finished hidden, no pins. */
const PREFS = () => ({ prefs: { lang: 'he', muted: false, showDone: false, pins: [] } })

/** Room A (a lead, a reader, a finished writer) and room B (one MCP agent). */
function fixture(): Agent[] {
  return [
    agent({ id: 'lead-a', is_session: true, tool: '', phase: 'thinking', topic: 'Ship the v2 config migration.' }),
    agent({ id: 'a1', role: 'map session-token validation', persona_id: 7 }),
    agent({ id: 'a2', role: 'draft the v2 migration guide', status: 'done', tool: 'Write', end_ms: T0 - 2000, result: 'Done.', persona_id: 11 }),
    agent({ id: 'b1', role: 'triage open bugs', tool: 'mcp__github__search_issues', session: SB.slice(0, 8), session_full: SB, project: '/home/dev/research', cwd: '/home/dev/research', persona_id: 9 }),
  ]
}

type Ui = {
  find: (q: { type?: string; key?: string; text?: RegExp; in?: string }) => Promise<{ text?: string; props: Record<string, unknown> } | undefined>
  press: (target: { key: string }) => Promise<unknown>
  pointer: (ev: { in?: string; type: 'down' | 'leave'; x: number; y: number; button?: 'left' }) => Promise<void>
  post: (data: JsonValue, scope?: { in?: string }) => Promise<void>
}

/** The office Client's props as last drawn. */
async function propsOf(ui: Ui): Promise<OfficeProps> {
  const c = await ui.find({ type: 'Client' })
  expect(c).toBeDefined()
  return c!.props.props as OfficeProps
}

/**
 * A click on the office's controls as the desktop does it (phase B, decision 26): the module's Button pressed by its key — a
 * row's who cell `agent:<id>:who`, a room head's pin `pin:<room>`, a room's more line `more:<room>` (the ✓ counts are no
 * Button: read-only, live check 7 Q6); the kit presses a Client's Button by its key alone.
 */
async function click(ui: Ui, kind: 'agent' | 'pin' | 'more', id: string): Promise<void> {
  expect(await ui.find({ in: OFFICE_KEY, type: 'Button', key: kind === 'agent' ? `agent:${id}:who` : `${kind}:${id}` }), `${kind} ${id}`).toBeDefined()
  await ui.press({ key: kind === 'agent' ? `agent:${id}:who` : kind === 'pin' ? `pin:${id}` : `more:${id}` })
  // (a pin keeps the cards where they are until the pointer leaves the office: live check 7, Q4 — its leave alone the pointer's)
  if (kind === 'pin') await ui.pointer({ in: OFFICE_KEY, type: 'leave', x: 0, y: 0 })
}

/** The writes an act made, by key ($.state, then $.store): only the non-zero ones. */
async function writesOf(captured: ReturnType<typeof beneath>['captured'], act: () => Promise<unknown>): Promise<Record<string, number>> {
  const w0 = { ...captured.writes }
  const s0 = { ...captured.storeWrites }
  await act()
  const out: Record<string, number> = {}
  for (const [k, n] of Object.entries(captured.writes)) if (n !== (w0[k] ?? 0)) out[k] = n - (w0[k] ?? 0)
  for (const [k, n] of Object.entries(captured.storeWrites)) if (n !== (s0[k] ?? 0)) out[`store:${k}`] = n - (s0[k] ?? 0)
  return out
}

test('ui.message: the office Client\'s own posts — toolbar Buttons, letter keys, row and room-head presses, the search Input — change prefs / view / the store as the text cards\' presses do, one atom per message', { timeoutMs: 30_000 }, async ($, on) => {
  let agents = fixture()
  const { captured, clock } = beneath(on, () => agents, PREFS())
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  expect(OFFICE_KEY).toBe('office') // the ui.message / ui.fault matchers carry it as a literal (validate reads matchers statically)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.resize({ in: OFFICE_KEY, columns: 90, rows: 40 })
  const p0 = await propsOf(ui)
  expect(p0.prefs).toEqual({ showDone: false, muted: false })
  expect(p0.rooms.map(r => r.agents.map(a => a.id))).toEqual([['lead-a', 'a1', 'a2'], ['b1']])   // (a2, finished, is among room A's recent finished)

  // showDone (the toolbar Button): the pref and its store mirror, nothing else; the finished writer is drawn
  expect(await writesOf(captured, () => ui.press({ key: 'showDone' }))).toEqual({ prefs: 1, 'store:prefs': 1 })
  expect((captured.store.prefs as { showDone: boolean }).showDone).toBe(true)
  expect((await propsOf(ui)).prefs.showDone).toBe(true)
  expect((await propsOf(ui)).rooms[0]?.agents.map(a => a.id)).toEqual(['lead-a', 'a1', 'a2'])
  // ... and back by its letter, through the module's own key handler
  expect(await writesOf(captured, () => ui.key({ in: OFFICE_KEY, key: 'f' }))).toEqual({ prefs: 1, 'store:prefs': 1 })
  expect((await propsOf(ui)).prefs.showDone).toBe(false)

  // mute: one pref
  expect(await writesOf(captured, () => ui.press({ key: 'mute' }))).toEqual({ prefs: 1, 'store:prefs': 1 })
  expect((captured.store.prefs as { muted: boolean }).muted).toBe(true)
  expect((await propsOf(ui)).prefs.muted).toBe(true)
  // (no motion toggle — live check 7, Q9: nothing read it — so `s` writes nothing; an old `still` post neither)
  expect(await writesOf(captured, () => ui.key({ in: OFFICE_KEY, key: 's' }))).toEqual({})
  expect(await writesOf(captured, () => ui.post({ t: 'still' }, { in: OFFICE_KEY }))).toEqual({})

  // help: one view write each way; open, it holds the demo / language Buttons
  expect(await writesOf(captured, () => ui.press({ key: 'help' }))).toEqual({ view: 1 })
  expect((await propsOf(ui)).helpOpen).toBe(true)
  expect(await ui.find({ in: OFFICE_KEY, key: 'still' })).toBeUndefined()
  expect(await writesOf(captured, () => ui.press({ key: 'mute' }))).toEqual({ prefs: 1, 'store:prefs': 1 })
  expect((await propsOf(ui)).helpOpen).toBe(true)   // a pref flip leaves the help open
  await ui.press({ key: 'help' })
  expect((await propsOf(ui)).helpOpen).toBe(false)

  // a press on a1's row opens its drawer (selected, the help closed, the text cards' focus on its card); ✕ closes it
  expect(await writesOf(captured, () => click(ui, 'agent', 'a1'))).toEqual({ view: 1 })
  expect(captured.view).toMatchObject({ selected: 'a1', helpOpen: false, focusIndex: FOCUS_ON_SELECTED })
  expect((await propsOf(ui)).drawer?.id).toBe('a1')
  expect(await writesOf(captured, () => ui.press({ key: 'close' }))).toEqual({ view: 1 })
  expect((await propsOf(ui)).selected).toBeNull()
  expect((await propsOf(ui)).drawer).toBeNull()

  // the pin on room B's head: prefs.pins (+ its mirror) → B is drawn first
  expect(await writesOf(captured, () => click(ui, 'pin', SB))).toEqual({ prefs: 1, 'store:prefs': 1 })
  expect((captured.store.prefs as { pins: string[] }).pins).toEqual([SB])
  expect((await propsOf(ui)).rooms.map(r => [r.id, r.pinned])).toEqual([[SB, true], [SA, false]])
  await click(ui, 'pin', SB)
  expect((captured.store.prefs as { pins: string[] }).pins).toEqual([])

  // room A's finished toggle (its post: room A holds one finished, so it draws no more line — live check 7, Q6 — and its
  // counts are read-only): the override lives in $.store, not $.state — no state write; drawn at once (the message's answer,
  // and the redraw asked before the store write: no latch — R3; the engine folds a burst of redraws itself)
  const roomDone = () => ui.post({ t: 'roomDone', room: SA }, { in: OFFICE_KEY })
  expect(await writesOf(captured, async () => { await roomDone(); await roomDone(); await roomDone() })).toEqual({ 'store:roomDone': 3 })
  expect(captured.store.roomDone).toEqual({ [SA]: true })
  expect((await propsOf(ui)).rooms.find(r => r.id === SA)).toMatchObject({ showDone: true })
  expect((await propsOf(ui)).rooms.find(r => r.id === SA)?.agents.map(a => a.id)).toEqual(['lead-a', 'a1', 'a2'])
  await roomDone()
  expect(captured.store.roomDone).toEqual({})
  expect((await propsOf(ui)).rooms.find(r => r.id === SA)?.showDone).toBe(false)

  // the search Input — drawn only while the office shows more than SEARCH_FROM agents (spec 2026-10-10 §2 item 22): ten more
  // working agents in room B bring it; then the first keystroke reaches view.search at once (one view write: the hooks size
  // the chrome by it under ONE_LINE_FROM) and the rest after the module's debounce (one more), the office narrows; Enter with
  // the same text writes nothing; an empty Enter clears it; the ten leave again
  expect(await ui.find({ in: OFFICE_KEY, key: 'search' })).toBeUndefined()
  agents = [...fixture(), ...Array.from({ length: 10 }, (_, i) => agent({ id: `x${i}`, role: 'extra work', session: SB.slice(0, 8), session_full: SB, project: '/home/dev/research', cwd: '/home/dev/research', persona_id: 20 + i }))]
  await clock.advance(POLL_MS)
  expect(await ui.find({ in: OFFICE_KEY, key: 'search' })).toBeDefined()
  expect(await writesOf(captured, () => ui.input({ key: 'search', text: 't', kind: 'change' }))).toEqual({ view: 1 })
  expect((await propsOf(ui)).search).toBe('t')
  await ui.input({ key: 'search', text: 'triage', kind: 'change' })
  expect((await propsOf(ui)).search).toBe('t')
  expect(await writesOf(captured, () => ui.advance(SEARCH_DEBOUNCE_MS))).toEqual({ view: 1 })
  expect((await propsOf(ui)).search).toBe('triage')
  expect((await propsOf(ui)).rooms.map(r => r.agents.map(a => a.id))).toEqual([['b1']])
  expect(await ui.find({ in: OFFICE_KEY, key: 'search' })).toBeDefined()   // one agent shown, the search active: the field stays
  expect(await writesOf(captured, () => ui.input({ key: 'search', text: 'triage', kind: 'submit' }))).toEqual({})
  expect(await writesOf(captured, () => ui.input({ key: 'search', text: '', kind: 'submit' }))).toEqual({ view: 1 })
  expect((await propsOf(ui)).search).toBe('')
  agents = fixture()
  await clock.advance(POLL_MS)
  expect(await ui.find({ in: OFFICE_KEY, key: 'search' })).toBeUndefined()

  // the demo: view.demo on and off — its Button in the help popover (`דמו 🎬`, then `יציאה ✕ 🎬`), its letter with the help closed
  await ui.press({ key: 'help' })
  expect((await ui.find({ in: OFFICE_KEY, key: 'demo' }))?.text).toBe('דמו 🎬')
  expect(await writesOf(captured, () => ui.press({ key: 'demo' }))).toEqual({ view: 1 })
  expect((await propsOf(ui)).demo).toBe(true)
  expect((await ui.find({ in: OFFICE_KEY, key: 'demo' }))?.text).toBe('יציאה ✕ 🎬')
  await ui.press({ key: 'demo' })
  expect((await propsOf(ui)).demo).toBe(false)

  // the language: the pref (+ mirror) and the pane retitled in English with the working count; the module's labels follow
  // (the Button in the help popover: `🌐 English`, then `🌐 עברית`)
  expect((await ui.find({ in: OFFICE_KEY, key: 'lang' }))?.text).toBe('🌐 English')
  expect(await writesOf(captured, () => ui.press({ key: 'lang' }))).toEqual({ prefs: 1, 'store:prefs': 1 }) // the retitle is a ui.open, not a write
  expect((captured.store.prefs as { lang: string }).lang).toBe('en')
  expect(captured.opens[captured.opens.length - 1]).toBe('🟢 3 · 🎭 Theater')
  expect((await propsOf(ui)).lang).toBe('en')
  expect((await propsOf(ui)).rtl).toBe(false)
  expect((await ui.find({ in: OFFICE_KEY, key: 'lang' }))?.text).toBe('🌐 עברית')
  expect((await ui.find({ in: OFFICE_KEY, key: 'showDone' }))?.text).toBe('☐ Show finished')
  await ui.press({ key: 'help' })
  await ui.key({ in: OFFICE_KEY, key: 'l' })
  expect((await propsOf(ui)).lang).toBe('he')
  expect((await ui.find({ in: OFFICE_KEY, key: 'showDone' }))?.text).toBe('הצג שסיימו ☐')
  expect(await writesOf(captured, () => ui.key({ in: OFFICE_KEY, key: 'd' }))).toEqual({ view: 1 })
  expect((await propsOf(ui)).demo).toBe(true)
  await ui.key({ in: OFFICE_KEY, key: 'd' })
  expect((await propsOf(ui)).demo).toBe(false)

  // j / k move the module's own keyboard focus and post nothing: no write (a write would redraw the pane per key)
  await click(ui, 'agent', 'lead-a')
  await ui.press({ key: 'close' })
  expect(await writesOf(captured, async () => { await ui.key({ in: OFFICE_KEY, key: 'j' }); await ui.key({ in: OFFICE_KEY, key: 'k' }) })).toEqual({})
  await ui.unmount()
})

test('ui.message: what is not an office message is ignored — content / pull (dropped by the amendment), focus, no `t`, wrong field types, not an object — no write, no redraw; a search text is capped and cleaned', async ($, on) => {
  const { captured, clock } = beneath(on, () => fixture(), PREFS())
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const before = JSON.stringify(await propsOf(ui))
  const reads0 = captured.prefsReads
  const junk: JsonValue[] = [
    { t: 'content', rows: 123 }, { t: 'pull', seq: 1 }, { t: 'focus', id: 'a1' }, { t: 'nonsense' }, { nonsense: true },
    { t: 'open' }, { t: 'open', id: 7 }, { t: 'pin', room: null }, { t: 'roomDone', room: ['x'] }, { t: 'search', q: 5 }, { t: 7 },
    'showDone', 42, null, [{ t: 'showDone' }],
  ]
  expect(await writesOf(captured, async () => { for (const d of junk) await ui.post(d, { in: OFFICE_KEY }) })).toEqual({})
  expect(captured.prefsReads).toBe(reads0) // nothing read, nothing redrawn
  expect(JSON.stringify(await propsOf(ui))).toBe(before)
  // a well-formed post through the same door does land (the kit's post is the module's surface.post)
  await ui.post({ t: 'open', id: 'b1' }, { in: OFFICE_KEY })
  expect((await propsOf(ui)).drawer?.id).toBe('b1')
  // a search text is cut to SEARCH_MAX code points (a pasted page must not swell the Client's props), never inside an emoji
  await ui.post({ t: 'search', q: '🔍'.repeat(SEARCH_MAX + 50) }, { in: OFFICE_KEY })
  expect(Array.from((await propsOf(ui)).search)).toEqual(Array.from('🔍'.repeat(SEARCH_MAX)))
  // ... and its control characters become spaces (an Input value holding one is refused: by the Client, and by the text cards)
  await ui.post({ t: 'search', q: 'tri\u001b[1mage\u0007' }, { in: OFFICE_KEY })
  expect((await propsOf(ui)).search).toBe('tri [1mage ')
  expect(await ui.find({ type: 'Client' })).toBeDefined()
  await ui.unmount()
})

/**
 * An engine scroll offset past the surface's bound on a Box's position (`top` an integer within 10,000 cells): with the
 * settings open, the module lays THE FLOATING OVERLAY at `top: max(offset, chromeRows)` — an offset no content of the module
 * ever allowed is drawn as handed (office-client.tsx THE STALE OFFSET) — so the tree fails the surface's validation. (Phase B:
 * the old trigger, a spacer taller than the bound, is gone — office-chrome.ts windowOf clamps the window to the content.)
 */
const FAULT_OFFSET = 20_000

/**
 * THE RECORD (register.tsx; office-log.ts): the office's falls and recoveries, one `$.store` key per entry. The tests read
 * the store beneath (`captured.store`) — the mod itself never reads an entry back. The plugin bundle's count of the entries
 * it wrote is module memory the tests cannot read, so no test assumes a count: it is read off the last key written.
 */
type Recorded = OfficeLogEntry & { key: string }
/** The record as the store holds it, in the order written: by the key's time, then by the writing process's count. */
function recordOf(store: Record<string, unknown>): Recorded[] {
  const part = (k: string): [number, number] => {
    const p = k.slice(OFFICE_LOG_PREFIX.length).split(':')
    return [Number(p[0]), Number(p[p.length - 1])]
  }
  return Object.keys(store).filter(k => k.startsWith(OFFICE_LOG_PREFIX))
    .sort((a, b) => part(a)[0] - part(b)[0] || part(a)[1] - part(b)[1])
    .map(k => ({ key: k, ...(store[k] as OfficeLogEntry) }))
}
/** An entry in a word: `fault:<the retry it armed>`, `up:<ms since the outage's first fault>`, or its kind. */
const brief = (e: OfficeLogEntry): string => e.k === 'fault' ? `fault:${e.retry}` : e.k === 'up' ? `up:${e.after}` : e.k
/** The writing process's count in an entry's key (its last part). */
const countOf = (key: string): number => Number(key.slice(key.lastIndexOf(':') + 1))
/** The store writes sequenced since `from` (`store:<key>`, test-kit.ts). */
const storeSeq = (captured: ReturnType<typeof beneath>['captured'], from: number): string[] => captured.seq.slice(from).filter(s => s.startsWith('store:'))
const FAULTED = { ...PANE.props, scroll: { offset: FAULT_OFFSET, bodyRows: 40 } }

// (mounts, faults and redraws through the kit: past the 5 s default under a full suite on a loaded machine with no code change —
// 5.14 s on 20.10 — the budget is load headroom)
test('ui.fault on the office: the desktop falls back to the text cards and toasts once (the reason to the debug log); /theater tries the Client again; a second fault toasts again', { timeoutMs: 30_000 }, async ($, on) => {
  const logs: string[] = []
  const sinks: Array<string | undefined> = []
  on('ui.log', ($, e) => { logs.push(e.text); sinks.push(e.to); return { value: undefined } })
  const { captured, clock } = beneath(on, () => fixture(), PREFS())
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  expect(await ui.find({ key: 'open:a1' })).toBeUndefined()
  // a real fault of the module: the settings open (view.helpOpen, kept over the fallback and the retry), then a redraw hands
  // it an engine scroll offset of FAULT_OFFSET, so the floating popover's `top` lies past the bound a surface draws a Box at
  // (10,000 cells): the surface refuses the tree, unmounts the instance and reports `ui.fault` (phase `render`) for element
  // `office`. (A live engine's offset stays inside the Client's height, itself under that bound; the kit's redraw takes any
  // offset. The module's older triggers — a search post over the post bound, a spacer past the bound — are gone: the module
  // caps its search text, cleanSearch, and clamps its window to the content, windowOf.)
  await ui.press({ key: 'help' })
  expect((await propsOf(ui)).helpOpen).toBe(true)
  expect((await ui.find({ in: OFFICE_KEY, type: 'Box', key: 'help' }))?.props).toMatchObject({ position: 'absolute', top: 4 })
  await ui.redraw({ ...PANE.props, scroll: { offset: FAULT_OFFSET, bodyRows: 40 } })
  expect(captured.toasts).toHaveLength(1)
  expect(captured.toasts[0]).toMatch(/\/theater/)
  expect(captured.toasts[0]).toMatch(/כרטיסים/) // Hebrew, as the prefs say
  expect(captured.toastTimeouts).toEqual([undefined]) // its stay the engine's default (live check 5 shortened the finish toast alone)
  expect(logs.filter(l => l.startsWith('office Client failed'))).toHaveLength(1)
  expect(logs.find(l => l.startsWith('office Client failed'))).toMatch(/^office Client failed \(render\): .*"top"/)
  // the fault line goes to the debug log alone, never the transcript (it was the transcript's for live check 4 only: decision 27)
  expect(sinks[logs.findIndex(l => l.startsWith('office Client failed'))]).toBe('debug')
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  expect(await ui.find({ key: 'open:a1' })).toBeDefined() // the text cards (their help card drawn above them: the view kept)
  expect(await ui.find({ type: 'Text', text: /משרד הסוכנים/ })).toBeDefined()
  // the fallback holds over the redraws (the window back in range) until the automatic retry is due (CLIENT_RETRY_MS; the
  // next test is the retries' own); no second toast
  await ui.redraw({ ...PANE.props })
  await clock.advance(CLIENT_RETRY_MS - 1)
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  expect(captured.toasts).toHaveLength(1)
  // /theater: the person asks again, before the retry (it drops the pending one) → the Client is drawn again, on the window in range
  await $.command.run(THEATER)
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  expect(await ui.find({ key: 'open:a1' })).toBeUndefined()
  expect((await propsOf(ui)).offset).toBe(0)
  expect((await propsOf(ui)).helpOpen).toBe(true)   // (the settings still open: the popover under the chrome, in range)
  // it fails again: the cards again, one more toast
  await ui.redraw({ ...PANE.props, scroll: { offset: FAULT_OFFSET, bodyRows: 40 } })
  expect(captured.toasts).toHaveLength(2)
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  expect(await ui.find({ key: 'open:a1' })).toBeDefined()
  // (reset: the flag is the plugin bundle's module memory)
  await ui.redraw({ ...PANE.props })
  await $.command.run(THEATER)
  expect(await ui.find({ type: 'Client' })).toBeDefined()
  await ui.unmount()
})

/**
 * THE CLIENT'S RETRIES (live check 8, 23.10; the 1.11 diagnosis): the Client's first draw timed out while the worker scanned,
 * and the office stayed on the text cards for the whole conversation (no /theater to try again). Then the diagnosis of
 * 28.10-1.11 (model.ts CLIENT_RETRIES): the faults come in waves while the host is starved, and two retries 3 s apart never
 * outlast a wave. The kit's clock holds the module's `$.clock.after` and `$.clock.now`; `clock.advance(ms)` crosses a retry's
 * due time, as the engine's clock does.
 */
// (mounts, faults, redraws, spawns and clock advances through the kit: the budget is load headroom, as the fault test's)
test('ui.fault on the office, the retries: the Client is drawn again after a fault with a growing gap — CLIENT_RETRY_MS, doubled per retry up to CLIENT_RETRY_MAX_MS — CLIENT_RETRIES times per wave, silently, then the cards stay; a fault CLIENT_ALIVE_GAP_MS after the last (the Client was up between) starts a wave anew; a subagent spawn with the wave spent tries the Client at once; /theater at once, counted anew, told again, a pending retry dropped', { timeoutMs: 60_000 }, async ($, on) => {
  expect(CLIENT_RETRIES).toBe(10)
  expect(CLIENT_RETRY_MS).toBe(3000)
  expect(CLIENT_RETRY_MAX_MS).toBe(60_000)
  expect(CLIENT_ALIVE_GAP_MS).toBe(90_000)
  const logs: string[] = []
  on('ui.log', ($, e) => { logs.push(e.text); return { value: undefined } })
  // the engine beneath starts each subagent and names it (the spawn's own hook auto-opens the pane once and polls)
  on('agent.spawn', ($, e) => ({ model: 'haiku', agentId: `live-${e.tool_use_id}` }))
  const { captured, clock } = beneath(on, () => fixture(), PREFS())
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  // the fault's trigger, as the test above sets it: the settings open (view.helpOpen, kept over the cards and every retry), so a
  // redraw at the stale offset puts the popover's `top` past the surface's bound (see FAULT_OFFSET)
  await ui.press({ key: 'help' })
  expect((await propsOf(ui)).helpOpen).toBe(true)
  const faulted = { ...PANE.props, scroll: { offset: FAULT_OFFSET, bodyRows: 40 } }
  const failures = () => logs.filter(l => l.startsWith('office Client failed')).length
  /** A fault of the Client on screen: the cards (the plugin bundle's flag is module memory the test cannot read: the tree says it); then the window back in range (what the live engine's own redraw hands). */
  const fault = async () => {
    expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
    await ui.redraw(faulted)
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    expect(await ui.find({ key: 'open:a1' })).toBeDefined()
    await ui.redraw({ ...PANE.props })
  }
  /** The retry: not yet due a millisecond short of `ms`, due at it — the Client is drawn again, a fresh instance. */
  const retry = async (ms: number) => {
    await clock.advance(ms - 1)
    expect(await ui.find({ type: 'Client' }), `${ms} ms: a millisecond short`).toBeUndefined()
    await clock.advance(1)
    expect((await ui.find({ type: 'Client' }))?.key, `${ms} ms: due`).toBe(OFFICE_KEY)
    expect(await ui.find({ key: 'open:a1' })).toBeUndefined()
  }
  const spawn = (id: string) => $.agent.spawn({ tool_use_id: id, prompt: 'Read it.', description: `desc ${id}`, subagentType: 'Explore', parentModel: 'opus' } as Parameters<typeof $.agent.spawn>[0])
  /** One wave's gaps: CLIENT_RETRY_MS doubled per retry, capped at CLIENT_RETRY_MAX_MS, CLIENT_RETRIES of them. */
  const WAVE = [3000, 6000, 12_000, 24_000, 48_000, 60_000, 60_000, 60_000, 60_000, 60_000]
  expect(WAVE).toHaveLength(CLIENT_RETRIES)
  // the first fault: told once (toast and debug line); then the whole wave, every retry silent
  await fault()
  expect(captured.toasts).toHaveLength(1)
  expect(failures()).toBe(1)
  for (const ms of WAVE) {
    await retry(ms)
    await fault()
  }
  expect(captured.toasts).toHaveLength(1)
  expect(failures()).toBe(1)
  // the wave spent: the cards stay over the redraws, the polls and any wait
  await clock.advance(CLIENT_RETRY_MAX_MS * 3)
  await clock.advance(POLL_MS * 3)
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  expect(await ui.find({ key: 'open:a1' })).toBeDefined()
  // a subagent starts in this conversation: the office matters now — the Client is tried at once, silently, a wave anew
  await spawn('t-1')
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  expect(captured.toasts).toHaveLength(1)
  await fault()
  expect(captured.toasts).toHaveLength(1)
  expect(failures()).toBe(1)
  await retry(WAVE[0]!)
  // a spawn while a wave runs changes nothing: the pending retry keeps its time
  await fault()
  await spawn('t-2')
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  await retry(WAVE[1]!)
  // THE CLIENT UP BETWEEN: a fault CLIENT_ALIVE_GAP_MS after the last one came from a Client that drew for a while (the cards
  // never show that long between two faults of a wave), so the wave starts anew — the next gap is the first, not the third
  await clock.advance(CLIENT_ALIVE_GAP_MS)
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  await fault()
  expect(captured.toasts).toHaveLength(1) // (silent: the person was told once since /theater)
  await retry(WAVE[0]!)
  // /theater still brings the Client back at once and counts the retries anew: a fault after it is told again and retried again
  await fault()
  await $.command.run(THEATER)
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  await fault()
  expect(captured.toasts).toHaveLength(2)
  expect(failures()).toBe(2)
  // ... a retry still pending when the person runs /theater is dropped: it must not clear a newer fault's flag early
  await clock.advance(CLIENT_RETRY_MS - 1000)
  await $.command.run(THEATER)
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  await fault()
  expect(captured.toasts).toHaveLength(3)   // (the first fault since /theater, told)
  await clock.advance(1000)                 // the dropped retry's due time: the newer fault's own is 2000 ms away
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  await clock.advance(CLIENT_RETRY_MS - 1000)
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  // (reset: the flag and the count are the plugin bundle's module memory)
  await $.command.run(THEATER)
  expect(await ui.find({ type: 'Client' })).toBeDefined()
  // THE RECORD of all of the above (office-log.ts), in the order written: every fault with the retry it armed (1..CLIENT_RETRIES
  // through a wave, 0 for the fault that arms none: the cards stay), every recovery with the ms since its outage's first fault
  // (in the kit a retry's Client mounts at once, so each `up` is its retry's gap; the spent wave's is the wait until the spawn),
  // `asked` for a /theater run while the cards showed — and no entry for a retry's timer, a spawn, a poll, or a /theater run
  // with the Client up
  const WAITED = CLIENT_RETRY_MAX_MS * 3 + POLL_MS * 3
  expect(recordOf(captured.store).map(brief)).toEqual([
    'fault:1', ...WAVE.flatMap((ms, i) => [`up:${ms}`, `fault:${i + 2 <= CLIENT_RETRIES ? i + 2 : 0}`]),
    `up:${WAITED}`,                                   // the spawn with the wave spent
    'fault:1', `up:${WAVE[0]}`,
    'fault:2', `up:${WAVE[1]}`,                       // (the spawn while the wave ran: nothing)
    'fault:1', `up:${WAVE[0]}`,                       // THE CLIENT UP BETWEEN: the wave anew
    'fault:2', 'asked', 'up:0',                       // /theater while the cards showed
    'fault:1', 'asked', `up:${CLIENT_RETRY_MS - 1000}`,
    'fault:1', `up:${CLIENT_RETRY_MS}`,
  ])
  expect(recordOf(captured.store).every(e => e.sid === 'test-session' && (e.k !== 'up' || e.faults === 1))).toBe(true)
  await ui.unmount()
})

test('THE RECORD, a fall and its recovery: the first fault writes ONE entry under its own `office-log:` key — the engine clock, the conversation id, the phase, the surface\'s reason cut to a line of 100 code points, the retry it armed — and nothing else (no conversation text, no $.state write, no redraw of its own); the fresh Client\'s mount note then writes ONE `up` (the ms since the fault, the faults in the outage), answered with no props; a second note writes nothing', { timeoutMs: 30_000 }, async ($, on) => {
  const logs: string[] = []
  on('ui.log', ($, e) => { logs.push(e.text); return { value: undefined } })
  const { captured, clock } = beneath(on, () => fixture(), PREFS())
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'help' })
  expect(recordOf(captured.store)).toEqual([]) // a mount, its note and a press: nothing to record
  const at = captured.seq.length
  const writes = JSON.stringify(captured.writes)
  // THE FALL
  await ui.redraw(FAULTED)
  expect(await ui.find({ type: 'Client' })).toBeUndefined()
  const fell = recordOf(captured.store)
  expect(fell).toHaveLength(1)
  const fault = fell[0]!
  expect(fault).toMatchObject({ t: T0 + POLL_MS, sid: 'test-session', k: 'fault', phase: 'render', retry: 1 })
  // exactly these fields: nothing of the conversation rides an entry
  expect(Object.keys(fault).sort()).toEqual(['k', 'key', 'phase', 'retry', 'sid', 't', 'why'])
  expect(fault.key).toBe(officeLogKey(T0 + POLL_MS, 'test-session', countOf(fault.key)))
  // the reason is the surface's own line, cut (the debug log keeps it whole)
  const why = (fault as { why: string }).why
  expect(why).toMatch(/"top"/)
  expect(why.endsWith('…')).toBe(true)
  expect(Array.from(why)).toHaveLength(OFFICE_LOG_WHY_MAX + 1)
  expect(why).not.toMatch(/\s{2}|[\r\n\t]/)
  const line = logs.find(l => l.startsWith('office Client failed'))!
  expect(line.length).toBeGreaterThan(why.length)
  expect(line).toContain(why.slice(0, -1))
  // ONE store write, of that key; what the person sees is as before (one toast, one debug line); no $.state write
  expect(storeSeq(captured, at)).toEqual([`store:${fault.key}`])
  expect(captured.toasts).toHaveLength(1)
  expect(logs.filter(l => l.startsWith('office Client failed'))).toHaveLength(1)
  expect(JSON.stringify(captured.writes)).toBe(writes)
  // ... and once it landed nothing is redrawn for it
  await ui.redraw({ ...PANE.props })
  const draws = captured.prefsReads
  await clock.advance(1)
  expect(captured.prefsReads).toBe(draws)
  // THE RECOVERY: the retry draws a fresh Client; its second call posts the mount note, and the hooks write `up`
  await clock.advance(CLIENT_RETRY_MS - 1)
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  const back = recordOf(captured.store)
  expect(back.map(brief)).toEqual(['fault:1', `up:${CLIENT_RETRY_MS}`])
  const up = back[1]!
  expect(up).toMatchObject({ t: T0 + POLL_MS + CLIENT_RETRY_MS, sid: 'test-session', k: 'up', after: CLIENT_RETRY_MS, faults: 1 })
  expect(Object.keys(up).sort()).toEqual(['after', 'faults', 'k', 'key', 'sid', 't'])
  expect(countOf(up.key)).toBe(countOf(fault.key) + 1)
  expect(storeSeq(captured, at)).toEqual([`store:${fault.key}`, `store:${up.key}`])
  expect(JSON.stringify(captured.writes)).toBe(writes) // still no $.state write: the record is the store's alone
  // the note's answer carries no props: the Client is not drawn again for it, and a second note (the outage is closed) writes nothing
  const props = JSON.stringify(await propsOf(ui))
  const drawn = captured.prefsReads
  await ui.post({ t: 'mounted' }, { in: OFFICE_KEY })
  await clock.advance(1)
  expect(recordOf(captured.store)).toHaveLength(2)
  expect(captured.prefsReads).toBe(drawn)
  expect(JSON.stringify(await propsOf(ui))).toBe(props)
  expect(captured.toasts).toHaveLength(1)
  await ui.unmount()
})

test('THE RECORD, /theater: run while the cards show it writes `asked`, and the Client\'s mount then writes `up`; run with the Client up it writes nothing', { timeoutMs: 30_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => fixture(), PREFS())
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'help' })
  // with the Client up: nothing
  await $.command.run(THEATER)
  expect(recordOf(captured.store)).toEqual([])
  // the cards show: the person asks for the office
  await ui.redraw(FAULTED)
  await ui.redraw({ ...PANE.props })
  await clock.advance(1000)
  await $.command.run(THEATER)
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  await ui.advance(0) // (the fresh Client's second call: the kit asks for it on the surface's next step)
  const rec = recordOf(captured.store)
  expect(rec.map(brief)).toEqual(['fault:1', 'asked', 'up:1000'])
  expect(rec[1]).toMatchObject({ t: T0 + POLL_MS + 1000, sid: 'test-session', k: 'asked' })
  expect(Object.keys(rec[1]!).sort()).toEqual(['k', 'key', 'sid', 't'])
  // and again with the Client up: nothing more
  await $.command.run(THEATER)
  await clock.advance(1)
  expect(recordOf(captured.store)).toHaveLength(3)
  await ui.unmount()
})

test('THE RECORD is bounded: a store that already holds OFFICE_LOG_MAX entries (another conversation\'s) keeps exactly that many after one more fall — the oldest gone, ours the newest — and no other key of the store is touched (the settings, the toast mark, the rooms\' toggles, the old `diag` list)', { timeoutMs: 30_000 }, async ($, on) => {
  const seeded: Record<string, unknown> = { ...PREFS(), usageToast: { resetsAt: '2023-11-14T20:00:00.000Z', pct: 80 }, roomDone: {}, diag: [{ t: 1, kind: 'render' }, { t: 2, kind: 'fault' }] }
  const old = Array.from({ length: OFFICE_LOG_MAX }, (_, i) => officeLogKey(T0 - 1_000_000 + i, 'other-conversation', i + 1))
  old.forEach((k, i) => { seeded[k] = { t: T0 - 1_000_000 + i, sid: 'other-conversation', k: 'up', after: 1, faults: 1 } })
  const others = JSON.stringify([seeded.prefs, seeded.usageToast, seeded.roomDone, seeded.diag])
  const { captured, clock } = beneath(on, () => fixture(), seeded)
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'help' })
  expect(recordOf(captured.store).map(e => e.key)).toEqual(old) // nothing is pruned or written until there is something to record
  await ui.redraw(FAULTED)
  await clock.advance(1)
  const rec = recordOf(captured.store)
  expect(rec).toHaveLength(OFFICE_LOG_MAX)
  expect(rec.map(e => e.key).slice(0, -1)).toEqual(old.slice(1))
  expect(rec[rec.length - 1]).toMatchObject({ sid: 'test-session', k: 'fault', retry: 1 })
  // the recovery prunes one more: the bound holds at every write
  await ui.redraw({ ...PANE.props })
  await clock.advance(CLIENT_RETRY_MS)
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  const then = recordOf(captured.store)
  expect(then).toHaveLength(OFFICE_LOG_MAX)
  expect(then.map(e => e.key).slice(0, -2)).toEqual(old.slice(2))
  expect(then.slice(-2).map(brief)).toEqual(['fault:1', `up:${CLIENT_RETRY_MS}`])
  // every other key as it was seeded, and none of them written
  expect(JSON.stringify([captured.store.prefs, captured.store.usageToast, captured.store.roomDone, captured.store.diag])).toBe(others)
  expect(Object.keys(captured.storeWrites).filter(k => !k.startsWith(OFFICE_LOG_PREFIX))).toEqual([])
  expect(Object.keys(captured.store).filter(k => !k.startsWith(OFFICE_LOG_PREFIX)).sort()).toEqual(['diag', 'prefs', 'roomDone', 'usageToast'])
  await ui.unmount()
})

test('THE RECORD never stands in the way, and loses nobody\'s entry: with the fault\'s own store write held (a slow store) the cards are drawn, the toast is up and the Client is back after CLIENT_RETRY_MS, its `up` written; an entry another conversation writes meanwhile is still there when ours lands (one key per entry: a shared list would have overwritten it); with an `up` write held, the outage is closed once and a press is applied meanwhile', { timeoutMs: 30_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => fixture(), PREFS())
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'help' })
  // a first fall and /theater: three entries, whose last key tells the process's count (and the next fault is told again)
  await ui.redraw(FAULTED)
  await ui.redraw({ ...PANE.props })
  await $.command.run(THEATER)
  await ui.advance(0) // (the fresh Client's second call, and with it its mount note)
  const first = recordOf(captured.store)
  expect(first.map(brief)).toEqual(['fault:1', 'asked', 'up:0'])
  expect(captured.toasts).toHaveLength(1)
  const n = countOf(first[2]!.key)
  // THE SLOW STORE: the next fault's write is held beneath (its key built as the writer builds it)
  await clock.advance(10)
  const now = T0 + POLL_MS + 10
  const mine = officeLogKey(now, 'test-session', n + 1)
  let release: () => void = () => undefined
  captured.hold[mine] = new Promise<void>(resolve => { release = resolve })
  await ui.redraw(FAULTED)
  expect(captured.seq).toContain('held:' + mine)
  expect(recordOf(captured.store)).toHaveLength(3)             // not landed
  expect(await ui.find({ type: 'Client' })).toBeUndefined()    // the cards, at once
  expect(await ui.find({ key: 'open:a1' })).toBeDefined()
  expect(captured.toasts).toHaveLength(2)                      // the person told, at once
  // another conversation's process writes an entry of its own meanwhile
  const theirs = officeLogKey(now + 1, 'other-conversation', 1)
  captured.store[theirs] = { t: now + 1, sid: 'other-conversation', k: 'fault', phase: 'load', why: 'x', retry: 1 }
  // the retry is not held either: the Client is back on time, and its `up` is written past the held write
  await ui.redraw({ ...PANE.props })
  await clock.advance(CLIENT_RETRY_MS)
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  expect(recordOf(captured.store).slice(3).map(e => `${e.sid.slice(0, 5)} ${brief(e)}`)).toEqual(['other fault:1', `test- up:${CLIENT_RETRY_MS}`])
  // the store answers at last: ours lands beside theirs
  release()
  await clock.advance(1)
  const all = recordOf(captured.store)
  expect(all.slice(3).map(e => `${e.sid.slice(0, 5)} ${brief(e)}`)).toEqual(['test- fault:1', 'other fault:1', `test- up:${CLIENT_RETRY_MS}`])
  expect(all[3]!.key).toBe(mine)
  expect(captured.store[theirs]).toEqual({ t: now + 1, sid: 'other-conversation', k: 'fault', phase: 'load', why: 'x', retry: 1 })
  // THE `up` WRITE HELD TOO: a fall, then /theater draws the Client again — the kit makes the fresh instance's second call
  // on the drawing's next step, so the outage is still open — and a mount note posted now finds the store slow: the outage
  // is closed at once (one `up`, whenever it lands) and a press of the Client is applied meanwhile. (What this cannot
  // show: on the desktop the page holds the Client's next post until the note's hook answered, which is why that hook
  // must not await the store; the kit answers a post without waiting for the hook, so an `await` there would pass here —
  // that rule is kept by the hook's one `void`, read, not tested.)
  await ui.redraw(FAULTED)
  await ui.redraw({ ...PANE.props })
  await $.command.run(THEATER)
  expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  expect(recordOf(captured.store).slice(6).map(brief)).toEqual(['fault:2', 'asked'])
  const up = officeLogKey(now + CLIENT_RETRY_MS + 1, 'test-session', n + 5)
  let releaseUp: () => void = () => undefined
  captured.hold[up] = new Promise<void>(resolve => { releaseUp = resolve })
  await ui.post({ t: 'mounted' }, { in: OFFICE_KEY })
  expect(captured.seq).toContain('held:' + up)
  expect(recordOf(captured.store)).toHaveLength(8) // the `up` not landed
  expect((await propsOf(ui)).helpOpen).toBe(true)
  await ui.press({ key: 'help' })
  expect((await propsOf(ui)).helpOpen).toBe(false)
  releaseUp()
  await clock.advance(1)
  expect(recordOf(captured.store).slice(6).map(brief)).toEqual(['fault:2', 'asked', 'up:0'])
  expect(recordOf(captured.store)[8]!.key).toBe(up)
  // (the fresh instance's own note, on the drawing's next step, finds the outage closed: nothing more)
  await ui.advance(0)
  expect(recordOf(captured.store)).toHaveLength(9)
  await ui.unmount()
})

test('THE RECORD is a by-product: a store that refuses the write loses that entry and nothing else (the cards, the toast, the retry and the later `up` as ever); a conversation id that cannot be read gives an entry naming none, under a well-formed key; a store that cannot list its keys keeps the entry unpruned', { timeoutMs: 30_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => fixture(), PREFS())
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'help' })
  let now = T0 + POLL_MS
  /** A fall of the Client on screen, then the retry's time: the Client back. */
  const fallAndBack = async () => {
    await ui.redraw(FAULTED)
    expect(await ui.find({ type: 'Client' })).toBeUndefined()
    expect(await ui.find({ key: 'open:a1' })).toBeDefined()
    await ui.redraw({ ...PANE.props })
    await clock.advance(CLIENT_RETRY_MS)
    now += CLIENT_RETRY_MS
    expect((await ui.find({ type: 'Client' }))?.key).toBe(OFFICE_KEY)
  }
  // a first fall: its entries tell the process's count
  await fallAndBack()
  expect(recordOf(captured.store).map(brief)).toEqual(['fault:1', `up:${CLIENT_RETRY_MS}`])
  let n = countOf(recordOf(captured.store)[1]!.key)
  // (a) THE STORE REFUSES the fault's write: that entry is lost — and only it
  await $.command.run(THEATER) // (the Client is up: nothing written; the next fault is told again and its retry the first again)
  const refused = Promise.reject(new Error('disk full'))
  refused.catch(() => undefined)
  captured.hold[officeLogKey(now, 'test-session', n + 1)] = refused
  await fallAndBack()
  expect(captured.seq).toContain('held:' + officeLogKey(now - CLIENT_RETRY_MS, 'test-session', n + 1))
  expect(captured.toasts).toHaveLength(2)
  expect(recordOf(captured.store).map(brief)).toEqual(['fault:1', `up:${CLIENT_RETRY_MS}`, `up:${CLIENT_RETRY_MS}`])
  n += 2
  // (b) THE CONVERSATION ID cannot be read: the entry names none, its key is still the record's
  captured.sessionIdDown = true
  await $.command.run(THEATER)
  await fallAndBack()
  captured.sessionIdDown = false
  const anon = recordOf(captured.store).slice(3)
  expect(anon.map(e => `${brief(e)} [${e.sid}]`)).toEqual(['fault:1 []', `up:${CLIENT_RETRY_MS} []`])
  expect(anon[0]!.key).toBe(officeLogKey(now - CLIENT_RETRY_MS, '', n + 1))
  expect(anon[1]!.key).toBe(officeLogKey(now, '', n + 2))
  expect(captured.toasts).toHaveLength(3)
  // (c) THE STORE cannot list its keys: nothing can be pruned, the entries are kept, nothing throws
  captured.storeKeysDown = true
  await $.command.run(THEATER)
  await fallAndBack()
  captured.storeKeysDown = false
  expect(recordOf(captured.store).slice(5).map(e => `${brief(e)} [${e.sid}]`)).toEqual(['fault:1 [test-session]', `up:${CLIENT_RETRY_MS} [test-session]`])
  expect(captured.toasts).toHaveLength(4)
  await ui.unmount()
})

test('THE RECORD, no fall: a session with its mount, presses, keys, polls, a /theater with the Client up, a mount note posted by hand, a note with a stray field and a batch carrying a `mounted` item writes no entry at all — and the notes change no $.state, no $.store, no props and redraw nothing', { timeoutMs: 30_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => fixture(), PREFS())
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.press({ key: 'help' })
  await ui.press({ key: 'help' })
  await ui.press({ key: 'showDone' })
  await ui.key({ in: OFFICE_KEY, key: 'j' })
  await clock.advance(POLL_MS * 3)
  await $.command.run(THEATER)
  const props = JSON.stringify(await propsOf(ui))
  const writes = JSON.stringify([captured.writes, captured.storeWrites])
  const draws = captured.prefsReads
  await ui.post({ t: 'mounted' }, { in: OFFICE_KEY })
  await ui.post({ t: 'mounted', extra: 1 }, { in: OFFICE_KEY })
  await ui.post({ t: 'batch', i: 'x', items: [{ t: 'mounted', n: 1 }] }, { in: OFFICE_KEY })
  await clock.advance(1)
  expect(JSON.stringify([captured.writes, captured.storeWrites])).toBe(writes)
  expect(captured.prefsReads).toBe(draws)
  expect(JSON.stringify(await propsOf(ui))).toBe(props)
  expect(Object.keys(captured.store).filter(k => k.startsWith(OFFICE_LOG_PREFIX))).toEqual([])
  expect(captured.seq.filter(s => s.includes(OFFICE_LOG_PREFIX))).toEqual([])
  expect(captured.toasts).toEqual([])
  await ui.unmount()
})

// (mounts and polls through the kit: the budget is load headroom, as the other mounted tests')
test('THE DEMO\'S EXITS (live check 5): the demo line\'s exit Button posts the demo toggle (one view write); a real subagent starting in this conversation (agent.spawn) while the demo runs turns the demo off — ONE view write, ahead of the spawn\'s own poll, outside the publish path — and the real office is published; a spawn with the demo off writes no view', { timeoutMs: 30_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, fixture, PREFS())
  // the engine beneath starts each subagent and names it
  on('agent.spawn', ($, e) => ({ model: 'haiku', agentId: `live-${e.tool_use_id}` }))
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.resize({ in: OFFICE_KEY, columns: 90, rows: 40 })
  const spawn = (id: string) => $.agent.spawn({ tool_use_id: id, prompt: 'Read it.', description: `desc ${id}`, subagentType: 'Explore', parentModel: 'opus' } as Parameters<typeof $.agent.spawn>[0])
  // the demo line: drawn while the demo runs, its Button ends it
  expect(await ui.find({ in: OFFICE_KEY, key: 'exitDemo' })).toBeUndefined()
  await ui.key({ in: OFFICE_KEY, key: 'd' })
  expect((await propsOf(ui)).demo).toBe(true)
  expect((await ui.find({ in: OFFICE_KEY, key: 'exitDemo' }))?.text).toBe('יציאה')
  expect(await ui.find({ in: OFFICE_KEY, type: 'Text', text: /^🎬.זו.הדגמה/ })).toBeDefined()
  expect(await writesOf(captured, () => ui.press({ key: 'exitDemo' }))).toEqual({ view: 1 })
  expect((await propsOf(ui)).demo).toBe(false)
  expect(await ui.find({ in: OFFICE_KEY, key: 'exitDemo' })).toBeUndefined()
  // a subagent starts with the demo off: no view write
  expect((await writesOf(captured, () => spawn('t1'))).view).toBeUndefined()
  await clock.advance(POLL_MS)
  // the demo on again; a real subagent of this conversation starts: the demo goes off at once — one view write
  await ui.key({ in: OFFICE_KEY, key: 'd' })
  await clock.advance(POLL_MS)
  expect(captured.payload?.demo).toBe(true)
  expect((await writesOf(captured, () => spawn('t2'))).view).toBe(1)
  expect(captured.view?.demo).toBe(false)
  expect((await propsOf(ui)).demo).toBe(false)
  // the switch is published (the render kick's poll): the real office (the kit draws the fixture for it)
  await clock.advance(POLL_MS)
  expect(captured.payload?.demo).toBe(false)
  expect((await propsOf(ui)).rooms.map(r => r.id)).toEqual([SA, SB])
  expect(captured.toasts).toEqual([])
  await ui.unmount()
})

// (polls, a mount and a hot reload's session.start through the kit: the budget is load headroom, as the other mounted tests')
test('THE LOGO (decision 28b): session.start reads the plugin\'s own logo ONCE — `$.fs.read(<root>/assets/lm-logo-48.png, { as: \'bytes\' })`, its only read of a file of its own — never per poll or per render; the desktop\'s credit row draws what it read; a fresh load (a reload\'s session.start) reads it again, and an empty answer (a missing file) draws the credit alone', { timeoutMs: 30_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => fixture(), PREFS())
  const LOGO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
  captured.bytes[LOGO_ASSET] = LOGO
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  expect(captured.bytesReads).toHaveLength(1)
  // (the plugin's own folder, absolute: `$.plugin.root`, which the test's engine does not expose — so its shape and its end)
  expect(captured.bytesReads[0]).toMatch(/^([A-Za-z]:)?\//)
  expect(captured.bytesReads[0]?.endsWith(`/${LOGO_ASSET}`)).toBe(true)
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await ui.resize({ in: OFFICE_KEY, columns: 90, rows: 40 })
  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(logoMarkdown(LOGO))
  // polls, a press's redraw, a language switch: no read more
  await clock.advance(POLL_MS * 3)
  await ui.press({ key: 'showDone' })
  await ui.key({ in: OFFICE_KEY, key: 'l' })
  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(logoMarkdown(LOGO))
  expect(captured.bytesReads).toHaveLength(1)
  await ui.unmount()
  // a fresh load (a hot reload fires session.start again): read again; the file gone (an empty answer) — the credit alone
  captured.bytes = {}
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  expect(captured.bytesReads).toHaveLength(2)
  const after = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await after.find({ type: 'Markdown' })).toBeUndefined()
  expect((await after.find({ type: 'Link' }))?.props.href).toBe('https://legalmind.co.il')
  await after.unmount()
})
