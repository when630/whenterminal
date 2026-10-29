import { expect, test } from './fixtures'

/** 메인이 렌더러로 보내는 대화 이벤트를 흉내 낸다 (모델을 부르지 않는다) */
async function emit(app: import('@playwright/test').ElectronApplication, event: Record<string, unknown>): Promise<void> {
  await app.evaluate(({ BrowserWindow }, e) => {
    BrowserWindow.getAllWindows()[0].webContents.send('agent:event', { projectId: 'p1', conversationId: 'c1', event: e })
  }, event)
}

const gap = (win: import('@playwright/test').Page): Promise<number> =>
  win.locator('.transcript').evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight)

test('답이 길어지면 맨 아래를 따라가고, 위로 올리면 멈추고 LATEST 버튼으로 다시 내려간다', async ({ app, win }) => {
  await win.keyboard.press('Alt+KeyA')
  await expect(win.locator('#composer-input')).toBeVisible()
  const long = Array.from({ length: 30 }, (_, i) => `줄 ${i + 1}`).join('\n\n')
  // 앞선 대화가 화면을 넘게 쌓여 있고, 긴 메시지를 보내 부드럽게 내려가는 도중에 답이 오기 시작한다
  await emit(app, { kind: 'assistant_text', text: long })
  await expect.poll(() => gap(win)).toBeLessThan(4)
  await emit(app, { kind: 'user', text: long })
  await emit(app, { kind: 'status', status: 'running' })
  await win.waitForTimeout(80)
  // 글자가 조금씩 늘어나도 맨 아래를 따라간다
  for (let i = 0; i < 40; i++) {
    await emit(app, { kind: 'text_delta', text: `답 ${i + 1}\n\n` })
    await win.waitForTimeout(20)
  }
  await expect.poll(() => gap(win)).toBeLessThan(4)
  await expect(win.locator('.to-bottom button')).toHaveCount(0)

  // 위로 올리면 따라가지 않고 버튼이 보인다
  await win.locator('.transcript').hover()
  await win.mouse.wheel(0, -1200)
  await expect(win.locator('.to-bottom button')).toBeVisible()
  const before = await win.locator('.transcript').evaluate((el) => el.scrollTop)
  for (let i = 0; i < 10; i++) await emit(app, { kind: 'text_delta', text: `더 ${i + 1}\n\n` })
  await win.waitForTimeout(200)
  expect(Math.abs((await win.locator('.transcript').evaluate((el) => el.scrollTop)) - before)).toBeLessThan(4)
  await win.screenshot({ path: test.info().outputPath('away.png') })

  // 버튼을 누르면 맨 아래로, 다시 따라간다
  await win.locator('.to-bottom button').click()
  await expect.poll(() => gap(win)).toBeLessThan(4)
  await expect(win.locator('.to-bottom button')).toHaveCount(0)
  for (let i = 0; i < 10; i++) await emit(app, { kind: 'text_delta', text: `끝 ${i + 1}\n\n` })
  await expect.poll(() => gap(win)).toBeLessThan(4)

  // 단축키로도 맨 아래로
  await win.mouse.wheel(0, -1200)
  await expect(win.locator('.to-bottom button')).toBeVisible()
  await win.keyboard.press('Control+Shift+KeyG')
  await expect.poll(() => gap(win)).toBeLessThan(4)
  await expect(win.locator('.to-bottom button')).toHaveCount(0)

  // 위로 올린 채 메시지를 보내면 다시 따라간다
  await win.mouse.wheel(0, -1200)
  await expect(win.locator('.to-bottom button')).toBeVisible()
  await emit(app, { kind: 'user', text: long })
  await emit(app, { kind: 'text_delta', text: '새 답' })
  await expect.poll(() => gap(win)).toBeLessThan(4)
  await expect(win.locator('.to-bottom button')).toHaveCount(0)
})
