// Remote Control(/remote) 통합 테스트: ① 켜면 claude.ai 링크가 오는지 ② CLI를 다시 띄워도(recycle) 같은 링크로 다시 붙는지
// ③ 끄면 null인지. 모델은 부르지 않는다(claude.ai에 원격 세션이 하나 생긴다). 실행: npm run test:remote
// --wait: 끄기 전에 기다린다. 그동안 링크를 열어 claude.ai에서 메시지를 보내면 앱이 받는 이벤트(말풍선·상태)를 찍는다. Ctrl+C로 끝
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentEvent } from '@shared/types'
import { AgentSession } from '../src/main/agent/session'

const wait = process.argv.includes('--wait')
const cwd = mkdtempSync(join(tmpdir(), 'wt-remote-'))
const events: AgentEvent[] = []
const session = new AgentSession({
  cwd,
  mode: 'default',
  prefs: () => ({ promptSuggestions: false }),
  away: () => false,
  budget: () => null,
  emit: (e) => {
    events.push(e)
    if (e.kind === 'remote') console.log(`[remote] ${e.remote ? `${e.remote.state} ${e.remote.url ?? ''}` : 'off'}`)
    else if (e.kind === 'status') console.log(`[status] ${e.status}`)
    else if (e.kind === 'user') console.log(`[user] ${e.remote ? '(remote) ' : ''}${e.text}`)
    else if (e.kind === 'assistant_text') console.log(`[assistant] ${e.text.slice(0, 80)}`)
    else if (e.kind === 'permission_request') console.log(`[permission] ${e.request.toolName}`)
    else if (e.kind === 'permission_resolved') console.log('[permission] resolved')
    else if (e.kind === 'error') console.log(`[error] ${e.message}`)
  },
  onSessionId: (id) => console.log(`[session] ${id}`),
  onRateLimit: () => {},
})

const until = async (check: () => boolean, ms: number): Promise<boolean> => {
  const t0 = Date.now()
  while (!check() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 200))
  return check()
}
const latest = (): Extract<AgentEvent, { kind: 'remote' }> | undefined => events.filter((e): e is Extract<AgentEvent, { kind: 'remote' }> => e.kind === 'remote').at(-1)

let ok = true
const check = (label: string, pass: boolean): void => {
  console.log(`${pass ? 'PASS' : 'FAIL'} ${label}`)
  if (!pass) ok = false
}

try {
  const first = await session.setRemote(true, 'WT remote-test')
  check('켜면 링크가 온다', !!first?.url && /^https:\/\/claude\.ai\//.test(first.url))
  check('연결됨(connected)까지', await until(() => latest()?.remote?.state === 'connected', 15_000))

  check('쉬는 세션은 다시 띄울 수 있다', session.recycle())
  check('다시 띄운 뒤 같은 링크로 연결됨', await until(() => latest()?.remote?.state === 'connected', 30_000))
  check('링크가 그대로', latest()?.remote?.url === first?.url)

  if (wait) {
    console.log(`\n이 링크를 열어 메시지를 보내 보세요: ${first?.url}\nCtrl+C로 끝내요`)
    await new Promise(() => {})
  }

  const off = await session.setRemote(false)
  check('끄면 null', off === null && latest()?.remote === null)
} catch (err) {
  console.log('ERROR', err)
  ok = false
} finally {
  session.dispose()
  // 끝난 CLI가 잠시 폴더를 잡고 있다 (Windows)
  try {
    rmSync(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 })
  } catch {
    console.log(`임시 폴더를 지우지 못했어요: ${cwd}`)
  }
}
console.log(ok ? '\nALL PASS' : '\nFAILED')
process.exit(ok ? 0 : 1)
