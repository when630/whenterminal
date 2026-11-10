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

test('분할창: 켜면 바로 앞에 본 대화가 옆 창에, 키로 창을 옮기고, 옆 창의 확인 요청은 테두리로, Shift+클릭은 옆 창에 연다', async ({ app, win }) => {
  const screens = win.locator('.stage > .screen')
  const pane = (id: string): import('@playwright/test').Locator => win.locator(`.stage > .screen[data-conversation-id="${id}"]`)

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

test.describe('대화가 하나뿐일 때', () => {
  test.use({ seed: { projects: [{ name: 'solo' }] } })

  test('분할창: 옆 창에 띄울 대화가 없으면 나누지 않고 안내한다', async ({ win }) => {
    await win.keyboard.press('Alt+a')
    await expect(win.locator('.stage > .screen')).toHaveCount(1)
    await win.keyboard.press('Control+Alt+v')
    await expect(win.locator('.side-flash')).toContainText('옆 창에 띄울 대화가 없어요')
    await expect(win.locator('.stage > .screen')).toHaveCount(1)
  })
})
