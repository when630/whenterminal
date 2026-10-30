import { createContext, useContext } from 'react'
import { DEFAULT_KEYMAP, FONTS, type FontId, type Keymap, type Settings, type SkinId, type ThemeId } from '@shared/keymap'

/** 지금 쓰는 단축키 맵. 화면의 단축키 표시는 모두 여기서 읽는다 */
export const KeymapContext = createContext<Keymap>(DEFAULT_KEYMAP)
export const useKeymap = (): Keymap => useContext(KeymapContext)

/**
 * 스킨·테마 적용. 처음에는 즉시, 바꿀 때는 잠깐 전환 클래스를 붙여 색이 부드럽게 넘어가게.
 * 기본값(poster 스킨·poster 테마)은 속성을 떼어 styles.css의 :root 그대로 쓴다
 */
/** acrylic: 창 바탕이 아크릴이라(메인 applyBackdrop) 바탕을 칠하지 않는다 (glass 스킨의 data-backdrop) */
export function applyTheme(skin: SkinId, theme: ThemeId, animate: boolean, acrylic = false): void {
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-switching')
    setTimeout(() => root.classList.remove('theme-switching'), 450)
  }
  if (skin === 'poster') delete root.dataset.skin
  else root.dataset.skin = skin
  if (theme === 'poster') delete root.dataset.theme
  else root.dataset.theme = theme
  if (acrylic && skin === 'glass') root.dataset.backdrop = 'acrylic'
  else delete root.dataset.backdrop
}

/** 글꼴 적용: 칸마다 CSS 변수를 :root style에 덮어쓴다. SKIN이면 지워서 styles.css·스킨 CSS의 값 그대로 */
export function applyFonts(s: Pick<Settings, 'textFont' | 'questionFont' | 'answerFont' | 'codeFont'>): void {
  const style = document.documentElement.style
  const put = (name: string, id: FontId): void => {
    if (id === 'skin') style.removeProperty(name)
    else style.setProperty(name, FONTS[id].css)
  }
  put('--font', s.textFont)
  put('--question-font', s.questionFont)
  put('--answer-font', s.answerFont)
  put('--mono', s.codeFont)
  // 손글씨처럼 글자 크기가 달라야 하는 글꼴을 CSS가 알 수 있게 (:root[data-answer-font='hand'])
  document.documentElement.dataset.questionFont = s.questionFont
  document.documentElement.dataset.answerFont = s.answerFont
  // 질문 굵기: SKIN은 스킨 값, DISPLAY는 그 자체로 굵은 글꼴이라 400, 나머지 본문 글꼴은 가늘어 보이므로 700
  if (s.questionFont === 'skin') style.removeProperty('--question-weight')
  else style.setProperty('--question-weight', s.questionFont === 'display' || s.questionFont === 'serif' ? '400' : '700')
}
