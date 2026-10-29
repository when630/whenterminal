import { app } from 'electron'
import { join } from 'node:path'
import { ACTIONS, ANSWER_FONTS, APP_ICONS, CODE_FONTS, QUESTION_FONTS, DEFAULT_SETTINGS, normalize, SKINS, TEXT_FONTS, THEMES, themeForSkin, type FontId, type Settings, type ThemeId } from '@shared/keymap'
import type { TerminalShell } from '@shared/types'
import { readJson, writeJson } from './json-file'

const TERMINAL_SHELLS: TerminalShell[] = ['auto', 'pwsh', 'powershell', 'gitbash', 'cmd', 'wsl', 'zsh', 'bash', 'fish']

/** userData/settings.json. 읽지 못하거나 모르는 값은 기본값으로 */
export class SettingsStore {
  private readonly file = join(app.getPath('userData'), 'settings.json')
  private settings: Settings = structuredClone(DEFAULT_SETTINGS)

  constructor() {
    const saved = readJson(this.file)
    if (saved !== undefined) this.settings = sanitize(saved)
  }

  get(): Settings {
    return structuredClone(this.settings)
  }

  set(next: Settings): Settings {
    this.settings = sanitize(next)
    writeJson(this.file, this.settings)
    return this.get()
  }
}

function sanitize(raw: unknown): Settings {
  const o = (raw ?? {}) as Partial<Settings>
  // 스킨이 없던 예전 설정은 테마가 속한 스킨으로 (지금까지의 테마는 모두 poster). 테마는 늘 고른 스킨의 것
  const known = THEMES.find((t) => t.id === o.theme)
  const skin = SKINS.some((s) => s.id === o.skin) ? o.skin! : (known?.skin ?? DEFAULT_SETTINGS.skin)
  const skinThemes: Settings['skinThemes'] = {}
  for (const s of SKINS) {
    const id = (o.skinThemes as Record<string, unknown> | undefined)?.[s.id]
    if (THEMES.some((t) => t.id === id && t.skin === s.id)) skinThemes[s.id] = id as ThemeId
  }
  const theme = known?.skin === skin ? known.id : themeForSkin(skin, skinThemes)
  skinThemes[skin] = theme
  // 스킨이 없던 예전 설정: 그때의 기본 글꼴(질문 DISPLAY·답변/화면 PRETENDARD·코드 GEIST)은 '스킨 글꼴'이었으므로 SKIN으로 옮긴다
  const legacy = o.skin === undefined
  const font = (v: FontId | undefined, list: FontId[], oldDefault: FontId, fallback: FontId): FontId =>
    legacy && v === oldDefault ? 'skin' : v && list.includes(v) ? v : fallback
  const textFont = font(o.textFont, TEXT_FONTS, 'pretendard', DEFAULT_SETTINGS.textFont)
  const questionFont = font(o.questionFont, QUESTION_FONTS, 'display', DEFAULT_SETTINGS.questionFont)
  const answerFont = font(o.answerFont, ANSWER_FONTS, 'pretendard', DEFAULT_SETTINGS.answerFont)
  const codeFont = font(o.codeFont, CODE_FONTS, 'geist', DEFAULT_SETTINGS.codeFont)
  const keymap: Settings['keymap'] = {}
  for (const a of ACTIONS) {
    const v = o.keymap?.[a.id]
    // 기본값과 같으면 저장하지 않는다 (기본값이 바뀌면 따라가게)
    if (typeof v === 'string' && normalize(v) && normalize(v) !== normalize(a.default)) keymap[a.id] = normalize(v)
  }
  const n = (o.notify ?? {}) as Partial<Settings['notify']>
  const d = DEFAULT_SETTINGS.notify
  const notify = {
    approval: typeof n.approval === 'boolean' ? n.approval : d.approval,
    done: typeof n.done === 'boolean' ? n.done : d.done,
    terminal: typeof n.terminal === 'boolean' ? n.terminal : d.terminal,
    usage: typeof n.usage === 'boolean' ? n.usage : d.usage,
    whenFocused: typeof n.whenFocused === 'boolean' ? n.whenFocused : d.whenFocused,
  }
  const maxConcurrent = Number.isInteger(o.maxConcurrent) && o.maxConcurrent! >= 0 && o.maxConcurrent! <= 16 ? o.maxConcurrent! : DEFAULT_SETTINGS.maxConcurrent
  const worktree = typeof o.worktree === 'boolean' ? o.worktree : DEFAULT_SETTINGS.worktree
  const dir = typeof o.worktreeDir === 'string' ? o.worktreeDir.trim().replace(/[\\/]+$/, '') : ''
  // 경로에 쓸 수 없는 글자(Windows)·NUL이 있으면 기본값
  const worktreeDir = dir && dir.length <= 260 && !/[\0<>"|?*]/.test(dir) ? dir : DEFAULT_SETTINGS.worktreeDir
  const openAtLogin = typeof o.openAtLogin === 'boolean' ? o.openAtLogin : DEFAULT_SETTINGS.openAtLogin
  const appIcon = APP_ICONS.some((i) => i.id === o.appIcon) ? o.appIcon! : DEFAULT_SETTINGS.appIcon
  const terminalShell = TERMINAL_SHELLS.includes(o.terminalShell as TerminalShell) ? o.terminalShell! : DEFAULT_SETTINGS.terminalShell
  const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback)
  const away = bool(o.away, DEFAULT_SETTINGS.away)
  const hideTaskbar = bool(o.hideTaskbar, DEFAULT_SETTINGS.hideTaskbar)
  const acrylic = bool(o.acrylic, DEFAULT_SETTINGS.acrylic)
  const promptSuggestions = bool(o.promptSuggestions, DEFAULT_SETTINGS.promptSuggestions)
  const budgetWhenHot = bool(o.budgetWhenHot, DEFAULT_SETTINGS.budgetWhenHot)
  return { skin, theme, skinThemes, textFont, questionFont, answerFont, codeFont, appIcon, notify, maxConcurrent, worktree, worktreeDir, openAtLogin, hideTaskbar, acrylic, terminalShell, away, promptSuggestions, budgetWhenHot, keymap }
}
