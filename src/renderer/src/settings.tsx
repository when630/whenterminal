import { createContext, useContext } from 'react'
import { DEFAULT_KEYMAP, DEFAULT_SETTINGS, FONTS, type FontId, type Keymap, type Settings, type ThemeId } from '@shared/keymap'

/** 지금 쓰는 단축키 맵. 화면의 단축키 표시는 모두 여기서 읽는다 */
export const KeymapContext = createContext<Keymap>(DEFAULT_KEYMAP)
export const useKeymap = (): Keymap => useContext(KeymapContext)

/** 테마 적용. 처음에는 즉시, 바꿀 때는 잠깐 전환 클래스를 붙여 색이 부드럽게 넘어가게 */
export function applyTheme(theme: ThemeId, animate: boolean): void {
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-switching')
    setTimeout(() => root.classList.remove('theme-switching'), 450)
  }
  if (theme === 'poster') delete root.dataset.theme
  else root.dataset.theme = theme
}

/** 글꼴 적용: 칸마다 CSS 변수를 :root style에 덮어쓴다 (기본값이면 styles.css 그대로) */
export function applyFonts(s: Pick<Settings, 'textFont' | 'questionFont' | 'answerFont' | 'codeFont'>): void {
  const style = document.documentElement.style
  const put = (name: string, id: FontId): void => {
    if (id === DEFAULT_SETTINGS[FONT_VARS[name]]) style.removeProperty(name)
    else style.setProperty(name, FONTS[id].css)
  }
  put('--font', s.textFont)
  put('--question-font', s.questionFont)
  put('--answer-font', s.answerFont)
  put('--mono', s.codeFont)
  if (s.questionFont === 'display') style.removeProperty('--question-weight')
  else style.setProperty('--question-weight', '700')
}

const FONT_VARS: Record<string, 'textFont' | 'questionFont' | 'answerFont' | 'codeFont'> = {
  '--font': 'textFont',
  '--question-font': 'questionFont',
  '--answer-font': 'answerFont',
  '--mono': 'codeFont',
}
