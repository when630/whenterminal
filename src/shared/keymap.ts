import type { TerminalShell } from './types'

// 단축키 맵: 동작 ID → 키 조합. 메인(전역 호출 키)과 렌더러(앱 안 단축키)가 함께 쓴다.
// 키 조합 문자열: 'Ctrl+Shift+L', 'Alt+Shift+Space', 'J', 'Ctrl+,' 처럼 수정 키 + 키 하나를 +로 잇는다.
// 글자·숫자·기호 키는 물리 키(e.code) 기준이라 한글 입력 상태에서도 같은 키로 동작한다.

export type ActionId =
  | 'summon' | 'goHome' | 'dispatch' | 'quickAsk' | 'openSettings' | 'search' | 'help'
  | 'addProject' | 'focusAsk' | 'down' | 'up' | 'toRunning' | 'toReports' | 'open' | 'archive' | 'newTask'
  | 'allow' | 'always' | 'deny'
  | 'nextConversation' | 'prevConversation' | 'closeConversation' | 'closeProject' | 'clear' | 'compact' | 'cycleMode'
  | 'panelNext' | 'panelPrev' | 'panelBack' | 'stopTask' | 'renameConversation' | 'newConversation' | 'terminal'
  | 'terminalNew' | 'terminalNext' | 'terminalPrev' | 'terminalClose' | 'terminalFind' | 'cycleEffort' | 'rewind' | 'scrollBottom' | 'away' | 'files' | 'projectUp' | 'projectDown' | 'palette' | 'git' | 'sendAfter'

export type ActionScope = 'system' | 'anywhere' | 'home' | 'chat' | 'approval'

export interface ActionDef {
  id: ActionId
  label: string
  scope: ActionScope
  default: string
}

export const SCOPE_LABEL: Record<ActionScope, string> = {
  system: 'SYSTEM',
  anywhere: 'ANYWHERE',
  home: 'HOME',
  chat: 'CHAT',
  approval: 'APPROVAL',
}

export const ACTIONS: ActionDef[] = [
  { id: 'summon', label: 'Summon app', scope: 'system', default: 'Ctrl+Shift+Space' },
  { id: 'goHome', label: 'Go home', scope: 'anywhere', default: 'Ctrl+H' },
  { id: 'dispatch', label: 'New task', scope: 'anywhere', default: 'Ctrl+K' },
  { id: 'quickAsk', label: 'Quick question', scope: 'anywhere', default: 'Ctrl+Shift+K' },
  { id: 'openSettings', label: 'Settings', scope: 'anywhere', default: 'Ctrl+,' },
  { id: 'search', label: 'Search all conversations', scope: 'anywhere', default: 'Ctrl+Shift+F' },
  { id: 'help', label: 'Keyboard shortcuts', scope: 'anywhere', default: 'Ctrl+/' },
  { id: 'palette', label: 'Command palette', scope: 'anywhere', default: 'Ctrl+Shift+P' },
  { id: 'away', label: 'Away mode on / off', scope: 'anywhere', default: 'Ctrl+Shift+A' },
  // 지금 연 프로젝트를 사이드바 목록에서 한 칸 옮긴다 (Alt+글자 프로젝트 이동은 Shift 없이만 받아 겹치지 않는다)
  { id: 'projectUp', label: 'Move project up', scope: 'anywhere', default: 'Alt+Shift+K' },
  { id: 'projectDown', label: 'Move project down', scope: 'anywhere', default: 'Alt+Shift+J' },
  { id: 'addProject', label: 'Add project', scope: 'home', default: 'Ctrl+N' },
  { id: 'focusAsk', label: 'Focus task input', scope: 'home', default: 'I' },
  { id: 'down', label: 'Next item', scope: 'home', default: 'J' },
  { id: 'up', label: 'Previous item', scope: 'home', default: 'K' },
  { id: 'toRunning', label: 'Jump to running', scope: 'home', default: 'H' },
  { id: 'toReports', label: 'Jump to reports', scope: 'home', default: 'L' },
  { id: 'open', label: 'Open', scope: 'home', default: 'O' },
  { id: 'archive', label: 'Archive report', scope: 'home', default: 'E' },
  { id: 'newTask', label: 'Follow-up task', scope: 'home', default: 'I' },
  { id: 'allow', label: 'Allow', scope: 'approval', default: 'Y' },
  { id: 'always', label: 'Always allow', scope: 'approval', default: 'A' },
  { id: 'deny', label: 'Deny', scope: 'approval', default: 'N' },
  { id: 'newConversation', label: 'New tab', scope: 'chat', default: 'Ctrl+Shift+T' },
  { id: 'files', label: 'Find & read project files', scope: 'chat', default: 'Ctrl+P' },
  { id: 'git', label: 'Git: branches, commits & diffs', scope: 'chat', default: 'Ctrl+G' },
  { id: 'terminal', label: 'Terminal: open / focus / fold', scope: 'chat', default: 'Ctrl+T' },
  { id: 'terminalNew', label: 'Terminal: new tab', scope: 'chat', default: 'Ctrl+Alt+T' },
  { id: 'terminalNext', label: 'Terminal: next tab', scope: 'chat', default: 'Ctrl+Alt+J' },
  { id: 'terminalPrev', label: 'Terminal: previous tab', scope: 'chat', default: 'Ctrl+Alt+K' },
  { id: 'terminalClose', label: 'Terminal: close tab', scope: 'chat', default: 'Ctrl+Alt+W' },
  // 터미널에 포커스가 있을 때만 (xterm이 받는다)
  { id: 'terminalFind', label: 'Terminal: find in output', scope: 'chat', default: 'Ctrl+F' },
  { id: 'nextConversation', label: 'Next tab', scope: 'chat', default: 'Ctrl+Tab' },
  { id: 'prevConversation', label: 'Previous tab', scope: 'chat', default: 'Ctrl+Shift+Tab' },
  { id: 'closeConversation', label: 'Close tab (twice)', scope: 'chat', default: 'Ctrl+W' },
  { id: 'clear', label: 'Clear (twice)', scope: 'chat', default: 'Ctrl+L' },
  { id: 'compact', label: 'Compact', scope: 'chat', default: 'Ctrl+Shift+L' },
  { id: 'closeProject', label: 'Close project (twice)', scope: 'chat', default: 'Ctrl+Shift+W' },
  { id: 'cycleMode', label: 'Cycle mode', scope: 'chat', default: 'Shift+Tab' },
  { id: 'cycleEffort', label: 'Cycle effort', scope: 'chat', default: 'Ctrl+Shift+O' },
  // 오른쪽 패널의 하위 에이전트·백그라운드 작업 세부 내용
  { id: 'panelNext', label: 'Next agent / task details', scope: 'chat', default: 'Ctrl+J' },
  { id: 'panelPrev', label: 'Previous agent / task details', scope: 'chat', default: 'Ctrl+Shift+J' },
  { id: 'panelBack', label: 'Back to chat', scope: 'chat', default: 'Ctrl+B' },
  { id: 'stopTask', label: 'Stop shown task', scope: 'chat', default: 'Ctrl+Shift+X' },
  { id: 'renameConversation', label: 'Rename tab', scope: 'chat', default: 'Ctrl+Shift+E' },
  { id: 'rewind', label: 'Rewind files / chat', scope: 'chat', default: 'Ctrl+Alt+Z' },
  { id: 'scrollBottom', label: 'Scroll to latest', scope: 'chat', default: 'Ctrl+Shift+G' },
  { id: 'sendAfter', label: 'Send after the current task', scope: 'chat', default: 'Ctrl+Enter' },
]

export type Keymap = Record<ActionId, string>

export const DEFAULT_KEYMAP = Object.fromEntries(ACTIONS.map((a) => [a.id, a.default])) as Keymap

/** 동시에 쓰일 수 있는 범위끼리만 충돌을 따진다 (홈 키와 대화창 키는 겹쳐도 된다) */
const OVERLAP: Record<ActionScope, ActionScope[]> = {
  system: ['system', 'anywhere', 'home', 'chat', 'approval'],
  anywhere: ['system', 'anywhere', 'home', 'chat', 'approval'],
  home: ['system', 'anywhere', 'home', 'approval'],
  chat: ['system', 'anywhere', 'chat', 'approval'],
  approval: ['system', 'anywhere', 'home', 'chat', 'approval'],
}

/** 같은 키를 쓰는 다른 동작들. 보고서 상세의 newTask와 홈의 focusAsk(I)는 화면이 달라 함께 써도 된다 */
export function conflictsOf(keymap: Keymap, id: ActionId): ActionId[] {
  const me = ACTIONS.find((a) => a.id === id)!
  const key = normalize(keymap[id])
  if (!key) return []
  const allowed = new Set<string>(['focusAsk:newTask', 'newTask:focusAsk'])
  return ACTIONS.filter((a) => a.id !== id && OVERLAP[me.scope].includes(a.scope) && normalize(keymap[a.id]) === key && !allowed.has(`${id}:${a.id}`)).map((a) => a.id)
}

const MOD_ORDER = ['Ctrl', 'Alt', 'Shift', 'Meta'] as const

/** 'shift+ctrl+l' → 'Ctrl+Shift+L' */
export function normalize(binding: string | undefined): string {
  if (!binding) return ''
  const parts = binding.split('+').map((p) => p.trim())
  // 'Ctrl++'처럼 키가 '+'인 경우는 지원하지 않는다 (Equal로 표기)
  const mods = new Set<string>()
  let key = ''
  for (const raw of parts) {
    const p = raw.toLowerCase()
    if (p === 'ctrl' || p === 'control') mods.add('Ctrl')
    else if (p === 'alt' || p === 'option' || p === 'opt') mods.add('Alt')
    else if (p === 'shift') mods.add('Shift')
    else if (p === 'meta' || p === 'cmd' || p === 'command' || p === 'super') mods.add('Meta')
    else if (raw) key = raw.length === 1 ? raw.toUpperCase() : raw[0].toUpperCase() + raw.slice(1)
  }
  return [...MOD_ORDER.filter((m) => mods.has(m)), key].filter(Boolean).join('+')
}

/** Electron 전역 단축키 형식으로 ('Ctrl+Shift+Space' → 'Control+Shift+Space') */
export function toAccelerator(binding: string): string {
  return normalize(binding)
    .split('+')
    .map((p) => (p === 'Ctrl' ? 'Control' : p === 'Meta' ? 'Super' : p === 'Esc' ? 'Escape' : p))
    .join('+')
}

/** 스킨: 모양(선·모서리·그림자·글꼴·배치). 색은 스킨마다 따로 있는 테마가 정한다. poster는 G안 그대로(:root에 data-skin 없음) */
export type SkinId = 'poster' | 'soft' | 'tui' | 'zen' | 'glass' | 'ide' | 'sketch'

export const SKINS: { id: SkinId; name: string; note: string }[] = [
  { id: 'poster', name: 'POSTER', note: '굵은 검은 선과 큰 글자, 스위스 포스터' },
  { id: 'soft', name: 'SOFT', note: '둥근 모서리와 옅은 그림자, 얇은 선' },
  { id: 'tui', name: 'TUI', note: '고정폭 글자와 제목이 박힌 상자, 터미널처럼' },
  { id: 'zen', name: 'ZEN', note: '선도 패널도 없이 여백과 글만' },
  { id: 'glass', name: 'GLASS', note: '흐린 바탕 위 반투명 유리 패널' },
  { id: 'ide', name: 'IDE', note: '편집기처럼 탭·탐색기 트리·아래 상태 표시줄' },
  { id: 'sketch', name: 'SKETCH', note: '캔버스 위 손그림과 떠 있는 도구 판' },
]

export type ThemeId =
  | 'poster' | 'paper' | 'sage' | 'sumi' | 'night'
  | 'soft-light' | 'soft-sand' | 'soft-dark'
  | 'tui-night' | 'tui-phosphor' | 'tui-amber' | 'tui-paper'
  | 'zen-sage' | 'zen-paper' | 'zen-ink' | 'zen-stone' | 'zen-snow' | 'zen-kraft' | 'zen-night' | 'zen-moss' | 'zen-dim'
  | 'glass-day' | 'glass-night' | 'glass-dusk'
  | 'ide-dark' | 'ide-light' | 'ide-midnight' | 'ide-solar' | 'ide-hc'
  | 'sketch-paper' | 'sketch-board' | 'sketch-blueprint' | 'sketch-kraft' | 'sketch-legal'

/** 색 테마. 스킨마다 제 테마 목록이 있고 목록의 첫 테마가 그 스킨의 기본값. colors는 [바탕, 글자, 신호색] (설정 견본·창 바탕색) */
export const THEMES: { id: ThemeId; skin: SkinId; name: string; note: string; colors: [string, string, string]; dark?: boolean }[] = [
  { id: 'poster', skin: 'poster', name: 'POSTER', note: '흰 종이와 검정, 대비가 가장 강함', colors: ['#ffffff', '#0a0a0a', '#ff2a12'] },
  { id: 'paper', skin: 'poster', name: 'PAPER', note: '누런 미색과 먹색, 눈부심이 적음', colors: ['#f4efe6', '#2e2a25', '#c4553a'] },
  { id: 'sage', skin: 'poster', name: 'SAGE', note: '옅은 초록빛 회색, 차분함', colors: ['#e8ece4', '#273029', '#b6533c'] },
  { id: 'sumi', skin: 'poster', name: 'SUMI', note: '따뜻한 어두운 회색, 밤에 편함', colors: ['#1f1e1c', '#d8d2c6', '#e07a5f'], dark: true },
  { id: 'night', skin: 'poster', name: 'NIGHT', note: '푸른 어두운 회색, 차가운 톤', colors: ['#1a1e24', '#c5cdd6', '#e5806b'], dark: true },
  { id: 'soft-light', skin: 'soft', name: 'LIGHT', note: '흰 카드와 옅은 회색 바탕', colors: ['#f4f4f6', '#1b1b1f', '#e5484d'] },
  { id: 'soft-sand', skin: 'soft', name: 'SAND', note: '따뜻한 미색, 눈부심이 적음', colors: ['#f3efe8', '#2b2722', '#d0583a'] },
  { id: 'soft-dark', skin: 'soft', name: 'DARK', note: '부드러운 어두운 회색', colors: ['#18181b', '#e8e8ea', '#ff6369'], dark: true },
  { id: 'tui-night', skin: 'tui', name: 'NIGHT', note: '푸른 어두운 터미널', colors: ['#14171c', '#c9d1d9', '#ff7b72'], dark: true },
  { id: 'tui-phosphor', skin: 'tui', name: 'PHOSPHOR', note: '검은 바탕에 초록 형광 글자', colors: ['#07120b', '#7ee69a', '#ff6a4d'], dark: true },
  { id: 'tui-amber', skin: 'tui', name: 'AMBER', note: '검은 바탕에 호박색 글자', colors: ['#120c04', '#f5b94a', '#ff5a3c'], dark: true },
  { id: 'tui-paper', skin: 'tui', name: 'PAPER', note: '밝은 종이 터미널', colors: ['#f5f2ea', '#222222', '#c4361c'] },
  { id: 'zen-sage', skin: 'zen', name: 'SAGE', note: '옅은 초록빛 회색, 차분함', colors: ['#e8ece4', '#273029', '#b6533c'] },
  { id: 'zen-paper', skin: 'zen', name: 'PAPER', note: '미색 종이', colors: ['#f7f4ee', '#2e2a25', '#c4553a'] },
  { id: 'zen-ink', skin: 'zen', name: 'INK', note: '먹빛 어두운 바탕', colors: ['#191a1c', '#d6d3cc', '#e07a5f'], dark: true },
  { id: 'zen-stone', skin: 'zen', name: 'STONE', note: '차가운 회색, 미색이 누렇게 느껴질 때', colors: ['#eeeff0', '#1f2326', '#b8432c'] },
  { id: 'zen-snow', skin: 'zen', name: 'SNOW', note: '거의 흰 바탕, 대비가 가장 커요', colors: ['#fbfbfa', '#111111', '#d0402a'] },
  { id: 'zen-kraft', skin: 'zen', name: 'KRAFT', note: '짙은 베이지, 종이 질감', colors: ['#e9e0d0', '#2b241b', '#b1442c'] },
  { id: 'zen-night', skin: 'zen', name: 'NIGHT', note: '푸른 먹색, 밤에 오래 볼 때', colors: ['#15181c', '#cdd3da', '#e8806a'], dark: true },
  { id: 'zen-moss', skin: 'zen', name: 'MOSS', note: '짙은 초록, SAGE의 어두운 짝', colors: ['#171c18', '#d3dccf', '#e07f62'], dark: true },
  { id: 'zen-dim', skin: 'zen', name: 'DIM', note: '대비를 낮춘 따뜻한 검정, 오래 봐도 눈이 편해요', colors: ['#1f1d1a', '#c4bba9', '#d98b6c'], dark: true },
  { id: 'glass-day', skin: 'glass', name: 'DAY', note: '밝은 바탕에 흰 유리', colors: ['#eef0f4', '#111318', '#ff3b30'] },
  { id: 'glass-night', skin: 'glass', name: 'NIGHT', note: '어두운 바탕에 짙은 유리', colors: ['#0f1218', '#e6eaf0', '#ff6b5e'], dark: true },
  { id: 'glass-dusk', skin: 'glass', name: 'DUSK', note: '보랏빛 저녁 바탕', colors: ['#1b1626', '#ece6f5', '#ff7a6b'], dark: true },
  { id: 'ide-dark', skin: 'ide', name: 'DARK', note: '기본 어두운 편집기', colors: ['#1f1f1f', '#cccccc', '#f14c4c'], dark: true },
  { id: 'ide-light', skin: 'ide', name: 'LIGHT', note: '밝은 편집기', colors: ['#ffffff', '#3b3b3b', '#c72e0f'] },
  { id: 'ide-midnight', skin: 'ide', name: 'MIDNIGHT', note: '푸른 검정, 밤에 오래 볼 때', colors: ['#0d1117', '#c9d1d9', '#f85149'], dark: true },
  { id: 'ide-solar', skin: 'ide', name: 'SOLAR', note: '따뜻한 미색, 눈부심이 적어요', colors: ['#fdf6e3', '#44525a', '#c4361c'] },
  { id: 'ide-hc', skin: 'ide', name: 'HIGH CONTRAST', note: '검정 바탕에 밝은 테두리, 대비가 가장 커요', colors: ['#000000', '#ffffff', '#ff5c5c'], dark: true },
  { id: 'sketch-paper', skin: 'sketch', name: 'PAPER', note: '흰 모눈 캔버스, 보라 강조', colors: ['#ffffff', '#1e1e1e', '#e03131'] },
  { id: 'sketch-board', skin: 'sketch', name: 'BOARD', note: '어두운 캔버스, 밤에 편해요', colors: ['#121214', '#e3e3e8', '#ff8787'], dark: true },
  { id: 'sketch-blueprint', skin: 'sketch', name: 'BLUEPRINT', note: '청사진 위 노란 연필', colors: ['#1d4f8f', '#eaf2ff', '#ff8a80'], dark: true },
  { id: 'sketch-kraft', skin: 'sketch', name: 'KRAFT', note: '갈색 크라프트지에 초록 펜', colors: ['#d6bf99', '#2b2117', '#c92a2a'] },
  { id: 'sketch-legal', skin: 'sketch', name: 'LEGAL', note: '줄 친 노란 패드에 파란 펜', colors: ['#fff6b8', '#1e1e1e', '#e03131'] },
]

/** 스킨의 테마 목록 */
export const themesOf = (skin: SkinId): typeof THEMES => THEMES.filter((t) => t.skin === skin)

/** 스킨을 고를 때 쓸 테마: 그 스킨에서 마지막으로 고른 테마, 없으면 스킨의 첫 테마 */
export function themeForSkin(skin: SkinId, remembered: Partial<Record<SkinId, ThemeId>>): ThemeId {
  const r = remembered[skin]
  return r && THEMES.some((t) => t.id === r && t.skin === skin) ? r : themesOf(skin)[0].id
}

export interface NotifySettings {
  /** 확인 요청이 오면 */
  approval: boolean
  /** 작업이 끝나면 (오류·중단 포함) */
  done: boolean
  /** 아래 터미널에서 오래 돈 명령이 끝나면 */
  terminal: boolean
  /** 구독 한도가 80%·95%를 넘거나 다 쓰면 */
  usage: boolean
  /** 창을 보고 있을 때도 알림 */
  whenFocused: boolean
}

export type AppIconId = 'wordmark' | 'prompt' | 'keycap' | 'bands' | 'question' | 'slots'

/** 앱 아이콘 (resources/icons/<id>.png, 원본은 build/icons/<id>.svg → npm run icons) */
export const APP_ICONS: { id: AppIconId; name: string; note: string }[] = [
  { id: 'wordmark', name: 'WT_', note: '사이드바 로고와 같은 모양' },
  { id: 'prompt', name: 'PROMPT', note: '작은 크기에서 가장 또렷함' },
  { id: 'keycap', name: 'KEYCAP', note: '키보드 중심 앱' },
  { id: 'bands', name: 'BANDS', note: '홈 화면의 프로젝트 띠' },
  { id: 'question', name: 'QUESTION', note: 'Dock에서 가장 눈에 띔' },
  { id: 'slots', name: 'SLOTS', note: 'A~L 프로젝트 자리' },
]

/** skin: 지금 스킨이 정한 글꼴 (기본값). 나머지는 스킨과 상관없이 그 글꼴로 */
export type FontId = 'skin' | 'display' | 'pretendard' | 'serif' | 'hand' | 'geist' | 'cascadia' | 'd2coding'

/** 글꼴 (설정 FONT). css는 --font·--mono·--answer-font·--question-font에 넣는 목록. 한글이 없는 글꼴은 뒤의 글꼴로 넘어간다 */
export const FONTS: Record<FontId, { name: string; css: string }> = {
  skin: { name: 'SKIN', css: '' },
  display: { name: 'DISPLAY', css: "'WT Display', 'Black Han Sans', 'Pretendard Variable', sans-serif" },
  pretendard: { name: 'PRETENDARD', css: "'Pretendard Variable', Pretendard, 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif" },
  serif: { name: 'SERIF', css: "'Noto Serif KR', 'AppleMyungjo', Batang, serif" },
  hand: { name: 'HANDWRITING', css: "'Gaegu', 'Pretendard Variable', cursive" },
  geist: { name: 'GEIST MONO', css: "'Geist Mono', 'SF Mono', 'Cascadia Code', 'D2Coding', Consolas, monospace" },
  cascadia: { name: 'CASCADIA CODE NF', css: "'Cascadia Code NF', 'D2Coding', Consolas, 'Pretendard Variable', monospace" },
  d2coding: { name: 'D2CODING NF', css: "'D2Coding NF', D2Coding, Consolas, monospace" },
}
/**
 * 칸마다 고를 수 있는 글꼴. 기본은 SKIN(스킨이 정한 글꼴: poster는 질문 DISPLAY·답변·화면 PRETENDARD·코드 GEIST MONO).
 * 다른 것을 고르면 스킨과 상관없이 그 글꼴. 터미널은 고정폭만
 */
export const TEXT_FONTS: FontId[] = ['skin', 'pretendard', 'cascadia', 'd2coding']
export const QUESTION_FONTS: FontId[] = ['skin', 'display', 'pretendard', 'serif', 'hand', 'cascadia', 'd2coding']
export const ANSWER_FONTS: FontId[] = ['skin', 'pretendard', 'serif', 'hand', 'cascadia', 'd2coding']
export const CODE_FONTS: FontId[] = ['skin', 'geist', 'cascadia', 'd2coding']

export interface Settings {
  /** 모양. theme은 늘 이 스킨의 테마다 (sanitize가 맞춘다) */
  skin: SkinId
  theme: ThemeId
  /** 스킨마다 마지막으로 고른 테마 (스킨을 바꿨다 돌아오면 그 테마로) */
  skinThemes: Partial<Record<SkinId, ThemeId>>
  /** 메뉴·입력창 같은 화면 글꼴 */
  textFont: FontId
  /** 대화의 내 질문 글꼴 */
  questionFont: FontId
  /** 대화의 답변 본문 글꼴 */
  answerFont: FontId
  /** 코드·터미널 글꼴 */
  codeFont: FontId
  appIcon: AppIconId
  notify: NotifySettings
  /** 동시에 실행할 대화 수 (OPEN-003). 0이면 제한 없음. 넘치면 대기열에서 차례를 기다린다 */
  maxConcurrent: number
  /** 탭의 +로 만든 하위 대화를 git worktree에서 실행 (OPEN-002). git 저장소가 아니면 플랜 모드로 시작 */
  worktree: boolean
  /** 하위 대화 worktree를 만들 폴더. 상대 경로면 프로젝트 폴더 기준, 절대 경로도 된다. 기본은 Claude Code와 같은 .claude/worktrees */
  worktreeDir: string
  /** 로그인할 때 자동 실행 (창은 숨긴 채 트레이에). 패키징한 앱에서만 동작 */
  openAtLogin: boolean
  /** Windows: 작업 표시줄에 앱 버튼을 두지 않는다 (트레이·전역 호출 키로만 연다). 최소화하면 트레이로 숨긴다 */
  hideTaskbar: boolean
  /** glass 스킨: 창 바탕을 Windows 아크릴로 (창 뒤 화면이 흐리게 비친다). Windows 11 22H2 이상에서만, 아니면 앱이 칠한 바탕 */
  acrylic: boolean
  /** 대화창 아래 터미널의 셸 */
  terminalShell: TerminalShell
  /**
   * 자리 비움(OPEN-004): 확인 요청을 묻지 않고 거절해 작업이 멈추지 않게 한다. 거절한 호출은 보고서에 모이고 돌아와서 한 번에 승인·재실행.
   * 앱을 다시 켜도 유지된다 (밤새 돌리는 용도)
   */
  away: boolean
  /** 턴이 끝나면 다음 지시를 예측해 입력창에 흐리게 띄운다 (SDK promptSuggestions, Tab으로 수락) */
  promptSuggestions: boolean
  /** 구독 한도가 80%를 넘으면 새 세션에 토큰 예산을 걸어 모델이 스스로 페이스를 조절하게 한다 (SDK taskBudget, 알파) */
  budgetWhenHot: boolean
  /** 기본값과 다른 키만 저장 */
  keymap: Partial<Keymap>
}

export const DEFAULT_SETTINGS: Settings = { skin: 'poster', theme: 'poster', skinThemes: {},textFont: 'skin', questionFont: 'skin', answerFont: 'skin', codeFont: 'skin', appIcon: 'prompt', maxConcurrent: 3, worktree: true, worktreeDir: '.claude/worktrees', openAtLogin: false, hideTaskbar: false, acrylic: true, terminalShell: 'auto', away: false, promptSuggestions: true, budgetWhenHot: true, notify: { approval: true, done: true, terminal: true, usage: true, whenFocused: false }, keymap: {} }

export function effectiveKeymap(settings: Settings): Keymap {
  return { ...DEFAULT_KEYMAP, ...settings.keymap }
}
