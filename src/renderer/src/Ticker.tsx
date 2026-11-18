import { useEffect, useRef } from 'react'
import { HOME_ROW } from './keys'
import { reducedMotion } from './motion'
import { isWindowShown, onWindowShown } from './window-shown'
import { STAGES, type BackgroundRef, type TaskRef } from './state'

interface Props {
  running: TaskRef[]
  reports: TaskRef[]
  /** 턴이 끝나도 도는 셸·모니터 등 */
  background: BackgroundRef[]
}

/** 맨 위 전광판: 모든 프로젝트의 지금 상태가 한 줄로 흐른다. 확인이 필요한 항목만 빨갛게 */
/** 초당 이동 거리(px). 길이가 달라도 읽는 속도가 같게 */
const SPEED = 46

export function Ticker({ running, reports, background }: Props): React.JSX.Element {
  const runRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = runRef.current
    const box = el?.parentElement
    if (!el || !box) return
    // 한 벌이 창 너비보다 짧으면 다음 벌이 화면 가운데서 튀어나오므로, 한 벌의 최소 너비를 창 너비로 맞춘다
    const fit = (): void => el.style.setProperty('--ticker-w', `${box.getBoundingClientRect().width}px`)
    fit()
    // 한 벌의 폭은 크기가 바뀔 때만 잰다. 프레임마다 scrollWidth를 읽으면 그때마다 문서 전체 레이아웃을 강제로 다시 한다
    let half = el.scrollWidth / 2
    /*
     * 흐름은 el.animate(transform)로 합성 스레드에 맡긴다. 예전에는 rAF에서 프레임마다 style.transform을 써서
     * 그때마다 스타일을 다시 계산했고, 홈에서 가만히 있어도 Blink GC 할당이 초당 0.65~0.77MB였다(poster).
     * offset은 왼쪽으로 민 거리: 음수면 아직 오른쪽 끝 바깥에서 들어오는 중(intro), 0~half는 한 벌씩 도는 중(loop)
     */
    let anim: Animation | null = null
    let intro = true
    let base = -box.clientWidth
    const offsetNow = (): number => {
      if (!anim) return base
      const o = base + ((Number(anim.currentTime) || 0) / 1000) * SPEED
      return intro ? Math.min(o, 0) : half > 0 ? o % half : 0
    }
    const stop = (): void => {
      if (!anim) return
      base = offsetNow()
      anim.onfinish = null
      // 무한 반복 애니메이션은 꼭 취소한다 (안 하면 문서 타임라인이 요소를 붙잡는다)
      anim.cancel()
      anim = null
    }
    const play = (from: number): void => {
      stop()
      base = from
      // 창이 숨은 동안·전광판을 숨긴 스킨(display: none)·움직임 줄이기에서는 돌지 않는다
      const visible = box.getClientRects().length > 0
      if (!isWindowShown() || !visible || half <= 0) return
      if (reducedMotion()) {
        el.style.transform = ''
        return
      }
      const linear = { easing: 'linear', fill: 'none' } as const
      intro = from < 0
      if (intro) {
        anim = el.animate([{ transform: `translate3d(${-from}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }], { ...linear, duration: (-from / SPEED) * 1000 })
        anim.onfinish = () => {
          anim = null
          play(0)
        }
        return
      }
      base = 0
      anim = el.animate([{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(${-half}px, 0, 0)` }], { ...linear, duration: (half / SPEED) * 1000, iterations: Infinity })
      anim.currentTime = ((from % half) / SPEED) * 1000
    }
    const restart = (): void => play(offsetNow())
    const ro = new ResizeObserver(() => {
      fit()
      half = el.scrollWidth / 2
      // 폭이 바뀌면(글자·창 크기·스킨이 전광판을 숨기거나 보임) 지금 자리에서 새 길이로 다시 건다
      restart()
    })
    ro.observe(box)
    ro.observe(el)
    // 앱이 떠 있는 동안 OS의 애니메이션 효과 설정이 바뀌어도 따라간다
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    play(base)
    // 숨길 때는 window-shown이 도는 애니메이션을 멈췄다 다시 튼다. 숨은 채 시작해 아직 안 건 경우만 여기서 건다
    const offShown = onWindowShown((shown) => shown && !anim && restart())
    mq.addEventListener('change', restart)
    return () => {
      stop()
      offShown()
      ro.disconnect()
      mq.removeEventListener('change', restart)
    }
  }, [])
  const unread = reports.filter((r) => r.task.unread).length
  const parts: { text: string; alert?: boolean }[] = running.map((r) => {
    const name = `■ ${HOME_ROW[r.projectIndex] ?? ''} ${r.project.name.toUpperCase()}`
    if (r.state.permissions.length > 0) return { text: `${name}  NEEDS YOU`, alert: true }
    if (r.state.status === 'queued') return { text: `${name}  QUEUED` }
    return { text: `${name}  ${STAGES[Math.min(r.task.stage, STAGES.length - 1)]} · ${r.task.activity}` }
  })
  for (const b of background) {
    parts.push({ text: `■ ${HOME_ROW[b.projectIndex] ?? ''} ${b.project.name.toUpperCase()}  ${b.label}${b.text ? ` · ${b.text}` : ''}` })
  }
  if (running.length === 0 && background.length === 0) parts.push({ text: '■ NO RUNNING TASKS' })
  if (unread > 0) parts.push({ text: `■ ${unread} NEW REPORT${unread > 1 ? 'S' : ''}` })

  const line = parts.map((p, i) => {
    const body = (
      <>
        {p.text}
        {'     '}
      </>
    )
    return p.alert ? <b key={i}>{body}</b> : <span key={i}>{body}</span>
  })
  return (
    <div className="ticker" role="status" aria-label={parts.map((p) => p.text).join(', ')}>
      <div className="ticker-run" ref={runRef} aria-hidden="true">
        <span>{line}</span>
        <span>{line}</span>
      </div>
    </div>
  )
}
