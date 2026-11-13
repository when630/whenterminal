import { execFile } from 'node:child_process'
import { delimiter } from 'node:path'

const MARK = '__WT_PATH__'
let loading: Promise<void> | null = null

/**
 * macOS에서 Finder·Dock·로그인 자동 실행으로 켜면 PATH가 /usr/bin:/bin:/usr/sbin:/sbin 뿐이라
 * SDK가 띄우는 CLI의 MCP 서버·훅·명령이 Homebrew·nvm 등의 명령을 찾지 못한다 (claude 실행 파일 자체는 executable.ts가 설치 자리를 직접 본다).
 * 로그인 셸에서 PATH를 한 번 읽어 앞에 붙인다. 실패하면 그대로 둔다. CLI를 띄우는 길은 모두 이것을 기다린다
 */
export function whenShellPath(): Promise<void> {
  loading ??= load()
  return loading
}

function load(): Promise<void> {
  if (process.platform !== 'darwin') return Promise.resolve()
  const shell = process.env.SHELL || '/bin/zsh'
  return new Promise((resolve) => {
    execFile(shell, ['-ilc', `printf '${MARK}%s${MARK}' "$PATH"`], { timeout: 5000 }, (_err, stdout) => {
      const found = String(stdout ?? '').match(new RegExp(`${MARK}(.*)${MARK}`))?.[1]
      if (found) {
        const merged = [...found.split(delimiter), ...(process.env.PATH ?? '').split(delimiter)].filter(Boolean)
        process.env.PATH = [...new Set(merged)].join(delimiter)
      }
      resolve()
    })
  })
}
