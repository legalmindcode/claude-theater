// THE FOLD (spec 2026-11-15-quiet-rooms-fold-design.md §3, §5): which rooms fold to their title line, and the order
// of the rooms.

import { expect, test } from 'claude-code/testing'

import { FOLD_AFTER_MS, PERSONA_EMOJI } from './model'
import type { Agent } from './model'
import { officeView, roomFolded, roomQuietSince } from './ui'

const T0 = 1_700_000_040_000
/** An agent of conversation `s`: working from `start` (seconds before T0), or finished at `end` (seconds before T0). */
function ag(id: string, s: string, start: number, end: number | null, over: Partial<Agent> = {}): Agent {
  return {
    id, persona_id: 3, emoji: PERSONA_EMOJI[3] ?? '', role: '', subagent_type: '', status: end === null ? 'running' : 'done', tool: 'Read', phase: 'tool',
    task: `Task of ${id}.`, task_short: `Task of ${id}.`, result: null, start_ms: T0 - start * 1000, end_ms: end === null ? null : T0 - end * 1000,
    session: s.slice(0, 8), session_full: s, cwd: '/w', project: '/w', mtime_ms: T0 - (end ?? 0) * 1000,
    is_session: false, closed: false, is_workflow: false, truncated: false, model: '', ...over,
  } as Agent
}
/** The rule's input for a quiet room with nothing else set: no search, no choice, not pinned, no wave, never a subagent. */
const QUIET = { search: '', choice: undefined, pinned: false, wave: false, quietSince: undefined, now: T0 } as const

test('THE FOLD, the rule: a room with no subagent is folded; a wave opens it; a pin opens it; it stays open FOLD_AFTER_MS after its last finish, to the millisecond', () => {
  expect(FOLD_AFTER_MS).toBe(120_000)
  expect(roomFolded(QUIET)).toBe(true)
  expect(roomFolded({ ...QUIET, wave: true })).toBe(false)
  expect(roomFolded({ ...QUIET, pinned: true })).toBe(false)
  expect(roomFolded({ ...QUIET, quietSince: T0 - (FOLD_AFTER_MS - 1) })).toBe(false)
  expect(roomFolded({ ...QUIET, quietSince: T0 - FOLD_AFTER_MS })).toBe(true)
  expect(roomFolded({ ...QUIET, quietSince: T0 - 3_600_000 })).toBe(true)
})

test('THE FOLD, the choice by hand: `open` keeps a quiet room open, `closed` folds a pinned room and a room with a wave; a search opens every room, a closed one too', () => {
  expect(roomFolded({ ...QUIET, choice: 'open' })).toBe(false)
  expect(roomFolded({ ...QUIET, choice: 'open', quietSince: T0 - 3_600_000 })).toBe(false)
  expect(roomFolded({ ...QUIET, choice: 'closed', pinned: true })).toBe(true)
  expect(roomFolded({ ...QUIET, choice: 'closed', wave: true })).toBe(true)
  expect(roomFolded({ ...QUIET, choice: 'closed', quietSince: T0 - 1000 })).toBe(true)
  // a search: every room shown holds a match, so it is open — whatever the choice
  expect(roomFolded({ ...QUIET, search: 'map' })).toBe(false)
  expect(roomFolded({ ...QUIET, search: 'map', choice: 'closed' })).toBe(false)
  expect(roomFolded({ ...QUIET, search: '   ' })).toBe(true) // (blank text is no search)
})

test('roomQuietSince: the latest end of a conversation\'s finished subagents — end_ms, else mtime_ms; the lead is skipped; a conversation with no finished subagent has no entry', () => {
  const agents = [
    ag('lead', 'sess-aaaa', 900, 5, { is_session: true }),   // the lead's own end is not the room's
    ag('d1', 'sess-aaaa', 300, 200),
    ag('d2', 'sess-aaaa', 250, 100),
    ag('r1', 'sess-bbbb', 60, null),
    ag('d3', 'sess-cccc', 500, null, { status: 'done', end_ms: null, mtime_ms: T0 - 40_000 }),
  ]
  const q = roomQuietSince(agents)
  expect(q.get('sess-aaaa')).toBe(T0 - 100_000)
  expect(q.has('sess-bbbb')).toBe(false)
  expect(q.get('sess-cccc')).toBe(T0 - 40_000)
})

test('THE ORDER (§5): pinned rooms first, then the rooms with a wave, then by the last change — a room whose lead alone is working no longer precedes a newer quiet room', () => {
  const lead = (s: string, mtime: number): Agent => ag(`lead-${s}`, s, 900, null, { is_session: true, mtime_ms: T0 - mtime * 1000 })
  const agents = [
    lead('sess-thinking', 50),                                  // its lead works, no subagent: quiet
    lead('sess-newer', 10), ag('n1', 'sess-newer', 300, 200, { mtime_ms: T0 - 10_000 }),   // quiet, changed more recently
    lead('sess-wave', 400), ag('w1', 'sess-wave', 100, null, { mtime_ms: T0 - 400_000 }),  // a subagent works: a wave
    lead('sess-pinned', 800),                                   // pinned, the oldest
  ]
  const view = officeView(agents, '', 'he', true, {}, ['sess-pinned'])
  expect(view.rooms).toEqual(['sess-pinned', 'sess-wave', 'sess-newer', 'sess-thinking'])
})
