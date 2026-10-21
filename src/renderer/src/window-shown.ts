/**
 * 앱 창이 화면에 보이는지 (트레이로 숨김·최소화면 false). 창은 숨어도 그리기를 멈추지 않으므로(backgroundThrottling: false,
 * 다시 열 때 바탕색만 보이는 시간이 없게) 숨은 동안 도는 것(전광판·CSS 반복 애니메이션·초 단위 시계)은 여기를 보고 스스로 멈춘다.
 * document.hidden은 이 설정에서 늘 false라 쓸 수 없다
 */
let shown = true
const listeners = new Set<(shown: boolean) => void>()

window.api.onWindowShown((next) => {
  if (next === shown) return
  shown = next
  // CSS 반복 애니메이션은 styles.css의 :root[data-window-hidden]이 멈춘다
  if (shown) delete document.documentElement.dataset.windowHidden
  else document.documentElement.dataset.windowHidden = ''
  listeners.forEach((cb) => cb(shown))
})

export const isWindowShown = (): boolean => shown

export function onWindowShown(cb: (shown: boolean) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
