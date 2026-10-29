import { flushSync } from 'react-dom'
import { reducedMotion } from './motion'
import { isWindowShown } from './window-shown'

/**
 * 모핑: 지금 화면의 요소(from)가 바뀐 화면의 요소(to)로 변하며 이어지게 한다 (View Transitions API).
 * from을 찍어 두고 → update를 바로 그린 뒤(flushSync) → to를 찾아 같은 이름을 붙이면, 브라우저가 둘 사이의 위치·크기를 잇는다.
 * 평소에는 문서 전체를 찍지 않아(styles.css `:root { view-transition-name: none }`) 나머지는 바로 바뀌고 이름 붙은 한 쌍만 움직인다.
 * 화면이 통째로 바뀌는 card·detail은 문서도 찍어 주변이 겹쳐 사라지고 나타난다.
 * 이름은 kind마다 하나(`morph-<kind>`)이고, 모양은 styles.css의 `::view-transition-*(morph-…)`.
 *
 * update는 한 프레임 뒤(옛 화면을 찍은 다음)에 불린다. 모핑할 수 없으면(지원 안 함·움직임 줄이기·창이 숨음·from 없음) 바로 부른다
 */
export type MorphKind = 'card' | 'detail' | 'ask' | 'tab'

let current: ViewTransition | null = null
let flushing = false

/** 지금 모핑의 새 화면을 그리는 중인지. usePresence가 이때는 나가는 요소를 붙잡지 않는다(새 화면에 옛 요소가 남아 찍히지 않게) */
export const isMorphing = (): boolean => flushing

export function morph(kind: MorphKind, from: Element | null | undefined, update: () => void, to: () => Element | null | undefined): void {
  if (!from?.isConnected || !document.startViewTransition || reducedMotion() || !isWindowShown()) {
    update()
    return
  }
  // 앞 모핑이 아직 돌면 끝으로 건너뛴다 (그 update는 그대로 불린다)
  current?.skipTransition()
  const name = `morph-${kind}`
  const source = from as HTMLElement
  let target: HTMLElement | null = null
  source.style.viewTransitionName = name
  // 화면이 통째로 바뀌는 것(card·detail)은 문서도 찍어 주변이 겹쳐 바뀌게 한다 (styles.css :root[data-morph])
  const root = document.documentElement
  root.dataset.morph = kind
  const vt = document.startViewTransition(() => {
    source.style.viewTransitionName = ''
    flushing = true
    try {
      flushSync(update)
    } finally {
      flushing = false
    }
    target = (to() as HTMLElement | null | undefined) ?? null
    if (target) target.style.viewTransitionName = name
  })
  current = vt
  // 같은 이름이 둘이면 등 모핑이 무산돼도 update는 이미 그려졌다. 거절은 조용히 넘긴다
  vt.ready.catch(() => {})
  void vt.finished.catch(() => {}).finally(() => {
    source.style.viewTransitionName = ''
    if (target) target.style.viewTransitionName = ''
    if (current === vt) {
      current = null
      delete root.dataset.morph
    }
  })
}
