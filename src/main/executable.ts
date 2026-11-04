import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, sep } from 'node:path'

let cached: string | undefined | null = null

/**
 * SDK가 띄울 Claude Code 실행 파일 경로 (`pathToClaudeCodeExecutable`).
 * 전역으로 설치한 claude가 있으면 그것을 쓴다 (스스로 업데이트되므로 SDK 번들보다 새 버전).
 * 없으면 패키징한 앱은 SDK 운영체제별 패키지(@anthropic-ai/claude-agent-sdk-<os>-<arch>)의 네이티브 바이너리를,
 * app.asar 안의 파일은 실행할 수 없으므로 빌드 때 풀어 둔 app.asar.unpacked 쪽 경로로 넘긴다.
 * 개발 실행에서 전역 claude가 없으면 undefined (SDK 기본 동작)
 */
export function claudeExecutable(): string | undefined {
  if (cached !== null) return cached
  cached = globalBinary() ?? (app.isPackaged ? bundledBinary() : undefined)
  console.log('Claude Code 실행 파일:', cached ?? 'SDK 기본')
  return cached
}

/**
 * 전역으로 설치한 claude 네이티브 바이너리. 없으면 undefined.
 * 설치 관리자가 두는 자리를 먼저 본다 (macOS는 Finder로 띄운 앱이 셸 PATH를 받지 못한다).
 * Windows의 npm 전역 설치(claude.cmd)는 SDK가 셸 없이 띄울 수 없으므로 .exe만 쓴다
 */
function globalBinary(): string | undefined {
  const isWin = process.platform === 'win32'
  const name = isWin ? 'claude.exe' : 'claude'
  const home = homedir()
  const known = [join(home, '.local', 'bin', name), join(home, '.claude', 'local', name)]
  if (!isWin) known.push('/opt/homebrew/bin/claude', '/usr/local/bin/claude')
  const hit = known.find((p) => existsSync(p))
  if (hit) return hit
  try {
    const out = execFileSync(isWin ? 'where' : 'which', [name], { encoding: 'utf8', timeout: 3000, windowsHide: true })
    return out.split(/\r?\n/).map((l) => l.trim()).find(Boolean)
  } catch {
    return undefined
  }
}

/** SDK가 번들한 운영체제별 Claude Code 바이너리 (개발 실행에서도). 없으면 undefined */
function bundledBinary(): string | undefined {
  try {
    const req = createRequire(import.meta.url)
    const pkg = req.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`)
    const bin = join(dirname(pkg), process.platform === 'win32' ? 'claude.exe' : 'claude')
    return bin.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
  } catch (err) {
    console.error('Claude Code 실행 파일을 찾지 못함', err)
    return undefined
  }
}

/** 터미널에서 로그인(claude auth login)할 때 칠 명령. 세션이 쓰는 바이너리(전역 또는 번들) 경로로, 둘 다 없으면 PATH의 claude */
export function loginCommand(): string {
  const bin = claudeExecutable() ?? bundledBinary()
  const exe = bin ? (/\s/.test(bin) ? `"${bin}"` : bin) : 'claude'
  // PowerShell은 경로를 따옴표로 감싸면 & 가 필요하다
  const prefix = process.platform === 'win32' && exe.startsWith('"') ? '& ' : ''
  return `${prefix}${exe} auth login`
}
