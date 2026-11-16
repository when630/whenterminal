import { useEffect, useState } from 'react'
import { Presence } from './motion'
import type { WorktreeChanges } from '@shared/types'
import { useBackLabel } from './beside'

interface Props {
  projectId: string
  conversationId: string
  /** 대화가 끝나 변경이 생겼을 수 있을 때마다 바뀌는 값 (다시 읽기용) */
  refreshKey: string
  onClose: () => void
  onDiscarded: (nextConversationId: string) => void
  /** 충돌 풀기를 이 대화의 Claude에게 보낸다 */
  onAskResolve: (text: string) => void
  /** 합친 뒤 탭 닫기 (깨끗하면 작업 공간·브랜치도 정리된다) */
  onCloseTab: () => void
}

/** UPDATE 충돌을 Claude에게 넘기는 메시지 */
export function resolvePrompt(target: string, conflicts: string[]): string {
  return [
    `작업 공간에서 ${target} 브랜치를 병합하다 충돌이 났어요. 충돌 파일:`,
    ...conflicts.map((f) => `- ${f}`),
    '',
    `양쪽 변경의 의도를 살려 충돌을 풀고, 빌드·테스트로 확인한 뒤 git add와 git commit --no-edit로 병합을 마무리해 주세요. 어느 쪽을 살릴지 판단이 어려운 충돌은 풀기 전에 물어봐 주세요.`,
  ].join('\n')
}

export const STATUS_LABEL: Record<string, string> = { A: 'NEW', M: 'MODIFIED', D: 'DELETED', R: 'RENAMED', C: 'COPIED' }

/** unified diff → 파일별 묶음 */
export function splitDiff(diff: string): { path: string; lines: string[] }[] {
  const out: { path: string; lines: string[] }[] = []
  for (const line of diff.split('\n')) {
    const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line)
    if (m) {
      out.push({ path: m[2], lines: [] })
      continue
    }
    if (!out.length || /^(index |--- |\+\+\+ |new file mode|deleted file mode|similarity index|rename (from|to))/.test(line)) continue
    out[out.length - 1].lines.push(line)
  }
  return out
}

/**
 * 작업 공간 탭(git worktree)의 변경: 파일 목록·diff, 합치기, 버리기(두 번).
 * 합치기는 커밋 안 한 변경을 대화 제목으로 커밋하고 프로젝트의 현재 브랜치에 --no-ff로 병합한다
 */
export function WorktreePanel({ projectId, conversationId, refreshKey, onClose, onDiscarded, onAskResolve, onCloseTab }: Props): React.JSX.Element {
  const backLabel = useBackLabel()
  const [data, setData] = useState<WorktreeChanges | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  // merged: 합치기에 성공해 탭을 닫자고 권할 때
  const [message, setMessage] = useState<{ ok: boolean; text: string; merged?: boolean; url?: string } | null>(null)
  // PUSH & PR은 원격에 올리는 일이라 두 번 눌러야 한다 (3초)
  const [pushArmed, setPushArmed] = useState(false)
  const [armed, setArmed] = useState(false)

  const load = (): void => {
    void window.api.worktreeChanges(projectId, conversationId).then(setData)
  }
  useEffect(load, [projectId, conversationId, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps
  // 다른 앱(편집기·터미널)에서 고치고 돌아오면 다시 읽는다
  useEffect(() => {
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [projectId, conversationId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!pushArmed) return
    const t = setTimeout(() => setPushArmed(false), 3000)
    return () => clearTimeout(t)
  }, [pushArmed])
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])

  const merge = async (squash = false): Promise<void> => {
    setBusy(true)
    const res = await window.api.worktreeMerge(projectId, conversationId, squash)
    setMessage({ ok: res.ok, text: res.message, merged: res.ok })
    setBusy(false)
    load()
  }
  /** 따라잡기. 충돌이 나면 작업 공간에 남겨 두고 바로 이 대화의 Claude에게 풀어 달라고 보낸다 */
  const update = async (): Promise<void> => {
    setBusy(true)
    const res = await window.api.worktreeUpdate(projectId, conversationId)
    setBusy(false)
    if (res.conflicts?.length && data) {
      onAskResolve(resolvePrompt(data.target, res.conflicts))
      return
    }
    setMessage({ ok: res.ok, text: res.message })
    load()
  }
  const push = async (): Promise<void> => {
    if (!pushArmed) return setPushArmed(true)
    setPushArmed(false)
    setBusy(true)
    const res = await window.api.worktreePush(projectId, conversationId)
    setMessage({ ok: res.ok, text: res.message, url: res.url })
    setBusy(false)
    load()
  }
  const abortMerge = async (): Promise<void> => {
    setBusy(true)
    const res = await window.api.worktreeAbortMerge(projectId, conversationId)
    setMessage({ ok: res.ok, text: res.message })
    setBusy(false)
    load()
  }
  const discard = async (): Promise<void> => {
    if (!armed) return setArmed(true)
    setBusy(true)
    onDiscarded(await window.api.worktreeDiscard(projectId, conversationId))
  }

  const nothing = !!data && data.files.length === 0 && data.ahead === 0
  const conflicted = !!data?.merging

  return (
    <section className="wt-panel" aria-label="작업 공간 변경">
      <header className="wt-head">
        <div className="wt-title">
          <span className="kr">CHANGES</span>
          {data && (
            <span className="mono">
              {data.branch} → {data.target}
            </span>
          )}
        </div>
        <div className="wt-actions">
          <button type="button" className="btn" disabled={busy || !data || conflicted || data.behind === 0} onClick={() => void update()} title={data ? `${data.target} 브랜치의 새 커밋을 작업 공간에 가져와요. 충돌이 나면 이 대화의 Claude에게 풀어 달라고 보내요` : undefined}>
            {data && data.behind > 0 ? `UPDATE · ${data.behind}` : 'UP TO DATE'}
          </button>
          <button type="button" className="btn-pri" disabled={busy || !data || nothing || conflicted} onClick={() => void merge()} title={data ? `병합 커밋으로 ${data.target} 브랜치에 합쳐요` : undefined}>
            {data?.dirty ? 'COMMIT & MERGE' : 'MERGE'}
          </button>
          <button type="button" className="btn" disabled={busy || !data || nothing || conflicted} onClick={() => void merge(true)} title={data ? `커밋 하나로 ${data.target} 브랜치에 합쳐요. 작업 공간은 합친 결과에서 이어 가요` : undefined}>
            SQUASH
          </button>
          <button type="button" className={`btn ${pushArmed ? 'armed' : ''}`} disabled={busy || !data || conflicted || (data.ahead === 0 && !data.dirty)} onClick={() => void push()} title={data ? `브랜치를 원격에 올리고 ${data.target} 브랜치로 PR을 만들어요 (gh)` : undefined}>
            {pushArmed ? 'PUSH? 한 번 더' : 'PUSH & PR'}
          </button>
          <button type="button" className={`btn ${armed ? 'armed' : ''}`} disabled={busy || !data} onClick={() => void discard()}>
            {armed ? 'DISCARD? 한 번 더' : 'DISCARD'}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={load} title="변경을 다시 읽어요">
            REFRESH
          </button>
          <button type="button" className="btn ghost" onClick={onClose}>
            {backLabel}
          </button>
        </div>
      </header>
      <Presence as="div" show={!!message} className={`wt-msg ${message?.ok ? 'ok' : 'bad'}`} role="status">
        {message?.text}
        {message?.url && (
          <a className="btn sm wt-msg-act" href={message.url} target="_blank" rel="noreferrer" title={message.url}>
            OPEN PR
          </a>
        )}
        {message?.merged && (
          <button type="button" className="btn sm wt-msg-act" onClick={onCloseTab} title="탭을 닫아요. 다 합쳐져 있으면 작업 공간과 브랜치도 정리돼요">
            CLOSE TAB
          </button>
        )}
      </Presence>
      {conflicted && data && (
        <div className="wt-conflict" role="alert">
          <span className="wt-conflict-head">CONFLICT · {data.conflicts.length}</span>
          <span className="wt-conflict-files mono">{data.conflicts.join(' · ') || '충돌을 푼 파일을 커밋하면 병합이 끝나요'}</span>
          <span className="wt-conflict-acts">
            <button type="button" className="btn sm" disabled={busy || !data.conflicts.length} onClick={() => onAskResolve(resolvePrompt(data.target, data.conflicts))} title="이 대화의 Claude에게 충돌을 풀어 달라고 보내요">
              ASK CLAUDE
            </button>
            <button type="button" className="btn sm" disabled={busy} onClick={() => void abortMerge()} title="병합을 되돌려 UPDATE 전으로 돌아가요">
              ABORT
            </button>
          </span>
        </div>
      )}
      <div className="wt-body">
        {data === undefined && <div className="empty">변경을 읽는 중…</div>}
        {data === null && <div className="empty">작업 공간이 없는 대화예요.</div>}
        {nothing && <div className="empty">바뀐 것이 없어요. {data!.target} 브랜치와 같아요.</div>}
        {data && data.files.length === 0 && data.ahead > 0 && <div className="empty">커밋 {data.ahead}개가 아직 {data.target} 브랜치에 들어가지 않았어요.</div>}
        {data && <DiffBody files={data.files} diff={data.diff} />}
        {data?.truncated && <div className="empty">diff가 너무 길어 앞부분만 보여요.</div>}
      </div>
    </section>
  )
}

/** +12 −3 (바뀐 줄이 없으면 그리지 않는다) */
function DiffCount({ n }: { n?: { add: number; del: number } }): React.JSX.Element | null {
  if (!n || (!n.add && !n.del)) return null
  return (
    <span className="diff-count mono">
      {n.add > 0 && <span className="plus">+{n.add}</span>}
      {n.del > 0 && <span className="minus">−{n.del}</span>}
    </span>
  )
}

/** 바뀐 파일 목록과 파일별 diff (작업 공간 CHANGES·git 화면). 목록의 파일을 누르면 그 diff로 */
export function DiffBody({ files, diff }: { files: { path: string; status: string }[]; diff: string }): React.JSX.Element {
  const parts = splitDiff(diff)
  // 파일마다 더한 줄·뺀 줄 수 (머리줄 ---/+++는 splitDiff가 이미 뺐다)
  const counts = new Map(parts.map((f) => [f.path, { add: f.lines.filter((l) => l.startsWith('+')).length, del: f.lines.filter((l) => l.startsWith('-')).length }]))
  const jump = (path: string, e: React.MouseEvent): void => {
    const box = (e.currentTarget as HTMLElement).closest('.wt-diffs')
    box?.querySelector(`[data-diff-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }
  return (
    <div className="wt-diffs">
      {files.length > 0 && (
        <ul className="wt-files">
          {files.map((f) => (
            <li key={f.path} onClick={(e) => jump(f.path, e)}>
              <span className={`wt-st st-${f.status}`}>{STATUS_LABEL[f.status] ?? f.status}</span>
              <span className="mono">{f.path}</span>
              <DiffCount n={counts.get(f.path)} />
            </li>
          ))}
        </ul>
      )}
      {parts.map((f) => (
        <div key={f.path} className="wt-file" data-diff-path={f.path}>
          <div className="wt-file-h mono">
            <span>{f.path}</span>
            <DiffCount n={counts.get(f.path)} />
          </div>
          <pre className="wt-diff">
            {/* 줄마다 블록이라 줄바꿈 글자 없이도 복사하면 줄이 나뉜다. 바뀐 줄은 칸 폭 전체에 색을 깐다 */}
            {f.lines.map((l, i) => (
              <span key={i} className={l.startsWith('@@') ? 'hunk' : l.startsWith('+') ? 'add' : l.startsWith('-') ? 'del' : 'ctx'}>
                {l}
              </span>
            ))}
          </pre>
        </div>
      ))}
    </div>
  )
}
