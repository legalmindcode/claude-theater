// THE REOPEN's pure half (pane-mark.ts): what counts as a conversation's pane
// mark, when a mark is too old to act on, and which marks the sweep names.
// The store calls take `$` and live in register.tsx: their tests are
// reopen.test.ts's, through the kit.

import { expect, test } from 'claude-code/testing'

import { PANE_MARKS_MAX, PANE_MARK_TTL_MS, STORE_PANE_PREFIX } from './model'
import { paneMarkExpired, paneMarksToDrop, parsePaneMark } from './pane-mark'

const NOW = 1_800_000_000_000

test('parsePaneMark: `{ at }` with a finite number above 0 is a mark (a stray field is ignored); nothing, a text, a number, a list, an empty object, an `at` that is a text, 0, negative, NaN or infinite is no mark', () => {
  expect(parsePaneMark({ at: NOW })).toEqual({ at: NOW })
  expect(parsePaneMark({ at: NOW, more: 1 })).toEqual({ at: NOW })
  for (const bad of [undefined, null, 'x', 7, true, [], [NOW], {}, { at: '1' }, { at: 0 }, { at: -5 }, { at: Number.NaN }, { at: Number.POSITIVE_INFINITY }]) {
    expect(parsePaneMark(bad), JSON.stringify(bad)).toBeNull()
  }
})

test('paneMarkExpired: a mark is fresh at exactly PANE_MARK_TTL_MS and expired one millisecond past it; a mark dated after now (a clock set back) is fresh', () => {
  expect(PANE_MARK_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000)
  expect(paneMarkExpired({ at: NOW - PANE_MARK_TTL_MS }, NOW)).toBe(false)
  expect(paneMarkExpired({ at: NOW - PANE_MARK_TTL_MS - 1 }, NOW)).toBe(true)
  expect(paneMarkExpired({ at: NOW + 60_000 }, NOW)).toBe(false)
})

test('paneMarksToDrop, THE SWEEP: nothing while PANE_MARKS_MAX marks or fewer are listed, even dead ones; past it the expired and the unreadable are named and NO fresh mark ever is, however many and however old; this conversation\'s own key is never named', () => {
  expect(PANE_MARKS_MAX).toBe(200)
  expect(STORE_PANE_PREFIX).toBe('pane:')
  const fresh = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `pane:f${i}`, mark: { at: NOW - 1000 - i } }))
  const old = { key: 'pane:old', mark: { at: NOW - PANE_MARK_TTL_MS - 1 } }
  const bad = { key: 'pane:bad', mark: null }
  // at the bound: nothing, although two of the 200 are dead (the usual case costs the listing alone)
  expect(paneMarksToDrop([...fresh(PANE_MARKS_MAX - 2), old, bad], NOW)).toEqual([])
  expect(paneMarksToDrop([], NOW)).toEqual([])
  // one past it: the dead ones, and only they
  expect(paneMarksToDrop([...fresh(PANE_MARKS_MAX - 1), old, bad], NOW).sort()).toEqual(['pane:bad', 'pane:old'])
  // far past it with every mark fresh: nothing — no oldest-first pass, so the mark of a living conversation is never swept
  expect(paneMarksToDrop(fresh(PANE_MARKS_MAX + 50), NOW)).toEqual([])
  // this conversation's own key is kept although it is expired
  const mine = { key: 'pane:mine', mark: { at: 1 } }
  expect(paneMarksToDrop([...fresh(PANE_MARKS_MAX), mine, old], NOW, 'pane:mine')).toEqual(['pane:old'])
  expect(paneMarksToDrop([...fresh(PANE_MARKS_MAX), mine, old], NOW).sort()).toEqual(['pane:mine', 'pane:old'])
})
