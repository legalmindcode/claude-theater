// THE PROPS GUARD (the diagnosis of 13.11): the desktop office Client is handed new props only when the DRAWN office
// changes. Every new props is a round trip to the Client's frame that the desktop page times at 2 s, and a render past
// it is a fault (register.tsx THE OFFICE'S FALLBACK) — so props that move with nothing drawn are exposure for nothing.
// A minute clock (`nowMin`) once rode the props, read by nothing that is drawn: a resting office handed the Client
// sixty new props an hour. The guards: the pure builder (no clock rides the props), a quiet half hour through the kit
// (zero new props) and the narrow header beside it, one helper at work (its row's changes alone), and the five-hour
// meter (its label follows its text, not the clock).
// WHAT THIS DOES NOT PIN: the poll still publishes once a minute while an agent's whole minute turns (ui.tsx
// renderKey), so the payload write and the pane's redraw REMAIN; the gain is that such a redraw hands the Client the
// same JSON, which the desktop page compares before it sends anything to the frame (the page of app build
// 5.1231.2.0; the kit skips the module on equal props likewise). A page that stopped comparing would bring the round
// trip back, and no kit test could see it.
import type { On, SessionRateLimit } from 'claude-code'
import { expect, test, type Engine } from 'claude-code/testing'

import { DEFAULT_PREFS, DEFAULT_VIEW, EMPTY_PAYLOAD, LONG_RUNNING_MS, PERSONA_EMOJI, POLL_MS } from './model'
import type { Agent } from './model'
import { WIDE_FROM } from './office-layout'
import { OFFICE_KEY, buildOfficeProps } from './office-props'
import type { OfficeProps, OfficePropsInput } from './office-props'
import { T0, TEST_HOME, beneath, type MemFiles } from './test-kit'

// ---------------------------------------------------------------------------------------------------------------
// 1. pure: buildOfficeProps
// ---------------------------------------------------------------------------------------------------------------

/** A wall-clock minute, so the minutes below are whole. */
const M0 = 1_700_000_040_000
function agent(over: Partial<Agent> & { id: string }): Agent {
  return { persona_id: 3, emoji: PERSONA_EMOJI[3] ?? '', role: '', subagent_type: '', status: 'running', tool: 'Read', phase: 'tool', task: 't', task_short: 't', result: null, start_ms: M0 - 120_000, end_ms: null, session: 'sess-a', session_full: 'sess-aaaa', cwd: '/w', project: '/w', mtime_ms: M0 - 1000, is_session: false, closed: false, is_workflow: false, truncated: false, model: 'claude-opus-5-5', ...over }
}
const USAGE = { pct: 42, resetsAt: new Date(2026, 9, 10, 14, 30).toISOString() }
function input(agents: Agent[], now: number, over: Partial<OfficePropsInput> = {}): OfficePropsInput {
  return { payload: { ...EMPTY_PAYLOAD, agents, stars: {} }, prefs: DEFAULT_PREFS, view: DEFAULT_VIEW, roomDone: {}, offset: 0, columns: 90, rows: 30, now, usage: USAGE, ...over }
}
/** The top-level keys of the props whose JSON differs between `a` and `b`. */
function changed(a: OfficeProps, b: OfficeProps): string[] {
  const x = a as unknown as Record<string, unknown>, y = b as unknown as Record<string, unknown>
  return [...new Set([...Object.keys(x), ...Object.keys(y)])].filter(k => JSON.stringify(x[k]) !== JSON.stringify(y[k])).sort()
}

test('buildOfficeProps: NO CLOCK RIDES THE PROPS — the same office a second, a minute, an hour and a day later builds the same JSON, byte for byte (a waiting lead, finished helpers, the five-hour meter); what time does move is only what is drawn: a working row\'s ⏱ once it passes LONG_RUNNING_MS (rooms alone), and the open drawer\'s minutes (drawer.elapsedMin alone)', () => {
  const lead = agent({ id: 'sess-aaaa', is_session: true, status: 'stale', tool: '', phase: 'thinking', start_ms: M0 - 120_000, mtime_ms: M0 - 120_000 })
  const done = [1, 2, 3].map(k => agent({ id: `d${k}`, status: 'done', result: 'ok', start_ms: M0 - 900_000, end_ms: M0 - k * 100_000, mtime_ms: M0 - k * 100_000 }))
  const quiet = [lead, ...done]
  const at = (now: number, agents = quiet, over: Partial<OfficePropsInput> = {}) => buildOfficeProps(input(agents, now, over))
  const first = at(M0)
  expect('nowMin' in first).toBe(false)
  for (const later of [1000, 59_000, 60_000, 61_000, 3_600_000, 86_400_000]) expect(JSON.stringify(at(M0 + later)), `+${later} ms`).toBe(JSON.stringify(first))
  // the meter is the reading's alone: another reading is another `usage`, and nothing else
  expect(changed(first, at(M0, quiet, { usage: { ...USAGE, pct: 43 } }))).toEqual(['usage'])
  // a working row: the same JSON until it passes LONG_RUNNING_MS, then its ⏱ — the rooms alone
  const working = [lead, agent({ id: 'r1', start_ms: M0 - 120_000 })]
  const w0 = at(M0, working)
  expect(JSON.stringify(at(M0 + 60_000, working))).toBe(JSON.stringify(w0))
  expect(JSON.stringify(at(M0 + LONG_RUNNING_MS - 121_000, working))).toBe(JSON.stringify(w0))
  const long = at(M0 + LONG_RUNNING_MS - 119_000, working)
  expect(changed(w0, long)).toEqual(['rooms'])
  expect(long.rooms[0]?.agents.find(a => a.id === 'r1')?.longRunning).toBe(true)
  // the open drawer's status line draws minutes: they ride the props, at the wall-clock minute, and nothing else moves with them
  const open = { view: { ...DEFAULT_VIEW, selected: 'r1' } }
  const d0 = at(M0, working, open)
  expect(d0.drawer?.elapsedMin).toBe(2)
  expect(JSON.stringify(at(M0 + 59_000, working, open))).toBe(JSON.stringify(d0))
  const d1 = at(M0 + 60_000, working, open)
  expect(changed(d0, d1)).toEqual(['drawer'])
  expect(d1.drawer?.elapsedMin).toBe(3)
  // a finished agent's drawer shows its duration: fixed
  expect(JSON.stringify(at(M0 + 3_600_000, quiet, { view: { ...DEFAULT_VIEW, selected: 'd1' } }))).toBe(JSON.stringify(at(M0, quiet, { view: { ...DEFAULT_VIEW, selected: 'd1' } })))
})

// ---------------------------------------------------------------------------------------------------------------
// 2. through the kit: the desktop pane
// ---------------------------------------------------------------------------------------------------------------

const PANE = {
  plugin: 'agent-theater', component: 'Pane', requestId: 'agent-theater', surface: 'desktop',
  props: { title: 'T', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
/** A pane under WIDE_FROM: its header has no room for the full meter, so the short one is drawn. */
const NARROW = 45
const PROJ = `${TEST_HOME}/.claude/projects/-C-x`
const NL = String.fromCharCode(10)
const rec = (o: Record<string, unknown>) => JSON.stringify(o)
const iso = (ms: number) => new Date(ms).toISOString()
const SESS = 'sess-0001-aaaa'
const sub = (id: string) => `${PROJ}/${SESS}/subagents/agent-${id}.jsonl`

/** An open conversation at rest (its lead waiting since two minutes before `now`) with three helpers that finished minutes ago: nothing in it moves but the clock. */
function restingOffice(now: number): MemFiles {
  const f: MemFiles = new Map()
  f.set(`${PROJ}/${SESS}.jsonl`, {
    text: [
      rec({ type: 'user', sessionId: SESS, cwd: 'C:/x', timestamp: iso(now - 180_000), message: { role: 'user', content: 'Resting office. Nothing moves.' } }),
      rec({ type: 'assistant', sessionId: SESS, timestamp: iso(now - 120_000), message: { role: 'assistant', model: 'claude-fable-5-1', content: [{ type: 'text', text: 'Done.' }] } }),
    ].join(NL) + NL,
    mtimeMs: now - 120_000,
  })
  f.set(`${TEST_HOME}/.claude/sessions/7.json`, { text: JSON.stringify({ pid: 7, sessionId: SESS }), mtimeMs: now })
  for (const [id, start, end] of [['f1', 900_000, 600_000], ['f2', 800_000, 500_000], ['f3', 700_000, 400_000]] as const) {
    f.set(sub(id), {
      text: [
        rec({ type: 'user', agentId: id, sessionId: SESS, timestamp: iso(now - start), cwd: 'C:/x', version: '2.1.0', message: { content: `Task of ${id}. Details follow.` } }),
        rec({ type: 'assistant', timestamp: iso(now - end), version: '2.1.0', message: { stop_reason: 'end_turn', content: [{ type: 'text', text: `Done ${id}.` }] } }),
      ].join(NL) + NL,
      mtimeMs: now - end,
    })
  }
  return f
}
/** A helper mid-tool beside them, started `ago` ms before `now`. */
function working(f: MemFiles, id: string, now: number, ago: number, mtimeMs: number): void {
  f.set(sub(id), {
    text: [
      rec({ type: 'user', agentId: id, sessionId: SESS, timestamp: iso(now - ago), cwd: 'C:/x', version: '2.1.0', message: { content: `Task of ${id}. Details follow.` } }),
      rec({ type: 'assistant', timestamp: iso(now - ago + 5000), version: '2.1.0', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'make' } }] } }),
    ].join(NL) + NL,
    mtimeMs,
  })
}

const CONTEXT = { tokens: 1, window: 200_000, percent: 0 }
const limits = (pct: number, resetsAt: string): SessionRateLimit[] => [{ kind: 'five_hour', percentUsed: pct, resetsAt }]
const measure = ($: Engine, rateLimits: SessionRateLimit[]) => $.session.measure({ context: CONTEXT, rateLimits, changed: ['rateLimits'] })
function usageBeneath(on: On, first: SessionRateLimit[]) {
  on('session.measure', ($, e) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: { startedAt: 0, context: CONTEXT, rateLimits: first } }))
  on('ui.status', () => ({ value: undefined }))
}
const local = (h: number, m: number) => new Date(2026, 9, 10, h, m).toISOString()

type Ui = { find: (q: { type?: string; key?: string; in?: string }) => Promise<{ key?: string; props: Record<string, unknown> } | undefined>; drawn: (scope?: { in?: string }) => Promise<unknown> }
/** What the office Client was handed on the last draw: its props as JSON, and its region. */
async function handed(ui: Ui): Promise<string> {
  const c = await ui.find({ type: 'Client' })
  expect(c?.key).toBe(OFFICE_KEY)
  return JSON.stringify([c!.props.width, c!.props.height, c!.props.props])
}
type Node = { type: string; props?: Record<string, unknown>; children?: Array<Node | string> }
const textOf = (n: Node | string): string => (typeof n === 'string' ? n : (n.children ?? []).map(textOf).join(''))
/** The office header's meter as the module drew it: the header Box's second Text ('' when the header draws the counts alone). */
async function meterOf(ui: Ui): Promise<string> {
  const header = (function find(n: Node | string): Node | undefined {
    if (typeof n === 'string') return undefined
    if (n.props?.key === 'header') return n
    for (const k of n.children ?? []) { const hit = find(k); if (hit) return hit }
    return undefined
  })((await ui.drawn({ in: OFFICE_KEY })) as Node)
  expect(header, 'the header Box').toBeDefined()
  const texts = (header!.children ?? []).filter((k): k is Node => typeof k !== 'string')
  return texts[1] ? textOf(texts[1]) : ''
}

// (360 polls through the kit: a couple of seconds alone, several times that inside the full parallel run on a loaded machine — the
// budget is load headroom, as the suite's other long walks carry)
test('A QUIET HALF HOUR hands the office Client NOTHING NEW (the props guard): a resting office — a waiting lead, three finished helpers, the five-hour meter drawn — through thirty turns of the minute (360 polls): after every one of them the Client\'s props, width and height are the first draw\'s, byte for byte, and the meter still reads `⏳ 5h ▰▰▰▰▱▱▱▱▱▱ 42% · 14:30`', { timeoutMs: 120_000 }, async ($, on) => {
  const files = restingOffice(T0)
  const { clock } = beneath(on, () => [], { prefs: { lang: 'he', muted: true, showDone: false, pins: [] } }, files)
  usageBeneath(on, limits(42, local(14, 30)))
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount(PANE)
  await clock.advance(POLL_MS)
  const first = await handed(ui)
  const p0 = (await ui.find({ type: 'Client' }))!.props.props as OfficeProps
  expect(p0.rooms.flatMap(r => r.agents.map(a => a.status))).toEqual(['stale', 'done', 'done', 'done'])
  expect(p0.usage).toEqual({ pct: 42, resetsAt: local(14, 30) })
  expect(await meterOf(ui)).toBe('⏳ 5h ▰▰▰▰▱▱▱▱▱▱ 42% · 14:30')
  for (let minute = 1; minute <= 30; minute++) {
    await clock.advance(60_000)
    expect(await handed(ui), `after minute ${minute}`).toBe(first)
  }
  expect(await meterOf(ui)).toBe('⏳ 5h ▰▰▰▰▱▱▱▱▱▱ 42% · 14:30')
  await ui.unmount()
})

test('THE NARROW HEADER keeps the guard: under WIDE_FROM the header draws the short meter `⏳ 5h 42%` (no bar, no reset hour), and the same reading hands the Client the same props through five turns of the minute — both forms of the label are the reading\'s alone', { timeoutMs: 60_000 }, async ($, on) => {
  const files = restingOffice(T0)
  const { clock } = beneath(on, () => [], { prefs: { lang: 'he', muted: true, showDone: false, pins: [] } }, files)
  usageBeneath(on, limits(42, local(14, 30)))
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount({ ...PANE, props: { ...PANE.props, bodyColumns: NARROW } })
  await clock.advance(POLL_MS)
  expect(NARROW).toBeLessThan(WIDE_FROM)
  const first = await handed(ui)
  expect(await meterOf(ui)).toBe('⏳ 5h 42%')
  for (let minute = 1; minute <= 5; minute++) {
    await clock.advance(60_000)
    expect(await handed(ui), `after minute ${minute}`).toBe(first)
  }
  expect(await meterOf(ui)).toBe('⏳ 5h 42%')
  await ui.unmount()
})

test('ONE HELPER AT WORK moves the props when its row does, never with the minute: beside the resting office a helper starts and stays on one tool — its arrival is one change of the props (counts and rooms), its ⏱ at LONG_RUNNING_MS a second (rooms alone), and no other poll of twelve minutes hands the Client anything', { timeoutMs: 60_000 }, async ($, on) => {
  const files = restingOffice(T0)
  const { clock } = beneath(on, () => [], { prefs: { lang: 'he', muted: true, showDone: false, pins: [] } }, files)
  usageBeneath(on, limits(42, local(14, 30)))
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount(PANE)
  await clock.advance(POLL_MS)
  const propsNow = async () => (await ui.find({ type: 'Client' }))!.props.props as OfficeProps
  const t1 = clock.now()
  working(files, 'w1', t1, 30_000, t1)
  let last = await handed(ui)
  let before = await propsNow()
  const moves: string[][] = []
  for (let i = 0; i < 144; i++) {
    await clock.advance(POLL_MS)
    const now = await handed(ui)
    if (now === last) continue
    const p = await propsNow()
    moves.push(changed(before, p))
    last = now
    before = p
  }
  expect(moves).toEqual([['counts', 'rooms'], ['rooms']])
  expect(before.rooms[0]?.agents.find(a => a.id === 'w1')).toMatchObject({ status: 'running', longRunning: true })
  await ui.unmount()
})

test('THE METER FOLLOWS ITS TEXT, NOT THE CLOCK: with the reading unchanged the Client is handed nothing through three minutes of polls; a reading one point up redraws the label as 43% (the props\' `usage` alone moved); a reading of the same rounded percent hands nothing; a new window draws its own reset hour; ⚠ from 80; no reading takes the meter away', { timeoutMs: 60_000 }, async ($, on) => {
  const files = restingOffice(T0)
  const { clock } = beneath(on, () => [], { prefs: { lang: 'he', muted: true, showDone: false, pins: [] } }, files)
  usageBeneath(on, limits(42, local(14, 30)))
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = await $.ui.mount(PANE)
  await clock.advance(POLL_MS)
  expect(await meterOf(ui)).toBe('⏳ 5h ▰▰▰▰▱▱▱▱▱▱ 42% · 14:30')
  const first = await handed(ui)
  for (let i = 0; i < 36; i++) await clock.advance(POLL_MS)
  expect(await handed(ui)).toBe(first)
  const before = (await ui.find({ type: 'Client' }))!.props.props as OfficeProps
  await measure($, limits(43, local(14, 30)))
  const after = (await ui.find({ type: 'Client' }))!.props.props as OfficeProps
  expect(await meterOf(ui)).toBe('⏳ 5h ▰▰▰▰▱▱▱▱▱▱ 43% · 14:30')
  expect(changed(before, after)).toEqual(['usage'])
  const at43 = await handed(ui)
  await measure($, limits(43.4, local(14, 30)))
  await measure($, limits(42.6, local(14, 30)))
  expect(await handed(ui)).toBe(at43)
  await measure($, limits(3, local(19, 30)))
  expect(await meterOf(ui)).toBe('⏳ 5h ▱▱▱▱▱▱▱▱▱▱ 3% · 19:30')
  await measure($, limits(85, local(19, 30)))
  expect(await meterOf(ui)).toBe('⚠ 5h ▰▰▰▰▰▰▰▰▰▱ 85% · 19:30')
  await measure($, [])
  expect(await meterOf(ui)).toBe('')
  await ui.unmount()
})
