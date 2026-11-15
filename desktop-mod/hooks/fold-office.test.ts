// THE FOLD through the kit (spec 2026-11-15-quiet-rooms-fold-design.md): the desktop office with a quiet room and a room
// at work — what is drawn, the fold Button's presses, the choice kept in the prefs (and their $.store mirror), read by a
// new process and pruned with the room.

import { expect, test } from 'claude-code/testing'

import type { Agent } from './model'
import { PERSONA_EMOJI, POLL_MS } from './model'
import { LESS_MARK, MORE_MARK } from './office-layout'
import { OFFICE_KEY, type OfficeProps } from './office-props'
import { T0, beneath } from './test-kit'

const SA = 'sess-aaaa-1111-quiet'
const SB = 'sess-bbbb-2222-working'
const PANE = {
  plugin: 'agent-theater', component: 'Pane', requestId: 'agent-theater',
  props: { title: 'T', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const

function agent(over: Partial<Agent> & { id: string }): Agent {
  return {
    persona_id: 3, emoji: PERSONA_EMOJI[3] ?? '', role: '', subagent_type: 'Explore', status: 'running', tool: 'Read', phase: 'tool',
    task: `Task of ${over.id}.`, task_short: `Task of ${over.id}.`, result: null, start_ms: T0 - 30_000, end_ms: null,
    session: SA.slice(0, 8), session_full: SA, cwd: '/w/a', project: '/w/a', mtime_ms: T0 - 1000,
    is_session: false, closed: false, is_workflow: false, truncated: false, model: 'claude-opus-5-5', ...over,
  }
}
const inB = { session: SB.slice(0, 8), session_full: SB, cwd: '/w/b', project: '/w/b' }
/** Room A: a waiting lead and a helper that finished ten minutes ago — quiet. Room B: a lead and a helper at work — a wave. */
function office(): Agent[] {
  return [
    agent({ id: 'lead-a', is_session: true, status: 'stale', tool: '', phase: 'thinking', topic: 'The quiet conversation.' }),
    agent({ id: 'a1', status: 'done', start_ms: T0 - 900_000, end_ms: T0 - 600_000, mtime_ms: T0 - 600_000, result: 'Done.' }),
    agent({ id: 'lead-b', is_session: true, tool: '', phase: 'thinking', topic: 'The working conversation.', ...inB }),
    agent({ id: 'b1', ...inB }),
  ]
}
const PREFS = (over: Record<string, unknown> = {}) => ({ prefs: { lang: 'he', muted: true, showDone: true, pins: [], ...over } })

type Ui = { find: (q: Record<string, unknown>) => Promise<{ key?: string; text?: string; props: Record<string, unknown> } | undefined>; press: (q: { key: string }) => Promise<unknown>; unmount: () => Promise<unknown> }
async function propsOf(ui: Ui): Promise<OfficeProps> {
  const c = await ui.find({ type: 'Client' })
  expect(c?.key).toBe(OFFICE_KEY)
  return c!.props.props as OfficeProps
}
const roomOf = (p: OfficeProps, id: string) => p.rooms.find(r => r.id === id)!
/** The label of the fold Button on a room's title ('' when the card draws none). */
async function foldLabel(ui: Ui, room: string): Promise<string> {
  const b = await ui.find({ in: OFFICE_KEY, key: `fold:${room}` })
  return b === undefined ? '' : String(b.props.label ?? b.text ?? '')
}
const storedFolds = (store: Record<string, unknown>) => (store.prefs as { folds?: Record<string, string> }).folds

test('THE FOLD on the desktop: the quiet room is drawn folded — its title line and the Button that opens it, no agent row — beside the room at work, which is drawn whole with no fold Button; a press opens the quiet room and keeps the choice in the prefs and their store mirror; a second press folds it again and DROPS the choice (the rule alone folds it)', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => office(), PREFS())
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = (await $.ui.mount({ ...PANE, surface: 'desktop' })) as unknown as Ui
  const p0 = await propsOf(ui)
  expect(p0.rooms.map(r => r.id).sort()).toEqual([SA, SB].sort())
  expect(roomOf(p0, SA)).toMatchObject({ folded: true, agents: [] })
  expect(roomOf(p0, SB).agents.map(a => a.id)).toEqual(['lead-b', 'b1'])
  expect('folded' in roomOf(p0, SB) || 'foldable' in roomOf(p0, SB)).toBe(false)
  // the room at work sorts first (THE ORDER: a wave), the quiet one after it
  expect(p0.rooms.map(r => r.id)).toEqual([SB, SA])
  // drawn: the folded card's Button points into the card (the Hebrew pane's arrow); none of its agents is drawn
  expect(await foldLabel(ui, SA)).toBe(MORE_MARK.rtl)
  expect(await foldLabel(ui, SB)).toBe('')
  expect(await ui.find({ in: OFFICE_KEY, key: 'agent:a1:who' })).toBeUndefined()
  expect(await ui.find({ in: OFFICE_KEY, key: 'agent:b1:who' })).toBeDefined()
  expect(storedFolds(captured.store)).toBeUndefined()
  // a press: the room is opened by hand, the choice kept
  await ui.press({ key: `fold:${SA}` })
  const p1 = await propsOf(ui)
  expect('folded' in roomOf(p1, SA)).toBe(false)
  expect(roomOf(p1, SA).foldable).toBe(true)
  expect(roomOf(p1, SA).agents.map(a => a.id)).toEqual(['lead-a', 'a1'])
  expect(await foldLabel(ui, SA)).toBe(LESS_MARK)
  expect(await ui.find({ in: OFFICE_KEY, key: 'agent:a1:who' })).toBeDefined()
  expect(storedFolds(captured.store)).toEqual({ [SA]: 'open' })
  // it stays open over the polls, however long
  await clock.advance(POLL_MS * 4)
  await clock.advance(600_000)
  expect('folded' in roomOf(await propsOf(ui), SA)).toBe(false)
  // a second press: folded again — and since the rule alone folds a quiet room, the choice is dropped, not kept as `closed`
  await ui.press({ key: `fold:${SA}` })
  expect(roomOf(await propsOf(ui), SA)).toMatchObject({ folded: true, agents: [] })
  expect(await foldLabel(ui, SA)).toBe(MORE_MARK.rtl)
  expect(storedFolds(captured.store)).toBeUndefined()
  await ui.unmount()
})

test('THE FOLD, a pinned room and a new process: a pinned quiet room is drawn open with the Button that folds it — folded by hand it keeps `closed` (the rule would open it); a process that starts with a stored choice draws it at its first draw; the English pane\'s Button points the other way; malformed stored choices are dropped', { timeoutMs: 60_000 }, async ($, on) => {
  const { captured, clock } = beneath(on, () => office(), PREFS({ lang: 'en', pins: [SA], folds: { [SB]: 'closed', 'sess-zzzz': 'sideways', 'sess-yyyy': 3 } }))
  await $.session.start({ cwd: 'C:/x', surface: 'desktop', isInteractive: true })
  await clock.advance(POLL_MS)
  const ui = (await $.ui.mount({ ...PANE, surface: 'desktop' })) as unknown as Ui
  const p0 = await propsOf(ui)
  // the pinned quiet room: open, first, foldable; the room at work was folded by hand in an earlier process: folded, its bar on its title
  expect(p0.rooms.map(r => r.id)).toEqual([SA, SB])
  expect([roomOf(p0, SA).folded, roomOf(p0, SA).foldable]).toEqual([undefined, true])
  expect(roomOf(p0, SB)).toMatchObject({ folded: true, agents: [], wave: { done: 0, total: 1 } })
  expect(await foldLabel(ui, SA)).toBe(LESS_MARK)
  expect(await foldLabel(ui, SB)).toBe(MORE_MARK.ltr)
  // fold the pinned room by hand: `closed` is kept, for the rule would open a pinned room
  await ui.press({ key: `fold:${SA}` })
  expect(roomOf(await propsOf(ui), SA)).toMatchObject({ folded: true, agents: [] })
  expect(storedFolds(captured.store)?.[SA]).toBe('closed')
  // open the room at work by hand: the rule opens a room with a wave, so its `closed` is dropped
  await ui.press({ key: `fold:${SB}` })
  const p2 = await propsOf(ui)
  expect('folded' in roomOf(p2, SB) || 'foldable' in roomOf(p2, SB)).toBe(false)
  expect(storedFolds(captured.store)).toEqual({ [SA]: 'closed' })
  await ui.unmount()
})
