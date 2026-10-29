import { expect, test } from './fixtures'

test.use({ seed: { projects: [{ name: 'alpha' }], settings: { skin: 'soft', theme: 'soft-light' } } })

test('soft: 컨텍스트는 원형 게이지, 입력창 보내기 버튼은 쓴 글이 있을 때만 눌리고 Enter와 같이 보낸다', async ({ app, win }) => {
  await win.keyboard.press('Alt+KeyA')
  const input = win.locator('#composer-input')
  await expect(input).toBeVisible()

  // 컨텍스트: 막대 대신 원형 게이지, 채운 정도는 --pct
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].webContents.send('agent:event', { projectId: 'p1', conversationId: 'c1', event: { kind: 'context', context: { percent: 61, tokens: 122000, max: 200000 } } })
  })
  const ring = win.locator('.ctx-ring')
  await expect(ring).toBeVisible()
  await expect(win.locator('.ctx-bar')).toBeHidden()
  await expect.poll(() => win.locator('.ctx').evaluate((el) => getComputedStyle(el).getPropertyValue('--pct').trim())).toBe('61')

  // 보내기: 비었으면 못 누르고, 쓰면 눌린다. 누르면 Enter와 같은 submit (앱이 처리하는 /files → 파일 찾기, 모델을 부르지 않는다)
  const send = win.getByRole('button', { name: '보내기' })
  await expect(send).toBeVisible()
  await expect(send).toBeDisabled()
  await input.fill('/files')
  await expect(send).toBeEnabled()
  await win.screenshot({ path: test.info().outputPath('soft-composer.png') })
  await send.click()
  await expect(win.locator('.overlay.files')).toBeVisible()
  await expect(input).toHaveValue('')
})

test('보내기 버튼·원형 게이지는 soft 스킨에만 보인다', async ({ win }) => {
  await win.keyboard.press('Alt+KeyA')
  await expect(win.locator('#composer-input')).toBeVisible()
  await win.evaluate(async () => {
    const w = window as unknown as { api: { initialSettings: object; setSettings: (s: object) => Promise<unknown> } }
    await w.api.setSettings({ ...w.api.initialSettings, skin: 'poster', theme: 'poster' })
  })
  await expect(win.getByRole('button', { name: '보내기' })).toBeHidden()
  await expect(win.locator('.ctx-ring')).toBeHidden()
})
