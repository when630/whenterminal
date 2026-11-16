import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { GitOverview, Project, WorktreeStart } from '@shared/types'
import { usePresence } from './motion'
import { ListHead } from './ModelPicker'

interface Props {
  project: Project
  conversationId: string
  onPick: (start: WorktreeStart) => void
}

interface Row {
  key: string
  section: 'from' | 'open' | 'existing'
  name: string
  desc: string
  start: WorktreeStart
}

const SECTION_LABEL: Record<Row['section'], string> = { from: 'NEW FROM', open: 'OPEN BRANCH', existing: 'WORKTREES' }
/** 원격 추적 브랜치는 최근 것만 */
const REMOTE_MAX = 30

const norm = (p: string): string => p.replace(/[\\/]+$/, '').replace(/\\/g, '/').toLowerCase()

/** 고를 줄: 새 브랜치의 기준(로컬·원격) · 그대로 열 로컬 브랜치(어디에도 체크아웃 안 된 것) · 탭에 안 열린 worktree */
function rowsOf(o: GitOverview, project: Project): Row[] {
  const rows: Row[] = []
  for (const b of o.branches) rows.push({ key: `from:${b.name}`, section: 'from', name: b.name, desc: b.subject, start: { base: b.name } })
  for (const b of o.remoteBranches.slice(0, REMOTE_MAX)) rows.push({ key: `from:${b.name}`, section: 'from', name: b.name, desc: b.subject, start: { base: b.name } })
  // 프로젝트 폴더(원래 작업 공간)에 체크아웃된 브랜치는 worktree 목록의 branch로 안다 (current는 이 대화 폴더 기준이라)
  const out = new Set(o.worktrees.map((w) => w.branch).filter(Boolean))
  for (const b of o.branches) if (!b.worktree && !b.current && !out.has(b.name)) rows.push({ key: `open:${b.name}`, section: 'open', name: b.name, desc: b.subject, start: { branch: b.name } })
  const opened = new Set(project.conversations.filter((c) => c.worktree && !c.closedAt).map((c) => norm(c.worktree!.root ?? c.worktree!.path)))
  for (const w of o.worktrees) {
    if (w.main || opened.has(norm(w.path))) continue
    rows.push({ key: `wt:${w.path}`, section: 'existing', name: w.branch ?? w.sha.slice(0, 8), desc: w.path, start: { existing: w.path } })
  }
  return rows
}

/**
 * 작업 공간 탭을 어떻게 시작할지 고르는 목록 (탭 줄 +WT 옆 ▾): 다른 브랜치에서 새로 · 이미 있는 브랜치 그대로 · 남은 worktree 다시 열기.
 * 위아래·Ctrl+N/P(J/K)로 이동, Enter로 고르기, Esc로 닫기
 */
export function WorktreePicker({ project, conversationId, onPick }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const panel = usePresence(open ? true : null, 220)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [index, setIndex] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  // 탭 줄은 가로 스크롤 영역이라 안에 두면 잘린다: body에 붙이고 버튼 아래에 고정 위치로
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open) return
    setRows(null)
    setIndex(0)
    const r = boxRef.current?.getBoundingClientRect()
    if (r) setAt({ top: r.bottom, left: Math.max(8, Math.min(r.left, window.innerWidth - 448)) })
    void window.api.gitOverview(project.id, conversationId).then((o) => setRows(o ? rowsOf(o, project) : []))
    const close = (e: MouseEvent): void => {
      if (!boxRef.current?.contains(e.target as Node) && !listRef.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (r: Row | undefined): void => {
    if (!r) return
    setOpen(false)
    onPick(r.start)
  }
  const onKey = (e: React.KeyboardEvent): void => {
    const n = rows?.length ?? 0
    const ctrl = e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey
    const step = e.key === 'ArrowDown' || (ctrl && (e.code === 'KeyN' || e.code === 'KeyJ')) ? 1 : e.key === 'ArrowUp' || (ctrl && (e.code === 'KeyP' || e.code === 'KeyK')) ? -1 : 0
    if (step && n) setIndex((i) => (i + step + n) % n)
    else if (e.key === 'Enter') pick(rows?.[index])
    else if (e.key === 'Escape') setOpen(false)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className="model-pick wt-pick" ref={boxRef}>
      <button
        type="button"
        className={`tab add add-wt-more ${open ? 'open' : ''}`}
        title="작업 공간 탭을 다른 브랜치에서 시작하거나, 이미 있는 브랜치·남은 worktree를 열어요"
        aria-label="작업 공간 탭 시작점 고르기"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        ▾
      </button>
      {panel.item && at && createPortal(
        <div className={`model-list wt-pick-list ${panel.leaving ? 'leaving' : ''}`} style={{ top: at.top, left: at.left }} role="listbox" aria-label="작업 공간 탭 시작점" tabIndex={-1} data-keys-own="true" onKeyDown={onKey} ref={(el) => {
          listRef.current = el
          if (el && !panel.leaving) el.focus()
        }}>
          {rows === null && <div className="wt-pick-empty">브랜치를 읽는 중…</div>}
          {rows?.length === 0 && <div className="wt-pick-empty">git 저장소를 읽지 못했어요.</div>}
          {rows?.map((r, i) => (
            <div key={r.key} className="wt-pick-item">
              {(i === 0 || rows[i - 1].section !== r.section) && <ListHead label={SECTION_LABEL[r.section]} count={rows.filter((x) => x.section === r.section).length} />}
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                className={`model-row ${i === index ? 'hi' : ''}`}
                ref={i === index ? (el) => el?.scrollIntoView({ block: 'nearest' }) : undefined}
                onMouseMove={() => i !== index && setIndex(i)}
                onClick={() => pick(r)}
                title={r.desc}
              >
                <span className="model-name mono">{r.name}</span>
                <span className="model-desc">{r.desc}</span>
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}
