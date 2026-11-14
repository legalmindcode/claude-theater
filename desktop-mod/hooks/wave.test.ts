// THE WAVE (spec 2026-11-14-room-progress-bar-design.md §3): the current run of work of one conversation's subagents,
// derived from their start and end times alone.

import { expect, test } from 'claude-code/testing'

import { PERSONA_EMOJI } from './model'
import type { Agent } from './model'
import { roomWaves } from './ui'

const T0 = 1_700_000_040_000
const S = 'sess-aaaa'
/** A subagent of conversation `S`: working from `start` (seconds before T0), or finished at `end` (seconds before T0). */
function sub(id: string, start: number | null, end: number | null, over: Partial<Agent> = {}): Agent {
  return {
    id, persona_id: 3, emoji: PERSONA_EMOJI[3] ?? '', role: '', subagent_type: '', status: end === null ? 'running' : 'done', tool: 'Read', phase: 'tool',
    task: `Task of ${id}.`, task_short: `Task of ${id}.`, result: null, start_ms: start === null ? null : T0 - start * 1000, end_ms: end === null ? null : T0 - end * 1000,
    session: 'sess-aaa', session_full: S, cwd: '/w', project: '/w', mtime_ms: T0 - (end ?? 0) * 1000,
    is_session: false, closed: false, is_workflow: false, truncated: false, model: '', ...over,
  } as Agent
}
const waveOf = (agents: Agent[]) => roomWaves(agents).get(S)

test('no wave: a conversation with no subagents, with its lead alone, or whose subagents all finished', () => {
  expect(roomWaves([]).size).toBe(0)
  expect(waveOf([sub('lead', 600, null, { is_session: true })])).toBeUndefined()
  expect(waveOf([sub('d1', 300, 200), sub('d2', 250, 100)])).toBeUndefined()
})

test('one wave: the working agents and the finished ones that overlapped them', () => {
  // three working since 100 s ago; two finished that ran beside them
  const agents = [sub('r1', 100, null), sub('r2', 90, null), sub('r3', 80, null), sub('d1', 95, 40), sub('d2', 85, 30)]
  expect(waveOf(agents)).toEqual({ done: 2, total: 5 })
})

test('two waves with a rest between them: only the second is counted', () => {
  // the first wave ended 200 s ago; the second began 100 s ago
  const agents = [sub('old1', 400, 300), sub('old2', 350, 200), sub('r1', 100, null), sub('d1', 90, 50)]
  expect(waveOf(agents)).toEqual({ done: 1, total: 2 })
})

test('a chain of overlaps reaches back: a finished agent that overlapped a finished agent that overlapped a working one', () => {
  // c ran 300-150, b ran 200-80, a works since 100: all one wave; x (500-400) ended before c began
  const agents = [sub('x', 500, 400), sub('c', 300, 150), sub('b', 200, 80), sub('a', 100, null)]
  expect(waveOf(agents)).toEqual({ done: 2, total: 3 })
})

test('a waiting agent (stale) is not finished and keeps the wave open; the lead is never counted', () => {
  const agents = [sub('lead', 900, null, { is_session: true }), sub('w1', 100, null, { status: 'stale' }), sub('d1', 90, 20)]
  expect(waveOf(agents)).toEqual({ done: 1, total: 2 })
})

test('missing times: a finished agent with no end time is timed by its mtime; a working agent with no start time is counted and moves no boundary; a finished agent with no start time is not counted', () => {
  // d1 has no end_ms: its mtime (30 s ago) is after r1's start (100 s ago), and it began before it: the same wave
  expect(waveOf([sub('r1', 100, null), sub('d1', 150, null, { status: 'done', end_ms: null, mtime_ms: T0 - 30_000 })])).toEqual({ done: 1, total: 2 })
  // r2 has no start: counted; the boundary is r1's
  expect(waveOf([sub('r1', 100, null), sub('r2', null, null), sub('d1', 90, 20)])).toEqual({ done: 1, total: 3 })
  // only a start-less working agent: no boundary at all, so no finished agent joins
  expect(waveOf([sub('r2', null, null), sub('d1', 90, 20)])).toEqual({ done: 0, total: 1 })
  // a finished agent with no start is left out
  expect(waveOf([sub('r1', 100, null), sub('d1', null, 20)])).toEqual({ done: 0, total: 1 })
})

test('each conversation has its own wave', () => {
  const other = { session_full: 'sess-bbbb', session: 'sess-bbb' }
  const waves = roomWaves([sub('r1', 100, null), sub('d1', 90, 20), sub('o1', 50, null, other), sub('o2', 40, 10, other), sub('o3', 45, 5, other)])
  expect(waves.get(S)).toEqual({ done: 1, total: 2 })
  expect(waves.get('sess-bbbb')).toEqual({ done: 2, total: 3 })
})
