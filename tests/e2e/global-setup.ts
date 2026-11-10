import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * 테스트가 남긴 것을 맨 끝에 한 번 치운다.
 * 테스트마다 앱을 프로세스 트리째 끝내는데(fixtures `quit`), 그 순간 CLI가 막 띄우던 자식(rg 모드 claude.exe·git)은
 * 일시 중단 상태로 부모만 잃고 남는다 (트리에 없어 taskkill /T가 못 잡는다). 이것들이 임시 폴더를 잡고 있어 폴더도 못 지운다.
 * 테스트마다 프로세스 목록을 읽으면 느려서(PowerShell 1~2초) 못 지운 폴더만 적어 두었다가(`WT_E2E_LEFTOVER`) 여기서 한 번에
 */
export default function globalSetup(): () => void {
  const started = Date.now()
  const list = join(tmpdir(), `wt-e2e-leftover-${process.pid}.txt`)
  // globalSetup에서 넣은 환경 변수는 워커에도 간다
  process.env.WT_E2E_LEFTOVER = list
  return () => {
    killOrphans(started)
    if (!existsSync(list)) return
    for (const root of readFileSync(list, 'utf8').split('\n').filter(Boolean)) {
      try {
        rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
      } catch {
        // 끝내 못 지우면 OS가 나중에 정리
      }
    }
    rmSync(list, { force: true })
  }
}

/**
 * 이 실행 중에 생겼고 부모가 이미 없는 프로세스 가운데 테스트 임시 폴더(`wt-e2e-`)를 가리키는 것과 rg 모드 claude.exe를 끝낸다.
 * 살아 있는 앱·세션의 자식은 부모가 있으므로 건드리지 않는다 (다른 e2e 실행·쓰고 있는 Claude Code)
 */
function killOrphans(since: number): void {
  if (process.platform !== 'win32') return
  const script = `
$since = [DateTimeOffset]::FromUnixTimeMilliseconds(${since}).LocalDateTime
$all = Get-CimInstance Win32_Process
$alive = @{}
foreach ($p in $all) { $alive[[int]$p.ProcessId] = $true }
foreach ($p in $all) {
  if ($alive.ContainsKey([int]$p.ParentProcessId) -or $p.CreationDate -lt $since) { continue }
  $cmd = [string]$p.CommandLine
  if ($cmd -like '*wt-e2e-*' -or ($p.Name -eq 'claude.exe' -and $cmd -like 'rg *')) {
    Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
  }
}`
  try {
    // 따옴표가 섞여 있어 -EncodedCommand(UTF-16LE base64)로 넘긴다
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { stdio: 'ignore', timeout: 30_000 })
  } catch {
    // 정리는 되는 데까지만. 테스트 결과와는 무관
  }
}
