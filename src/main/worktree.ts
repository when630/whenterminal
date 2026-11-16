import { execFile, execFileSync, spawn } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { listSessions } from '@anthropic-ai/claude-agent-sdk'
import { samePath, worktreesOf } from './git-view'
import { worktreeRoot, type GitBranch, type WorktreeOpResult, type WorktreeRef } from '@shared/types'

const run = promisify(execFile)
const git = async (cwd: string, ...args: string[]): Promise<string> => (await run('git', ['-C', cwd, ...args], { timeout: 20_000 })).stdout.trim()
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * 작업 공간 폴더를 지운다. Windows에서는 그 폴더를 작업 폴더로 쓰는 프로세스(탭을 열 때 띄운 CLI 등)가
 * 막 끝나는 중이면 'Permission denied'로 실패하므로 잠깐씩 기다리며 다시 해 본다.
 * git이 파일만 일부 지우고 실패해 더는 작업 공간으로 안 보이면 폴더를 직접 지우고 git 기록을 정리한다
 */
async function removeWorktreeDir(projectPath: string, path: string, force: boolean): Promise<boolean> {
  for (const wait of [0, 300, 700, 1500, 3000]) {
    if (wait) await sleep(wait)
    try {
      await git(projectPath, 'worktree', 'remove', ...(force ? ['--force'] : []), path)
      return true
    } catch {
      if (!existsSync(path)) return true
      if (existsSync(join(path, '.git'))) continue
      try {
        await rm(path, { recursive: true, force: true })
        await git(projectPath, 'worktree', 'prune')
        return true
      } catch {
        // 아직 잡혀 있다. 다음에 다시
      }
    }
  }
  return false
}

/** 지금 브랜치. 분리된 HEAD면 짧은 커밋. git 저장소가 아니면 null */
export async function branchOf(path: string): Promise<GitBranch | null> {
  let name: string
  let detached = false
  try {
    name = await git(path, 'symbolic-ref', '--short', '-q', 'HEAD')
  } catch {
    try {
      name = await git(path, 'rev-parse', '--short', 'HEAD')
      detached = true
    } catch {
      return null
    }
  }
  let dirty = false
  try {
    dirty = (await git(path, 'status', '--porcelain', '--untracked-files=no')).length > 0
  } catch {
    // 상태는 몰라도 된다
  }
  return { name, detached, dirty }
}

export async function isGitRepo(path: string): Promise<boolean> {
  try {
    return (await git(path, 'rev-parse', '--is-inside-work-tree')) === 'true'
  } catch {
    return false
  }
}

/**
 * 작업 공간 폴더가 저장소 안이면 git이 새 파일로 보지 않게 저장소의 info/exclude에 적는다 (.gitignore는 건드리지 않는다).
 * 이미 무시되는 경로면 그대로
 */
async function ignoreInRepo(projectPath: string, root: string): Promise<void> {
  const top = await git(projectPath, 'rev-parse', '--show-toplevel')
  const rel = relative(resolve(top), root)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return
  try {
    await git(projectPath, 'check-ignore', '-q', root)
    return
  } catch {
    // 무시되지 않음 (종료 코드 1) → 적는다
  }
  const exclude = join(resolve(projectPath, await git(projectPath, 'rev-parse', '--git-common-dir')), 'info', 'exclude')
  const line = `/${rel.split(/[\\/]/).join('/')}/`
  const cur = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  if (cur.split(/\r?\n/).includes(line)) return
  mkdirSync(join(exclude, '..'), { recursive: true })
  appendFileSync(exclude, `${cur && !cur.endsWith('\n') ? '\n' : ''}# WHENTERMINAL 작업 공간 탭\n${line}\n`)
}

/** 브랜치가 이미 있는지 */
async function hasBranch(cwd: string, branch: string): Promise<boolean> {
  try {
    await git(cwd, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`)
    return true
  } catch {
    return false
  }
}

/**
 * 작업 공간 탭 (OPEN-002): 같은 프로젝트의 대화끼리 파일을 덮어쓰지 않게, HEAD에서 새 브랜치(worktree-<대화 앞 8자>, Claude Code와 같은 꼴)를 따서 따로 체크아웃한다.
 * 위치는 설정 worktreeDir: 상대 경로면 저장소 맨 위 기준(기본 .claude/worktrees/<대화 앞 8자>, Claude Code와 같은 자리·같은 드라이브),
 * 절대 경로면 여러 저장소가 같이 쓰므로 <저장소>-<대화 앞 8자>.
 * 프로젝트가 저장소의 하위 폴더면 worktree는 저장소 전체를 체크아웃하므로, 대화는 그 안의 같은 하위 폴더에서 돈다.
 * 저장소 맨 위의 .worktreeinclude에 맞는 git 무시 파일(.env 등)은 복사한다
 */
export async function createWorktree(projectPath: string, dir: string, conversationId: string, start: { base?: string; branch?: string } = {}): Promise<{ ref: WorktreeRef; copied: number }> {
  const top = resolve(await git(projectPath, 'rev-parse', '--show-toplevel'))
  const sub = relative(top, resolve(projectPath))
  const short = conversationId.slice(0, 8)
  // 이미 있는 브랜치를 열면 그 브랜치 그대로 (사용자 것), 아니면 기준(없으면 HEAD)에서 새 브랜치
  const adopted = !!start.branch
  let branch = start.branch ?? `worktree-${short}`
  if (!adopted && (await hasBranch(top, branch))) branch = `${branch}-${Date.now().toString(36)}`
  const shared = isAbsolute(dir)
  const base = shared ? dir : resolve(top, dir)
  const root = join(base, shared ? `${basename(top)}-${short}` : short)
  mkdirSync(base, { recursive: true })
  await ignoreInRepo(top, base).catch((err) => console.warn('작업 공간 폴더를 git 무시 목록에 넣지 못함', err))
  if (adopted) await git(top, 'worktree', 'add', root, branch)
  else await git(top, 'worktree', 'add', '-b', branch, root, start.base || 'HEAD')
  const copied = await copyIncluded(top, root).catch((err) => {
    console.warn('.worktreeinclude 파일을 복사하지 못함', err)
    return 0
  })
  return { ref: { path: sub && !sub.startsWith('..') ? join(root, sub) : root, root, branch, ...(adopted ? { adopted } : {}) }, copied }
}

/**
 * 이미 있는 worktree 폴더(맨 위)를 작업 공간으로 연다. 프로젝트가 저장소의 하위 폴더면 그 안의 같은 하위 폴더에서.
 * 이 앱이 만든 브랜치(worktree-…)가 아니면 사용자 것이라 adopted (닫아도 지우지 않는다)
 */
export async function adoptWorktree(projectPath: string, root: string): Promise<WorktreeRef> {
  const top = resolve(await git(projectPath, 'rev-parse', '--show-toplevel'))
  const sub = relative(top, resolve(projectPath))
  if (!existsSync(root)) throw new Error('폴더가 없어요')
  let branch: string
  try {
    branch = await git(root, 'symbolic-ref', '--short', '-q', 'HEAD')
  } catch {
    throw new Error('브랜치가 아닌 커밋(분리된 HEAD)이 체크아웃되어 있어 열 수 없어요')
  }
  const path = sub && !sub.startsWith('..') ? join(root, sub) : root
  return { path, root, branch, ...(branch.startsWith('worktree-') ? {} : { adopted: true }) }
}

/**
 * /resume으로 고른 세션이 이 저장소의 다른 worktree에서 돌던 것이면 그 작업 공간 (세션은 돌던 폴더에서 열어야 이어진다).
 * 프로젝트 폴더·그 하위 폴더에서 돌던 세션이면 null. 폴더가 없어졌으면 세션의 브랜치로 기록만 만들어 두고 세션을 띄울 때 되살린다(ensureWorktreeSync).
 * 없어진 폴더는 저장소 밖이거나 worktreeDir 안일 때만 작업 공간으로 본다 (지운 하위 폴더를 작업 공간으로 착각하지 않게)
 */
export async function sessionWorktree(projectPath: string, cwd: string, branch: string | undefined, dir: string): Promise<WorktreeRef | null> {
  let top: string
  try {
    top = resolve(await git(projectPath, 'rev-parse', '--show-toplevel'))
  } catch {
    return null
  }
  const at = resolve(cwd)
  const inside = (parent: string): boolean => {
    const rel = relative(parent, at)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  }
  if (existsSync(at)) {
    let wtTop: string
    try {
      wtTop = resolve(await git(at, 'rev-parse', '--show-toplevel'))
    } catch {
      return null
    }
    if (samePath(wtTop, top)) return null
    if (!(await worktreesOf(top)).some((w) => !w.main && samePath(w.path, wtTop))) return null
    return { ...(await adoptWorktree(projectPath, wtTop)), path: at }
  }
  const base = isAbsolute(dir) ? resolve(dir) : resolve(top, dir)
  if (!branch || (inside(top) && !inside(base))) return null
  // 맨 위 = 하위 폴더 몫을 뗀 자리
  const sub = relative(top, resolve(projectPath))
  const tail = sub ? `${sep}${sub}` : ''
  const root = tail && at.toLowerCase().endsWith(tail.toLowerCase()) ? at.slice(0, -tail.length) : at
  return { path: at, root, branch, ...(branch.startsWith('worktree-') ? {} : { adopted: true }) }
}

/** 이 폴더의 가장 최근 세션 (남은 worktree를 다시 열 때 이어 연다) */
export async function latestSession(dir: string): Promise<{ sessionId: string; title: string } | null> {
  try {
    const list = await listSessions({ dir, limit: 20 })
    const last = [...list].sort((a, b) => b.lastModified - a.lastModified)[0]
    if (!last) return null
    return { sessionId: last.sessionId, title: (last.customTitle ?? last.summary ?? last.firstPrompt ?? '').trim() || '작업 공간' }
  } catch {
    return null
  }
}

const INCLUDE_MAX = 5000

/** git에 stdin으로 넣고 stdout을 받는다 (종료 코드 1도 결과로: check-ignore는 맞는 게 없으면 1) */
function gitWithInput(cwd: string, args: string[], input: string): Promise<string> {
  return new Promise((done, reject) => {
    const child = spawn('git', ['-C', cwd, ...args], { windowsHide: true })
    let out = ''
    child.stdout.setEncoding('utf8').on('data', (d: string) => (out += d))
    child.on('error', reject)
    child.on('close', (code) => (code === 0 || code === 1 ? done(out) : reject(new Error(`git ${args.join(' ')}: 종료 코드 ${code}`))))
    child.stdin.end(input)
  })
}

/**
 * .worktreeinclude(.gitignore 꼴)에 맞고 git이 무시하는 파일만 새 worktree로 복사한다 (Claude Code와 같은 규칙: 추적하는 파일은 복사하지 않는다).
 * 복사한 파일 수를 돌려준다
 */
async function copyIncluded(top: string, root: string): Promise<number> {
  const list = join(top, '.worktreeinclude')
  if (!existsSync(list)) return 0
  const { stdout } = await run('git', ['-C', top, '-c', 'core.quotepath=false', 'ls-files', '--others', '--ignored', `--exclude-from=${list}`, '-z'], { timeout: 30_000, maxBuffer: 64 * 1024 * 1024 })
  const matched = stdout.split('\0').filter(Boolean)
  if (!matched.length) return 0
  const ignored = (await gitWithInput(top, ['-c', 'core.quotepath=false', 'check-ignore', '--stdin', '-z'], matched.join('\0') + '\0')).split('\0').filter(Boolean)
  let n = 0
  for (const rel of ignored.slice(0, INCLUDE_MAX)) {
    const dst = join(root, rel)
    if (existsSync(dst)) continue
    await mkdir(dirname(dst), { recursive: true })
    await copyFile(join(top, rel), dst)
    n++
  }
  return n
}

/**
 * 폴더가 없어진 작업 공간을 같은 자리에 되살린다 (밖에서 지웠거나 정리됐을 때). 같은 자리라야 세션을 이어 열 수 있다.
 * 브랜치가 남아 있으면 그 브랜치로, 없으면 지금 HEAD에서 같은 이름으로 다시 만든다. 되살렸으면 안내 글, 그대로면 null
 */
export function ensureWorktreeSync(projectPath: string, wt: WorktreeRef): string | null {
  const root = worktreeRoot(wt)
  if (existsSync(root)) return null
  const g = (...args: string[]): string => execFileSync('git', ['-C', projectPath, ...args], { encoding: 'utf8', timeout: 20_000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  try {
    g('worktree', 'prune')
  } catch {
    // 정리는 못 해도 된다
  }
  let kept = true
  try {
    g('show-ref', '--verify', '--quiet', `refs/heads/${wt.branch}`)
  } catch {
    kept = false
  }
  g('worktree', 'add', ...(kept ? [root, wt.branch] : ['-b', wt.branch, root, 'HEAD']))
  return kept
    ? `작업 공간 폴더가 없어져 ${wt.branch} 브랜치로 다시 만들었어요. 커밋하지 않았던 변경은 돌아오지 않아요.`
    : `작업 공간 폴더와 브랜치가 없어져 지금 HEAD에서 ${wt.branch}를 새로 만들었어요. 예전 변경은 돌아오지 않아요.`
}

/** 탭 제목 → 브랜치 이름 조각 (글자·숫자만, 나머지는 -) */
export function branchSlug(title: string): string {
  return title.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+/, '').slice(0, 40).replace(/-+$/, '')
}

/** 작업 공간 브랜치를 탭 제목으로 바꾼다 (worktree-<제목>). 겹치면 대화 앞 4자를 붙인다. 바꿨으면 새 이름, 그대로면 null */
export async function renameWorktreeBranch(wt: WorktreeRef, title: string, conversationId: string): Promise<string | null> {
  const slug = branchSlug(title)
  if (!slug) return null
  const root = worktreeRoot(wt)
  if (!existsSync(root)) return null
  let next = `worktree-${slug}`
  if (next === wt.branch || wt.branch === `${next}-${conversationId.slice(0, 4)}`) return null
  if (await hasBranch(root, next)) next = `${next}-${conversationId.slice(0, 4)}`
  if (next === wt.branch || (await hasBranch(root, next))) return null
  await git(root, 'branch', '-m', wt.branch, next)
  return next
}

/** 변경이 없을 때만 작업 공간을 지운다. 브랜치는 프로젝트 쪽에 다 들어가 있을 때만(git branch -d) 같이 지운다. 지웠으면 true */
export async function removeWorktreeIfClean(projectPath: string, wt: WorktreeRef): Promise<boolean> {
  // 사용자 것(이미 있던 브랜치·worktree)은 지우지 않는다
  if (wt.adopted) return false
  const root = worktreeRoot(wt)
  try {
    if (existsSync(root)) {
      if ((await git(root, 'status', '--porcelain')) !== '') return false
      if (!(await removeWorktreeDir(projectPath, root, false))) return false
    }
  } catch {
    return false
  }
  try {
    await git(projectPath, 'branch', '-d', wt.branch)
  } catch {
    // 아직 합치지 않은 커밋이 있으면 남긴다
  }
  return true
}

/** 닫기 전 확인용: 커밋 안 한 변경이 있는지, 프로젝트의 지금 브랜치에 아직 안 들어간 커밋 수. 폴더가 없으면 null */
export async function worktreeState(projectPath: string, wt: WorktreeRef): Promise<{ dirty: boolean; ahead: number } | null> {
  const root = worktreeRoot(wt)
  if (!existsSync(root)) return null
  try {
    const dirty = (await git(root, 'status', '--porcelain')) !== ''
    const target = await git(projectPath, 'rev-parse', '--abbrev-ref', 'HEAD')
    const ahead = Number(await git(projectPath, 'rev-list', '--count', `${target}..${wt.branch}`)) || 0
    return { dirty, ahead }
  } catch {
    return null
  }
}

const DIFF_LIMIT = 400_000

export interface WorktreeChanges {
  branch: string
  /** 합칠 대상: 프로젝트 폴더에서 지금 체크아웃된 브랜치 */
  target: string
  files: { path: string; status: string }[]
  /** 작업 공간에서 갈라진 지점 대비 전체 변경 (커밋 안 한 것·새 파일 포함) */
  diff: string
  truncated: boolean
  /** 아직 커밋하지 않은 변경이 있는지 */
  dirty: boolean
  /** 대상 브랜치에 아직 들어가지 않은 커밋 수 */
  ahead: number
  /** 작업 공간에 아직 안 들어온 대상 브랜치의 커밋 수 (UPDATE로 가져온다) */
  behind: number
  /** 작업 공간이 병합 중인지 (UPDATE 충돌을 아직 풀지 않음) */
  merging: boolean
  /** 풀지 않은 충돌 파일 */
  conflicts: string[]
}

/** 작업 공간의 변경 요약과 diff (프로젝트의 현재 브랜치와 갈라진 지점 기준) */
export async function worktreeChanges(projectPath: string, ref: WorktreeRef): Promise<WorktreeChanges> {
  const wt = { path: worktreeRoot(ref), branch: ref.branch }
  const target = await git(projectPath, 'rev-parse', '--abbrev-ref', 'HEAD')
  const base = await git(wt.path, 'merge-base', 'HEAD', target)
  const status = await git(wt.path, 'status', '--porcelain')
  const untracked = (await git(wt.path, 'ls-files', '--others', '--exclude-standard')).split('\n').filter(Boolean)
  const nameStatus = (await git(wt.path, 'diff', '--name-status', base)).split('\n').filter(Boolean)
  const files = [
    ...nameStatus.map((l) => {
      const [st, ...rest] = l.split('\t')
      return { status: st[0], path: rest[rest.length - 1] }
    }),
    ...untracked.map((path) => ({ status: 'A', path })),
  ]
  // 새 파일은 --no-index로 /dev/null과 비교해 diff에 넣는다
  let diff = await git(wt.path, 'diff', base)
  for (const f of untracked) {
    if (diff.length > DIFF_LIMIT) break
    try {
      await run('git', ['-C', wt.path, 'diff', '--no-index', '/dev/null', f], { timeout: 10_000 })
    } catch (err) {
      // 차이가 있으면 종료 코드 1이라 여기로 온다
      diff += '\n' + ((err as { stdout?: string }).stdout ?? '')
    }
  }
  const ahead = Number(await git(projectPath, 'rev-list', '--count', `${target}..${wt.branch}`)) || 0
  const behind = Number(await git(projectPath, 'rev-list', '--count', `${wt.branch}..${target}`)) || 0
  const isMerging = await merging(wt.path)
  const conflicts = isMerging ? await conflictFiles(wt.path) : []
  return { branch: wt.branch, target, files, diff: diff.slice(0, DIFF_LIMIT), truncated: diff.length > DIFF_LIMIT, dirty: status !== '', ahead, behind, merging: isMerging, conflicts }
}

const gitMessage = (err: unknown, fallback: string): string => {
  const e = err as { stderr?: string; stdout?: string; message?: string }
  return (e.stderr || e.stdout || e.message || fallback).trim()
}

/** 커밋 안 한 변경이 있으면 대화 제목으로 커밋한다 */
async function commitPending(path: string, title: string): Promise<void> {
  if ((await git(path, 'status', '--porcelain')) === '') return
  await git(path, 'add', '-A')
  await git(path, 'commit', '-m', title)
}

/** 풀지 않은 충돌 파일 */
async function conflictFiles(path: string): Promise<string[]> {
  try {
    return (await git(path, '-c', 'core.quotepath=false', 'diff', '--name-only', '--diff-filter=U')).split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/**
 * 합치기: 작업 공간의 커밋 안 한 변경을 커밋하고, 프로젝트의 현재 브랜치에 합친다.
 * 보통은 --no-ff 병합, squash면 커밋 하나로 합친 뒤 작업 공간 브랜치를 대상 브랜치에 맞춘다(다 들어간 브랜치로 보이고 작업 공간은 새 시작점에서 이어 간다).
 * 충돌 등으로 실패하면 프로젝트 폴더를 되돌리고 git 메시지를 돌려준다(충돌은 UPDATE로 작업 공간에서 먼저 풀도록 안내). 작업 공간은 남겨 둬 대화를 이어 갈 수 있다
 */
export async function mergeWorktree(projectPath: string, ref: WorktreeRef, title: string, squash = false): Promise<WorktreeOpResult> {
  const wt = { path: worktreeRoot(ref), branch: ref.branch }
  if (await merging(wt.path)) return { ok: false, message: '작업 공간에서 풀지 않은 충돌이 있어요. 충돌을 풀고 커밋한 뒤에 합쳐 주세요' }
  try {
    await commitPending(wt.path, title)
  } catch (err) {
    return { ok: false, message: gitMessage(err, '커밋하지 못했어요') }
  }
  // 사용자가 프로젝트 폴더에서 하던 병합이 있으면 건드리지 않는다 (실패해도 그 병합을 되돌리면 안 된다)
  if (await merging(projectPath)) return { ok: false, message: '프로젝트 폴더에서 진행 중인 병합이 있어요. 그 병합을 끝낸 뒤에 합쳐 주세요' }
  const target = await git(projectPath, 'rev-parse', '--abbrev-ref', 'HEAD')
  const ahead = Number(await git(projectPath, 'rev-list', '--count', `${target}..${wt.branch}`)) || 0
  if (ahead === 0) return { ok: true, message: `${target} 브랜치에 이미 모두 들어가 있어요` }
  try {
    if (squash) {
      // 사용자 설정 merge.ff(false·only)에 흔들리지 않게 이 명령에서만 기본값으로
      await git(projectPath, '-c', 'merge.ff=true', 'merge', '--squash', wt.branch)
      await git(projectPath, 'commit', '-m', title)
      // 작업 공간 브랜치를 합친 결과에 맞춘다. 깨끗한 상태라 잃는 것이 없다
      await git(wt.path, 'reset', '--hard', target)
      return { ok: true, message: `${wt.branch}의 커밋 ${ahead}개를 ${target} 브랜치에 커밋 하나로 합쳤어요` }
    }
    await git(projectPath, 'merge', '--no-ff', '-m', `Merge ${wt.branch}: ${title}`, wt.branch)
    return { ok: true, message: `${wt.branch}의 커밋 ${ahead}개를 ${target} 브랜치에 합쳤어요` }
  } catch (err) {
    const message = gitMessage(err, '합치지 못했어요')
    // 위에서 진행 중인 병합이 없음을 확인했으므로, 지금 병합 중이면 이 함수가 시작한 것이다. squash는 MERGE_HEAD 없이 인덱스에만 남으므로 그것도 되돌린다
    const conflicted = (await conflictFiles(projectPath)).length > 0
    try {
      if (await merging(projectPath)) await git(projectPath, 'merge', '--abort')
      else if (squash && conflicted) await git(projectPath, 'reset', '--merge')
    } catch {
      // 되돌리지 못하면 사용자에게 보이는 오류로 충분하다
    }
    return { ok: false, message: conflicted ? `${target} 브랜치와 충돌해서 되돌렸어요. UPDATE로 작업 공간에서 먼저 충돌을 풀어 주세요.\n${message}` : message }
  }
}

/**
 * 따라잡기: 프로젝트의 현재 브랜치를 작업 공간 브랜치에 병합한다 (커밋 안 한 변경은 먼저 대화 제목으로 커밋).
 * 충돌이 나면 되돌리지 않고 작업 공간에 남겨 conflicts로 돌려준다 (그 대화의 Claude가 풀 수 있게). 프로젝트 폴더는 건드리지 않는다
 */
export async function updateWorktree(projectPath: string, ref: WorktreeRef, title: string): Promise<WorktreeOpResult> {
  const path = worktreeRoot(ref)
  if (await merging(path)) return { ok: false, message: '작업 공간에서 이미 병합 중이에요. 충돌을 풀거나 ABORT로 되돌려 주세요', conflicts: await conflictFiles(path) }
  const target = await git(projectPath, 'rev-parse', '--abbrev-ref', 'HEAD')
  try {
    const behind = Number(await git(projectPath, 'rev-list', '--count', `${ref.branch}..${target}`)) || 0
    if (behind === 0) return { ok: true, message: `이미 ${target} 브랜치의 최신 커밋까지 들어와 있어요` }
    await commitPending(path, title)
    await git(path, '-c', 'merge.ff=true', 'merge', '--no-edit', target)
    return { ok: true, message: `${target} 브랜치의 커밋 ${behind}개를 작업 공간에 가져왔어요` }
  } catch (err) {
    const conflicts = (await merging(path)) ? await conflictFiles(path) : []
    if (conflicts.length) return { ok: false, message: `${target} 브랜치를 가져오다 파일 ${conflicts.length}개가 충돌했어요`, conflicts }
    return { ok: false, message: gitMessage(err, '가져오지 못했어요') }
  }
}

/** 원격 이름: 대상 브랜치의 upstream 원격, 없으면 origin, 그것도 없으면 첫 원격 */
async function remoteFor(projectPath: string, target: string): Promise<string | null> {
  try {
    return await git(projectPath, 'config', `branch.${target}.remote`)
  } catch {
    const remotes = (await git(projectPath, 'remote')).split('\n').filter(Boolean)
    return remotes.includes('origin') ? 'origin' : (remotes[0] ?? null)
  }
}

const urlIn = (text: string): string | undefined => /https?:\/\/\S+\/pull\/\d+/.exec(text)?.[0] ?? /https?:\/\/\S+/.exec(text)?.[0]

/**
 * PUSH & PR: 커밋 안 한 변경을 대화 제목으로 커밋하고, 작업 공간 브랜치를 원격에 올린 뒤 gh로 프로젝트의 지금 브랜치를 향한 PR을 만든다.
 * gh가 없거나 실패하면 올린 것까지만 하고 git·gh 메시지를 그대로 돌려준다. 이미 PR이 있으면 그 주소
 */
export async function pushWorktree(projectPath: string, ref: WorktreeRef, title: string): Promise<WorktreeOpResult> {
  const path = worktreeRoot(ref)
  if (await merging(path)) return { ok: false, message: '작업 공간에서 풀지 않은 충돌이 있어요. 충돌을 풀고 커밋한 뒤에 올려 주세요' }
  const target = await git(projectPath, 'rev-parse', '--abbrev-ref', 'HEAD')
  const remote = await remoteFor(projectPath, target)
  if (!remote) return { ok: false, message: '원격 저장소가 없어 올릴 수 없어요' }
  try {
    await commitPending(path, title)
    const ahead = Number(await git(projectPath, 'rev-list', '--count', `${target}..${ref.branch}`)) || 0
    if (ahead === 0) return { ok: false, message: `${target} 브랜치에 없는 커밋이 없어 PR을 만들 게 없어요` }
    await run('git', ['-C', path, 'push', '-u', remote, ref.branch], { timeout: 120_000 })
  } catch (err) {
    return { ok: false, message: gitMessage(err, '올리지 못했어요') }
  }
  // PR 대상은 원격에서의 대상 브랜치 이름 (upstream이 origin/main이면 main)
  let base = target
  try {
    base = (await git(projectPath, 'rev-parse', '--abbrev-ref', `${target}@{upstream}`)).replace(`${remote}/`, '')
  } catch {
    // upstream이 없으면 같은 이름
  }
  const body = (await git(projectPath, 'log', '--format=- %s', `${target}..${ref.branch}`).catch(() => '')) || title
  try {
    const { stdout } = await run('gh', ['pr', 'create', '--base', base, '--head', ref.branch, '--title', title, '--body', body], { cwd: path, timeout: 60_000, windowsHide: true })
    const url = urlIn(stdout)
    return { ok: true, message: `${remote}에 올리고 ${base} 브랜치로 PR을 만들었어요`, url }
  } catch (err) {
    const e = err as { code?: string; stderr?: string; stdout?: string }
    if (e.code === 'ENOENT') return { ok: true, message: `${remote}에 ${ref.branch}를 올렸어요. gh가 없어 PR은 만들지 못했어요` }
    const text = `${e.stderr ?? ''}${e.stdout ?? ''}`
    if (/already exists/i.test(text)) return { ok: true, message: `${remote}에 올렸어요. 이 브랜치의 PR이 이미 있어요`, url: urlIn(text) }
    return { ok: false, message: `${remote}에 올렸지만 PR은 만들지 못했어요.\n${gitMessage(err, 'gh pr create 실패')}` }
  }
}

/** 작업 공간에서 진행 중인 병합을 되돌린다 */
export async function abortWorktreeMerge(ref: WorktreeRef): Promise<WorktreeOpResult> {
  const path = worktreeRoot(ref)
  try {
    await git(path, 'merge', '--abort')
    return { ok: true, message: '병합을 되돌렸어요' }
  } catch (err) {
    return { ok: false, message: gitMessage(err, '되돌리지 못했어요') }
  }
}

/** 프로젝트 폴더가 병합 중인지 (MERGE_HEAD가 있는지) */
async function merging(projectPath: string): Promise<boolean> {
  try {
    await git(projectPath, 'rev-parse', '-q', '--verify', 'MERGE_HEAD')
    return true
  } catch {
    return false
  }
}

/** 버리기: 작업 공간과 브랜치를 지운다 (변경도 함께 사라진다) */
export async function discardWorktree(projectPath: string, wt: WorktreeRef): Promise<void> {
  await removeWorktreeDir(projectPath, worktreeRoot(wt), true)
  try {
    await git(projectPath, 'branch', '-D', wt.branch)
  } catch {
    // 브랜치가 없을 수 있다
  }
}
