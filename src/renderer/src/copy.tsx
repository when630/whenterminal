import { useEffect, useState } from 'react'

/** 글을 클립보드에 복사하는 버튼. 누르면 잠시 COPIED로 바뀐다. text는 함수면 누를 때 읽는다 */
export function CopyButton({ text, className }: { text: string | (() => string); className?: string }): React.JSX.Element {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setDone(false), 1500)
    return () => clearTimeout(t)
  }, [done])
  return (
    <button
      type="button"
      className={`copy-btn ${done ? 'done' : ''} ${className ?? ''}`}
      title="클립보드에 복사해요"
      onClick={(e) => {
        e.stopPropagation()
        const value = typeof text === 'function' ? text() : text
        void navigator.clipboard.writeText(value).then(() => setDone(true)).catch(() => {})
      }}
    >
      {done ? 'COPIED' : 'COPY'}
    </button>
  )
}
