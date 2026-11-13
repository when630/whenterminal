import { onWindowShown } from './window-shown'

/**
 * /diag용: 창이 다시 보일 때 렌더러가 얼마나 멈추는지 기록한다 (트레이·최소화에서 돌아올 때 렉).
 * 다시 보일 때마다 3초 동안 프레임 간격·긴 작업·긴 애니메이션 프레임(LoAF, 어느 스크립트가 잡았는지)을 모아 최근 20번을 들고 있고,
 * 평소에도 100ms 넘는 긴 애니메이션 프레임을 최근 50개 남긴다. 기록만 하고 아무것도 바꾸지 않는다
 */

const WATCH_MS = 3000
const KEEP_SHOWS = 20
const KEEP_SLOW = 50
const SLOW_FRAME_MS = 100
/** 이보다 긴 프레임 간격만 하나하나 남긴다 (60Hz 한 프레임 ≈ 17ms) */
const GAP_MS = 24

/** lib.dom에 아직 없는 Long Animation Frames API의 필요한 부분 */
interface LoafScript {
  invoker?: string
  invokerType?: string
  sourceURL?: string
  sourceFunctionName?: string
  duration: number
  forcedStyleAndLayoutDuration?: number
}
interface LoafEntry extends PerformanceEntry {
  blockingDuration?: number
  renderStart?: number
  styleAndLayoutStart?: number
  scripts?: LoafScript[]
}

interface Frame {
  /** 다시 보인 때부터 (ms) */
  at: number
  duration: number
  blocking?: number
  /** 그 프레임에서 그리기 전 단계(rAF·스타일·레이아웃)가 걸린 시간 */
  render?: number
  styleLayout?: number
  scripts: string[]
}

interface ShowRecord {
  at: string
  /** 숨어 있던 시간 (ms) */
  hiddenMs: number | null
  domElements: number
  /** 다시 보인 뒤 첫 rAF까지 (ms) */
  firstFrameMs: number | null
  frames: number
  maxGapMs: number
  /** GAP_MS보다 긴 프레임 간격 [다시 보인 때부터 ms, 간격 ms] */
  gaps: [number, number][]
  longTasks: [number, number][]
  slowFrames: Frame[]
}

const shows: ShowRecord[] = []
const slow: (Frame & { when: string })[] = []
let hiddenAt: number | null = null
let current: { t0: number; rec: ShowRecord } | null = null

const round = (n: number): number => Math.round(n)

function frameOf(e: LoafEntry, t0: number): Frame {
  return {
    at: round(e.startTime - t0),
    duration: round(e.duration),
    blocking: e.blockingDuration === undefined ? undefined : round(e.blockingDuration),
    render: e.renderStart ? round(e.startTime + e.duration - e.renderStart) : undefined,
    styleLayout: e.styleAndLayoutStart ? round(e.startTime + e.duration - e.styleAndLayoutStart) : undefined,
    scripts: (e.scripts ?? [])
      .slice()
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 3)
      .map((s) => {
        const where = s.sourceFunctionName || s.invoker || s.invokerType || '?'
        const file = s.sourceURL ? s.sourceURL.slice(s.sourceURL.lastIndexOf('/') + 1) : ''
        const forced = s.forcedStyleAndLayoutDuration ? ` forced ${round(s.forcedStyleAndLayoutDuration)}` : ''
        return `${where}${file ? ` @${file}` : ''} ${round(s.duration)}ms${forced}`
      }),
  }
}

function observe(type: string, cb: (e: PerformanceEntry) => void): void {
  try {
    new PerformanceObserver((list) => list.getEntries().forEach(cb)).observe({ type, buffered: false })
  } catch {
    // 이 엔진이 모르는 종류
  }
}

observe('long-animation-frame', (e) => {
  const loaf = e as LoafEntry
  if (current && e.startTime >= current.t0 && e.startTime - current.t0 <= WATCH_MS) current.rec.slowFrames.push(frameOf(loaf, current.t0))
  if (e.duration >= SLOW_FRAME_MS) {
    slow.push({ ...frameOf(loaf, 0), when: new Date(performance.timeOrigin + e.startTime).toISOString() })
    if (slow.length > KEEP_SLOW) slow.shift()
  }
})

observe('longtask', (e) => {
  if (current && e.startTime >= current.t0 && e.startTime - current.t0 <= WATCH_MS) current.rec.longTasks.push([round(e.startTime - current.t0), round(e.duration)])
})

function watch(): void {
  const t0 = performance.now()
  const rec: ShowRecord = {
    at: new Date().toISOString(),
    hiddenMs: hiddenAt === null ? null : round(t0 - hiddenAt),
    domElements: document.getElementsByTagName('*').length,
    firstFrameMs: null,
    frames: 0,
    maxGapMs: 0,
    gaps: [],
    longTasks: [],
    slowFrames: [],
  }
  current = { t0, rec }
  shows.push(rec)
  if (shows.length > KEEP_SHOWS) shows.shift()
  let last = t0
  const tick = (t: number): void => {
    if (current?.rec !== rec) return
    // rAF의 t는 그 프레임이 시작된 시각이라 다시 보인 때보다 앞설 수 있다. 첫 프레임은 콜백이 불린 때로 잰다
    if (rec.firstFrameMs === null) rec.firstFrameMs = round(performance.now() - t0)
    const gap = t - last
    if (rec.frames > 0) {
      rec.maxGapMs = Math.max(rec.maxGapMs, round(gap))
      if (gap > GAP_MS) rec.gaps.push([round(last - t0), round(gap)])
    }
    rec.frames++
    last = t
    if (t - t0 < WATCH_MS) requestAnimationFrame(tick)
    else current = null
  }
  requestAnimationFrame(tick)
}

onWindowShown((shown) => {
  if (shown) watch()
  else {
    hiddenAt = performance.now()
    current = null
  }
})

/** /diag 보고서에 넣을 기록 */
export function showLagReport(): { shows: ShowRecord[]; slowFrames: (Frame & { when: string })[] } {
  return { shows: [...shows], slowFrames: [...slow] }
}
