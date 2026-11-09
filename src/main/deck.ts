import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { openConversations, type AgentEventEnvelope, type AgentStatus, type Project, type UsageInfo } from '@shared/types'

// 스트림덱(Ulanzi 등) 플러그인이 대화 상태·사용량을 읽어 가는 로컬 HTTP 통로.
// 127.0.0.1에서만 듣고, 다른 사이트의 페이지가 읽지 못하게 Host·Origin을 확인한다.
//   GET  /state           지금 상태 한 번
//   GET  /events          상태가 바뀔 때마다 SSE로 (처음 연결하면 바로 한 번)
//   POST /open?project=&conversation=   창을 열고 그 대화로 옮긴다 (둘 다 없으면 창만)
//   POST /home            창을 열고 홈 화면으로
//   POST /usage/refresh   사용량을 새로 받는다

export const DECK_PORT = 37630

export interface DeckConversation {
  projectId: string
  projectName: string
  conversationId: string
  title: string
  status: AgentStatus
  /** 턴이 끝나도 살아 있는 백그라운드 작업 수 (셸·모니터·하위 에이전트 등) */
  background: number
  contextPercent: number | null
  model: string | null
}

export interface DeckState {
  conversations: DeckConversation[]
  usage: UsageInfo | null
  at: number
}

const LOCAL_HOSTS = new Set([`127.0.0.1:${DECK_PORT}`, `localhost:${DECK_PORT}`])
/** 플러그인 WebView는 file:// 또는 로컬 서버에서 뜬다. 원격 사이트의 페이지는 막는다 */
const allowedOrigin = (origin: string | undefined): boolean =>
  !origin || origin === 'null' || origin.startsWith('file://') || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)

export class DeckBridge {
  private server: Server | null = null
  private clients = new Set<ServerResponse>()
  /** 대화별 마지막 상태. 이벤트로만 알 수 있어 여기서 들고 있는다 (모르면 idle) */
  private status = new Map<string, AgentStatus>()
  /** 대화별 살아 있는 백그라운드 작업 수 (background 이벤트가 목록 전체를 바꿔치기로 보낸다) */
  private background = new Map<string, number>()
  private usage: UsageInfo | null = null
  private pushTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private poll: ReturnType<typeof setInterval> | null = null
  /** 마지막으로 보낸 내용 (같으면 다시 보내지 않는다) */
  private lastSent = ''

  constructor(
    private readonly projects: () => Project[],
    private readonly open: (projectId: string, conversationId: string) => void,
    private readonly refreshUsage: () => void,
    private readonly goHome: () => void,
  ) {}

  start(): void {
    const server = createServer((req, res) => this.handle(req, res))
    server.on('error', (err: NodeJS.ErrnoException) => {
      // 포트를 다른 인스턴스(테스트 등)가 쓰고 있으면 이 앱은 통로 없이 돈다
      console.warn(`스트림덱 통로를 열지 못함 (${DECK_PORT})`, err.code ?? err)
      this.server = null
    })
    server.listen(DECK_PORT, '127.0.0.1')
    this.server = server
    // 프록시·WebView가 오래 조용한 연결을 끊지 않게
    this.heartbeat = setInterval(() => {
      for (const c of this.clients) c.write(': ping\n\n')
    }, 25_000)
    // 제목·대화 목록은 여러 곳에서 바뀌어 하나하나 걸지 않고 2초마다 비교한다. 상태 이벤트는 바로 보낸다
    this.poll = setInterval(() => this.push(), 2_000)
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat)
    if (this.poll) clearInterval(this.poll)
    for (const c of this.clients) c.end()
    this.clients.clear()
    this.server?.close()
    this.server = null
  }

  onEvent(e: AgentEventEnvelope): void {
    if (e.event.kind === 'background') {
      const n = e.event.tasks.length
      if ((this.background.get(e.conversationId) ?? 0) === n) return
      this.background.set(e.conversationId, n)
      this.changed()
      return
    }
    if (e.event.kind !== 'status') return
    if (this.status.get(e.conversationId) === e.event.status) return
    this.status.set(e.conversationId, e.event.status)
    this.changed()
  }

  setUsage(u: UsageInfo | null): void {
    this.usage = u
    this.changed()
  }

  /** 무언가 바뀌었다. 몰아서 한 번만 보낸다 */
  changed(): void {
    if (this.clients.size === 0 || this.pushTimer) return
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      this.push()
    }, 150)
  }

  /** 지난번에 보낸 것과 다를 때만 모든 연결에 보낸다 */
  private push(): void {
    if (this.clients.size === 0) return
    const { at: _at, ...rest } = this.state()
    const key = JSON.stringify(rest)
    if (key === this.lastSent) return
    this.lastSent = key
    const data = `data: ${JSON.stringify({ ...rest, at: Date.now() })}\n\n`
    for (const c of this.clients) c.write(data)
  }

  state(): DeckState {
    const conversations: DeckConversation[] = []
    for (const p of this.projects()) {
      for (const c of openConversations(p)) {
        conversations.push({
          projectId: p.id,
          projectName: p.name,
          conversationId: c.id,
          title: c.title,
          status: this.status.get(c.id) ?? 'idle',
          background: this.background.get(c.id) ?? 0,
          contextPercent: c.contextPercent ?? null,
          model: c.modelLabel ?? c.model ?? null,
        })
      }
    }
    return { conversations, usage: this.usage, at: Date.now() }
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const origin = req.headers.origin
    // DNS 리바인딩: 다른 이름으로 들어온 요청은 받지 않는다
    if (!LOCAL_HOSTS.has(req.headers.host ?? '') || !allowedOrigin(origin)) {
      res.writeHead(403).end()
      return
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Max-Age': '600' }).end()
      return
    }
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    if (req.method === 'GET' && url.pathname === '/state') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(this.state()))
      return
    }
    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' })
      res.write(`retry: 2000\ndata: ${JSON.stringify(this.state())}\n\n`)
      this.clients.add(res)
      req.on('close', () => this.clients.delete(res))
      return
    }
    if (req.method === 'POST' && url.pathname === '/open') {
      this.open(url.searchParams.get('project') ?? '', url.searchParams.get('conversation') ?? '')
      res.writeHead(204).end()
      return
    }
    if (req.method === 'POST' && url.pathname === '/home') {
      this.goHome()
      res.writeHead(204).end()
      return
    }
    if (req.method === 'POST' && url.pathname === '/usage/refresh') {
      this.refreshUsage()
      res.writeHead(204).end()
      return
    }
    res.writeHead(404).end()
  }
}
