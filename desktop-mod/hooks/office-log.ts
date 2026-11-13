// THE RECORD — the pure half: a small permanent record of the desktop office
// Client's falls and recoveries, kept in the mod's own `$.store`. Pure: no `$`
// here (the writer takes `$`, so it lives in register.tsx — logOffice), only
// the shapes, the key and the bounds, which the writer and the tests share.
//
// WHY A RECORD. The Client faults while the desktop's page is starved (model.ts
// CLIENT_RETRIES; the diagnosis of 28.10-1.11), in waves, days apart, and never
// in the kit. The debug log's line is gone with the app's log rotation, and
// the temporary diagnostic that followed (28.10: one list under the store key
// `diag`, capped at 40) was crowded out by its own noise and lost entries.
// What a later diagnosis needs is small: WHEN the office fell, in WHICH
// conversation, at which stage the surface gave up and why (its own line),
// which retry was armed — and whether a Client really drew again afterwards.
//
// WHAT AN ENTRY HOLDS. `t` (the engine's clock, ms; 0 when it could not be
// read), `sid` (the conversation's id; '' when unknown) and one of:
//   fault   the surface reported the Client's fall (`ui.fault`) while the
//           Client was drawn: `phase` (load | render | run), `why` (the
//           surface's reason as ONE line, its first OFFICE_LOG_WHY_MAX code
//           points — cutWhy), `retry` (the number of the retry this fault
//           armed, 1..CLIENT_RETRIES; 0: none — the wave is spent and the cards
//           stay until a spawn, an opening of the pane or /theater). A fault
//           that arrives while the cards already show is not recorded: one
//           entry per fall the person can see.
//   up      a recovery: THE MOUNT NOTE of a fresh Client (office-client.tsx)
//           heard while an outage was open — `after` (ms since the outage's
//           FIRST fault; 0 when a clock could not be read) and `faults` (the
//           faults recorded in the outage).
//   asked   /theater was run while the cards showed.
//   reopen  the pane was opened again by the mod after the app restarted the
//           conversation's engine process (register.tsx writes it there).
// NOTHING ELSE, EVER: no agent text, title, task, path, tool name or prompt.
// The one free text is `why`, the surface's own line about the mod's module;
// it is cut and stored, never parsed.
//
// WHY ONE KEY PER ENTRY (`office-log:<time>:<conversation>:<count>`), never
// read back. Every open conversation runs its own engine process, and all of
// them share the mod's one store file. The engine (2.1.321) locks that file
// around each single `set` or `delete` — lock, read afresh, merge the ONE key,
// rewrite — but not around a plugin's get-then-set, so a list that several
// writers read, extend and write back loses entries (the `diag` list lost at
// least two this way inside one process). A writer that only ever sets keys it
// minted itself cannot lose anybody's entry, needs no parsing of stored data,
// and a prune (delete the record's own keys past the newest OFFICE_LOG_MAX —
// staleLogKeys) is idempotent: two processes pruning at once still converge.
// The key's time is zero-padded so plain string order is time order; the
// conversation's first characters and the process's count keep two entries of
// one millisecond apart. (Two entries of the SAME millisecond may sort either
// way round: the values carry `t`, and a prune that close to the bound may
// drop one a millisecond newer than the one it keeps.)
//
// WHAT THE RECORD CAN AND CANNOT PROVE — read this before counting anything:
//  * `fault` proves the surface reported a fall there and then, with that
//    stage and reason, and which retry the hooks armed.
//  * `up` proves that after it a fresh Client's module was called a SECOND
//    time and its post reached the hooks while the hooks were drawing the
//    Client. On the desktop page this build was read against (Claude
//    5.1231.2.0, engine 2.1.321) the second call is asked for only after the
//    page took the first render's answer and accepted its tree, so `up` means
//    "the office was drawn again" — by that build's ordering, not by contract.
//    It does NOT prove the person saw it (a covered window), nor that it
//    stayed up: the very render that posts the note can still miss the page's
//    2 s limit, so an `up` may be followed at once by a `fault`, truthfully.
//  * A MISSING `up` PROVES NOTHING. The pane hidden or closed, the
//    conversation left, the process ended, a hot reload of the mod (the open
//    outage is module memory), or the note displaced by a press in the same
//    frame all look the same. Never count "faults without an up" as "never
//    came back".
//  * `up.after` CAN BE LARGE and unrelated to one wave: an outage whose note
//    was lost stays open, and the next mount — possibly hours later — closes
//    it. `faults` then spans all of that time too.
//  * A process that died records nothing; only `reopen` marks a restart.
//  * The outage and the fall-back flag are one per engine process, not per
//    surface: with two desktop surfaces on one conversation an `up` from one
//    closes the outage while the other may still be loading.
//
// THE BOUNDS. At most OFFICE_LOG_MAX entries (a spent wave is eleven faults
// and an `up`: about eight such waves; at the rate of the worst day seen,
// thirteen falls in twenty hours, about a week), each about 300 characters on
// disk: some 30 KB of the store file at the bound.
// A session with no fall writes nothing at all.
//
// READING IT. The store file of the mod (`~/.claude/plugins/store/`, the file
// whose name starts with the plugin's) is plain JSON: every key that starts
// with OFFICE_LOG_PREFIX is an entry, and each value is self-contained. There
// is no command for it: the reader is whoever diagnoses the next wave.

import { capPoints } from './model'

/** Every key of the record starts with this; nothing else in the store does. */
export const OFFICE_LOG_PREFIX = 'office-log:'
/** The record's bound: a write prunes the record's own keys past the newest this many. */
export const OFFICE_LOG_MAX = 100
/** A fault's `why`: at most this many code points of the surface's reason (the surface's own bound is 200 characters; the four reasons seen stay distinct in 100). */
export const OFFICE_LOG_WHY_MAX = 100

/** What an entry says, by kind (the header: WHAT AN ENTRY HOLDS). */
export type OfficeLogBody =
  | { k: 'fault'; phase: 'load' | 'render' | 'run'; why: string; retry: number }
  | { k: 'up'; after: number; faults: number }
  | { k: 'asked' }
  | { k: 'reopen' }
/** An entry as stored: the engine's clock (0: unread), the conversation's id ('': unknown), and what it says. */
export type OfficeLogEntry = { t: number; sid: string } & OfficeLogBody

/** The outage open now: the engine's clock at its first recorded fault, and the faults recorded since. */
export type Outage = { since: number; faults: number }

/**
 * The surface's reason as the record keeps it: ONE line (every run of whitespace a space, the ends trimmed), its first
 * OFFICE_LOG_WHY_MAX code points and an ellipsis when cut (capPoints: never half an emoji). The reason is the surface's
 * untrusted text — whatever it is, it becomes a short string here and is never parsed.
 */
export function cutWhy(reason: unknown): string {
  return capPoints(String(reason ?? '').split(/\s+/).filter(Boolean).join(' '), OFFICE_LOG_WHY_MAX)
}

/**
 * The key of one entry: the prefix, the time as 13 digits (so string order is time order until the year 2286; a clock that
 * could not be read is 0), the conversation id's first 8 characters (enough to tell the open conversations apart; the value
 * holds the whole id) and the writing process's count (two entries of one millisecond never share a key).
 */
export function officeLogKey(t: number, sid: string, seq: number): string {
  const ms = Number.isFinite(t) && t > 0 ? Math.floor(t) : 0
  return `${OFFICE_LOG_PREFIX}${String(ms).padStart(13, '0')}:${String(sid ?? '').slice(0, 8)}:${seq}`
}

/** What a prune deletes: of `keys` (the whole store's), the record's own past its newest `max`, oldest first — never another key. */
export function staleLogKeys(keys: readonly string[], max = OFFICE_LOG_MAX): string[] {
  const mine = keys.filter(k => k.startsWith(OFFICE_LOG_PREFIX)).sort()
  return mine.slice(0, Math.max(0, mine.length - Math.max(0, max)))
}

/**
 * Whether a mount note closes the outage and so writes `up`: only while one is open AND the Client is the one drawn. With
 * the cards showing, a note can only be a late one from the instance that just faulted (the engine may hand the hooks the
 * fault first): closing the outage on it would record a recovery of a few ms that never happened.
 */
export function noteCloses(outage: Outage | null, cardsShow: boolean): outage is Outage {
  return outage !== null && !cardsShow
}

/** The outage after one more recorded fault at `now`: opened at its first fault, one fault more each time (a new record: the old one is not changed). */
export function nextOutage(prev: Outage | null, now: number): Outage {
  return prev === null ? { since: now, faults: 1 } : { since: prev.since, faults: prev.faults + 1 }
}
