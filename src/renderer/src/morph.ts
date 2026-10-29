import { flushSync } from 'react-dom'
import { reducedMotion } from './motion'
import { isWindowShown } from './window-shown'

/**
 * 모핑: 지금 화면의 요소(from)가 바뀐 화면의 요소(to)로 변하며 이어지게 한다 (View Transitions API).
 * from을 찍어 두고 → update를 바로 그린 뒤(flushSync) → to를 찾아 같은 이름을 붙이면, 브라우저가 둘 사이의 위치·크기를 잇는다.
 * 평소에는 문서 전체를 찍지 않아(styles.css `:root { view-transition-name: none }`) 나머지는 바로 바뀌고 이름 붙은 한 쌍만 움직인다.
 * 넓게 바뀌는 것(card, 세부 화면 열기)은 문서도 찍어 주변이 겹쳐 사라지고 나타난다(`wide`).
 * 이름은 kind마다 하나(`morph-<kind>`)이고, 모양은 styles.css의 `::view-transition-*(morph-…)`.
 *
 * - 앞 모핑이 아직 돌 때(키를 빠르게 이어 누름) 새로 움직이지 않고 바로 바꾼다. View Transitions는 한 번에 하나라
 *   새로 시작하면 앞 것이 끝 모습으로 튀어 오히려 끊겨 보인다
 * - 움직임 줄이기면 자리·크기는 잇지 않고 화면 전체를 짧게 겹쳐 바꾼다(무엇이 바뀌었는지만 보이게)
 * - 스크롤 영역에 가려 일부만 보이는 요소는 잇지 않는다(그 영역 밖으로 비어져 나와 보이므로)
 *
 * update는 한 프레임 뒤(옛 화면을 찍은 다음)에 불린다. 모핑할 수 없으면(지원 안 함·창이 숨음·glass 스킨·from 없음) 바로 부른다
 */
export type MorphKind = 'card' | 'detail' | 'ask'

let current: ViewTransition | null = null
/** current의 update가 아직 안 불렸는지 */
let waiting = false
let flushing = false

/** 지금 모핑의 새 화면을 그리는 중인지. usePresence가 이때는 나가는 요소를 붙잡지 않는다(새 화면에 옛 요소가 남아 찍히지 않게) */
export const isMorphing = (): boolean => flushing

/** 요소가 통째로 보이는지: 스크롤·잘림 영역(조상)에 가린 부분이 없어야 한다 */
function inView(el: Element): boolean {
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return false
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p)
    if (s.overflowX === 'visible' && s.overflowY === 'visible') continue
    const b = p.getBoundingClientRect()
    if (r.top < b.top - 1 || r.bottom > b.bottom + 1 || r.left < b.left - 1 || r.right > b.right + 1) return false
  }
  return true
}

/**
 * 모핑 없이 바로 바꿀 때도 이걸로: 앞 모핑의 update가 아직(다음 프레임)이면 그 뒤에 부른다.
 * 그냥 부르면 키를 빠르게 이어 누를 때 늦게 온 앞 update가 이번 것을 덮어 옛 화면으로 돌아간다
 */
export function afterMorph(update: () => void): void {
  if (current && waiting) void current.updateCallbackDone.catch(() => {}).finally(update)
  else update()
}

/**
 * wide: 문서 전체도 찍어 주변이 겹쳐 바뀌게 한다(옛 화면이 위에서 사라진다). 화면이 통째로 바뀌는 card는 늘,
 * detail은 열 때만(대화 기록이 서서히 사라지게). 닫을 때 찍으면 옛 화면의 세부 화면 자리 흰 바탕이 돌아온 대화 기록을 덮는다
 */
export function morph(kind: MorphKind, from: Element | null | undefined, update: () => void, to: () => Element | null | undefined, wide = kind === 'card'): void {
  if (current) {
    // 앞 모핑을 끝으로 보내고 이번 것은 바로. 앞 update가 아직이면 그 뒤에 (순서가 바뀌면 옛 화면으로 돌아간다)
    const vt = current
    vt.skipTransition()
    if (waiting) void vt.updateCallbackDone.catch(() => {}).finally(update)
    else update()
    return
  }
  const reduced = reducedMotion()
  // glass 스킨은 하지 않는다: 유리 판(backdrop-filter)은 찍힌 모습에 뒤 배경이 없어 실제보다 밝게 보이다가 끝나는 순간 툭 어두워진다
  const glass = document.documentElement.dataset.skin === 'glass'
  if (!document.startViewTransition || !isWindowShown() || glass || (!reduced && !(from?.isConnected && inView(from)))) {
    update()
    return
  }
  const name = `morph-${kind}`
  const source = reduced ? null : (from as HTMLElement)
  let target: HTMLElement | null = null
  if (source) source.style.viewTransitionName = name
  // 넓게(wide) 바뀌는 것과 움직임 줄이기(fade)는 문서도 찍는다 (styles.css :root[data-morph])
  const root = document.documentElement
  root.dataset.morph = reduced ? 'fade' : wide ? 'wide' : kind
  waiting = true
  const vt = document.startViewTransition(() => {
    waiting = false
    if (source) source.style.viewTransitionName = ''
    flushing = true
    try {
      flushSync(update)
    } finally {
      flushing = false
    }
    if (!source) return
    const t = (to() as HTMLElement | null | undefined) ?? null
    if (t && inView(t)) {
      target = t
      t.style.viewTransitionName = name
      // 새로 그려진 화면의 등장 움직임(승인창 wipe·기록 줄 enter 등)은 끝 모습으로: 모핑이 이미 자리를 잡아 주므로 두 번 움직이면 깜빡여 보인다.
      // 화면이 통째로 바뀌는 card는 무대 전체, detail은 대화 영역(돌아온 대화 기록의 줄들도 다시 떠오르므로), ask는 도착한 줄 안만.
      // 끝없이 도는 것(맥동 등)은 그대로
      const scope = (kind === 'card' ? t.closest('.stage') : kind === 'detail' ? t.closest('.chat-body') : null) ?? t
      for (const a of scope.getAnimations({ subtree: true })) {
        if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish()
      }
    }
  })
  current = vt
  // 같은 이름이 둘이면 등 모핑이 무산돼도 update는 이미 그려졌다. 거절은 조용히 넘긴다
  vt.ready.catch(() => {})
  void vt.finished.catch(() => {}).finally(() => {
    if (source) source.style.viewTransitionName = ''
    if (target) target.style.viewTransitionName = ''
    if (current === vt) {
      current = null
      delete root.dataset.morph
    }
  })
}
