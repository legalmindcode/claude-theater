// THE REOPEN — the pure half: a conversation's PANE MARK in the mod's `$.store`.
// Pure: no `$` here (the store calls take `$`, so they live in register.tsx —
// rememberPane, forgetPane, reopenPane), only the mark's shape, its age limit
// and the sweep's choice, which the writer and the tests share.
//
// WHY A MARK. The desktop app ends the engine process of a conversation that
// sat idle while memory is short, and of every conversation when the app
// restarts, and starts a new process — with the same conversation id — when
// the person returns. The pane roster (`$.ui.panes`), `$.state` and the
// module's memory all belong to the process, so the new one has no pane and no
// way to know there was one: the theater stayed gone until the next subagent
// or a /theater. The mark is what outlives the process: one `$.store` key per
// conversation (model.ts STORE_PANE_PREFIX + the conversation's id) saying
// "this conversation's pane was open and nobody closed it".
//
// ITS LIFE. Written by the poll that first finds the pane SHOWN, deleted by
// the poll that first finds it no longer listed (the person closed it), read
// once by a new process REOPEN_DELAY_MS after its session.start: present,
// readable and not expired, with no pane listed — the pane is opened again.
// The value is `{ at }`, the engine's clock when the pane was first found
// shown or was opened again; `at` exists only to let a mark expire.
//
// WHAT IT HOLDS. A conversation's id (in the key) and a time. Nothing of the
// conversation itself.

import { PANE_MARKS_MAX, PANE_MARK_TTL_MS } from './model'

/** A conversation's pane mark: when its pane was first found shown, or was opened again (the engine's clock, ms). */
export type PaneMark = { at: number }

/** A stored value as a mark: an object whose `at` is a finite number above 0. Anything else is no mark — a bad value never opens a pane. */
export function parsePaneMark(v: unknown): PaneMark | null {
  if (typeof v !== 'object' || v === null) return null
  const at = (v as { at?: unknown }).at
  return typeof at === 'number' && Number.isFinite(at) && at > 0 ? { at } : null
}

/** Is the mark too old to act on at `now`? (A mark dated after `now` — a clock set back — is fresh.) */
export function paneMarkExpired(mark: PaneMark, now: number): boolean {
  return now - mark.at > PANE_MARK_TTL_MS
}

/**
 * THE SWEEP: which marks to delete, given every mark key of the store with its value parsed (null: unreadable). Nothing
 * while PANE_MARKS_MAX or fewer are listed — the usual case, which costs the listing alone. Past it: the unreadable and the
 * expired ones, and ONLY those. There is no oldest-first pass: a fresh mark may be the mark of a living conversation with
 * its pane up, and deleting it would lose that pane at the next restart, while the dead ones are all the growth there is (a
 * mark is deleted when its pane is closed; what stays behind are the conversations that never came back, some tens of bytes
 * each). `keep` — this conversation's own key — is never named.
 */
export function paneMarksToDrop(marks: ReadonlyArray<{ key: string; mark: PaneMark | null }>, now: number, keep?: string): string[] {
  if (marks.length <= PANE_MARKS_MAX) return []
  return marks.filter(m => m.key !== keep && (m.mark === null || paneMarkExpired(m.mark, now))).map(m => m.key)
}
