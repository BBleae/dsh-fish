/**
 * types.d.ts —— `dsh-fish` 核心领域契约与前后端接口类型定义
 *
 * 只包含纯类型声明（零运行时代码、零编译步骤），覆盖四个最容易发生跨模块漂移的中枢：
 *   1. 事件流判别联合类型（`FishEvent`，对应 `lib/schema.js`）；
 *   2. 生长环境配置树（`FishConfig`，对应 `lib/settings.js` 的 `DEFAULTS`）；
 *   3. 认知派生快照（`DerivedSelf`，对应 `lib/derive.js` 的 `deriveSelf` 返回值）；
 *   4. 观测台 HTTP 响应载荷与宿主最小接口（对应 `lib/observe*.js` 与 `lib/client.js`）。
 *
 * `test/architecture.test.mjs` 会校验本文件中的枚举字面量与 `schema.js` / `settings.js` 保持同步。
 */

import type { DEFAULTS } from './settings.js'

// ============================================================================
// 1. 事件流契约（schema.js）
// ============================================================================

export type HerEventType = 'utterance' | 'revise' | 'reunion' | 'narration' | 'refusal' | 'dream'

export type SystemOnlyEventType =
  | 'seed'
  | 'answer'
  | 'test'
  | 'absence'
  | 'meta'
  | 'diary'
  | 'voice'
  | 'grant_offer'
  | 'grant'
  | 'ask'
  | 'heard'
  | 'comment'

export type EventType = HerEventType | SystemOnlyEventType

export type EventScene = 'desk' | 'private' | 'group'

export type EventFlag = 'selfmod' | 'unrecorded' | 'weak' | 'truncated' | 'uncommitted' | 'anchored'

export type EventVerdict = 'confirmed' | 'refuted' | 'refined' | null

export type EventSource = 'tool' | 'system' | 'import' | (string & {})

export interface EventGrantPayload {
  rule: string
  offerId: string
  verdict: 'approve' | 'reject' | null
  reason: string
  expiresAt?: string | null
}

export interface EventAskValue {
  wakesPerDay?: number
  window?: [string, string]
}

export interface EventAskPayload {
  kind: string
  subject: string
  options: string[]
  reason: string
  askId: string
  verdict: 'approve' | 'reject' | 'later' | null
  via: string
  appointId: string
  value?: EventAskValue
}

export interface EventRefusePayload {
  act: string
  object: string
  raw?: string
}

export interface FishEventBase {
  id: string
  v: number
  ts: string
  day: number
  stage: number
  type: EventType
  source: EventSource
  sessionId?: string
  scene?: EventScene
  who?: { id: string; name: string }
  re?: string
  topic?: string
  text: string
  refs: string[]
  verdict: EventVerdict
  confidence: number
  flags: EventFlag[]
  grant?: EventGrantPayload
  ask?: EventAskPayload
  refuse?: EventRefusePayload
  days?: number
}

export interface UtteranceEvent extends FishEventBase {
  type: 'utterance'
  topic?: string
}

export interface ReviseEvent extends FishEventBase {
  type: 'revise'
  topic?: string
}

export interface RefusalEvent extends FishEventBase {
  type: 'refusal'
  refuse?: EventRefusePayload
}

export interface AskEvent extends FishEventBase {
  type: 'ask' | 'answer'
  ask?: EventAskPayload
}

export interface GrantEvent extends FishEventBase {
  type: 'grant_offer' | 'grant'
  grant?: EventGrantPayload
}

export interface HeardEvent extends FishEventBase {
  type: 'heard'
  re?: string
}

export interface AbsenceEvent extends FishEventBase {
  type: 'absence'
  days?: number
}

export interface GenericFishEvent extends FishEventBase {
  type: Exclude<EventType, 'utterance' | 'revise' | 'refusal' | 'ask' | 'answer' | 'grant_offer' | 'grant' | 'heard' | 'absence'>
}

export type FishEvent =
  | UtteranceEvent
  | ReviseEvent
  | RefusalEvent
  | AskEvent
  | GrantEvent
  | HeardEvent
  | AbsenceEvent
  | GenericFishEvent

export interface ValidateContext {
  day?: number
  stage?: number
  now?: number
  source?: EventSource
  knownIds?: ReadonlySet<string> | null
}

// ============================================================================
// 2. 生长环境配置契约（settings.js）
// ============================================================================

export type OwnerPronoun = '他' | '她' | 'TA'
export type SelfPronoun = '她' | '他' | '祂'
export type SubReadMode = 'page' | 'whole'
export type ToolKind = 'produce' | 'consume' | 'effect' | 'self'
export type TimeWindow = [string, string]

export type RawDefaults = typeof DEFAULTS

export type FishConfig = Omit<RawDefaults, 'window' | 'owner' | 'self' | 'tools' | 'proactive' | 'browse' | 'comment' | 'avoid' | 'cloud' | 'match'> & {
  window: TimeWindow
  owner: { pronoun: OwnerPronoun }
  self: { pronoun: SelfPronoun }
  tools: { preset: string; restrict: boolean; allow: string[] }
  proactive: Omit<RawDefaults['proactive'], 'sendTools' | 'toolKinds'> & {
    sendTools: string[]
    toolKinds: Record<string, ToolKind>
    minIdleHours?: number
  }
  match: {
    cooldownDays: number
    dayMax?: number
  }
  browse: Omit<RawDefaults['browse'], 'window' | 'keywords'> & {
    window: TimeWindow | null
    keywords: string[]
  }
  comment: Omit<RawDefaults['comment'], 'window'> & {
    window: TimeWindow
  }
  avoid: {
    keywords: string[]
    upMids: string[]
    minDuration: number
  }
  cloud: Omit<RawDefaults['cloud'], 'targets'> & {
    targets: Array<Record<string, any>>
  }
  [extraKey: string]: any
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<U>
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

// ============================================================================
// 3. 认知派生快照契约（derive.js）
// ============================================================================

export type GateKey = 'trust' | 'autonomy' | 'competence'

export interface BeliefItem {
  id: string
  text: string
  since: number
  at: string
  stage: number
  confidence: number
  refs: string[]
  anchored: boolean
  topic: string
  mentions: number
  testedCount: number
  lastTouchedAt: number
  salience: number
  solid: boolean
  faded?: boolean
}

export interface RefusalItem {
  id: string
  at: string
  day: number
  what: string
  quote: string
  act: string
  object: string
  reaction: string | null
  reactionText?: string | null
  conceded?: boolean
  concedeText?: string | null
  resolved?: boolean
}

export interface TensionItem {
  a: { id: string; text: string; at?: string }
  b: { id: string; text: string; at?: string }
  sim: number
}

export interface StageGate {
  passed: GateKey[]
  pending: GateKey | null
  next: GateKey | null
  forced: GateKey[]
  gateStage: number
}

export interface DerivedFacts {
  refusals: number
  wont: number
  refused: number
  askRejected: number
  revises: number
  narrations: number
  corrected: number
  reunions: number
  reunionAfterAbsence: number
  tensions: number
  solid: number
  faded: number
  solidStaleDays: number
  reactions: { accept: number; insist: number; hurt: number; leave: number; other: number }
  hurts: number
  scars: number
  scarsResolved: number
  voices: number
  voicesEchoed: number
}

export interface DerivedSelf {
  day: number
  growthDays: number
  startedAt: string | null
  persona: { imported: boolean; source: string }
  stage: number
  elapsedStage: number
  stageName: string
  stagePeak: number
  stageForced: boolean
  stageGate: StageGate
  name: string | null
  beliefs: BeliefItem[]
  ranked: BeliefItem[]
  solid: BeliefItem[]
  solidTotal: number
  faded: BeliefItem[]
  tensions: TensionItem[]
  tensionsTotal: number
  scars: RefusalItem[]
  scarCount: number
  voices: Array<{ id: string; at: string; text: string; echoed?: boolean }>
  freshVoice: { id: string; at: string; text: string } | null
  lookedRecent: Array<{ bvid: string; title: string; at?: string }>
  materials: Array<Record<string, any>>
  beliefCount: number
  refuted: Array<Record<string, any>>
  refusals: RefusalItem[]
  refusalEcho: RefusalItem | null
  conflicts: Array<Record<string, any>>
  recentHeard: Array<Record<string, any>>
  topicPairs: Array<Record<string, any>>
  looseSaid: Array<Record<string, any>>
  selfmodAttempts: Array<Record<string, any>>
  reunions: Array<Record<string, any>>
  corrected: number
  tested: string[]
  needs: { autonomy: number; competence: number; relatedness: number }
  facts: DerivedFacts
  absenceDays: number
  narrative: { id?: string; text: string; at?: string; source?: string } | null
  prevNarrative: { text: string; at?: string } | null
  lastAbsence: { at: string } | null
  lastSeenAt: string | null
  lastWakeAt: string | null
  spokenSinceSeen: boolean
  heardSinceWake: boolean
  lastReunion: { at: string; text: string } | null
}

// ============================================================================
// 4. 观测台 HTTP 与宿主运行期接口契约（observe*.js ↔ client.js）
// ============================================================================

export interface HttpRequest {
  method?: string
  url?: string
  headers?: Record<string, string | string[] | undefined>
  on(event: 'data', listener: (chunk: Buffer | string) => void): void
  on(event: 'end', listener: () => void): void
  on(event: 'error', listener: (err: Error) => void): void
  on(event: string, listener: (...args: any[]) => void): void
  destroy?: () => void
}

export interface HttpResponse {
  writableEnded?: boolean
  writeHead(statusCode: number, headers?: Record<string, string | number>): void
  setHeader?(name: string, value: string | number): void
  end(data?: string | Uint8Array): void
}

export type ObserveHandler = (req: HttpRequest, res: HttpResponse) => Promise<void> | void
export type ObserveRouteEntry = [path: string, handler: ObserveHandler]

export interface HostContext {
  get?: (name: string) => any
  on?: (event: string, listener: (...args: any[]) => any) => (() => void) | void
  emit?: (event: string, payload?: any) => void
  bail?: (event: string, payload?: any) => any
  sessionController?: any
  webServer?: any
  connection?: any
  tools?: any
  attachments?: any
  [key: string]: any
}

export interface TenancyBag {
  root?: string
  herDir?: string
  tenant?: { ok: boolean; instanceId?: string; why?: string; owner?: { dataDir?: string } }
  homes?: { changed?: boolean; from?: string; to?: string }
  home?: { blocked?: boolean; why?: string }
  reclaim?: () => Promise<void> | void
  quiet?: <T>(fn: () => Promise<T> | T) => Promise<T> | T
}

export interface ObserveDeps {
  root?: string
  version?: string
  tenancy?: TenancyBag
  compat?: { checked?: boolean; userQuestions?: boolean }
  install?: {
    host?: { ok?: boolean; status?: string; version?: string; range?: string; why?: string }
    upgrade?: {
      ok?: boolean
      stale?: boolean
      older?: boolean
      skipped?: boolean
      running?: string
      source?: string
      sourcePath?: string
      profile?: string
      why?: string
    }
  }
  restoreLimit?: number
  selfUpdater?: any
  qrLogin?: any
  openFolder?: (dir: string) => Promise<boolean>
}

export interface ObserveEnv {
  ctx: HostContext
  root: string
  deps: ObserveDeps
  flog: (level?: 'info' | 'warn' | 'error' | 'debug') => (...args: unknown[]) => void
  pressure: ReturnType<typeof import('./session-pressure.js').registerSessionPressure>
  selfUpdater: any
  qrLogin: any
  openFolder: (dir: string) => Promise<boolean>
  syncBridgePort: (portRaw: unknown, why?: string) => void
  inflight: Map<string, number>
  restoreLimit: number
  runRestore: (bundle: any, skipBad: boolean) => Promise<any>
  replyRestore: (res: HttpResponse, r: any) => void
  awayFromBeat: <T>(fn: () => Promise<T> | T) => Promise<T> | T
  reclaimTenant: () => Promise<void>
}

export interface ObserveStatusPayload {
  phase: string
  label: string
  detail: string
  since: string
  minutesAgo: number | null
  plannedWakeAt: string | null
  nextWakeAt: string | null
  awake: boolean
  today: {
    wakes: number
    idleWakes: number
    browsed: number
    said: number
    chat: number
    comments: number
    dairies: number
  }
  timeline: Array<{ at: string; kind: string; text: string; idle?: boolean }>
  away: { kind: string; since?: number; line: string; tripDays: number } | null
  running: boolean
}

export interface ObserveStatePayload {
  day: number
  growthDays: number
  dev: boolean
  stage: number
  stageName: string
  stagePeak: number
  stageForced: boolean
  pendingGate: GateKey | null
  gateTimes: { belief: number; refuse: number; revise: number }
  forcedGates: Array<'belief' | 'refuse' | 'revise'>
  name: string | null
  beliefCount: number
  absenceDays: number
  tension: { count: number; a: string; b: string } | null
  solidCount: number
  scarCount: number
  stanceCount: number
  stanceReady: boolean
  counts: {
    utterance: number
    chat: number
    revise: number
    refusal: number
    reunion: number
    total: number
    all: number
    meta: number
    noise: number
  }
  quality: Record<string, any>
  rules: any
  pending: { id: string; rule?: string; title: string; text: string; day: number | null } | null
  grants: any
  config: {
    window: TimeWindow
    daily: FishConfig['daily']
    diary: { enabled: boolean; visible: boolean }
    absenceAfterDays: number
    proactive: FishConfig['proactive']
    self: { pronoun: SelfPronoun }
  }
  meta: {
    root: string
    skippedLines: number
    configFresh: boolean
    configBroken: boolean
    dateKey: string
    version: string
  }
  tenancy: { ok: boolean; instanceId: string; why: string; dataDir: string } | null
  homes: { changed: boolean; from: string; to: string } | null
  home: Record<string, any>
  compat: { checked: boolean; userQuestions: boolean }
  host: { ok: boolean; status: string; version: string; range: string; why: string } | null
  upgrade: {
    stale: boolean
    older: boolean
    skipped: boolean
    running: string
    source: string
    sourcePath: string
    profile: string
    why: string
  } | null
}
