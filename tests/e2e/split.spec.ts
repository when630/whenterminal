import { expect, test } from './fixtures'

test.use({
  seed: {
    projects: [
      { name: 'alpha', git: true, conversations: [{ id: 'c1', title: '하나', mode: 'default' }, { id: 'c2', title: '둘', mode: 'default' }] },
      { name: 'beta', conversations: [{ id: 'c3', title: '셋', mode: 'default' }] },
    ],
  },
})

/** 메인이 렌더러로 보내는 대화 이벤트를 흉내 낸다 (모델을 부르지 않는다) */
async function emit(app: import('@playwright/test').ElectronApplication, projectId: string, conversationId: string, event: Record<string, unknown>): Promise<void> {
  await app.evaluate(({ BrowserWindow }, a) => {
    BrowserWindow.getAllWindows()[0].webContents.send('agent:event', a)
  }, { projectId, conversationId, event })
}

/** 창 크기 (기본 1280×820은 분할하기에 좁다) */
async function size(app: import('@playwright/test').ElectronApplication, win: import('@playwright/test').Page, w: number, h: number): Promise<void> {
  await app.evaluate(({ BrowserWindow }, [w, h]) => {
    const b = BrowserWindow.getAllWindows()[0]
    b.unmaximize()
    b.setSize(w, h)
  }, [w, h])
  await expect.poll(() => win.evaluate(() => innerWidth)).toBe(w)
}

test('분할창: 켜면 바로 앞에 본 대화가 옆 창에, 키로 창을 옮기고, 옆 창의 확인 요청은 테두리로, Shift+클릭은 옆 창에 연다', async ({ app, win }) => {
  const screens = win.locator('.stage > .screen')
  const pane = (id: string): import('@playwright/test').Locator => win.locator(`.stage > .screen[data-conversation-id="${id}"]`)
  await size(app, win, 1920, 1080)

  await win.keyboard.press('Alt+a')
  await expect(pane('c1')).toBeVisible()
  await win.keyboard.press('Alt+s')
  await expect(pane('c3')).toBeVisible()

  // 켜기: 지금 대화(c3)가 왼쪽 활성 창, 바로 앞에 본 c1이 오른쪽 옆 창
  await win.keyboard.press('Control+Alt+v')
  await expect(screens).toHaveCount(2)
  await expect(screens.nth(0)).toHaveAttribute('data-conversation-id', 'c3')
  await expect(pane('c3')).toHaveClass(/pane-active/)
  await expect(pane('c1')).toHaveClass(/pane-idle/)
  // 입력창 ID·포커스는 활성 창에만
  await expect(win.locator('#composer-input')).toHaveCount(1)
  await expect(pane('c3').locator('#composer-input')).toHaveCount(1)
  await expect.poll(() => win.evaluate(() => document.activeElement?.id)).toBe('composer-input')
  // 사이드바: 옆 창의 프로젝트는 외곽선
  await expect(win.locator('.side .nav.pane-other')).toContainText('alpha')

  // 오른쪽 창으로: 자리는 그대로, 활성만 옮긴다
  await win.keyboard.press('Control+Alt+l')
  await expect(pane('c1')).toHaveClass(/pane-active/)
  await expect(screens.nth(0)).toHaveAttribute('data-conversation-id', 'c3')
  await expect(pane('c1').locator('#composer-input')).toHaveCount(1)

  // 옆 창(c3)에 확인 요청: 그 창 둘레를 신호색으로, 활성 창에는 그 프로젝트의 NEEDS YOU 배지를 띄우지 않는다
  await emit(app, 'p2', 'c3', { kind: 'status', status: 'waiting_approval' })
  await emit(app, 'p2', 'c3', { kind: 'permission_request', request: { requestId: 'r1', toolName: 'Bash', input: { command: 'ls' } } })
  await expect(pane('c3')).toHaveClass(/pane-ask/)
  await expect(pane('c1').locator('.badge.other')).toHaveCount(0)

  // ⌥S: beta가 옆 창에 있으니 그 창을 활성으로 (새로 띄우지 않는다)
  await win.keyboard.press('Alt+s')
  await expect(pane('c3')).toHaveClass(/pane-active/)
  await expect(pane('c3')).not.toHaveClass(/pane-ask/)
  await expect(screens).toHaveCount(2)
  await emit(app, 'p2', 'c3', { kind: 'permission_resolved', requestId: 'r1' })
  await emit(app, 'p2', 'c3', { kind: 'status', status: 'idle' })

  // 옆 창(c1)을 누르면 그 창이 활성. 그 창 탭 줄의 '둘'을 Shift+클릭하면 옆 창에 열린다 → 같은 폴더
  await pane('c1').locator('.transcript, .placeholder').first().click()
  await expect(pane('c1')).toHaveClass(/pane-active/)
  await pane('c1').locator('.tab', { hasText: '둘' }).click({ modifiers: ['Shift'] })
  await expect(pane('c2')).toHaveClass(/pane-idle/)
  await expect(pane('c3')).toHaveCount(0)
  await expect(win.locator('.same-folder')).toHaveCount(2)
  // 활성 창 탭 줄에서 옆 창에 떠 있는 탭은 외곽선, 누르면 그 창으로
  await expect(pane('c1').locator('.tab.elsewhere')).toContainText('둘')
  await pane('c1').locator('.tab.elsewhere').click()
  await expect(pane('c2')).toHaveClass(/pane-active/)
  await expect(screens).toHaveCount(2)

  // 끄기: 활성 창만 남고 입력창으로
  await win.keyboard.press('Control+Alt+v')
  await expect(screens).toHaveCount(1)
  await expect(pane('c2')).toBeVisible()
  await expect.poll(() => win.evaluate(() => document.activeElement?.id)).toBe('composer-input')
})

test('분할창: 좁은 창에서는 나누지 않고, 분할 중에 좁아지면 활성 창만, 넓히면 돌아온다. 경계를 끌어 폭을 바꾸고 팔레트로 옆 창에 연다', async ({ app, win }) => {
  const screens = win.locator('.stage > .screen')
  const pane = (id: string): import('@playwright/test').Locator => win.locator(`.stage > .screen[data-conversation-id="${id}"]`)

  // 1280 창: 켜지 않고 안내
  await win.keyboard.press('Alt+a')
  await expect(pane('c1')).toBeVisible()
  await win.keyboard.press('Control+Alt+v')
  await expect(win.locator('.side-flash')).toContainText('창이 좁아서')
  await expect(screens).toHaveCount(1)

  // 넓히면 나뉜다. 다시 좁히면 활성 창만, 넓히면 옆 창이 돌아온다
  await size(app, win, 1920, 1080)
  // 폭 판정(ResizeObserver)은 창 크기가 바뀐 뒤 한 박자 늦게 갱신된다. 그 전에 누르면 아직 좁다는 안내만 나온다
  await expect(async () => {
    await win.keyboard.press('Control+Alt+v')
    await expect(screens).toHaveCount(2, { timeout: 1000 })
  }).toPass()
  await size(app, win, 1280, 820)
  await expect(screens).toHaveCount(1)
  await expect(pane('c1')).toBeVisible()
  await size(app, win, 1920, 1080)
  await expect(screens).toHaveCount(2)

  // 경계를 오른쪽으로 끌면 왼쪽 창이 넓어지고, 한 창은 480px 아래로 줄지 않는다
  const handle = win.locator('.split-handle')
  const hb = (await handle.boundingBox())!
  const y = hb.y + hb.height / 2
  await win.mouse.move(hb.x + hb.width / 2, y)
  await win.mouse.down()
  await win.mouse.move(1900, y, { steps: 6 })
  await win.mouse.up()
  const left = (await screens.nth(0).boundingBox())!
  const right = (await screens.nth(1).boundingBox())!
  expect(left.width).toBeGreaterThan(right.width)
  expect(right.width).toBeGreaterThanOrEqual(479)
  // 더블클릭하면 반반
  await handle.dblclick()
  await expect.poll(async () => Math.round((await screens.nth(0).boundingBox())!.width - (await screens.nth(1).boundingBox())!.width)).toBeLessThan(8)

  // 팔레트: Open beside · 셋 → 옆 창에 c3
  await win.keyboard.press('Control+Shift+p')
  await win.keyboard.type('Open beside 셋')
  await win.keyboard.press('Enter')
  await expect(pane('c3')).toHaveClass(/pane-idle/)
  await expect(pane('c1')).toHaveClass(/pane-active/)
})

test.describe('대화가 하나뿐일 때', () => {
  test.use({ seed: { projects: [{ name: 'solo' }] } })

  test('분할창: 옆 창에 띄울 대화가 없으면 나누지 않고 안내한다', async ({ app, win }) => {
    await size(app, win, 1920, 1080)
    await win.keyboard.press('Alt+a')
    await expect(win.locator('.stage > .screen')).toHaveCount(1)
    await win.keyboard.press('Control+Alt+v')
    await expect(win.locator('.side-flash')).toContainText('옆 창에 띄울 대화가 없어요')
    await expect(win.locator('.stage > .screen')).toHaveCount(1)
  })
})
