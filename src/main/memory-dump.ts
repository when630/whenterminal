import { readFile } from 'node:fs/promises'
import { contentTracing } from 'electron'

/**
 * /diag의 할당자별 메모리: Chromium memory-infra 덤프를 한 번 받아 원본 트레이스(chrome://tracing에서 열림)와 요약을 남긴다.
 * 힙 스냅샷에는 V8·DOM만 잡히고 PartitionAlloc·Skia·글꼴 캐시·cc 같은 것은 빠져, 프로세스 메모리가 왜 큰지 알 수 없었다
 */

/** 녹화를 켜면 detailed 덤프가 바로 한 번 돈다. 주기는 녹화 중에 다시 돌지 않을 만큼 길게 */
const TRACE_CONFIG = {
  included_categories: ['disabled-by-default-memory-infra'],
  excluded_categories: ['*'],
  memory_dump_config: { triggers: [{ mode: 'detailed', periodic_interval_ms: 600_000 }] },
}
/** 덤프가 모든 프로세스에서 돌아올 때까지 */
const WAIT_MS = 2000
/** 요약에 남길 할당자: 이보다 작거나 깊은 것은 원본 트레이스에서 본다 */
const MIN_BYTES = 512 * 1024
const MAX_DEPTH = 4
const MAX_ROWS = 80

interface TraceEvent {
  ph: string
  pid: number
  name?: string
  id?: string
  args?: {
    name?: string
    labels?: string
    dumps?: {
      process_totals?: Record<string, string>
      allocators?: Record<string, { attrs?: Record<string, { value?: string; units?: string }> }>
    }
  }
}

export interface ProcessMemory {
  pid: number
  name: string
  labels?: string
  /** 작업 관리자의 '메모리'와 같은 값 */
  privateFootprintMB?: number
  /** 할당자 이름(경로) → MB. 부모는 자식을 포함하므로 더하지 말 것 */
  allocatorsMB: Record<string, number>
}

const mb = (bytes: number): number => Math.round((bytes / 1048576) * 10) / 10
const hex = (v: string | undefined): number => (v ? parseInt(v, 16) : 0)

/** 녹화해 tracePath에 저장하고 프로세스별 요약을 돌려준다. 이미 다른 녹화가 돌고 있으면 실패로 돌려준다 */
export async function captureMemoryDump(tracePath: string): Promise<{ processes: ProcessMemory[] } | { error: string }> {
  try {
    await contentTracing.startRecording(TRACE_CONFIG)
    await new Promise((r) => setTimeout(r, WAIT_MS))
    await contentTracing.stopRecording(tracePath)
    const events = (JSON.parse(await readFile(tracePath, 'utf8')) as { traceEvents: TraceEvent[] }).traceEvents
    return { processes: summarize(events) }
  } catch (err) {
    return { error: String(err) }
  }
}

function summarize(events: TraceEvent[]): ProcessMemory[] {
  const names = new Map<number, string>()
  const labels = new Map<number, string>()
  for (const e of events) {
    if (e.ph !== 'M') continue
    if (e.name === 'process_name' && e.args?.name) names.set(e.pid, e.args.name)
    if (e.name === 'process_labels' && e.args?.labels) labels.set(e.pid, e.args.labels)
  }
  // 한 프로세스의 덤프는 같은 id의 'v' 이벤트 여러 개로 나뉘어 온다 (totals와 allocators 따로). 마지막 id만 쓴다
  const last = new Map<number, string | undefined>()
  for (const e of events) if (e.ph === 'v') last.set(e.pid, e.id)
  const out = new Map<number, ProcessMemory>()
  for (const e of events) {
    if (e.ph !== 'v' || e.id !== last.get(e.pid) || !e.args?.dumps) continue
    const p = out.get(e.pid) ?? { pid: e.pid, name: names.get(e.pid) ?? '?', labels: labels.get(e.pid), allocatorsMB: {} }
    out.set(e.pid, p)
    const totals = e.args.dumps.process_totals
    if (totals?.private_footprint_bytes) p.privateFootprintMB = mb(hex(totals.private_footprint_bytes))
    for (const [path, dump] of Object.entries(e.args.dumps.allocators ?? {})) {
      const size = hex(dump.attrs?.size?.value)
      if (size < MIN_BYTES || path.split('/').length > MAX_DEPTH || path.split('/')[0] === 'global') continue
      p.allocatorsMB[path] = mb(size)
    }
  }
  // 큰 것부터 MAX_ROWS개를 고른 뒤 경로 순으로 (자식이 부모 바로 아래에 오게)
  return [...out.values()].map((p) => ({
    ...p,
    allocatorsMB: Object.fromEntries(Object.entries(p.allocatorsMB).sort((a, b) => b[1] - a[1]).slice(0, MAX_ROWS).sort((a, b) => a[0].localeCompare(b[0]))),
  }))
}
