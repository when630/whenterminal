import { memo, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CopyButton } from './copy'
import { LocalImage } from './images'

/** 주소 앞에 scheme(http: 등)이 붙어 있는지. 없으면 상대 경로 */
const hasScheme = (s: string): boolean => /^[a-z][a-z0-9+.-]*:/i.test(s)

/**
 * 모델 답변용 마크다운. 원시 HTML은 그리지 않는다(react-markdown 기본값) — 앱 API가 노출된 창이라 안전 우선.
 * 링크는 새 창 요청으로 보내고, 메인이 외부 브라우저로 연다 (앱 창 안에서 이동하지 않음).
 * fileUrl(파일 보기): 그 파일의 wt-file 주소. 상대 경로 그림은 그 기준으로 읽고, 상대 경로 링크는 onOpen으로 앱 안에서 연다
 * loadImage(대화창): 로컬 경로 그림(절대·대화 폴더 기준 상대)을 메인이 열어 준 주소로 그린다
 */
export const Markdown = memo(function Markdown({ text, fileUrl, onOpen, remote, loadImage }: { text: string; fileUrl?: string; onOpen?: (path: string) => void; remote?: Record<string, string>; loadImage?: (path: string) => Promise<string | null> }): React.JSX.Element {
  const local = (href: string): string | null => {
    if (!fileUrl || hasScheme(href) || href.startsWith('#')) return null
    const u = new URL(href, fileUrl)
    return decodeURIComponent(u.pathname).replace(/^\/+/, '')
  }
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const path = href && onOpen ? local(href) : null
            // 문서 안의 #이동은 앱 창이 따라가지 않는다
            if (href?.startsWith('#') && fileUrl) return <a href={href} onClick={(e) => e.preventDefault()}>{children}</a>
            if (path !== null && onOpen) {
              return (
                <a href={href} onClick={(e) => { e.preventDefault(); onOpen(path) }} title={`${path} 열기`}>
                  {children}
                </a>
              )
            }
            return (
              <a href={href} target="_blank" rel="noreferrer noopener">
                {children}
              </a>
            )
          },
          img: ({ src, alt }) => {
            const s = typeof src === 'string' ? src : ''
            // 원격 그림: CSP가 막으므로 메인이 받아 준 data URI로(파일 보기), 아직이거나 대화창이면 자리만
            if (/^https?:\/\//i.test(s)) {
              const data = remote?.[s]
              if (data) return <img src={data} alt={alt ?? ''} />
              return <span className="md-remote mono" title={s}>IMAGE · {new URL(s).host}{alt ? ` · ${alt}` : ''}</span>
            }
            if (!fileUrl && loadImage && s && !/^(data|wt-file):/i.test(s)) return <LocalImage src={s} alt={alt} load={loadImage} />
            return <img src={fileUrl && s && !hasScheme(s) ? new URL(s, fileUrl).toString() : s} alt={alt ?? ''} />
          },
          // 코드 블록은 오른쪽 위에 복사 버튼
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          // 표는 넓으면 가로로 스크롤
          table: ({ children }) => (
            <div className="md-table">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
})

/** 답변의 코드 블록. 복사 버튼은 블록 밖에 두어 가로·세로 스크롤해도 제자리에 있다 */
function CodeBlock({ children }: { children: React.ReactNode }): React.JSX.Element {
  const ref = useRef<HTMLPreElement>(null)
  return (
    <div className="md-pre">
      <pre ref={ref}>{children}</pre>
      <CopyButton text={() => (ref.current?.textContent ?? '').replace(/\n$/, '')} />
    </div>
  )
}
