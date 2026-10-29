import { execFile } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const SKIP = new Set(['node_modules', '.git', 'out', 'dist', 'build', '.next', '.venv', 'venv', '__pycache__', '.idea', '.vscode', 'target', 'coverage'])
const MAX_FILES = 20_000
const TTL_MS = 30_000

const cache = new Map<string, { at: number; files: string[] }>()

const git = (cwd: string, args: string[]): Promise<string[]> =>
  // 한글 같은 비ASCII 경로를 git이 "\353\254\270…"처럼 이스케이프하지 않게(core.quotepath), 공백·줄바꿈이 든 이름도 안전하게 NUL로 구분(-z)
  run('git', ['-C', cwd, '-c', 'core.quotepath=false', 'ls-files', '-z', ...args], { maxBuffer: 32 * 1024 * 1024, timeout: 10_000, encoding: 'utf8' }).then(({ stdout }) =>
    stdout.split('\0').filter(Boolean),
  )

/** dir(cwd 기준 상대, '' 또는 'a/b/') 아래 파일을 훑어 files에 더한다. 무거운 폴더(SKIP)는 들어가지 않는다 */
function walk(cwd: string, dir: string, files: string[], dotfiles: boolean, depth = 0): void {
  if (depth > 8 || files.length >= MAX_FILES) return
  let entries
  try {
    entries = readdirSync(join(cwd, dir), { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (!dotfiles && e.name.startsWith('.') && e.name !== '.github') continue
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) walk(cwd, `${dir}${e.name}/`, files, dotfiles, depth + 1)
    } else files.push(`${dir}${e.name}`)
    if (files.length >= MAX_FILES) return
  }
}

/**
 * 폴더의 파일 목록 (상대 경로). git이면 추적 중인 파일과 무시되지 않은 새 파일, 아니면 직접 훑는다.
 * all이면(파일 보기) .gitignore로 무시된 파일·숨김 파일도 넣는다. 무시된 폴더 중 무거운 것(SKIP)은 찾기에서 빼고 둘러보기(listChildren)로만
 */
async function listAll(cwd: string, all = false): Promise<string[]> {
  const key = all ? `${cwd}\0all` : cwd
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.files
  let files: string[]
  try {
    files = await git(cwd, ['--cached', '--others', '--exclude-standard'])
    if (all) {
      // 무시된 것: 폴더째 무시된 것은 '폴더/' 하나로 오므로(--directory) 직접 훑는다
      for (const f of await git(cwd, ['--others', '--ignored', '--exclude-standard', '--directory'])) {
        if (!f.endsWith('/')) files.push(f)
        else if (!f.split('/').some((part) => SKIP.has(part))) walk(cwd, f, files, true)
        if (files.length >= MAX_FILES) break
      }
    }
  } catch {
    files = []
    walk(cwd, '', files, all)
  }
  files = files.slice(0, MAX_FILES).map((f) => f.replace(/\\/g, '/'))
  // 폴더도 @로 넣을 수 있게 (CLI처럼). 파일 경로에서 끌어내고 끝에 /를 붙여 구분한다
  const dirs = new Set<string>()
  for (const f of files) {
    let i = f.indexOf('/')
    while (i > 0) {
      dirs.add(`${f.slice(0, i)}/`)
      i = f.indexOf('/', i + 1)
    }
  }
  files = [...files, ...dirs]
  cache.set(key, { at: Date.now(), files })
  return files
}

/**
 * 글자를 띄엄띄엄 쳐도 찾는다 ('rsapp' → 'src/renderer/src/App.tsx').
 * 파일 이름에 붙어 맞을수록, 연속으로 맞을수록, 경로가 짧을수록 위로
 */
function score(path: string, q: string): number {
  if (!q) return 1000 - path.length
  const p = path.toLowerCase()
  // 폴더는 끝의 /를 뗀 이름으로 맞춘다
  const base = p.endsWith('/') ? p.slice(0, -1) : p
  const name = base.slice(base.lastIndexOf('/') + 1)
  if (name.startsWith(q)) return 5000 - path.length
  if (name.includes(q)) return 4000 - path.length
  if (p.includes(q)) return 3000 - path.length
  let i = 0
  let run = 0
  let best = 0
  for (const ch of p) {
    if (ch === q[i]) {
      i++
      run++
      best = Math.max(best, run)
      if (i === q.length) return 1000 + best * 20 - path.length
    } else run = 0
  }
  return -1
}

export async function searchFiles(cwd: string, query: string, all = false, limit = 50): Promise<string[]> {
  const q = query.toLowerCase()
  return (await listAll(cwd, all))
    .map((f) => ({ f, s: score(f, q) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.f)
}

/**
 * 폴더 하나의 바로 아래 항목 (파일 보기에서 폴더를 둘러볼 때). dir은 ''(맨 위) 또는 'src/main/'처럼 끝에 /.
 * 폴더를 직접 읽어 .gitignore로 무시된 것·숨김 파일도 보인다(.git만 뺀다). 폴더(끝에 /)가 먼저, 그 안에서는 이름순
 */
export async function listChildren(cwd: string, dir: string): Promise<string[]> {
  const prefix = dir && !dir.endsWith('/') ? `${dir}/` : dir
  let entries
  try {
    entries = readdirSync(join(cwd, prefix), { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.name !== '.git')
    .map((e) => {
      let isDir = e.isDirectory()
      // 링크(심볼릭·정션)는 가리키는 곳이 폴더인지 본다
      if (e.isSymbolicLink()) {
        try {
          isDir = statSync(join(cwd, prefix, e.name)).isDirectory()
        } catch {
          // 끊어진 링크는 파일로
        }
      }
      return `${prefix}${e.name}${isDir ? '/' : ''}`
    })
    .sort((a, b) => Number(b.endsWith('/')) - Number(a.endsWith('/')) || a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))
}
