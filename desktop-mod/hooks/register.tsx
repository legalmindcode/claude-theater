// Claude Theater — hooks module entry. Wiring only; the work lives in
//   scanner.ts  (files → payload)      live.ts (this session's agents from events)
//   ui.tsx      (the pane)             i18n.ts / personas.ts (strings, cast)
//   model.ts    (types, constants, $.state atoms)
//
// OWNER: architect. Builders touch this file only to swap a stub call for
// the real one (same names), so three builders never edit the same lines.
//
// ENGINE RULE (claude plugin validate): `$` is never passed to a function
// imported from another file. Helpers that take `$` are declared HERE
// (openPane, poll, loadPrefs, loadLogo, scanIo, ensurePolling, logOffice, paneKeyOf, rememberPane,
// forgetPane, reopenPane); imported modules get closures (scanIo) or register their own hooks
// (registerUi).
//
// Lifecycle:
//   session.start   load prefs from $.store, remember the session id, register
//                   /theater, start the poll timer ($.clock.every POLL_MS),
//                   read the logo's bytes once (decision 28b: loadLogo, the
//                   desktop's credit row; the mod's only read of its own files),
//                   take the five-hour meter's first reading
//                   ($.session.usage; session.measure below). Off the terminal
//                   it also arms THE REOPEN's one timer (REOPEN_DELAY_MS; it
//                   reads nothing here).
//                   Each step is its own try: a failing $.command.register
//                   (nothing answers it in a test harness, or a name clash)
//                   never stops the office from scanning.
//   session.measure THE FIVE-HOUR METER (spec §2 item 12): the engine pushes its
//                   usage after each turn; when what the meter draws changed
//                   (the five_hour window's rounded percent, its reset time),
//                   USAGE (model.ts) takes it, the footer line follows
//                   ($.ui.status — the desktop draws it on its footer, the
//                   terminal under the prompt; no SessionMode label: one label
//                   per surface), the pane is redrawn (its header draws USAGE)
//                   and a toast fires at 80% and at 95%, once per window (the
//                   mark in $.store 'usageToast'; a window without a reset
//                   time never toasts). No $.state write; an unchanged reading
//                   does nothing at all.
//   poll            while the pane is up: scanAll(scanIo($)) → liveAged
//                   ($.agent.list()) → mergeLive → cleanOffice (THE TEXT GATE:
//                   every agent text freed of what a surface refuses, once, here;
//                   the scan error too) → $.state payload ONLY IF what
//                   the pane draws changed (renderKey: the flicker guard — a
//                   state write redraws the pane, and on the desktop a redraw
//                   hands the office Client new props and blinks the pane),
//                   scanError only on change, `tick`
//                   every poll (read by the text surfaces alone, for their
//                   mm:ss). ONE PUBLISH PER POLL (spec §6.1): the ⭐/chime
//                   "finish beat" (PAGE updateWS) runs HERE, in the poll —
//                   starsOf (ui.tsx) stamps the ids just finished into the
//                   payload it publishes (`stars`) and the toast + chime fire
//                   for the ones the office shows (the toast short and naming
//                   the room — ui.tsx finishToast — and neither ever for the
//                   demo's cast: live check 5, pre-check 6) — and the "🟢 N · " working
//                   count in the pane title (PAGE's document.title, only when N
//                   changes) goes out in the same tick BEFORE the write, so a
//                   finish is the one $.state write of the publish (no deferred
//                   `view` write; a plugin never sees its own state.set). The
//                   old beat's housekeeping follows the write in the same tick,
//                   only when something vanished: a selection whose agent left
//                   the office → view.selected null; the pins / roomDone
//                   overrides of rooms no longer present pruned (against a
//                   real, non-empty office only — never the demo's cast).
//                   While the pane is closed (never opened, or closed by the
//                   person) the files are NOT scanned — PAGE polled only while
//                   the panel was visible — only the live map is aged so the
//                   engine's statuses keep landing; openPane polls at once.
//                   THE REOPEN's mirror rides the poll's ONE pane listing: the
//                   pane first found shown → this conversation's mark written
//                   to $.store; no longer listed → the mark deleted. After the
//                   poll's latch is released and never awaited: a slow store
//                   holds no scan and no publish.
//                   In demo mode the payload is scanner's demoPayload — the one
//                   demo cast; ui.tsx draws the cast published here (live check
//                   7: a click's redraw once re-drew demoPayload(now), so the
//                   cast moved under the pointer), so the demo moves on these
//                   publishes alone (demoPayload(now) only for the switch's
//                   first frames, before this poll publishes it).
//   reload safety   a hot reload runs `register` again in a fresh environment and
//                   drops the old one's timers; session.start fires again on that
//                   fresh load (once per process, then once per fresh load of a
//                   changed module — types/index.d.ts), which restarts the poll
//                   and refills the meter. The pane can redraw before it lands,
//                   though, so the timer lives in module scope and
//                   ensurePolling($) (re)starts it lazily from every hook that
//                   has a `$` — session.start, /theater, agent.spawn, tool.call
//                   — and from the pane's next redraw (a render hook of this
//                   file ahead of ui.tsx's, through $.clock.after(0): a render
//                   may not write state). That redraw also kicks a poll at once
//                   when the demo was switched (view.demo ≠ the payload's): the
//                   switch publishes without waiting for SETTLE_MS / CALM_MS,
//                   so leaving the demo never leaves its cast frozen on screen.
//   poll guards     one poll at a time (a helper process may take seconds; an
//                   overlapping tick would race the caches) and a publish never
//                   rolls the office back to an older scan.
//   reopen          THE REOPEN (pane-mark.ts; the block above ensurePolling): the
//                   desktop app ends a conversation's engine process (idle under
//                   memory pressure, or the app restarting) and starts a new one
//                   with the same conversation id and no pane. REOPEN_DELAY_MS
//                   after session.start the new process opens the pane again when
//                   its conversation's mark is in $.store, not expired, and no
//                   pane is listed — silently (no toast even if the office then
//                   falls), one `reopen` entry in THE RECORD. Never under the
//                   terminal, never a pane the person closed.
//   session.end     stops the mirror (a roster emptied while the process dies
//                   must not read as "the person closed the pane") and drops a
//                   reopen still pending; on `clear` the process goes on under
//                   a new conversation id, so the cached key is forgotten and
//                   the next poll marks the new id. Observe: next(e) as is.
//
// Files over 4 MiB ($.fs.read's limit): scanIo hands the scanner three optional
// closures built over $.process.run — head(path, lines), tail(path, bytes) and
// pidAlive(pid) — PowerShell on Windows (%OS% = Windows_NT), head/tail/ps
// elsewhere. Any failure (no $.process on this surface, a timeout, a missing
// executable) rejects and the scanner degrades exactly as without the closure:
// the oversized transcript is skipped and counted in payload.oversized, an
// oversized parent yields role ""/project ""/topic "", and every registered
// session is trusted as open. pidAlive reads ONE process listing (tasklist /
// ps) cached PID_TTL_MS at module level, so a scan every 5 s (POLL_MS) spawns
// one process per 30 s however many chats are open.
//   agent.spawn     after next: liveSpawned; the demo running → off (one view
//                   write: a real subagent ends it, live check 5); first
//                   subagent of the session → $.ui.open once (auto-open).
//   tool.call       in a live agent's loop: liveToolStarted / liveToolReturned;
//                   the main loop's Agent (or Task, the older alias) call:
//                   liveAgentReturned (its result).
//   command.run     /theater → $.ui.open (always, asked by the person); clears
//                   DESKTOP.clientFailed first, so a failed office Client is tried again
//                   (THE RECORD: `asked`, when the cards were showing).
//   ui.fault        the desktop office Client (OFFICE_KEY) failed → DESKTOP.clientFailed:
//                   the desktop pane draws the text cards; one toast; a redraw; then
//                   the Client is tried again CLIENT_RETRY_MS later, the gap doubled per
//                   retry up to CLIENT_RETRY_MAX_MS, CLIENT_RETRIES times per wave (a wave
//                   anew once the Client was up CLIENT_ALIVE_GAP_MS, or at a subagent spawn
//                   / an opening of the pane with the wave spent: retryClientNow).
//                   THE RECORD (office-log.ts; logOffice below): each such fault is
//                   one `$.store` key of its own — when, which conversation, the
//                   phase, the surface's reason cut to a line, the retry armed —
//                   written beside the hook's work, never awaited by it.
//   ui.message      THE MOUNT NOTE alone (office-client.tsx: a Client instance's
//                   `{ t: 'mounted' }`, posted on its second call): answered `{}`
//                   here, in a hook registered AHEAD of ui.tsx's (a plugin's hooks
//                   nest in the order registered, the first outermost), so
//                   ui.tsx's hook and its NEWEST ANSWER counters never see a note;
//                   heard while an outage is open and the Client is the one drawn,
//                   it closes the outage and THE RECORD gains `up`. Everything
//                   else goes on with next(e):
//   (ui.message     the office Client's posts: ui.tsx registerUi, beside the press
//                   handlers it shares with the text cards.)
// Every hook: wrapped in try/catch AND `.catch` so the office never blocks Claude.
// An event is hooked at most ONCE without a matcher per module (validate rule),
// which is why the agent.spawn and tool.call hooks are here and live.ts is pure.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import { I18N } from './i18n'
import { liveAgentReturned, liveAged, liveSpawned, liveToolReturned, liveToolStarted, mergeLive, type LiveMap } from './live'
import { BRAND, CLIENT_ALIVE_GAP_MS, CLIENT_RETRIES, CLIENT_RETRY_MAX_MS, CLIENT_RETRY_MS, COMMAND, DEFAULT_PREFS, DEFAULT_VIEW, DESKTOP, EMPTY_PAYLOAD, LOGO_ASSET, LOGO_MAX_CHARS, PANE_FORGET_TRIES, PANE_ID, PANE_MARKS_MAX, POLL_MS, REOPEN_DELAY_MS, STORE_PANE_PREFIX, STORE_PREFS_KEY, STORE_USAGE_TOAST_KEY, USAGE, type Agent, type Payload, type Prefs, type TheaterStatus } from './model'
import { cleanAgentText } from './office-chrome'
import { cutWhy, nextOutage, noteCloses, officeLogKey, staleLogKeys, type OfficeLogBody, type Outage } from './office-log'
import { isOfficeNote } from './office-props'
import { paneMarkExpired, paneMarksToDrop, parsePaneMark, type PaneMark } from './pane-mark'
import { demoPayload, scanAll, type ScanIo } from './scanner'
import { FINISH_TOAST_MS, RECENT_DONE, STORE_ROOM_DONE_KEY, finishToast, officeView, paneTitle, parseRoomDone, registerUi, rememberRoomDone, renderKey, roomTitle, starsOf, textSurfaceActive, workingCount } from './ui'
import { parseToastMark, pickFiveHour, resetClock, sameFiveHour, toastDue, usageLabel, usageThreshold, type FiveHour, type ToastMark } from './usage'

// $.state atoms (validate: declared as consts in the file that reads them).
const payloadAtom = atom({ plugin: 'agent-theater', key: 'payload' } as const, EMPTY_PAYLOAD)
const sessionIdAtom = atom({ plugin: 'agent-theater', key: 'sessionId' } as const, '')
const prefsAtom = atom({ plugin: 'agent-theater', key: 'prefs' } as const, DEFAULT_PREFS)
const viewAtom = atom({ plugin: 'agent-theater', key: 'view' } as const, DEFAULT_VIEW)
const paneOpenedAtom = atom({ plugin: 'agent-theater', key: 'paneOpened' } as const, false)
const scanErrorAtom = atom({ plugin: 'agent-theater', key: 'scanError' } as const, null)
const tickAtom = atom({ plugin: 'agent-theater', key: 'tick' } as const, 0)

/** Is the office pane open (and the one shown) on some surface? One cheap round trip; false when unanswerable. */
async function paneIsUp($: EngineInterface): Promise<boolean> {
  try {
    return (await $.ui.panes()).some(p => p.id === PANE_ID && p.isShown !== false)
  } catch {
    return false
  }
}

/** Is the office pane still open (listed, shown or not)? What the poll's retitle asks: `$.ui.open` on an id no longer open opens it again. False when unanswerable. */
async function paneIsOpen($: EngineInterface): Promise<boolean> {
  try {
    return (await $.ui.panes()).some(p => p.id === PANE_ID)
  } catch {
    return false
  }
}

/** Opens (or raises) the pane with the current language's title, then fills it at once. Never rejects. */
export async function openPane($: EngineInterface): Promise<void> {
  try {
    const prefs = await read($, prefsAtom)
    const payload = await read($, payloadAtom)
    await $.ui.open({ id: PANE_ID, title: paneTitle(prefs.lang, workingCount(payload)) })
    await update($, paneOpenedAtom, () => true)
  } catch {
    // no surface draws yet (an SDK / -p run), or a hook refused: the next spawn / /theater tries again
  }
  retryClientNow($)
  void poll($)
}

/** How long one helper process (head/tail/the pid listing) may run before the scanner degrades instead. */
const PROCESS_TIMEOUT_MS = 10_000
/** The process listing is reused this long (Python re-checked every scan with a free os.kill(pid, 0)). */
const PID_TTL_MS = 30_000

/** Asked once per environment: %OS% = Windows_NT decides PowerShell/tasklist vs head/tail/ps. */
let WIN: Promise<boolean> | undefined
/** The one process listing, cached PID_TTL_MS (a failed listing is cached too, so a broken helper is not retried every tick). */
let PID_LIST: { at: number; pids: Promise<Set<number>> } | undefined

/** True on Windows (%OS% = Windows_NT); memoised per environment. */
function isWindows($: EngineInterface): Promise<boolean> {
  if (!WIN) {
    // $.env.get takes a literal name (validate lists the variables a module reads).
    WIN = $.env.get('OS').then(v => v === 'Windows_NT', () => false)
  }
  return WIN
}

/** A PowerShell single-quoted literal (the only escape is a doubled quote). */
function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

/**
 * PowerShell argv for one script: UTF-8 on stdout so Hebrew topics survive the
 * pipe, and ANY error → exit 1 (so `run` rejects and the scanner degrades,
 * instead of reading an empty stdout as an empty file).
 */
function psArgv(script: string): string[] {
  const wrapped =
    `$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; ` +
    `try { ${script} } catch { [Console]::Error.WriteLine($_); exit 1 }`
  return ['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', wrapped]
}

/** `tasklist /NH /FO CSV` ("name","pid",...) or `ps -axo pid=` (one pid per line) → the live pids. */
export function parsePidListing(stdout: string): Set<number> {
  const out = new Set<number>()
  for (const line of stdout.split('\n')) {
    const m = /^"[^"]*","(\d+)"/.exec(line.trim()) ?? /^(\d+)$/.exec(line.trim())
    if (m) out.add(Number(m[1]))
  }
  return out
}

/** Runs argv through `$.process.run`, resolves stdout, rejects on a non-zero exit (the scanner then degrades). */
async function runProcess($: EngineInterface, argv: readonly string[]): Promise<string> {
  const r = await $.process.run(argv, { timeoutMs: PROCESS_TIMEOUT_MS })
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `exit ${r.exitCode}`)
  return r.stdout
}

/** The pids alive now: ONE listing per PID_TTL_MS for the whole office (every registered chat shares it). */
function livePids($: EngineInterface, now: number): Promise<Set<number>> {
  if (PID_LIST && now - PID_LIST.at < PID_TTL_MS) return PID_LIST.pids
  const pids = isWindows($).then(win =>
    runProcess($, win ? ['tasklist', '/NH', '/FO', 'CSV'] : ['ps', '-axo', 'pid=']).then(parsePidListing))
  pids.catch(() => undefined) // each pidAlive caller observes the rejection itself (→ "alive"); never unhandled here
  PID_LIST = { at: now, pids }
  return pids
}

/** The scanner's file-system closures over `$` (declared here: `$` never crosses an import). */
function scanIo($: EngineInterface): ScanIo {
  return {
    read: path => $.fs.read(path),
    list: path => $.fs.list(path),
    stat: path => $.fs.stat(path),
    exists: path => $.fs.exists(path),
    home: async () => (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')),
    // Files over FS_READ_LIMIT: the first `lines` lines ...
    head: async (path, lines) => {
      const n = Math.max(1, Math.floor(lines))
      return (await isWindows($))
        ? runProcess($, psArgv(`Get-Content -LiteralPath ${psQuote(path)} -TotalCount ${n} -Encoding UTF8 | ForEach-Object { [Console]::Out.WriteLine($_) }`))
        : runProcess($, ['head', '-n', String(n), path])
    },
    // ... and the last `bytes` bytes (the scanner drops the partial first line itself).
    tail: async (path, bytes) => {
      const n = Math.max(1, Math.floor(bytes))
      if (!(await isWindows($))) return runProcess($, ['tail', '-c', String(n), path])
      const script =
        `$s=[System.IO.File]::OpenRead(${psQuote(path)}); try { ` +
        `$n=[int][Math]::Min($s.Length, ${n}); [void]$s.Seek(-$n, [System.IO.SeekOrigin]::End); ` +
        `$b=New-Object byte[] $n; $r=$s.Read($b, 0, $n); ` +
        `[Console]::Out.Write([Text.Encoding]::UTF8.GetString($b, 0, $r)) } finally { if ($s) { $s.Dispose() } }`
      return runProcess($, psArgv(script))
    },
    // Is the process that registered a ~/.claude/sessions record still alive? (rejects → the scanner trusts the record)
    pidAlive: async pid => (await livePids($, await $.clock.now())).has(pid),
  }
}

/**
 * THIS SESSION'S LIVE AGENTS, in module memory - NOT $.state. Every subagent
 * tool call starts and returns here (several a second with a few agents), and
 * on the desktop ANY $.state write of the plugin redraws its pane, which
 * blinks and swallows presses. A hot reload loses the map; the file scan still
 * shows those agents (only their sub-second phase is the live map's).
 */
let LIVE: LiveMap = {}
/** The band's working count last drawn (the band redraws only when it moves). */
let lastBandCount = 0
/** Running agents of the live map (the band's count). */
function liveWorking(): number {
  return Object.values(LIVE).filter(a => a.engine_status === 'running').length
}

/**
 * THE TEXT GATE's memory: each text the last office carried → its clean form, one map per kind
 * ([one-line, multi-line]). An unchanged agent's strings are the same strings poll after poll (the
 * scanner's cache, the live map), so a quiet poll costs a lookup per field, not a regex pass; each poll
 * keeps only what its office carried, so the memory is bounded by the office.
 */
let cleanMemo: [Map<string, string>, Map<string, string>] = [new Map(), new Map()]

/**
 * THE TEXT GATE: the office with every agent text field cleaned (office-chrome.ts cleanAgentText).
 * Transcripts and the engine's events hand the scan raw text, and ONE control character (an ANSI colour
 * code, a BEL) or bidi control (an RLM pasted from a Hebrew editor) in a Button's label or a Text refuses
 * the WHOLE pane on every surface (the desktop's Client faults into the same refused cards). Run by the
 * poll once on the merged office, before the finish beat, the flicker guard and the write — so the toast,
 * renderKey and $.state all see clean text — the one choke point of both sources: scanAll's agents (the
 * role re-resolved every scan, the room leads' topics, the demo cast) and mergeLive's live agents (a
 * spawn's description and prompt, a tool name, a returned result). task and result keep their line breaks
 * (the drawer draws them over several lines); every other field is one line. Not cleaned: the ids (id,
 * session, session_full — keys of the pins, the overrides, the selection; uuids from the engine), the
 * persona emoji (ours), numbers and flags. Deterministic and idempotent: the same raw office gives the same
 * clean one, so renderKey holds on a quiet poll.
 */
export function cleanOffice(office: Payload): Payload {
  const prev = cleanMemo
  const next: [Map<string, string>, Map<string, string>] = [new Map(), new Map()]
  const clean = (s: string, multiline: boolean): string => {
    if (!s) return s
    const k = multiline ? 1 : 0
    const out = next[k].get(s) ?? prev[k].get(s) ?? cleanAgentText(s, multiline)
    next[k].set(s, out)
    return out
  }
  const agents = office.agents.map(a => {
    const c: Agent = {
      ...a,
      role: clean(a.role, false),
      subagent_type: clean(a.subagent_type, false),
      tool: clean(a.tool, false),
      task: clean(a.task, true),
      task_short: clean(a.task_short, false),
      result: a.result === null ? null : clean(a.result, true),
      cwd: clean(a.cwd, false),
      project: clean(a.project, false),
      model: clean(a.model, false),
    }
    if (a.topic !== undefined) c.topic = clean(a.topic, false)
    return c
  })
  cleanMemo = next
  return { ...office, agents }
}

/** The poll in progress, if any (a tick that finds one running is skipped). */
let polling = false
/** The working count last written into the pane title (PAGE's document.title); undefined until the first poll. */
let lastRun: number | undefined
/** renderKey of the payload last published, at its publish time; undefined until the first publish (and after a hot reload: one publish). */
let lastKey: string | undefined
/** The coarse renderKey last published, and when (the CALM GUARD). */
let lastCoarse: string | undefined
let lastPublishAt = -Infinity
/** Activity-only changes (tool / phase / the minute) reach the pane at most this often. */
export const CALM_MS = 8_000
/** Even an arrival or a finish waits this long after the previous publish, so a burst of them is ONE redraw. */
export const SETTLE_MS = 5_000
/**
 * SETTLE_MS equals POLL_MS: the poll after a publish measures `since` between two clock reads about one timer period
 * apart, which lands a few ms either side of SETTLE_MS. Within this slack it counts as settled, so whether a structure
 * change publishes on the poll that sees it never hangs on that jitter (a burst inside SETTLE_MS is still one redraw).
 */
export const SETTLE_SLACK_MS = 250

// The finish beat's memory (PAGE updateWS; a hot reload only loses a beat, as PAGE's reload does).
/** PAGE prevStatus: agent id → last status seen (starsOf keeps it). */
const prevStatus: Record<string, TheaterStatus> = {}
/** The ⭐ map the last poll computed, published or not (a publish held back by SETTLE_MS must not lose a star). */
let pendingStars: Record<string, number> = {}
/** PAGE ding(): two chimes within this many ms are one (storm guard). */
const DING_GAP_MS = 400
/** The finish chime, the plugin's own file. */
const DING_ASSET = 'sounds/done.wav'
/** PAGE lastDing: the storm guard. */
let lastDing = 0

/** PAGE ding(): the finish chime, unless muted; two within DING_GAP_MS are one. Never rejects. */
async function ding($: EngineInterface, muted: boolean, now: number): Promise<void> {
  if (muted) return
  if (now - lastDing < DING_GAP_MS) return
  lastDing = now
  await $.audio.play({ asset: DING_ASSET }).catch(() => undefined)
}

/**
 * One poll. Pane up: scan the files (or the demo cast), age + merge this
 * session's live agents, publish, retitle. Pane down: only age the live map
 * (the engine's statuses must keep landing; no file is touched). Never
 * throws; never runs twice at once.
 */
export async function poll($: EngineInterface): Promise<void> {
  if (polling) return
  polling = true
  // what this poll's pane listing said, for THE REOPEN's mirror (below, in `finally`); undefined: no listing was answered
  let seen: { shown: boolean; listed: boolean; at: number } | undefined
  try {
    const now = await $.clock.now()
    // ONE listing for the poll and for the mirror (a quiet poll makes no engine call more than before). In its own try, as
    // paneIsUp's: a listing that throws reads as "pane down" here — the live map is still aged, no scan error is written —
    // and as nothing at all by the mirror (neither "shown" nor "closed").
    let panes: Awaited<ReturnType<typeof $.ui.panes>> | null = null
    try {
      panes = await $.ui.panes()
    } catch {
      // unanswerable
    }
    const up = panes !== null && panes.some(p => p.id === PANE_ID && p.isShown !== false)
    if (panes !== null) seen = { shown: up, listed: panes.some(p => p.id === PANE_ID), at: now }
    const view = await read($, viewAtom)
    const sessionId = await read($, sessionIdAtom)
    let scanned: (Payload & { error?: string }) | undefined
    if (up) scanned = view.demo ? demoPayload(now) : await scanAll(scanIo($), now)
    // Age the live map (after the scan's awaits: a tool.call that landed meanwhile is kept)
    if (Object.keys(LIVE).length > 0) {
      const listed = await $.agent.list().catch(() => [])
      LIVE = liveAged(LIVE, listed, now)
    }
    const aged = LIVE
    // the band above the prompt shows the working count while the pane is closed: redraw it only when that count moves
    const band = up ? 0 : liveWorking()
    if (band !== lastBandCount) {
      lastBandCount = band
      try {
        $.ui.invalidate('ui.render')
      } catch {
        // the band catches up on its next draw
      }
    }
    if (!scanned) return
    const { error, ...payload } = scanned
    // THE TEXT GATE (cleanOffice): every agent text cleaned once, here, before anything reads the office
    const merged = cleanOffice(mergeLive(payload, aged, sessionId, now))
    // THE FINISH BEAT (PAGE updateWS), here in the poll — not in the render — so a finish is the ONE
    // write below: the ⭐ ids ride the payload (`stars`: starsOf stamps the finishes just seen `now` and
    // drops the expired), the toast + chime fire now. Only an agent the office SHOWS is celebrated (its
    // room shows finished, it matches the search, its chat is open — officeView, as the pane draws it);
    // a hidden finish is remembered (prevStatus) and never celebrated later. The toast and the chime fire
    // at detection, while the drawn ⭐ follows the publish — which SETTLE_MS may hold for up to one poll —
    // so the sound can precede the star by up to SETTLE_MS. `prefs` is read only on a finish or a retitle
    // (the pane's render reads it once per draw; the tests count redraws by it).
    const published = await read($, payloadAtom)
    // (a hot reload emptied the module's maps: the published payload still has the stars; a publish held
    // back by SETTLE_MS left them in pendingStars)
    const prevStars = { ...published.stars, ...pendingStars }
    const stars = starsOf(prevStatus, merged.agents, prevStars, now)
    const fresh = Object.keys(stars).filter(id => !(id in prevStars))
    let prefs: Prefs | undefined
    if (fresh.length > 0) {
      prefs = await read($, prefsAtom)
      const roomDone = parseRoomDone(await $.store.get(STORE_ROOM_DONE_KEY).catch(() => undefined))
      // the ⭐ for every finish the office draws (THE RECENT FINISHED: a hiding room's three most recent among them); the
      // toast and the chime only for a finish the room shows by its toggle or prefs.showDone, as before (controller's ruling,
      // fix round 1 of Task 2.8a: no chime on every subagent finish for a default user)
      const drawn = new Set(officeView(merged.agents, view.search, prefs.lang, prefs.showDone, roomDone, prefs.pins, RECENT_DONE).visible.map(a => a.id))
      const shownView = officeView(merged.agents, view.search, prefs.lang, prefs.showDone, roomDone, prefs.pins)
      const shown = new Set(shownView.visible.map(a => a.id))
      // THE FINISH TOAST (live check 5): short (FINISH_TOAST_MS), naming the persona and the conversation (ui.tsx
      // finishToast). THE SILENT DEMO (pre-check 6): the demo's cast — the ids of the demo payload scanned (a live agent of this
      // session merged into it is real) — finishes on a loop: its finishes keep their ⭐ but are neither toasted nor chimed
      const demoIds = view.demo ? new Set(payload.agents.map(a => a.id)) : null
      let celebrated = false
      for (const id of fresh) {
        const a = merged.agents.find(x => x.id === id)
        if (a === undefined || !drawn.has(id)) {
          delete stars[id]
          continue
        }
        if (!shown.has(id) || demoIds?.has(id)) continue
        $.ui.toast(finishToast(a, roomTitle(shownView.stat.get(a.session_full), a.session_full), prefs.lang), { timeoutMs: FINISH_TOAST_MS })
        celebrated = true
      }
      if (celebrated) void ding($, prefs.muted, now)
    }
    pendingStars = stars
    const office: Payload = { ...merged, stars }
    // THE FLICKER GUARD. Every $.state.set redraws the pane, and on the desktop a
    // redraw rebuilds the office Client's props and redraws it (every redraw of the
    // pane blinks: the flicker), so the office is published ONLY when what it draws changed:
    // renderKey (ui.tsx) projects a payload at `now` onto what is drawn —
    // minute-resolution clocks, the ⭐ ids still inside their window (`stars`),
    // never scanned_ms or raw timestamps. The text surfaces' mm:ss tick from
    // `tick` instead, which the desktop never reads.
    const key = renderKey(office, now)
    // THE CALM GUARD: on the desktop EVERY redraw of the pane blinks (even a pane of plain Text), so
    // the moment-to-moment activity (tool / phase, the minute) is batched: published at most once
    // per CALM_MS. What matters at once (an agent arriving, finishing, failing, a ⭐) is in the
    // coarse key and publishes once SETTLE_MS has passed since the previous publish (a burst = one redraw).
    const coarse = renderKey(office, now, true)
    const since = now - lastPublishAt
    // (settled within SETTLE_SLACK_MS: the poll after a publish comes about SETTLE_MS later, a few ms either side)
    const settled = since >= SETTLE_MS - SETTLE_SLACK_MS
    // THE DEMO SWITCH publishes at once, whatever SETTLE_MS / CALM_MS say: the render draws the demo from the flag
    // (effectivePayload) — and on leaving it the office as it was before the demo (ui.tsx's memory, live check 7) until this
    // publish brings the fresh scan
    const switched = published.demo !== office.demo
    const due = (coarse !== lastCoarse && settled) || since >= CALM_MS || switched
    // (the second test, held to the same SETTLE_MS: what is IN state differs in substance — a reload, a hook beneath)
    if ((key !== lastKey && due) || ((lastCoarse === undefined || settled) && renderKey(published, now, true) !== coarse)) {
      // THE RETITLE first, in the same tick (spec §6.1): the title follows what the pane is about to show
      // (PAGE: document.title = (run ? "🟢 N · " : "") + docTitle), and the engine coalesces the redraws of
      // one tick, so the $.ui.open and the write below are ONE redraw — and the title never changes between
      // two calm publishes. An open id is retitled in place (never a second instance); no `focus`. The pane may
      // have been closed while the scan ran (`up` was read before it, and a scan can take seconds): `$.ui.open`
      // on an id no longer open would open it again, unasked — so it is asked again here, and a closed pane is
      // not retitled (lastRun kept: the next publish with the pane open retitles it).
      const run = workingCount(office)
      if (run !== lastRun && (await paneIsOpen($))) {
        lastRun = run
        prefs ??= await read($, prefsAtom)
        await $.ui.open({ id: PANE_ID, title: paneTitle(prefs.lang, run) }).catch(() => undefined)
      }
      // Never roll the office back: a slower, older scan loses to a newer publish.
      await update($, payloadAtom, cur => (cur.scanned_ms > office.scanned_ms ? cur : office))
      lastKey = key
      lastCoarse = coarse
      lastPublishAt = now
      // THE HOUSEKEEPING of the old deferred beat (PAGE updateWS), in the same tick as the write, as rare extra
      // writes only when something actually vanished — a quiet poll never reaches a write here, and a FAILED
      // scan never touches user state (scanAll republishes LAST_GOOD — empty after a hot reload — and mergeLive
      // adds this session's live agents even to that: a non-empty office that is NOT the office; `error` gates):
      // - the selection: `view.selected` is "null when closed" (types/index.d.ts), so a selected agent that left
      //   the office resets it (one `view` write; the drawer is already gone, it draws only a present agent);
      // - the pins and the per-room overrides (prefs.pins, $.store 'roomDone') of rooms no longer present —
      //   only when a published room vanished (or on the first publish: pins kept from an earlier session;
      //   never on a mere arrival), and only against a REAL, NON-EMPTY office: the demo's cast and an empty
      //   scan must not wipe them. Each prunes only what changed (one `prefs` write + its store mirror, one
      //   store write) — PAGE's rule, restored.
      const liveIds = new Set(office.agents.map(a => a.id))
      if (error === undefined && view.selected !== null && !liveIds.has(view.selected)) {
        const gone = view.selected
        await update($, viewAtom, v => (v.selected === gone ? { ...v, selected: null } : v))
      }
      const liveRooms = new Set(office.agents.map(a => a.session_full))
      const prevRooms = new Set(published.agents.map(a => a.session_full))
      const roomsChanged = prevRooms.size === 0 || [...prevRooms].some(s => !liveRooms.has(s))
      if (roomsChanged && error === undefined && office.agents.length > 0 && !office.demo) {
        prefs ??= await read($, prefsAtom)
        if (prefs.pins.some(s => !liveRooms.has(s))) {
          const saved = await update($, prefsAtom, p => ({ ...p, pins: p.pins.filter(s => liveRooms.has(s)) }))
          await $.store.set(STORE_PREFS_KEY, saved).catch(() => undefined)
        }
        const roomDone = parseRoomDone(await $.store.get(STORE_ROOM_DONE_KEY).catch(() => undefined))
        if (Object.keys(roomDone).some(s => !liveRooms.has(s))) {
          const kept: Record<string, boolean> = {}
          for (const [s, v] of Object.entries(roomDone)) if (liveRooms.has(s)) kept[s] = v
          await $.store.set(STORE_ROOM_DONE_KEY, kept).catch(() => undefined)
          rememberRoomDone(kept)
        }
      }
    }
    // the scan error is drawn in the footer: cleaned as agent text is, and compared clean (an error that
    // carried a control character must not read as new on every poll)
    const errText = error === undefined ? null : cleanAgentText(error)
    const curError = await read($, scanErrorAtom)
    if (errText !== curError) {
      await update($, scanErrorAtom, () => errText)
    }
    // the tick only while a text surface draws the pane (the TICK GUARD, ui.tsx): on the desktop
    // any write of ours redraws the pane, so an idle desktop office must see no write at all
    if (textSurfaceActive(now)) {
      await update($, tickAtom, () => now)
    }
  } catch (err) {
    // a poll that throws every tick (a step past the scan failing) reports it ONCE: compared clean with what is stored,
    // as the scan's own error is — a write per failing poll would redraw the pane every POLL_MS
    try {
      const msg = cleanAgentText(err instanceof Error ? err.message : String(err))
      if ((await read($, scanErrorAtom)) !== msg) await update($, scanErrorAtom, () => msg)
    } catch {
      // nothing more to do: the office stays as it was
    }
  } finally {
    polling = false
    // THE REOPEN's mirror (the block above ensurePolling): the pane first found shown → the mark; no longer listed → the mark
    // deleted. HERE, after the latch is released, and `void`: a $.store call takes a lock file and rewrites the whole store
    // file, on a machine whose trouble is starvation — awaited inside the latch, a slow one would leave the office empty
    // exactly when it was opened (every later tick returns at `polling`), and one that never answered would freeze it for
    // the life of the process. Both helpers never reject and set their flag before their first await, so the next poll does
    // not ask twice.
    if (seen !== undefined && paneMemory) {
      if (seen.shown && paneMarked !== true) void rememberPane($, seen.at)
      else if (!seen.listed && paneMarked === true) void forgetPane($)
    }
  }
}

/** The poll timer of this environment (a hot reload drops it with the environment; ensurePolling restarts it). */
let ticker: Timer | undefined
/**
 * THE CLIENT'S RETRIES (ui.fault below): the retries spent on the office Client in this wave (reset by /theater, by a fault
 * CLIENT_ALIVE_GAP_MS after the last, and by retryClientNow), the pending retry's timer (/theater cancels it: the person's
 * own retry replaces the automatic one), the engine's clock at the last fault (0: none since this load), and whether the
 * person was told — the toast and the debug line, once per /theater. Module memory, like DESKTOP.clientFailed: a hot
 * reload clears them all.
 */
let clientRetries = 0
let clientRetryTimer: Timer | undefined
let clientLastFaultAt = 0
let clientTold = false
/**
 * THE RECORD (office-log.ts: what is kept, why one `$.store` key per entry, and what an entry can and cannot prove). THE
 * OUTAGE open now — opened by the first recorded fault, one fault more per recorded fault, closed by THE MOUNT NOTE of a
 * Client that drew again (the ui.message hook below), which writes `up`; null: none. /theater, a spawn and the retry timers
 * do not touch it: only a Client that really came back closes it. And the count of the entries this process wrote, which
 * ends each entry's key (two entries of one millisecond never share one). Module memory, like the retries: a hot reload
 * clears both, and an outage open then gets no `up`.
 */
let clientOutage: Outage | null = null
let officeLogSeq = 0
/**
 * THE RECORD's writer: one entry under a key of its own (`$.store.set` — the engine locks the store file around each single
 * set, so entries of several conversations' processes never overwrite each other), then the prune (the record's own keys
 * past the newest OFFICE_LOG_MAX: `$.store.keys`, `$.store.delete`). It never reads an entry back, never writes `$.state`
 * and never redraws: a record write costs the office nothing it shows. `at` is the engine's clock when the caller already
 * read it (0: read here; a clock that cannot be read leaves `t` 0); a conversation id that cannot be read is ''.
 * A BY-PRODUCT: it never rejects and is always called with `void` — a store that is slow, full or locked loses that entry
 * and nothing else (the cards, the retry, the toast and the hook's answer never wait for it); a prune that fails leaves the
 * entry in place for the next write's prune.
 * Called as `void logOffice($, { k: 'fault', phase, why, retry }, now)`, `void logOffice($, { k: 'up', after, faults }, now)`,
 * `void logOffice($, { k: 'asked' })` and `void logOffice($, { k: 'reopen' })`.
 */
async function logOffice($: EngineInterface, body: OfficeLogBody, at = 0): Promise<void> {
  try {
    // (the count is taken before the first await: entries are numbered in the order they were asked for)
    const seq = ++officeLogSeq
    const t = at > 0 ? at : await $.clock.now().catch(() => 0)
    const sid = await $.session.id().catch(() => '')
    await $.store.set(officeLogKey(t, sid, seq), { t, sid, ...body })
    for (const key of staleLogKeys(await $.store.keys())) await $.store.delete(key).catch(() => undefined)
  } catch {
    // the record is a by-product: this entry (or this prune) is lost, the office is not
  }
}
/**
 * THE OFFICE ASKED FOR AGAIN (a subagent spawn, the pane opened): the Client on the cards with its wave spent is tried again
 * at once, the retries counted anew — silently (the person was told at the wave's first fault). A wave still running (a
 * retry pending) keeps its own time; nothing while the Client is up. /theater (command.run) is the person's own, told
 * again.
 */
function retryClientNow($: EngineInterface): void {
  if (!DESKTOP.clientFailed || clientRetryTimer !== undefined) return
  clientRetries = 0
  DESKTOP.clientFailed = false
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // nothing draws the pane now: its next draw is the Client's
  }
}
/** THE DEMO SWITCH: the view.demo the render kick last polled for while the published payload disagreed (undefined once they agree). */
let demoKicked: boolean | undefined

// ---------------------------------------------------------------------------
// THE REOPEN (pane-mark.ts: why a mark, its life, what it holds; model.ts
// STORE_PANE_PREFIX: why one key per conversation). The poll MIRRORS the
// engine's pane roster into this conversation's mark in $.store, and a new
// process of the same conversation opens the pane again from it.
//
// WHY THE MARK WAITS FOR A PANE THAT IS SHOWN, not merely listed: every
// headless engine process — a Workflow's subagents, a `-p` run — that spawns a
// subagent auto-opens a pane no surface ever shows. Marking on "listed" would
// write one mark per such run (filling the store's marks within days) and
// would mark conversations whose pane no person ever saw. A pane the reopen
// itself opened is the one exception (reopenPane): its conversation was marked
// already.
// WHY THE MARK GOES ONLY WHEN THE PANE IS NO LONGER LISTED: that is the
// person's close (or the plugin's unload). A pane listed but shown by nothing
// (the page detached, another tab in front of it) was not closed, and a
// listing that cannot be read says nothing.
// WHAT THE PERSON SEES: after the app restarted, or set an idle conversation
// aside, the theater pane he had open comes back by itself about
// REOPEN_DELAY_MS after that conversation's process starts — no toast, no
// sound, no `focus` asked. A pane he closed does not come back; and since the
// reopen is an opening like any other (paneOpened), a pane he closes AFTER a
// reopen is not opened again by the first subagent of that process either: the
// band's button and /theater are his way back.
// NOT ON THE TERMINAL (`paneMemory`): a pane opening by itself half a minute
// after `claude --resume` was never asked for; there nothing is written, read
// or opened.
// NOTHING HERE IS $.state: the mark is the store's, the flags are module
// memory (a new process starts with none, which is the point), so the mirror
// redraws nothing and the write budgets hold — one $.store write per process
// and opening, one delete per close.
// ---------------------------------------------------------------------------

/** Whether this process keeps a mark at all: set by session.start (false under the terminal REPL), cleared by session.end. */
let paneMemory = false
/** This conversation's key (STORE_PANE_PREFIX + its id), asked at first need; undefined until then, and again after a /clear (session.end). */
let paneKey: string | undefined
/**
 * What this process did with the mark: undefined — it never saw the pane shown (the reopen may still act); true — the mark
 * is written, or being written; false — the pane was closed and the mark deleted, or being deleted. Set BEFORE the first
 * await of rememberPane / forgetPane and asked again after it, so when an opening and a close overlap the last one wins.
 */
let paneMarked: boolean | undefined
/** The deletes of the mark the store refused since the last opening (forgetPane: PANE_FORGET_TRIES). */
let paneForgetTries = 0
/** THE REOPEN's one pending timer (session.start arms it, session.end and the next session.start drop it). */
let reopenTimer: Timer | undefined

/** This conversation's mark key, or undefined while its id cannot be read (asked again at the next need). Never rejects. */
async function paneKeyOf($: EngineInterface): Promise<string | undefined> {
  if (paneKey !== undefined) return paneKey
  const id = await $.session.id().catch(() => '')
  if (id !== '') paneKey ??= STORE_PANE_PREFIX + id
  return paneKey
}

/**
 * The pane is shown (or was just opened again): this conversation's mark, `{ at: now }` — ONE $.store write per process and
 * opening (`paneMarked`: a pane raised, retitled or polled again writes nothing). A write the store refuses (over its size,
 * the lock not won) is not tried again in this process: a retry every poll would hammer a store already in trouble, and
 * the only loss is that this conversation's pane does not come back once. A pane closed while the write was still pending
 * is deleted again after it (the late write must not leave the mark of a closed pane). Then THE SWEEP (pane-mark.ts
 * paneMarksToDrop), only here, right after a mark was written: one key listing, and only past PANE_MARKS_MAX marks a read
 * of each and the deletes of the dead ones. Never rejects; always called with `void` by the poll.
 */
async function rememberPane($: EngineInterface, now: number): Promise<void> {
  if (!paneMemory || paneMarked === true) return
  paneMarked = true
  paneForgetTries = 0
  try {
    const key = await paneKeyOf($)
    if (key === undefined || paneMarked !== true) return
    await $.store.set(key, { at: now })
    if (paneMarked !== true) {
      // (closed meanwhile: forgetPane's delete may have run before this write landed. After a /clear — undefined — the key
      // written is the cleared conversation's own and stays)
      if (paneMarked === false) await $.store.delete(key)
      return
    }
    const keys = (await $.store.keys()).filter(k => k.startsWith(STORE_PANE_PREFIX))
    if (keys.length <= PANE_MARKS_MAX) return
    const marks: Array<{ key: string; mark: PaneMark | null }> = []
    for (const k of keys) marks.push({ key: k, mark: k === key ? { at: now } : parsePaneMark(await $.store.get(k)) })
    for (const k of paneMarksToDrop(marks, now, key)) await $.store.delete(k).catch(() => undefined)
  } catch {
    // not written, or not swept: this conversation's pane does not come back once; the next mark's sweep sweeps
  }
}

/**
 * The pane is no longer listed — the person closed it: this conversation's mark is deleted, so no later process opens it.
 * A delete the store refused must not leave that mark (the one outcome THE REOPEN may never have is a closed pane coming
 * back): the flag goes back to "written" and the next poll tries again, PANE_FORGET_TRIES times in all for one close, so a
 * broken store is not asked every POLL_MS for ever. A pane opened again while the delete was still to be made keeps its
 * mark (the flag is asked again after the await). Never rejects; always called with `void` by the poll.
 */
async function forgetPane($: EngineInterface): Promise<void> {
  if (!paneMemory || paneMarked !== true) return
  paneMarked = false
  try {
    const key = await paneKeyOf($)
    if (key === undefined || paneMarked !== false) return
    await $.store.delete(key)
    paneForgetTries = 0
  } catch {
    paneForgetTries++
    if (paneMarked === false && paneForgetTries < PANE_FORGET_TRIES) paneMarked = true
  }
}

/**
 * THE REOPEN itself, run once by session.start's timer. In order: nothing if this process already saw the pane shown or
 * closed (a subagent or /theater opened it inside the delay — and the person may have closed it since: the pending reopen
 * yields); the conversation's mark is read — none, or unreadable: nothing; expired: deleted, nothing; the roster is asked,
 * and the first check made again (the awaits took time). No pane listed → openPane, the same opening /theater makes (the
 * title in the current language, paneOpened, a spent retry wave tried again, a poll at once), with no toast, no command
 * text, no chime and no `focus` — and with `clientTold` set first: the person did not ask for the pane at this moment, and
 * a reopen comes after an eviction, when memory is short and frames fall, so a fall of the office right after it shows the
 * text cards and its retries as ever (and is recorded) but does not toast; /theater tells again, as always. A pane already
 * listed (a reload of the module; an opening still waiting for a surface) is not opened again.
 * Then, if the pane is listed now: the mark is dated anew AT ONCE, shown or not — a pane the reopen opened that no surface
 * shows yet would otherwise be closed later with its old mark never deleted — and an opening made here writes one `reopen`
 * entry to THE RECORD (never awaited). An opening the host did not take (`$.ui.open` rejected, or no pane listed after it)
 * changes nothing: the old mark stays for the next process, `clientTold` is put back, and nothing is tried again in this
 * one. Never rejects.
 */
async function reopenPane($: EngineInterface): Promise<void> {
  try {
    if (!paneMemory || paneMarked !== undefined) return
    const key = await paneKeyOf($)
    if (key === undefined) return
    const mark = parsePaneMark(await $.store.get(key))
    if (mark === null) return
    if (paneMarkExpired(mark, await $.clock.now())) {
      await $.store.delete(key)
      return
    }
    const listed = await paneIsOpen($)
    if (!paneMemory || paneMarked !== undefined) return
    if (!listed) {
      const told = clientTold
      clientTold = true
      await openPane($)
      if (!(await paneIsOpen($))) {
        clientTold = told
        return
      }
    }
    const now = await $.clock.now()
    if (!listed) void logOffice($, { k: 'reopen' }, now)
    await rememberPane($, now)
  } catch {
    // the mark stays as it was: the next process of this conversation tries again
  }
}

/**
 * Starts the poll timer unless this environment already runs one; `restart`
 * (session.start) replaces whatever runs, so a new session never polls on a
 * stale `$`. Never throws.
 */
function ensurePolling($: EngineInterface, restart = false): void {
  try {
    if (ticker && !restart) return
    ticker?.cancel()
    ticker = $.clock.every(POLL_MS, () => void poll($))
    void poll($)
  } catch {
    // never block the caller
  }
}

// ---------------------------------------------------------------------------
// THE FIVE-HOUR METER (spec §2 item 12). The five_hour rate-limit window reaches
// the person three ways: one footer line ($.ui.status — the desktop draws it on
// its footer between the mode and the model, dim, after the plugin's name; the
// terminal under the prompt, beside the engine's pinned notices), the office
// header (USAGE → the Client's props.usage, ui.tsx) and a toast when the rounded
// percent reaches 80, and again at 95 — once per window (`resetsAt`), whichever
// conversation sees it first (the mark in $.store, STORE_USAGE_TOAST_KEY).
// Nothing goes to $.state: on the desktop any state write redraws the pane, and
// an unchanged reading must cost nothing (no line, no redraw, no store).
// ---------------------------------------------------------------------------

/** The text last handed to $.ui.status; null until this environment set one (so its first call always goes out, clearing a label an earlier environment left). */
let statusText: string | undefined | null = null
/** The last toast this environment made or found in $.store (the store holds it across environments; this closes the gap between a store read and its write). */
let toastMark: ToastMark | null = null

/** The plugin's status line: `text`, or cleared (undefined — never anything else); the same text twice is one call. Never throws. */
function setStatus($: EngineInterface, text: string | undefined): void {
  if (statusText !== null && statusText === text) return
  try {
    $.ui.status(text)
    statusText = text
  } catch {
    // no status line on this host: the office header still draws the meter
  }
}

/**
 * The 80 / 95 toast for this reading: once per window per threshold, the higher one only on a jump past
 * both. A window is known by its `resetsAt`; one reported without it is never toasted (every such window
 * would share the key '' — "once per window" would become "once ever" — and a window seen once without it
 * and later with it would toast the same threshold twice): no store read or write, the label's `⚠` still
 * warns. Never rejects.
 */
async function usageToast($: EngineInterface, u: FiveHour, lang: Prefs['lang']): Promise<void> {
  if (u.resetsAt === '') return
  const at = usageThreshold(u.pct)
  if (at === 0 || !toastDue(toastMark, u.resetsAt, at)) return
  const stored = parseToastMark(await $.store.get(STORE_USAGE_TOAST_KEY).catch(() => undefined))
  if (!toastDue(stored, u.resetsAt, at)) {
    toastMark = stored // another conversation (or this one before a reload of the module) toasted this window already
    return
  }
  if (!toastDue(toastMark, u.resetsAt, at)) return // a reading that landed during the store read toasted it
  toastMark = { resetsAt: u.resetsAt, at }
  try {
    $.ui.toast(I18N[lang].usageToast(Math.round(u.pct), resetClock(u.resetsAt)))
  } catch {
    // no toast on this host: the line and the header still say it
  }
  await $.store.set(STORE_USAGE_TOAST_KEY, toastMark).catch(() => undefined)
}

/**
 * Takes one five-hour reading (null: no five_hour window). A reading equal to the last as drawn (usage.ts
 * sameFiveHour: the rounded percent, the window) does nothing, unless `first` (session.start's reading:
 * the line is set and the toast checked even then). A new one: USAGE takes it, the pane is redrawn once
 * (its header draws USAGE), the line follows (cleared without a reading) and the toast check runs.
 * `lang` when the caller holds the prefs (session.start); else read here, only for a
 * reading to show. Never rejects.
 */
async function takeUsage($: EngineInterface, u: FiveHour | null, first: boolean, lang?: Prefs['lang']): Promise<void> {
  try {
    const same = sameFiveHour(USAGE.fiveHour, u)
    if (same && !first) return
    USAGE.fiveHour = u
    if (!same) {
      try {
        $.ui.invalidate('ui.render') // (one change is one call; the engine folds a burst to its redraw rate)
      } catch {
        // nothing draws the pane now: its next draw reads USAGE
      }
    }
    if (u === null) {
      setStatus($, undefined)
      return
    }
    const l = lang ?? (await read($, prefsAtom).catch(() => DEFAULT_PREFS)).lang
    if (USAGE.fiveHour !== u) return // a newer reading landed meanwhile: the line and the toast are its own
    // (no clock is read: the label takes none — usage.ts, it is the reading's alone)
    setStatus($, usageLabel(u, l))
    await usageToast($, u, l)
  } catch {
    // decoration: never blocks the session
  }
}

/** A PNG's bytes as $.fs.read answers them as bytes: standard padded base64, nothing else (the Markdown carries it as a data URI). */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

/**
 * THE LOGO (decision 28b): reads the small logo's bytes (LOGO_ASSET under `$.plugin.root`) into BRAND.logo, for the desktop's
 * credit row (ui.tsx draws it as a Markdown inline image). Called ONCE per load, by session.start — never per render. A missing
 * or unreadable file, an answer that is not base64, or one past LOGO_MAX_CHARS leaves BRAND.logo '' (the credit drawn without
 * it). A logo that changed redraws the pane once (a hot reload with the pane up may have drawn it before this read landed); an
 * unchanged one redraws nothing. The mod's only read of its own files: a local file it ships, no network. Never rejects.
 */
async function loadLogo($: EngineInterface): Promise<void> {
  let logo = ''
  try {
    const { base64 } = await $.fs.read(`${$.plugin.root}/${LOGO_ASSET}`, { as: 'bytes' })
    if (typeof base64 === 'string' && base64.length <= LOGO_MAX_CHARS && BASE64_RE.test(base64)) logo = base64
  } catch {
    // no logo: the credit alone
  }
  if (logo === BRAND.logo) return
  BRAND.logo = logo
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // nothing draws the pane now: its next draw reads BRAND
  }
}

/** Prefs from $.store, defaults filled in; a bad value falls back to the default. */
async function loadPrefs($: EngineInterface): Promise<Prefs> {
  try {
    const stored = (await $.store.get(STORE_PREFS_KEY)) as Partial<Prefs> | undefined
    return {
      lang: stored?.lang === 'en' ? 'en' : DEFAULT_PREFS.lang,
      muted: stored?.muted === true,
      showDone: stored?.showDone === true,
      still: stored?.still === true,
      pins: Array.isArray(stored?.pins) ? stored.pins.filter(p => typeof p === 'string') : [],
    }
  } catch {
    return DEFAULT_PREFS
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Seven independent steps, each in its own try: none may block the session,
    // and none may stop the ones after it (a /theater that cannot be registered
    // must still leave a scanning office behind).
    let prefs: Prefs = DEFAULT_PREFS
    try {
      prefs = await loadPrefs($)
      await update($, prefsAtom, () => prefs)
    } catch {
      // defaults stay
    }
    try {
      const sessionId = await $.session.id().catch(() => '')
      await update($, sessionIdAtom, () => sessionId)
    } catch {
      // live agents then land in a sessionless room until the id is known
    }
    try {
      await $.command.register({
        name: COMMAND,
        description: prefs.lang === 'he' ? 'פותח את 🎭 התיאטרון — משרד הסוכנים החי' : 'Open 🎭 Claude Theater, the live office of your subagents',
        immediate: true,
      })
    } catch {
      // the pane still auto-opens on the first subagent
    }
    // THE REOPEN: only off the terminal REPL (the app-hosted engine starts with no surface at all, `null`). Set before the
    // poll is started, so the first poll already mirrors the pane; the timer reads nothing here — the mark, the conversation's
    // id and the roster are asked when it fires. A session.start raised again in this process replaces the timer: one reopen
    // at most.
    paneMemory = e.surface !== 'terminal'
    ensurePolling($, true)
    try {
      reopenTimer?.cancel()
      reopenTimer = undefined
      if (paneMemory) {
        reopenTimer = $.clock.after(REOPEN_DELAY_MS, () => {
          reopenTimer = undefined
          void reopenPane($)
        })
      }
    } catch {
      // no timer on this host: the pane comes back at the next subagent or /theater, as before
    }
    // THE LOGO (decision 28b): its bytes, once per load, for the desktop's credit row — its own try inside (a missing file: no
    // logo, the credit still drawn); after the poll is started, so the read never holds the office back
    await loadLogo($)
    // THE FIVE-HOUR METER's first reading (session.measure keeps it after; the poll is already started, so a
    // slow reading never holds the office back): the line at once, the toast if this window never had one;
    // no five_hour window — or no reading at all — clears the line. session.start fires again on a fresh load
    // of this module (a reload), and $.session.usage() answers the engine's last reading, which outlives the
    // module: a reload refills the meter here, at once.
    let fiveHour: FiveHour | null = null
    try {
      fiveHour = pickFiveHour((await $.session.usage()).rateLimits)
    } catch {
      // no reading on this host: no meter until a measurement brings one
    }
    await takeUsage($, fiveHour, true, prefs.lang)
    return next(e)
  }).catch(($, e, next) => next(e))

  // THE REOPEN's guard at the session's end. Any end but a /clear means this process is going away (an exit, a signal, a
  // logout, another conversation resumed in its place): the mirror stops and a reopen still pending is dropped — if the
  // engine empties its pane roster on the way down while the poll still runs, that must not read as "the person closed the
  // pane" and delete the mark (not seen in the engine's code, and not verifiable in the kit: this is the insurance; where
  // the app kills the process outright the hook never runs and nothing is lost by it). A /clear is the other case
  // (SessionEndInput): the conversation ends, the SAME process goes on under a NEW id with the pane still up, and no
  // session.start follows — so the cached key and the flag are forgotten and the next poll marks the new id (one write);
  // the cleared conversation's own mark is left where it is. Nothing is awaited: the whole chain shares the exit's one
  // short bound. Observe: next(e) as is.
  on('session.end', async ($, e, next) => {
    try {
      if (e.reason === 'clear') {
        paneKey = undefined
        paneMarked = undefined
        paneForgetTries = 0
      } else {
        paneMemory = false
        reopenTimer?.cancel()
        reopenTimer = undefined
      }
    } catch {
      // never holds the exit
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // THE FIVE-HOUR METER: the engine's measurement after each main-thread turn (and when a rate-limit window
  // moves a whole point). Every measurement carries the rate limits and is read, whatever `changed` names;
  // a five-hour reading that draws the same (takeUsage: the rounded percent, the window) does nothing at
  // all — no line, no redraw, no store. Observe: next(e) as is.
  on('session.measure', async ($, e, next) => {
    try {
      await takeUsage($, pickFiveHour(e.rateLimits ?? []), false)
    } catch {
      // decoration: never blocks the measurement
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'theater' }, async $ => {
    try {
      // the person asks for the office again: a desktop office Client that failed (ui.fault below) is tried again, with its
      // automatic retries counted anew (a retry still pending is dropped: this one replaces it)
      clientRetryTimer?.cancel()
      clientRetryTimer = undefined
      clientRetries = 0
      clientTold = false
      if (DESKTOP.clientFailed) {
        DESKTOP.clientFailed = false
        // THE RECORD: the person asked for the office while the cards showed (never awaited; with the Client up: no entry)
        void logOffice($, { k: 'asked' })
        try {
          $.ui.invalidate('ui.render')
        } catch {
          // nothing draws the pane now: its next draw is the Client's
        }
      }
      ensurePolling($)
      await openPane($)
      const prefs = await read($, prefsAtom)
      return { text: prefs.lang === 'he' ? 'התיאטרון נפתח.' : 'Theater pane opened.' }
    } catch (err) {
      return { text: `agent-theater: ${err instanceof Error ? err.message : String(err)}` }
    }
  }).catch(($, e, next) => next(e))

  // THE OFFICE'S FALLBACK (spec §5): the desktop office Client (key OFFICE_KEY, office-client.tsx) failed — its
  // module did not load, its drawing failed, or its code threw after it drew. From now on the desktop pane draws
  // the text cards (DESKTOP.clientFailed, read by ui.tsx's render) and the person is told ONCE (the first fault since
  // /theater: `clientTold`). THE WAVES (the diagnosis of 28.10-1.11; model.ts CLIENT_RETRIES): the module never
  // faults on its own data (the kit draws every size without one) — the faults come while the desktop's page is
  // starved (83% of the 93 faults the app logged sit within three minutes of one of its memory-pressure lines, against
  // 36% of the time the app was running), at every stage
  // the surface times (the frame's shell, its runtime, the module's load, a render past 2 s), in waves that two
  // retries 3 s apart never outlast (live check 8 saw the first: the Client's first draw timing out at the auto-open
  // on the first subagent spawn, with no /theater listed to try again). So the Client is tried again CLIENT_RETRY_MS
  // after a fault, the gap doubled per retry up to CLIENT_RETRY_MAX_MS, CLIENT_RETRIES times per wave, before the
  // fallback stays: ONE retry per fault ($.clock.after; it clears the flag and redraws, and the render builds the
  // Client afresh), the next one scheduled only if that fresh Client faults too; a fault CLIENT_ALIVE_GAP_MS or more
  // after the last one came from a Client that had drawn for a while (between two faults of a wave the cards show for
  // the gap and the surface's load wait at most), so the wave starts anew; a subagent spawn or an opening of the pane
  // with the wave spent tries the Client at once (retryClientNow). A retry is silent (no second toast, no second log
  // line); /theater (above) still clears the flag at once, restarts the count, cancels a retry still pending and tells
  // again on the next fault. Observe only: core answers `{}`. The engine redraws the site itself after a fault; the
  // invalidate is for a fault it would not redraw for (a Client born in that redraw). `e.reason` is the surface's
  // untrusted text: logged to the debug log, never parsed. THE RECORD (office-log.ts): every fault handled here — one per
  // fall the person can see; a fault while the cards already show is not handled and not recorded — opens or extends THE
  // OUTAGE and writes one `fault` entry (the phase, the reason cut to a line, the retry this fault armed; 0: none, the
  // cards stay), after the retry is armed and never awaited: the fall-back, the retry and the toast do not wait for a store.
  on('ui.fault', { element: 'office' }, async ($, e, next) => { // OFFICE_KEY, as a literal: validate reads a matcher statically
    try {
      if (!DESKTOP.clientFailed) {
        DESKTOP.clientFailed = true
        // (the engine's clock, for the wave: a read that fails counts as no gap)
        const now = await $.clock.now().catch(() => 0)
        if (clientLastFaultAt !== 0 && now - clientLastFaultAt >= CLIENT_ALIVE_GAP_MS) clientRetries = 0
        clientLastFaultAt = now
        // the retry is scheduled first: the log / toast below must not be able to lose it
        let retry = 0
        if (clientRetries < CLIENT_RETRIES) {
          const gap = Math.min(CLIENT_RETRY_MS * 2 ** clientRetries, CLIENT_RETRY_MAX_MS)
          clientRetries++
          retry = clientRetries
          clientRetryTimer?.cancel()
          clientRetryTimer = $.clock.after(gap, () => {
            clientRetryTimer = undefined
            // (a /theater since then cleared the flag itself; the guard keeps a late timer from clearing a newer fault's)
            if (!DESKTOP.clientFailed) return
            DESKTOP.clientFailed = false
            try {
              $.ui.invalidate('ui.render')
            } catch {
              // nothing draws the pane now: its next draw is the Client's
            }
          })
        }
        // THE RECORD: this fall, beside the hook's work (`void`: a slow store holds nothing back)
        clientOutage = nextOutage(clientOutage, now)
        void logOffice($, { k: 'fault', phase: e.phase, why: cutWhy(e.reason), retry }, now)
        if (!clientTold) {
          clientTold = true
          // (the reason to the debug log alone: the transcript carried it for live check 4 only, 18.10 — gone with the release,
          // decision 27c; the toast below is what the person sees)
          $.ui.log(`office Client failed (${e.phase}): ${e.reason} [${e.component} ${e.module}]`, { to: 'debug' })
          const prefs = await read($, prefsAtom)
          $.ui.toast(`🎭 ${I18N[prefs.lang].officeFailed}`)
        }
        $.ui.invalidate('ui.render')
      }
    } catch {
      // the flag is set: the redraw after the fault draws the cards
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // A subagent started: record it (after next, when agentId/model are known)
  // and auto-open the pane on the FIRST subagent of the session (spec "פתיחה").
  on('agent.spawn', async ($, e, next) => {
    const ran = await next(e)
    try {
      ensurePolling($)
      // THE OFFICE ASKED FOR AGAIN: a subagent starting is when the person looks at the office — a Client on the cards with
      // its wave spent is tried once more (retryClientNow; a wave still running keeps its time)
      retryClientNow($)
      const agentId = ran.agentId
      if (agentId !== undefined) {
        const now = await $.clock.now()
        const spawn = {
          agentId,
          tool_use_id: e.tool_use_id,
          description: e.description,
          subagentType: e.subagentType,
          prompt: e.prompt,
          model: ran.model ?? e.model ?? '',
        }
        LIVE = liveSpawned(LIVE, spawn, now)
        // THE DEMO'S AUTO-EXIT (live check 5: Asaf watched the demo without knowing it): a real subagent of this conversation
        // starts while the demo runs → the demo goes off, as its exit Button does (ui.tsx setDemo: the selection with it) — ONE
        // view write, here and not in the poll's publish path, ahead of the poll below (which then scans the real office);
        // the render kick publishes the switch at once (THE DEMO SWITCH). Read first: a spawn with the demo off writes nothing.
        if ((await read($, viewAtom)).demo) await update($, viewAtom, v => ({ ...v, demo: false, selected: null, focusIndex: -1 }))
        const opened = await read($, paneOpenedAtom)
        if (!opened) void openPane($)
      }
    } catch {
      // never block the spawn
    }
    return ran
  }).catch(($, e, next) => next(e))

  // Tool calls: inside a live agent's loop they drive its phase/tool; the main
  // loop's Agent call (Task: the older alias, as Python name_map_for joins on
  // both) carries the subagent's result when it returns.
  on('tool.call', async ($, e, next) => {
    ensurePolling($)
    const agentId = e.agentId
    if (agentId !== undefined) {
      try {
        const now = await $.clock.now()
        LIVE = liveToolStarted(LIVE, agentId, String(e.tool), now)
      } catch {
        // ignore
      }
      const ran = await next(e)
      try {
        const now = await $.clock.now()
        LIVE = liveToolReturned(LIVE, agentId, now)
      } catch {
        // ignore
      }
      return ran
    }
    const tool = String(e.tool)
    if (tool === 'Agent' || tool === 'Task') {
      const ran = await next(e)
      try {
        const now = await $.clock.now()
        const text = ran.deny !== undefined ? ran.deny : ran.text
        LIVE = liveAgentReturned(LIVE, e.tool_use_id, text, ran.deny !== undefined || ran.isError === true, now)
      } catch {
        // ignore
      }
      return ran
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The render kick: a pane that is already up after a hot reload ($.ui.panes()
  // lists it; the engine's record outlives the module) resumes polling on its
  // first redraw. A hook of our own on the pane's render, ahead of ui.tsx's in
  // the chain, schedules ensurePolling through $.clock.after(0) — outside the
  // render, so poll's state writes are allowed — and passes the draw on with
  // next(e). (`$` may not be handed to a callback across files: validate rule.)
  // THE DEMO SWITCH: the redraw that follows a demo press (view.demo no longer
  // the published payload's) also polls at once, and that poll publishes the
  // switch whatever SETTLE_MS / CALM_MS say (poll's `switched`): leaving the demo
  // shows the real office now, not the demo cast frozen at the last publish. A
  // read only (two atoms the pane's render reads anyway), and ONE kick per
  // switch (demoKicked): every redraw until the switch is published — a text
  // surface's tick among them — must not poll again, or a poll that publishes
  // nothing would loop through its own tick. Once the two agree the kick is the
  // plain ensurePolling again.
  on('ui.render', { component: 'Pane', requestId: 'agent-theater' }, async ($, e, next) => {
    try {
      const demo = (await read($, viewAtom)).demo
      const switched = demo !== (await read($, payloadAtom)).demo
      const kick = switched && demoKicked !== demo
      demoKicked = switched ? demo : undefined
      $.clock.after(0, () => {
        ensurePolling($)
        // (a poll already running skips this one: then the next tick's poll publishes the switch)
        if (kick) void poll($)
      })
    } catch {
      // the hooks with a `$` kick the poll too
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // The band above the prompt: a way back into the office without a slash
  // command. Shown only while this conversation has subagents working and the
  // pane is not on screen; pressing it opens (or raises) the pane. The count is
  // the live map's (engine events), since the file scan rests while the pane is
  // closed.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    try {
      if (e.props.hasSurvey) return next(e)
      const working = liveWorking()
      if (working === 0 || (await paneIsUp($))) return next(e)
      const prefs = await read($, prefsAtom)
      const label = prefs.lang === 'he'
        ? `🎭 התיאטרון · ${working} ${working === 1 ? 'עובד' : 'עובדים'} — לחצו לפתיחה`
        : `🎭 Theater · ${working} working — press to open`
      const { Box, Button } = $.ui.resolve(e)
      return (
        <Box>
          <Button key="open-theater" label={label} onPress={() => openPane($)} />
        </Box>
      )
    } catch {
      return next(e)
    }
  }).catch(($, e, next) => next(e))

  // THE MOUNT NOTE (office-client.tsx; THE RECORD, office-log.ts): a Client instance says, once, that it was drawn and
  // called again — the positive signal of a recovery. (Inferring one from silence after a retry was rejected: in the
  // 28.10 diagnostic "the hooks drew the Client again" was followed by another fault seven times out of nine.) Registered
  // AHEAD of ui.tsx's message hook (registerUi below; first registered, outermost), so a note is answered here — `{}`:
  // heard, no props, hence no render of the Client and nothing for the page's 2 s limit to time — and ui.tsx's hook and
  // its NEWEST ANSWER counters never see one; anything that is no note goes on with next(e), untouched. `up` is written
  // only while an outage is open AND the Client is the one drawn (office-log.ts noteCloses): a note still in flight from
  // the instance that then faulted (the cards show) must not close the outage with a false recovery of a few ms — the
  // kit cannot stage that order (it refuses a post while the drawing holds no Client), so the rule is tested pure. The
  // page holds the Client's next post until this hook answers, so the hook awaits one clock read at most and NEVER the
  // store.
  on('ui.message', { element: 'office' }, async ($, e, next) => { // OFFICE_KEY, as a literal: validate reads a matcher statically
    if (!isOfficeNote(e.data)) return next(e)
    try {
      const outage = clientOutage
      if (noteCloses(outage, DESKTOP.clientFailed)) {
        // (closed before the await: a second note in the same moment finds no outage, so one outage gives one `up`)
        clientOutage = null
        const now = await $.clock.now().catch(() => 0)
        void logOffice($, { k: 'up', after: now > 0 && outage.since > 0 ? Math.max(0, now - outage.since) : 0, faults: outage.faults }, now)
      }
    } catch {
      // the record is a by-product: the note is answered all the same
    }
    return {}
  }).catch(($, e, next) => next(e))

  registerUi(on)
}
