// 키 화면 그리기 (196×196 PNG). WHENTERMINAL 아이콘과 같은 결: 검정 바탕 · 흰 글자 · 빨강 하나
/* exported Draw */
const Draw = (() => {
  const SIZE = 196
  const K = '#0a0a0a'
  const W = '#ffffff'
  const R = '#ff2a12'
  const DIM = '#7a7a7a'
  const FONT = "'Segoe UI', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"
  const MONO = "'Cascadia Mono', Consolas, 'Malgun Gothic', monospace"

  const LABEL = {
    idle: 'IDLE',
    queued: 'QUEUED',
    running: 'RUNNING',
    waiting_approval: 'NEEDS YOU',
    done: 'DONE',
    error: 'ERROR',
    stopped: 'STOPPED',
  }

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')

  function clear(bg) {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, SIZE, SIZE)
    ctx.textBaseline = 'alphabetic'
    ctx.textAlign = 'left'
  }

  function font(weight, px, family = FONT) {
    ctx.font = `${weight} ${px}px ${family}`
  }

  /** 폭에 맞춰 글자 단위로 줄을 나눈다 (한글은 띄어쓰기가 없어도 끊긴다). 넘치면 마지막 줄 끝을 … */
  function wrap(text, width, maxLines) {
    const lines = []
    let line = ''
    for (const ch of Array.from(text.replace(/\s+/g, ' ').trim())) {
      if (ctx.measureText(line + ch).width > width && line) {
        lines.push(line.trimEnd())
        line = ch === ' ' ? '' : ch
        if (lines.length === maxLines) break
      } else line += ch
    }
    if (lines.length < maxLines && line) lines.push(line)
    else if (lines.length === maxLines && line) {
      let last = lines[maxLines - 1]
      while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, -1)
      lines[maxLines - 1] = last + '…'
    }
    return lines
  }

  function fit(text, width) {
    if (ctx.measureText(text).width <= width) return text
    let t = text
    while (t && ctx.measureText(t + '…').width > width) t = t.slice(0, -1)
    return t + '…'
  }

  const png = () => canvas.toDataURL('image/png')

  /**
   * 대화 하나: 위에 상태, 가운데 프로젝트 글자(앱의 Alt+A·S·D… 순서), 아래에 프로젝트 이름. 한 프로젝트에 대화가 여럿이면 글자 뒤에 탭 번호
   * c: { status, background, projectName }, letter: 'A' · 'S2' …, blink: 실행 중 깜빡이는 칸을 켤지
   */
  function conversation(c, letter, blink) {
    // 턴은 끝났어도 백그라운드 작업(셸·모니터·하위 에이전트)이 돌면 BG RUNNING
    const bg = c.background > 0 && c.status !== 'running' && c.status !== 'waiting_approval' && c.status !== 'error'
    const s = bg ? 'running' : c.status
    const needs = s === 'waiting_approval'
    clear(needs ? R : K)
    const quiet = s === 'idle' || s === 'queued' || s === 'stopped'

    // 위: 상태 (가운데)
    const label = bg ? 'BG RUNNING' : LABEL[s] || s.toUpperCase()
    font(800, bg ? 21 : 24)
    const lw = ctx.measureText(label).width
    const mark = s === 'running' ? 22 : 0
    const x0 = (SIZE - lw - mark) / 2
    if (s === 'running' && blink) {
      ctx.fillStyle = R
      ctx.fillRect(x0, 22, 14, 20)
    }
    ctx.fillStyle = needs ? W : s === 'error' ? R : quiet ? DIM : W
    ctx.fillText(label, x0 + mark, 42)

    // 구분선
    ctx.fillStyle = needs ? W : s === 'error' ? R : '#2a2a2a'
    ctx.fillRect(16, 58, SIZE - 32, 3)

    // 가운데: 글자
    const main = letter.charAt(0)
    const sub = letter.slice(1)
    ctx.fillStyle = quiet ? DIM : W
    font(900, 92)
    const mw = ctx.measureText(main).width
    font(800, 34, MONO)
    const sw = sub ? ctx.measureText(sub).width + 6 : 0
    const cx = (SIZE - mw - sw) / 2
    font(900, 92)
    ctx.fillText(main, cx, 146)
    if (sub) {
      font(800, 34, MONO)
      ctx.fillStyle = needs ? W : DIM
      ctx.fillText(sub, cx + mw + 6, 146)
    }

    // 아래: 프로젝트 이름
    font(700, 19)
    ctx.textAlign = 'center'
    ctx.fillStyle = needs ? W : DIM
    ctx.fillText(fit(c.projectName || '', SIZE - 24), SIZE / 2, 182)
    return png()
  }

  /** 대화가 칸보다 많을 때 마지막 칸: 남은 대화 수와 그중 가장 급한 상태 */
  function overflow(count, status, slot) {
    const needs = status === 'waiting_approval'
    clear(needs ? R : K)
    font(700, 16, MONO)
    ctx.textAlign = 'right'
    ctx.fillStyle = needs ? W : DIM
    ctx.fillText(String(slot).padStart(2, '0'), SIZE - 14, 34)
    ctx.textAlign = 'center'
    ctx.fillStyle = W
    font(900, 64)
    ctx.fillText(`+${count}`, SIZE / 2, 118)
    font(800, 20)
    ctx.fillStyle = needs ? W : status === 'running' || status === 'error' ? R : DIM
    ctx.fillText(LABEL[status] || 'MORE', SIZE / 2, 160)
    return png()
  }

  /** 대화가 없는 칸 */
  /** 보여 줄 대화가 없는 키. 대화 키와 같은 자리에 흐리게: 위 EMPTY · 가운데 순번 · 아래 빈 자리 */
  function empty(slot) {
    clear(K)
    ctx.textAlign = 'center'
    font(800, 24)
    ctx.fillStyle = DIM
    ctx.fillText('EMPTY', SIZE / 2, 42)
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(16, 58, SIZE - 32, 3)
    font(900, 72, MONO)
    ctx.fillStyle = '#4a4a4a'
    ctx.fillText(String(slot).padStart(2, '0'), SIZE / 2, 142)
    font(700, 19)
    ctx.fillStyle = DIM
    ctx.fillText('빈 자리', SIZE / 2, 182)
    return png()
  }

  /**
   * 분할창: 창 두 칸을 그린다. 켜져 있으면 칸마다 그 대화의 프로젝트 글자(키를 받는 창은 흰 칸·검은 글자),
   * 꺼져 있으면 한 칸에 OFF. 앱 창이 좁아 나눌 수 없으면 흐리게 NARROW
   * info: { on, roomy, panes: [{ conversationId, active }] } | null (앱이 아직 안 알려 줌), letters: 대화 ID → 'A' · 'S2'
   */
  function split(info, letters) {
    clear(K)
    const on = !!(info && info.on && info.panes.length === 2)
    const narrow = !!info && !info.roomy && !on
    ctx.textAlign = 'center'
    font(800, 24)
    ctx.fillStyle = on ? W : DIM
    ctx.fillText('SPLIT', SIZE / 2, 42)
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(16, 58, SIZE - 32, 3)
    const top = 74
    const h = 82
    if (on) {
      const gap = 8
      const w = (SIZE - 32 - gap) / 2
      info.panes.forEach((p, i) => {
        const x = 16 + i * (w + gap)
        if (p.active) {
          ctx.fillStyle = W
          ctx.fillRect(x, top, w, h)
        } else {
          ctx.strokeStyle = DIM
          ctx.lineWidth = 4
          ctx.strokeRect(x + 2, top + 2, w - 4, h - 4)
        }
        const letter = letters.get(p.conversationId) || '?'
        font(900, letter.length > 1 ? 40 : 56)
        ctx.fillStyle = p.active ? K : W
        ctx.fillText(fit(letter, w - 12), x + w / 2, top + h / 2 + (letter.length > 1 ? 14 : 20))
      })
    } else {
      ctx.strokeStyle = narrow ? '#3a3a3a' : DIM
      ctx.lineWidth = 4
      ctx.strokeRect(18, top + 2, SIZE - 36, h - 4)
      font(800, 26)
      ctx.fillStyle = narrow ? '#4a4a4a' : DIM
      ctx.fillText(narrow ? 'NARROW' : 'OFF', SIZE / 2, top + h / 2 + 9)
    }
    font(700, 19)
    ctx.fillStyle = DIM
    ctx.fillText(on ? '누르면 하나로' : narrow ? '창이 좁아요' : '누르면 나눠요', SIZE / 2, 182)
    return png()
  }

  /**
   * 앱 창 키: 위에 WINDOW, 가운데 창 그림(앞에 떠 있으면 흰 창, 다른 창 뒤면 외곽선, 트레이면 아래 막대만), 아래에 누르면 할 일.
   * w: { visible, focused } (예전 앱이라 모르면 undefined → 트레이로 본다)
   */
  function windowKey(w) {
    clear(K)
    const visible = !!(w && w.visible)
    const front = visible && !!w.focused
    ctx.textAlign = 'center'
    font(800, 24)
    ctx.fillStyle = front ? W : DIM
    ctx.fillText(front ? 'SHOWN' : visible ? 'BEHIND' : 'TRAY', SIZE / 2, 42)
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(16, 58, SIZE - 32, 3)
    const x = 40
    const y = 76
    const w0 = SIZE - 80
    const h = 64
    if (front) {
      ctx.fillStyle = W
      ctx.fillRect(x, y, w0, h)
      ctx.fillStyle = R
      ctx.fillRect(x, y, w0, 10)
    } else if (visible) {
      ctx.strokeStyle = W
      ctx.lineWidth = 5
      ctx.strokeRect(x + 3, y + 3, w0 - 6, h - 6)
    } else {
      ctx.strokeStyle = '#3a3a3a'
      ctx.lineWidth = 4
      ctx.setLineDash([10, 8])
      ctx.strokeRect(x + 2, y + 2, w0 - 4, h - 4)
      ctx.setLineDash([])
      ctx.fillStyle = W
      ctx.fillRect(x + 16, y + h + 6, w0 - 32, 6)
    }
    font(700, 19)
    ctx.fillStyle = DIM
    ctx.fillText(front ? '누르면 숨겨요' : '누르면 열어요', SIZE / 2, 182)
    return png()
  }

  /** 앱에 연결하지 못함 */
  function offline() {
    clear(K)
    ctx.strokeStyle = DIM
    ctx.lineWidth = 10
    ctx.lineCap = 'square'
    ctx.beginPath()
    ctx.moveTo(60, 62)
    ctx.lineTo(96, 96)
    ctx.lineTo(60, 130)
    ctx.stroke()
    ctx.fillStyle = R
    ctx.fillRect(108, 122, 34, 12)
    font(800, 18)
    ctx.textAlign = 'center'
    ctx.fillStyle = DIM
    ctx.fillText('OFFLINE', SIZE / 2, 172)
    return png()
  }

  function bar(y, label, w) {
    const p = w && w.percent != null ? Math.max(0, Math.min(100, w.percent)) : null
    const hot = p != null && (p >= 80 || w.status === 'rejected')
    font(800, 18)
    ctx.fillStyle = DIM
    ctx.textAlign = 'left'
    ctx.fillText(label, 16, y)
    font(800, 30, MONO)
    ctx.textAlign = 'right'
    ctx.fillStyle = hot ? R : W
    ctx.fillText(p == null ? '--' : `${p}%`, SIZE - 16, y + 2)
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(16, y + 12, SIZE - 32, 12)
    if (p != null) {
      ctx.fillStyle = hot ? R : W
      ctx.fillRect(16, y + 12, Math.round(((SIZE - 32) * p) / 100), 12)
    }
  }

  function hhmm(ms) {
    const d = new Date(ms)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  /** 사용량: 5시간·주간 막대와 5시간 창이 초기화되는 시각 */
  function usage(u, counts) {
    clear(K)
    font(800, 18)
    ctx.fillStyle = W
    ctx.fillText('USAGE', 16, 34)
    if (u && u.plan) {
      font(700, 15, MONO)
      ctx.textAlign = 'right'
      ctx.fillStyle = DIM
      ctx.fillText(String(u.plan).toUpperCase(), SIZE - 16, 33)
      ctx.textAlign = 'left'
    }
    if (!u || !u.available) {
      font(700, 18)
      ctx.fillStyle = DIM
      ctx.fillText(u ? '구독 한도 없음' : '불러오는 중…', 16, 104)
    } else {
      const five = u.windows.find((w) => w.id === 'five_hour')
      const week = u.windows.find((w) => w.id === 'seven_day')
      bar(76, '5H', five)
      bar(132, 'WEEK', week)
    }
    // 맨 아래: 5시간 초기화 시각 · 도는 대화 수
    ctx.fillStyle = DIM
    font(700, 16, MONO)
    ctx.textAlign = 'left'
    const five = u && u.windows ? u.windows.find((w) => w.id === 'five_hour') : null
    if (five && five.resetsAt) ctx.fillText(`↻ ${hhmm(five.resetsAt)}`, 16, 184)
    if (counts && (counts.running || counts.waiting)) {
      ctx.textAlign = 'right'
      ctx.fillStyle = counts.waiting ? R : W
      ctx.fillText(counts.waiting ? `! ${counts.waiting}` : `▶ ${counts.running}`, SIZE - 16, 184)
    }
    return png()
  }

  /** 하루 안이면 '17:40', 그 뒤면 '11/12 목' */
  function resetText(ms) {
    if (ms - Date.now() < 24 * 3600e3) return hhmm(ms)
    const d = new Date(ms)
    return `${d.getMonth() + 1}/${d.getDate()} ${'일월화수목금토'[d.getDay()]}`
  }

  /** 사용량 키를 여러 개 놓았을 때 한 키에 한도 하나: 이름 · 큰 사용률 · 막대 · 초기화 시각 */
  function usageOne(w, label) {
    clear(K)
    const p = w && w.percent != null ? Math.max(0, Math.min(100, w.percent)) : null
    const hot = p != null && (p >= 80 || w.status === 'rejected')
    font(800, 20)
    ctx.fillStyle = DIM
    ctx.textAlign = 'center'
    ctx.fillText(fit(label, SIZE - 24), SIZE / 2, 36)
    font(900, 58, MONO)
    ctx.fillStyle = hot ? R : W
    ctx.fillText(p == null ? '--' : `${p}%`, SIZE / 2, 112)
    ctx.fillStyle = '#2a2a2a'
    ctx.fillRect(16, 128, SIZE - 32, 14)
    if (p != null) {
      ctx.fillStyle = hot ? R : W
      ctx.fillRect(16, 128, Math.round(((SIZE - 32) * p) / 100), 14)
    }
    if (w && w.resetsAt) {
      font(700, 18, MONO)
      ctx.fillStyle = DIM
      ctx.fillText(`↻ ${resetText(w.resetsAt)}`, SIZE / 2, 180)
    }
    return png()
  }

  return { conversation, overflow, empty, offline, usage, usageOne, split, windowKey, SIZE }
})()
