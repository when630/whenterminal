import { memo, useEffect, useMemo, useState } from 'react'

// 대화창의 그림: 내 메시지의 첨부 경로, 답변의 로컬 그림, 도구 결과(Read·스크린샷)에 든 그림.
// 로컬 파일은 메인이 wt-file 주소로 열어 주고(CSP가 file:을 막는다), 도구 결과의 그림은 펼칠 때 세션 기록에서 data URI로 읽는다

const EXT = 'png|jpe?g|gif|webp|bmp|svg|avif|ico'
/** 글 속 그림 경로: "따옴표 경로" 또는 띄어쓰기 없는 경로. 앞의 @(입력창 첨부 꼴, attach.tsx refsFor)도 같이 */
const REF = new RegExp(`@?"([^"\\n]+?\\.(?:${EXT}))"|@?([^\\s"'<>|*?()[\\]]+\\.(?:${EXT}))(?![\\w.])`, 'gi')
/** 한 메시지에서 찾아보는 경로 수 */
const MAX_REFS = 8

export function imageRefs(text: string): string[] {
  const out = new Set<string>()
  for (const m of text.matchAll(REF)) {
    const p = m[1] ?? m[2]
    if (p && !/^https?:/i.test(p)) out.add(p)
    if (out.size >= MAX_REFS) break
  }
  return [...out]
}

/** 누르면 원래 크기로 펼치고, 다시 누르면 접는 그림 */
function Thumb({ src, title }: { src: string; title?: string }): React.JSX.Element {
  const [big, setBig] = useState(false)
  return (
    <img
      className={`msg-img ${big ? 'big' : ''}`}
      src={src}
      alt={title ?? ''}
      title={title}
      draggable={false}
      onClick={() => setBig((b) => !b)}
    />
  )
}

/** 메시지 글에 든 그림 경로를 찾아 그 아래에 그린다. 없는 파일·그림이 아닌 경로는 그리지 않는다 */
export const ImageRefs = memo(function ImageRefs({ text, load }: { text: string; load: (path: string) => Promise<string | null> }): React.JSX.Element | null {
  const refs = useMemo(() => imageRefs(text), [text])
  const [found, setFound] = useState<{ ref: string; url: string }[]>([])
  useEffect(() => {
    if (!refs.length) {
      setFound([])
      return
    }
    let alive = true
    void Promise.all(refs.map((r) => load(r).catch(() => null))).then((urls) => {
      if (alive) setFound(refs.flatMap((ref, i) => (urls[i] ? [{ ref, url: urls[i]! }] : [])))
    })
    return () => {
      alive = false
    }
  }, [refs, load])
  if (!found.length) return null
  return (
    <div className="msg-imgs">
      {found.map((f) => (
        <Thumb key={f.ref} src={f.url} title={f.ref} />
      ))}
    </div>
  )
})

/** 답변 마크다운의 로컬 그림. 읽기 전·못 읽으면 자리 표시 */
export function LocalImage({ src, alt, load }: { src: string; alt?: string; load: (path: string) => Promise<string | null> }): React.JSX.Element {
  const [url, setUrl] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void load(src)
      .catch(() => null)
      .then((u) => alive && setUrl(u))
    return () => {
      alive = false
    }
  }, [src, load])
  if (url) return <Thumb src={url} title={alt || src} />
  return <span className="md-remote mono" title={src}>IMAGE · {src.split(/[\\/]/).pop()}{url === null ? ' · NOT FOUND' : ''}</span>
}

/** 도구 결과에 든 그림. 펼쳤을 때 그려지므로 그때 읽는다 */
export function ToolImages({ count, load }: { count: number; load: () => Promise<string[]> }): React.JSX.Element {
  const [urls, setUrls] = useState<string[] | null>(null)
  useEffect(() => {
    let alive = true
    void load()
      .catch(() => [])
      .then((u) => alive && setUrls(u))
    return () => {
      alive = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- 이 줄이 펼쳐질 때 한 번만
  return (
    <>
      <h5>IMAGE{count > 1 ? ` · ${count}` : ''}</h5>
      {urls === null ? (
        <span className="muted">…</span>
      ) : urls.length ? (
        <div className="msg-imgs">
          {urls.map((u, i) => (
            <Thumb key={i} src={u} />
          ))}
        </div>
      ) : (
        <span className="muted">그림을 읽지 못했어요</span>
      )}
    </>
  )
}
