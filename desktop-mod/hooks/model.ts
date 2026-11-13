// Shared model: the payload/agent types (re-exported from the contract), the
// constants ported from claude_theater.py, the $.state atoms every module
// reads, and the few pure helpers both the scanner and the UI need.
//
// Owned by the architect. Builders ADD to this file only when a value is
// needed by two of {scanner, live, ui}; otherwise keep it in your own module.

import type {
  TheaterAgent,
  TheaterLiveAgent,
  TheaterPayload,
  TheaterPhase,
  TheaterPrefs,
  TheaterStatus,
  TheaterView,
} from '../types'

export type {
  TheaterAgent,
  TheaterLiveAgent,
  TheaterPayload,
  TheaterPhase,
  TheaterPrefs,
  TheaterStatus,
  TheaterView,
}

/** Shorter aliases used inside the hooks modules. */
export type Agent = TheaterAgent
export type Payload = TheaterPayload
export type LiveAgent = TheaterLiveAgent
export type Prefs = TheaterPrefs
export type View = TheaterView

// ---------------------------------------------------------------------------
// Constants (claude_theater.py lines 39-58, 266-267, 658) — same values, except the
// two phase-1 cadence constants (GLOB_TTL_SEC, POLL_MS: the scan was slowing the machine).
// ---------------------------------------------------------------------------

/**
 * The plugin's name (plugin.json `name`, the $.state / $.store namespace, the
 * pane id). The spec says "claude-theater", but `claude plugin validate`
 * refuses a third-party name starting with "claude-" (reserved for Anthropic's
 * own), so the mod is `agent-theater` — a change the engine forces.
 */
export const PLUGIN = 'agent-theater' as const
/** The pane's id for $.ui.open / the ui.render matcher. */
export const PANE_ID = 'agent-theater' as const
/** The slash command. */
export const COMMAND = 'theater' as const

/** Only show agents whose file changed in the last N minutes. */
export const MAX_AGE_MIN = 180
/** An at-rest agent untouched this long is shown as idle (`stale`). */
export const RUNNING_STALE_SEC = 90
/** A mid-tool/mid-turn agent silent longer than this is treated as hung and may go idle. */
export const IN_FLIGHT_MAX_SEC = 1200
/** Directory listings are reused this long between scans: 30 s (was the Python _throttled_glob's 6 s). */
export const GLOB_TTL_SEC = 30
/** Stop reasons that mean "the turn continues", never "done". */
export const CONTINUATION_STOP_REASONS: readonly string[] = ['tool_use', 'pause_turn']
/** A result longer than this is cut and `truncated` set. */
export const RESULT_CHAR_LIMIT = 4000
/** Claude Code versions the parser was tested against (major.minor). */
export const KNOWN_CC_VERSIONS: readonly string[] = ['2.1']
/** Tail window read from a transcript, bytes (Python read_tail_lines max_bytes). */
export const TAIL_MAX_BYTES = 200_000
/** Keep at most this many parsed events per transcript (the tail is what status/phase/done read). */
export const MAX_EVENTS = 400
/** `$.fs.read` rejects a file over 4 MiB; the scanner degrades instead of crashing. */
export const FS_READ_LIMIT = 4 * 1024 * 1024
/** The scan period: 5 s (was the extension's 1.5 s); only while the pane is open. */
export const POLL_MS = 5000
/** ⏰ long-running badge threshold. */
export const LONG_RUNNING_MS = 10 * 60 * 1000
/** ⭐ "just finished" window (PAGE line 1583: the `recent` class is removed 10 s after the finish). */
export const JUST_FINISHED_MS = 10 * 1000

/** Display order of statuses. */
export const STATUS_ORDER: Record<TheaterStatus, number> = { running: 0, stale: 1, done: 2 }

/**
 * 48 persona emojis, index-aligned with PERSONAS_EN / PERSONAS_HE in
 * personas.ts. First 16 unchanged so an existing agent keeps its avatar.
 */
export const PERSONA_EMOJI: readonly string[] = [
  '🕵️', '✍️', '🏃', '🔬', '📚', '🧭', '🔭', '🔨',
  '🪄', '🎯', '🦉', '🦊', '🐝', '🤖', '🐯', '🦅',
  '🔧', '🧪', '📐', '🎨', '⚖️', '🩺', '💼', '🔑',
  '🧯', '🧰', '🖋️', '📊', '🧠', '🛡️', '⚙️', '🔩',
  '🕹️', '📡', '🔦', '🗺️', '📷', '🎥', '🎙️', '🔔',
  '🐜', '🐺', '🦫', '🐢', '🦆', '🐬', '🦂', '🦇',
]

// ---------------------------------------------------------------------------
// Pure helpers shared by scanner, live and ui.
// ---------------------------------------------------------------------------

/** Python persona_index: 32-bit Java-style string hash mod the cast size. Stable per id. */
export function personaIndex(agentId: string): number {
  let h = 0
  for (const ch of agentId ?? '') {
    h = (Math.imul(h, 31) + (ch.codePointAt(0) ?? 0)) >>> 0
  }
  return h % PERSONA_EMOJI.length
}

/** The places a task's or a title's short form keeps (shortTask, scanner.ts shortTitle), in code points. */
export const SHORT_MAX = 90
/**
 * `flat` whole while it holds at most `max` code points, else its first `max` (trimmed) with an ellipsis. Counted and cut in
 * code points, never UTF-16 units: an emoji at the cut (a surrogate pair) stays whole — a lone half would be an invalid
 * string in the props and the drawn Text.
 */
export function capPoints(flat: string, max: number): string {
  const cps = Array.from(flat)
  return cps.length > max ? cps.slice(0, max).join('').trim() + '…' : flat
}

/** Python short_task: first sentence (if it ends before char 90) else the first 90 code points + "…" (capPoints). */
export function shortTask(task: string): string {
  const flat = (task ?? '').split(/\s+/).filter(Boolean).join(' ')
  for (const sep of ['. ', '? ', '! ', ': ']) {
    const idx = flat.indexOf(sep)
    if (idx > 0 && idx < SHORT_MAX) return flat.slice(0, idx + 1).trim()
  }
  return capPoints(flat, SHORT_MAX)
}

/** `mcp__<server>__<tool>` → `<server>`, else "". */
export function mcpServer(tool: string): string {
  const parts = (tool ?? '').split('__')
  return parts.length >= 3 ? (parts[1] ?? '') : ''
}

/** Python detect_done's result shaping: collapse whitespace and cut to RESULT_CHAR_LIMIT. */
export function clipResult(text: string): { result: string; truncated: boolean } {
  const full = (text ?? '').split(/\s+/).filter(Boolean).join(' ')
  const truncated = full.length > RESULT_CHAR_LIMIT
  return { result: truncated ? full.slice(0, RESULT_CHAR_LIMIT) + '…' : full, truncated }
}

// ---------------------------------------------------------------------------
// $.state values. ENGINE RULE (claude plugin validate): `read`/`update` accept
// only an atom declared as a const IN THE SAME FILE with literal plugin/key,
// so atoms are NOT exported from here. Each module that touches state declares
// its own, e.g.
//   const prefsAtom = atom({ plugin: 'agent-theater', key: 'prefs' } as const, DEFAULT_PREFS)
// using these defaults (the contract's keys: payload, sessionId, prefs, view,
// paneOpened, scanError, tick — see ../types/index.d.ts).
// ---------------------------------------------------------------------------

export const EMPTY_PAYLOAD: TheaterPayload = {
  agents: [],
  versions: [],
  skipped: 0,
  oversized: 0,
  scanned_ms: 0,
  demo: false,
  stars: {},
}

export const DEFAULT_PREFS: TheaterPrefs = { lang: 'he', muted: false, showDone: false, pins: [] }

export const DEFAULT_VIEW: TheaterView = {
  selected: null,
  search: '',
  helpOpen: false,
  demo: false,
  focusIndex: -1,
}

/**
 * Payload field `model` (TheaterAgent.model, see ../types/index.d.ts): the raw
 * model id, "" when unknown. Filled by scanner.ts (transcripts: the latest
 * assistant record's `message.model`) and live.ts (agent.spawn's model wins
 * when non-empty); shortened for display by i18n.ts `modelLabel()`.
 */
export const UNKNOWN_MODEL = '' as const

/** $.store keys (prefs mirror). (ui.tsx keeps 'roomDone', STORE_ROOM_DONE_KEY.) */
export const STORE_PREFS_KEY = 'prefs'
/**
 * $.store key of the last five-hour usage toast, `{ resetsAt, at }` (usage.ts ToastMark): the window it was
 * for and the threshold (80 | 95) it reached. Kept across sessions and hot reloads so a window toasts each
 * threshold once, whichever conversation sees it first; written by register.tsx only when a toast fires.
 * `resetsAt` is never '' here: a window reported without a reset time is never toasted.
 */
export const STORE_USAGE_TOAST_KEY = 'usageToast'
/**
 * THE REOPEN (pane-mark.ts; register.tsx rememberPane / forgetPane / reopenPane): every $.store key that starts with this
 * is one conversation's PANE MARK — the prefix and the conversation's id, value `{ at }` — "this conversation's pane was
 * open and nobody closed it". ONE KEY PER CONVERSATION, never one shared map: every open conversation runs its own engine
 * process and all of them share the mod's one store file; the engine (2.1.321) locks that file around each single `set` or
 * `delete` — lock, read afresh, merge the ONE key, rewrite — but not around a plugin's get-then-set, so a map read and
 * written back by the mod could bring back an entry another conversation had just deleted, and a pane the person closed
 * would be opened again. (THE RECORD's keys start with `office-log:`, office-log.ts; nothing else starts with either.)
 */
export const STORE_PANE_PREFIX = 'pane:'
/**
 * How long after session.start a new process waits before it opens the pane again. The engine raises session.start as
 * soon as the hooks modules are loaded, at the very start of its own start-up: the app's timing lines put the rest of that
 * start-up at a median of 12 s over 53 days of logs and 22 s in November, and the office frame must load within 10 s, so an
 * opening at session.start would put the whole load inside the busiest seconds of the process — and a frame that misses its
 * limit is a fall. At 30 s the start-up was over in 85% of the starts (67% in November). NOT measured: that a load during
 * the start-up really falls more often (no pane was ever opened that early); THE RECORD's `reopen` and `fault` entries are
 * what to revisit this number from.
 */
export const REOPEN_DELAY_MS = 30_000
/**
 * A mark older than this opens nothing and is deleted when its conversation returns (and by the sweep): 30 days. Of 183
 * returns after a pause in 53 days of the app's logs the longest came after 14.8 days; a conversation left for longer than
 * a month should not have a pane open by itself.
 */
export const PANE_MARK_TTL_MS = 30 * 24 * 60 * 60 * 1000
/**
 * THE SWEEP's threshold (pane-mark.ts paneMarksToDrop): only while more marks than this are listed does a newly written
 * mark read the others and delete the expired and the unreadable ones. About 200 conversations were started in those 53
 * days and a quarter of the paused ones never returned, so the sweep (one small read per mark) runs about once in months.
 */
export const PANE_MARKS_MAX = 200
/**
 * A delete of the mark that the store refused (its lock not won) is tried again by the next polls, this many times in all
 * for one close: the mark of a pane the person closed must not stay, or the next process opens it again — but a store in
 * trouble is not asked every POLL_MS for the life of the process.
 */
export const PANE_FORGET_TRIES = 3
/**
 * After a session.end that leaves the process running under another conversation (a /clear, a resume), `$.session.id()`
 * goes on answering the ENDED id until the engine has finished the end step. The mirror refuses that id this many times
 * (one ask per poll: three polls, ten times the end step's 1.5 s bound) and then takes it as this conversation's again: an
 * engine that kept the id after all must not leave a pane that is never marked — or, worse, a closed one never unmarked.
 */
export const PANE_ENDED_ASKS = 3

// ---------------------------------------------------------------------------
// Module objects shared between register.tsx (writes) and ui.tsx (reads) — no
// `$` crosses an import, no $.state write for what is not user state.
// ---------------------------------------------------------------------------

/**
 * The 5-hour usage meter the desktop office draws in its header (`props.usage`):
 * the five_hour window of the last reading, null when there is none (an API key,
 * no subscription, before the first reading). Written by register.tsx alone (the
 * first reading at session.start, then session.measure), which also puts the
 * footer label ($.ui.status) up and redraws the pane when it changes; ui.tsx
 * reads it on every draw. Module memory, never $.state: a reload of the module
 * empties it, and the session.start that fresh load fires again refills it at
 * once from the engine's last reading ($.session.usage(), which outlives the
 * module). Only what is drawn counts as a change: the rounded percent, the reset.
 */
export const USAGE = { fiveHour: null as { pct: number; resetsAt: string } | null }

/**
 * The desktop office's fallback switch: while `clientFailed` the desktop draws
 * the text cards instead of the office Client. Set by register.tsx on a
 * `ui.fault` of the office module, cleared by a retry, a spawn or an opening of
 * the pane with the retries spent, and by /theater (the Client is tried again:
 * CLIENT_RETRIES); read by ui.tsx's render. Module memory: a hot reload clears
 * it too.
 */
export const DESKTOP = { clientFailed: false }

/**
 * THE LOGO (decision 28b, 23.10): the small Legal Mind logo the desktop draws in its credit row (ui.tsx, at the row's
 * reading edge beside the `© Legal Mind` link), the PNG's bytes as base64 — '' while there is none, and then
 * the credit is drawn without it. The plugin's own file, LOGO_ASSET under `$.plugin.root` (48×23 px, 2,346 bytes:
 * 3,128 base64 characters), read ONCE by register.tsx's session.start ($.fs.read as bytes, in a try of its own: a
 * missing or unreadable file, an answer that is not base64, or one past LOGO_MAX_CHARS leaves it '') — never per
 * render. Why a Markdown and not an Image: the desktop draws NO `Image` element in the pane at all (paint probe rounds
 * 7-8: neither a file source nor PNG bytes), but it does draw a Markdown INLINE IMAGE of a `data:image/png;base64,`
 * URI in the pane's tree (round 9), as wide as its box (round 9: the whole pane wide — too big; round 10: small in 8-
 * and 14-cell Boxes), so ui.tsx draws it as a Markdown (office-layout.ts logoMarkdown) in a LOGO_CELLS-wide Box. Only
 * on the desktop: the terminal, VS Code and mobile draw no Markdown image, and their credit stays text. Module memory,
 * as USAGE: a reload empties it and the session.start that fresh load fires again refills it. The only file of its own
 * the mod reads (no network).
 */
export const BRAND = { logo: '' }
/** The logo's file, under `$.plugin.root` (decision 28b): desktop-mod/assets/lm-logo-48.png. */
export const LOGO_ASSET = 'assets/lm-logo-48.png'
/** The most base64 characters the logo may be (a PNG of about 3 KB): a bigger file is not drawn — the pane's tree carries it whole on every render. */
export const LOGO_MAX_CHARS = 4096

/**
 * THE CLIENT'S RETRIES (live check 8, 23.10; the diagnosis of 28.10-1.11): the office Client faults while the
 * desktop's page is starved — the module never faults on its own data (the kit draws every size without one), but
 * the surface times every stage (the frame's shell, its runtime, the module's load: 10 s; a render: 2 s), and 83%
 * of the 93 faults the app logged sit within three minutes of one of its own memory-pressure lines, against 36% of
 * the time the app was running (an earlier count, 72 of 85 against 16% of random moments, took its base rate over
 * hours the app was closed) — in waves that two retries 3 s apart never outlast, so the text cards stayed for the
 * rest of the conversation (live check 8 saw the first of them: the Client's first draw timing out at the auto-open
 * on the first subagent spawn, with no /theater listed to try again). So register.tsx's `ui.fault` hook tries the
 * Client again CLIENT_RETRY_MS after a fault ($.clock.after), the gap doubled per retry up to CLIENT_RETRY_MAX_MS
 * (3, 6, 12, 24, 48, 60, 60 … s), CLIENT_RETRIES times per wave — about eight minutes — before the cards stay; a
 * fault CLIENT_ALIVE_GAP_MS or more after the last one came from a Client that had drawn for a while (between two
 * faults of a wave the cards show for the gap and the surface's load wait at most: under 75 s), so the wave starts
 * anew; a subagent spawn or an opening of the pane with the wave spent tries the Client at once (retryClientNow);
 * /theater at once, the person's own. Module memory, reset by /theater.
 */
export const CLIENT_RETRIES = 10
export const CLIENT_RETRY_MS = 3000
export const CLIENT_RETRY_MAX_MS = 60_000
export const CLIENT_ALIVE_GAP_MS = 90_000
