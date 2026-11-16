/**
 * 앱 창이 화면에 보이는지 (트레이로 숨김·최소화면 false). 창은 숨어도 그리기를 멈추지 않으므로(backgroundThrottling: false,
 * 다시 열 때 바탕색만 보이는 시간이 없게) 숨은 동안 도는 것(전광판·반복 애니메이션·초 단위 시계)은 여기를 보고 스스로 멈춘다.
 * document.hidden은 이 설정에서 늘 false라 쓸 수 없다
 */
let shown = true
const listeners = new Set<(shown: boolean) => void>()
/** 숨길 때 멈춘 애니메이션 (다시 보이면 이것만 다시 튼다) */
let paused: Animation[] = []

/**
 * 반복 애니메이션(CSS·el.animate)을 멈추고 튼다. 예전에는 :root 속성 하나로 모든 요소의 animation-play-state를 바꿨는데,
 * 속성을 붙이고 뗄 때마다 문서 전체 스타일을 다시 계산해 다시 열 때 요소 1만 개쯤에서 60~70ms 멈췄다.
 * 지금 도는 애니메이션만 고르면 비용이 화면 크기와 상관없다. 짧은 전환(transition)은 곧 끝나므로 그대로 둔다
 */
function pauseAnimations(): void {
  paused = document.getAnimations().filter((a) => a.playState === 'running' && !(a instanceof CSSTransition))
  for (const a of paused) a.pause()
}

function resumeAnimations(): void {
  for (const a of paused) {
    // 숨은 동안 요소가 빠졌거나 취소된 것은 건너뛴다
    if (a.playState !== 'paused') continue
    const target = (a.effect as KeyframeEffect | null)?.target
    if (target && !target.isConnected) continue
    a.play()
  }
  paused = []
}

window.api.onWindowShown((next) => {
  if (next === shown) return
  shown = next
  if (shown) resumeAnimations()
  else pauseAnimations()
  listeners.forEach((cb) => cb(shown))
})

export const isWindowShown = (): boolean => shown

export function onWindowShown(cb: (shown: boolean) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
