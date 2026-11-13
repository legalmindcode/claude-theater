// THE RECORD's pure half (office-log.ts): how a surface's reason is cut, how an
// entry's key is built and sorts, which keys a prune names, and how an outage
// counts its faults — and what THE MOUNT NOTE is (office-props.ts isOfficeNote).
// The writer itself takes `$` and lives in register.tsx: its tests are
// register.test.ts's (THE RECORD), through the kit.

import { expect, test } from 'claude-code/testing'

import { OFFICE_LOG_MAX, OFFICE_LOG_PREFIX, OFFICE_LOG_WHY_MAX, cutWhy, nextOutage, noteCloses, officeLogKey, staleLogKeys } from './office-log'
import { isOfficeNote } from './office-props'

/** The four reasons the desktop surface gave in the 28.10-1.11 diagnosis, verbatim (92, 94, 113 and 157 characters). */
const REASONS = [
  'its module frame did not answer: its shell ran, the runtime inside never did; waited 10000ms',
  'an instance of hooks/office-client.tsx did not answer a render within 2000ms of a loaded frame',
  "did not load: the module's top level never settled (an import or a top-level await still pending); waited 10000ms",
  "its shell did not start: its document did not load from the page's own origin (unreachable, or refused by the page's content security policy); waited 10000ms",
]

test("cutWhy: a surface's reason is kept whole up to OFFICE_LOG_WHY_MAX code points and cut there with an ellipsis, never inside an emoji; its whitespace runs are one space; what is no string is its text, and nothing is the empty text", () => {
  expect(OFFICE_LOG_WHY_MAX).toBe(100)
  expect(REASONS.map(r => r.length)).toEqual([92, 94, 113, 157])
  // the two short ones whole, the two long ones their first 100 code points and an ellipsis
  expect(cutWhy(REASONS[0])).toBe(REASONS[0])
  expect(cutWhy(REASONS[1])).toBe(REASONS[1])
  for (const r of REASONS.slice(2)) {
    const cut = cutWhy(r)
    expect(cut.endsWith('…')).toBe(true)
    expect(Array.from(cut).length).toBeLessThanOrEqual(OFFICE_LOG_WHY_MAX + 1)
    expect(r.startsWith(cut.slice(0, -1))).toBe(true)
  }
  // the four stay apart once cut: the record still says which stage timed out
  expect(new Set(REASONS.map(r => cutWhy(r))).size).toBe(4)
  // exactly at the bound: whole; one past it: cut
  expect(cutWhy('a'.repeat(100))).toBe('a'.repeat(100))
  expect(cutWhy('a'.repeat(101))).toBe('a'.repeat(100) + '…')
  // code points, not UTF-16 units: an emoji at the bound is kept or dropped whole
  expect(cutWhy('🎭'.repeat(120))).toBe('🎭'.repeat(100) + '…')
  // one line: tabs, newlines and runs of spaces are one space, the ends trimmed
  expect(cutWhy('  a\t\tb\r\n c   d \n')).toBe('a b c d')
  // what is no string is its text; nothing is ''
  expect(cutWhy(42)).toBe('42')
  expect(cutWhy(undefined)).toBe('')
  expect(cutWhy(null)).toBe('')
  expect(cutWhy('')).toBe('')
})

test("officeLogKey: the prefix, the time in 13 digits, the conversation id's first 8 characters and the process's count — keys sort as strings in time order, two entries of one millisecond differ, and a clock or an id that could not be read still gives a well-formed key", () => {
  expect(OFFICE_LOG_PREFIX).toBe('office-log:')
  expect(officeLogKey(1_793_432_410_377, '0b6f19fe-4f04-47fe-af0e-934feaa0b138', 1)).toBe('office-log:1793432410377:0b6f19fe:1')
  // the same millisecond, the same conversation: the count tells them apart
  expect(officeLogKey(5, 'abcdefgh-1', 1)).not.toBe(officeLogKey(5, 'abcdefgh-1', 2))
  // string order is time order, across a change in the number of digits too (the padding), whatever the counts
  const times = [999, 1000, 9_999_999_999, 10_000_000_000, 1_793_432_410_377, 1_793_432_410_378]
  const keys = times.map((t, i) => officeLogKey(t, 'sess', times.length - i))
  expect([...keys].sort()).toEqual(keys)
  // a clock that failed (0), a negative or broken time, a fraction, an unknown conversation
  expect(officeLogKey(0, '', 3)).toBe('office-log:0000000000000::3')
  expect(officeLogKey(-5, 'x', 1)).toBe('office-log:0000000000000:x:1')
  expect(officeLogKey(Number.NaN, 'x', 1)).toBe('office-log:0000000000000:x:1')
  expect(officeLogKey(12.9, 'x', 1)).toBe('office-log:0000000000012:x:1')
  // far under the engine's bound on a key (256 characters)
  expect(officeLogKey(1_793_432_410_377, 'x'.repeat(500), 123_456).length).toBeLessThan(45)
})

test("staleLogKeys: a prune names the record's own keys alone — the oldest past the newest OFFICE_LOG_MAX — and never another key of the store, wherever it sorts", () => {
  expect(OFFICE_LOG_MAX).toBe(100)
  const entry = (i: number) => officeLogKey(1_700_000_000_000 + i, 'sess-aaaa', i + 1)
  const others = ['prefs', 'usageToast', 'roomDone', 'diag', 'office-log', 'office-logx:1', 'zz', 'pane:abc']
  // at the bound and under it: nothing
  expect(staleLogKeys([])).toEqual([])
  expect(staleLogKeys(others)).toEqual([])
  expect(staleLogKeys([...others, ...Array.from({ length: OFFICE_LOG_MAX }, (_, i) => entry(i))])).toEqual([])
  // one over: the oldest, whatever order the store lists them in
  const over = Array.from({ length: OFFICE_LOG_MAX + 1 }, (_, i) => entry(i))
  expect(staleLogKeys([...over].reverse().concat(others))).toEqual([entry(0)])
  // far over (a process that died between its write and its prune, many times): every extra, oldest first
  const far = Array.from({ length: OFFICE_LOG_MAX + 37 }, (_, i) => entry(i))
  expect(staleLogKeys([...others, ...far])).toEqual(far.slice(0, 37))
  // the bound is a parameter (a test's small store)
  expect(staleLogKeys([entry(2), 'prefs', entry(0), entry(1)], 2)).toEqual([entry(0)])
  expect(staleLogKeys([entry(0)], 0)).toEqual([entry(0)])
})

test('nextOutage: the first fault opens the outage at its time; every further fault keeps that time and adds one', () => {
  // (the one test of `faults` past 1: in the kit every retry's Client mounts at once and its note closes the outage, so two
  // recorded faults with no `up` between them cannot be staged there)
  const one = nextOutage(null, 1000)
  expect(one).toEqual({ since: 1000, faults: 1 })
  const two = nextOutage(one, 4000)
  expect(two).toEqual({ since: 1000, faults: 2 })
  expect(nextOutage(two, 99_000)).toEqual({ since: 1000, faults: 3 })
  // (a new record each time: the caller's old one is not changed under it)
  expect(one).toEqual({ since: 1000, faults: 1 })
})

test('noteCloses: a mount note closes an outage only while one is open and the Client is the one drawn — never while the cards show (a late note of the instance that just faulted is no recovery), never with no outage open', () => {
  // (the kit cannot stage a note heard while the cards show: it refuses a post when the drawing holds no Client — so the
  // rule the ui.message hook applies is pinned here)
  const open = { since: 1000, faults: 2 }
  expect(noteCloses(open, false)).toBe(true)
  expect(noteCloses(open, true)).toBe(false)
  expect(noteCloses(null, false)).toBe(false)
  expect(noteCloses(null, true)).toBe(false)
})

test('isOfficeNote: THE MOUNT NOTE is an object whose `t` is `mounted` — a batch (even one carrying such an item), an action, a list, a text and nothing are not', () => {
  expect(isOfficeNote({ t: 'mounted' })).toBe(true)
  expect(isOfficeNote({ t: 'mounted', extra: 1 })).toBe(true)
  expect(isOfficeNote({ t: 'batch', i: 'x', items: [{ t: 'mounted', n: 1 }] })).toBe(false)
  expect(isOfficeNote({ t: 'help' })).toBe(false)
  expect(isOfficeNote({})).toBe(false)
  expect(isOfficeNote([{ t: 'mounted' }])).toBe(false)
  expect(isOfficeNote('mounted')).toBe(false)
  expect(isOfficeNote(null)).toBe(false)
  expect(isOfficeNote(undefined)).toBe(false)
})
