import { expect, test } from './fixtures'

test.use({ seed: { projects: [{ name: 'alpha' }], settings: { skin: 'zen', theme: 'zen-paper' } } })

test('zen: 승인창의 도구 입력은 접혀 있고 글자 토글로 펼친다', async ({ app, win }) => {
  await win.keyboard.press('Alt+KeyA')
  await expect(win.locator('#composer-input')).toBeVisible()
  await app.evaluate(({ BrowserWindow }) => {
    const send = (event: unknown): void => BrowserWindow.getAllWindows()[0].webContents.send('agent:event', { projectId: 'p1', conversationId: 'c1', event })
    send({ kind: 'status', status: 'running' })
    send({ kind: 'permission_request', request: { requestId: 'r1', toolName: 'Bash', input: { command: 'npm test -- auth' } } })
  })
  const box = win.locator('.permission')
  await expect(box).toBeVisible()
  const pre = box.locator('pre')
  const toggle = box.locator('.permission-input-toggle')
  await expect(pre).toBeHidden()
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(pre).toBeVisible()
  await expect(pre).toContainText('npm test -- auth')
  await toggle.click()
  await expect(pre).toBeHidden()
})

test('다른 스킨은 승인창의 도구 입력이 늘 보이고 토글이 없다', async ({ app, win }) => {
  await win.keyboard.press('Alt+KeyA')
  await expect(win.locator('#composer-input')).toBeVisible()
  await win.evaluate(async () => {
    const w = window as unknown as { api: { initialSettings: object; setSettings: (s: object) => Promise<unknown> } }
    await w.api.setSettings({ ...w.api.initialSettings, skin: 'poster', theme: 'poster' })
  })
  await app.evaluate(({ BrowserWindow }) => {
    const send = (event: unknown): void => BrowserWindow.getAllWindows()[0].webContents.send('agent:event', { projectId: 'p1', conversationId: 'c1', event })
    send({ kind: 'status', status: 'running' })
    send({ kind: 'permission_request', request: { requestId: 'r1', toolName: 'Bash', input: { command: 'npm test -- auth' } } })
  })
  await expect(win.locator('.permission pre')).toBeVisible()
  await expect(win.locator('.permission-input-toggle')).toBeHidden()
})
