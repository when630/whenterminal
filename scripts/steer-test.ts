// 실행 중에 보낸 메시지 통합 테스트 (실제 SDK·haiku): 지금 턴에 끼워 넣기(folded)·접히기 전 취소·끝난 뒤 보내기(after)
// 실행: npm run test:steer  (구독 사용량을 약간 씀)
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentEvent } from '@shared/types'
import { AgentSession } from '../src/main/agent/session'

const TASK = 'Run these three Bash commands one at a time, each in its own separate tool call, waiting for each to finish before the next: `sleep 3 && echo one`, `sleep 3 && echo two`, `sleep 3 && echo three`. Then reply with one short sentence.'
const STEER = 'Also: end your final reply with the exact word PINEAPPLE.'

type Run = { events: AgentEvent[]; text: () => string; dones: () => number }

/** 세션 하나를 띄워 TASK를 보내고, 첫 도구 호출에서 onFirstTool을 부른다. 끝(done 횟수 want)까지 기다린다 */
async function run(label: string, want: number, onFirstTool: (s: AgentSession) => void | Promise<void>): Promise<Run> {
  const cwd = mkdtempSync(join(tmpdir(), 'whenterminal-steer-'))
  const events: AgentEvent[] = []
  let fired = false
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label}: timeout`)), 240_000)
      const session: AgentSession = new AgentSession({
        cwd,
        mode: 'bypassPermissions',
        model: 'haiku',
        prefs: () => ({ promptSuggestions: false }),
        away: () => false,
        budget: () => null,
        emit: (e) => {
          events.push(e)
          if (e.kind === 'tool_use' && !fired) {
            fired = true
            console.log(`[${label}] first tool_use → act`)
            void onFirstTool(session)
          } else if (e.kind === 'folded' || e.kind === 'unqueued' || e.kind === 'task_start') console.log(`[${label}] ${e.kind}`)
          else if (e.kind === 'status') {
            console.log(`[${label}] status ${e.status}`)
            if (e.status === 'error') {
              clearTimeout(timer)
              session.dispose()
              reject(new Error(`${label}: error`))
            }
            // want 0: Esc로 멈춘 뒤(stopped) 다음 턴이 이어지지 않는지 본다
            if ((want === 0 && e.status === 'stopped') || (want > 0 && e.status === 'done' && events.filter((x) => x.kind === 'status' && x.status === 'done').length >= want)) {
              clearTimeout(timer)
              // 다음 턴이 이어지는지 잠깐 더 본다
              setTimeout(() => {
                session.dispose()
                resolve()
              }, want === 0 ? 15000 : 3000)
            }
          }
        },
        onSessionId: () => {},
        onRateLimit: () => {},
      })
      session.send(TASK)
    })
  } finally {
    await new Promise((r) => setTimeout(r, 1500))
    try {
      rmSync(cwd, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
    } catch {
      // 임시 폴더
    }
  }
  const texts = (): string => events.filter((e): e is Extract<AgentEvent, { kind: 'assistant_text' }> => e.kind === 'assistant_text').map((e) => e.text).join('\n')
  return { events, text: texts, dones: () => events.filter((e) => e.kind === 'status' && e.status === 'done').length }
}

const checks: Record<string, boolean> = {}

// 1) 기본: 지금 턴에 끼워 넣는다 → 모델이 다음 도구 호출 사이에 읽고(folded) 같은 작업에서 반영
const a = await run('steer', 1, (s) => s.send(STEER))
checks.steerFolded = a.events.some((e) => e.kind === 'folded')
checks.steerApplied = /PINEAPPLE/.test(a.text())
checks.steerOneTask = a.dones() === 1 && !a.events.some((e) => e.kind === 'task_start')

// 2) Esc: 끼워 넣으려던 메시지도 함께 멈춘다 (다음 턴으로 혼자 돌지 않는다)
const b = await run('esc', 0, async (s) => {
  s.send(STEER)
  await s.interrupt()
})
checks.escCancelled = b.events.some((e) => e.kind === 'unqueued')
checks.escNotApplied = !/PINEAPPLE/.test(b.text())
checks.escNoNewTurn = !b.events.some((e, i) => e.kind === 'status' && e.status === 'running' && b.events.slice(0, i).some((p) => p.kind === 'status' && p.status === 'stopped'))

// 3) 끝난 뒤 보내기(after): 지금 작업이 끝나고 새 작업으로 돈다
const c = await run('after', 2, (s) => s.send('Reply with exactly: KIWI', true, undefined, undefined, true))
checks.afterTwoTasks = c.dones() === 2 && c.events.some((e) => e.kind === 'task_start')
checks.afterNotFolded = !c.events.some((e) => e.kind === 'folded')
checks.afterApplied = /KIWI/.test(c.text())

console.log(checks)
process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1
