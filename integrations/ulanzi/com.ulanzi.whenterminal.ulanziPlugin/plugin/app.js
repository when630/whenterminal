/* global $UD, Draw */
// WHENTERMINAL 덱 플러그인 주 서비스.
// 앱의 로컬 통로(127.0.0.1:37630, src/main/deck.ts)에서 상태를 SSE로 받아 키마다 그린다.
//  - 대화 상태: 놓은 키를 위→아래, 왼쪽→오른쪽 순으로 세어 N번째 키에 N번째 대화를 보여 준다.
//    키를 더 놓으면 그만큼 더 보이고, 대화가 키보다 많으면 마지막 키가 '+남은 수'가 된다. 설정에서 순번을 고정할 수 있다
//  - 사용량: 키 설정에서 고른 한도(요약·5시간·주간·모델별 주간). 자동이면 놓은 사용량 키 수로 나눈다. 누르면 새로 받는다
//  - 홈: 누르면 창을 열고 홈 화면으로 (그림은 고정 아이콘)
//  - 분할: 지금 분할창 상태(두 창의 프로젝트 글자, 키를 받는 창은 흰 칸). 누르면 창을 열고 분할 켜기·끄기

const BASE = 'http://127.0.0.1:37630'
const PLUGIN = 'com.ulanzi.ulanzistudio.whenterminal'
const CONV = `${PLUGIN}.conversation`
const USAGE = `${PLUGIN}.usage`
const HOME = `${PLUGIN}.home`
const SPLIT = `${PLUGIN}.split`
const PRIORITY = { waiting_approval: 6, error: 5, running: 4, queued: 3, stopped: 2, done: 1, idle: 0 }
/** 백그라운드 작업이 돌면 턴이 끝났어도 실행 중으로 본다 */
const busy = (c) => c.status === 'running' || (c.background > 0 && c.status !== 'waiting_approval' && c.status !== 'error')
const effective = (c) => (busy(c) && c.status !== 'running' ? 'running' : c.status)

/** context → { kind, key, actionid, slot(대화 순번, 0이면 자동), pick(사용량 한도, ''이면 자동) } */
const keys = new Map()
/** context → 마지막으로 보낸 그림 (같으면 다시 보내지 않는다) */
const sent = new Map()
/** context → 지금 보여 주는 대화 (누르면 열 것) */
const target = new Map()
let state = null
let online = false
let blink = false
let offlineTimer = null

$UD.connect(PLUGIN)

function kindOf(uuid) {
  return uuid === USAGE ? 'usage' : uuid === HOME ? 'home' : uuid === SPLIT ? 'split' : 'conv'
}

/** 키 위치 'col_row' → 정렬 값. 모르는 형식이면 뒤로 */
function order(key) {
  const m = /^(\d+)_(\d+)$/.exec(key || '')
  return m ? Number(m[2]) * 1000 + Number(m[1]) : 1e9
}

function register(jsn) {
  const ctx = jsn.context
  const { uuid, key, actionid } = $UD.decodeContext(ctx)
  // 키를 옮기면 Studio는 새 위치로 add만 보내고 옛 위치를 clear하지 않는다. context는 위치를 품고 있어
  // 옛 것이 유령 키로 남아 순번(14번 칸 등)과 사용량 나눔을 어긋나게 했다. ActionID는 옮겨도 그대로라 그걸로 정리한다
  let prev = keys.get(ctx)
  for (const [other, k] of keys) {
    if (other === ctx || k.actionid !== actionid) continue
    prev = prev || k
    keys.delete(other)
    sent.delete(other)
    target.delete(other)
  }
  keys.set(ctx, { kind: kindOf(uuid), key, actionid, slot: prev ? prev.slot : 0, pick: prev ? prev.pick : '' })
  applySettings(ctx, jsn.param)
}

function applySettings(ctx, param) {
  const k = keys.get(ctx)
  if (!k || !param) return
  if (Object.prototype.hasOwnProperty.call(param, 'slot')) k.slot = Number(param.slot) || 0
  if (Object.prototype.hasOwnProperty.call(param, 'pick')) k.pick = String(param.pick || '')
}

/** 대화 키마다 순번을 정한다. 고정한 키는 그 번호, 나머지는 위치 순으로 1부터 */
function slots() {
  const conv = [...keys.entries()].filter(([, k]) => k.kind === 'conv')
  const auto = conv.filter(([, k]) => !k.slot).sort(([, a], [, b]) => order(a.key) - order(b.key) || String(a.actionid).localeCompare(String(b.actionid)))
  const out = new Map()
  auto.forEach(([ctx], i) => out.set(ctx, i + 1))
  for (const [ctx, k] of conv) if (k.slot) out.set(ctx, k.slot)
  return out
}

/** 앱의 프로젝트 글자(Alt+A = 1번 프로젝트 …). 대화가 여럿인 프로젝트는 글자 뒤에 탭 번호를 붙인다 (S1 · S2) */
const HOME_ROW = ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L']
function lettersOf(convs) {
  const projects = []
  const perProject = new Map()
  for (const c of convs) {
    if (!perProject.has(c.projectId)) {
      projects.push(c.projectId)
      perProject.set(c.projectId, [])
    }
    perProject.get(c.projectId).push(c.conversationId)
  }
  const out = new Map()
  projects.forEach((p, i) => {
    const ids = perProject.get(p)
    const ch = HOME_ROW[i] || '?'
    ids.forEach((id, j) => out.set(id, ids.length > 1 ? `${ch}${j + 1}` : ch))
  })
  return out
}

/** 키에 나눠 줄 한도 순서. 앱 연동 한도(OAuth 앱)는 뺀다. 이름은 키 폭에 맞게 줄인다 */
function usageWindows(u) {
  if (!u || !u.available) return []
  const rank = (w) => (w.id === 'five_hour' ? 0 : w.id === 'seven_day' ? 1 : 2)
  return u.windows
    .filter((w) => w.id !== 'seven_day_oauth_apps')
    .sort((a, b) => rank(a) - rank(b))
    .map((w) => ({ ...w, label: w.label.replace('WEEKLY', 'WEEK') }))
}

function send(ctx, img) {
  if (sent.get(ctx) === img) return
  sent.set(ctx, img)
  $UD.setBaseDataIcon(ctx, img)
}

function render() {
  if (!online || !state) {
    for (const [ctx, k] of keys) {
      if (k.kind === 'home') continue
      target.delete(ctx)
      send(ctx, Draw.offline())
    }
    return
  }
  const convs = state.conversations
  const letters = lettersOf(convs)
  const map = slots()
  const total = map.size
  const last = Math.max(0, ...map.values())
  const counts = {
    running: convs.filter(busy).length,
    waiting: convs.filter((c) => c.status === 'waiting_approval').length,
  }
  // 사용량 키가 하나면 요약, 여럿이면 놓은 순서대로 한도를 하나씩 (5시간 → 주간 → 모델별 주간)
  // 키 설정에서 한도를 고른 키는 그것만. 자동인 키끼리는 하나면 요약, 여럿이면 놓은 순서대로 5시간 → 주간 → 모델별 주간
  const windows = usageWindows(state.usage)
  const one = (ctx, w, label) => send(ctx, Draw.usageOne(w || null, w ? w.label : label))
  const autoKeys = []
  for (const [ctx, k] of keys) {
    if (k.kind !== 'usage') continue
    if (k.pick === 'summary') send(ctx, Draw.usage(state.usage, counts))
    else if (k.pick === 'five_hour') one(ctx, windows.find((w) => w.id === 'five_hour'), '5H')
    else if (k.pick === 'seven_day') one(ctx, windows.find((w) => w.id === 'seven_day'), 'WEEK')
    else if (k.pick === 'model') one(ctx, windows.find((w) => w.id.startsWith('model:')), 'MODEL WEEK')
    else autoKeys.push([ctx, k])
  }
  autoKeys.sort(([, a], [, b]) => order(a.key) - order(b.key) || String(a.actionid).localeCompare(String(b.actionid)))
  autoKeys.forEach(([ctx], i) => {
    if (autoKeys.length === 1) send(ctx, Draw.usage(state.usage, counts))
    else one(ctx, windows[i], 'USAGE')
  })
  for (const [ctx, k] of keys) {
    if (k.kind === 'split') send(ctx, Draw.split(state.split, letters))
  }
  for (const [ctx, k] of keys) {
    if (k.kind !== 'conv') continue
    const n = map.get(ctx)
    // 대화가 키보다 많다: 마지막 순번 키가 남은 대화를 모아 보여 준다
    if (n === last && convs.length > total && convs.length > n) {
      const rest = convs.slice(n - 1)
      const top = rest.reduce((a, c) => (PRIORITY[effective(c)] > PRIORITY[effective(a)] ? c : a), rest[0])
      target.set(ctx, top)
      send(ctx, Draw.overflow(rest.length, effective(top), n))
      continue
    }
    const c = convs[n - 1]
    if (!c) {
      target.delete(ctx)
      send(ctx, Draw.empty(n))
      continue
    }
    target.set(ctx, c)
    send(ctx, Draw.conversation(c, letters.get(c.conversationId) || '?', blink))
  }
}

// 실행 중인 대화가 있으면 앞의 빨간 칸을 깜빡인다
setInterval(() => {
  if (!online || !state || !state.conversations.some(busy)) return
  blink = !blink
  render()
}, 700)

function connect() {
  const es = new EventSource(`${BASE}/events`)
  es.onmessage = (e) => {
    try {
      state = JSON.parse(e.data)
    } catch {
      return
    }
    online = true
    if (offlineTimer) {
      clearTimeout(offlineTimer)
      offlineTimer = null
    }
    render()
  }
  // EventSource는 스스로 다시 붙는다. 잠깐 끊긴 것으로 키가 깜빡이지 않게 3초 기다린 뒤 OFFLINE
  es.onerror = () => {
    if (offlineTimer || !online) {
      if (!online) render()
      return
    }
    offlineTimer = setTimeout(() => {
      offlineTimer = null
      online = false
      render()
    }, 3000)
  }
}

function post(path) {
  return fetch(`${BASE}${path}`, { method: 'POST' }).catch(() => $UD.toast('WHENTERMINAL이 꺼져 있어요'))
}

$UD.onConnected(() => connect())

$UD.onAdd((jsn) => {
  register(jsn)
  sent.delete(jsn.context)
  render()
})

$UD.onSetActive((jsn) => {
  // 페이지를 넘겨 다시 보이면 그림을 새로 보낸다
  if (jsn.active) {
    sent.delete(jsn.context)
    render()
  }
})

$UD.onRun((jsn) => {
  const k = keys.get(jsn.context)
  if (!k) return
  if (k.kind === 'usage') {
    post('/usage/refresh')
    return
  }
  if (k.kind === 'home') {
    post('/home')
    return
  }
  if (k.kind === 'split') {
    post('/split')
    return
  }
  const c = target.get(jsn.context)
  post(c ? `/open?project=${encodeURIComponent(c.projectId)}&conversation=${encodeURIComponent(c.conversationId)}` : '/open')
})

$UD.onClear((jsn) => {
  for (const item of jsn.param || []) {
    keys.delete(item.context)
    sent.delete(item.context)
    target.delete(item.context)
  }
  render()
})

$UD.onParamFromApp((jsn) => {
  if (!keys.has(jsn.context)) register(jsn)
  else applySettings(jsn.context, jsn.param)
  render()
})

$UD.onParamFromPlugin((jsn) => {
  applySettings(jsn.context, jsn.param)
  render()
})
