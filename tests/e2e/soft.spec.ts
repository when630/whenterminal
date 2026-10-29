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

test('soft: 끝난 도구는 Done 글자 대신 초록 체크, 도는 중·오류는 글자 그대로', async ({ app, win }) => {
  await win.keyboard.press('Alt+KeyA')
  await expect(win.locator('#composer-input')).toBeVisible()
  const send = (e: Record<string, unknown>): Promise<void> =>
    app.evaluate(({ BrowserWindow }, ev) => BrowserWindow.getAllWindows()[0].webContents.send('agent:event', { projectId: 'p1', conversationId: 'c1', event: ev }), e)
  await send({ kind: 'user', text: '세션 끊김 원인 찾기' })
  await send({ kind: 'status', status: 'running' })
  await send({ kind: 'tool_use', toolUseId: 't1', name: 'Read', input: { file_path: 'src/auth/session.ts' } })
  await send({ kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false })
  await send({ kind: 'tool_use', toolUseId: 't2', name: 'Grep', input: { pattern: 'expiresAt' } })
  await send({ kind: 'tool_result', toolUseId: 't2', content: 'nope', isError: true })
  await send({ kind: 'tool_use', toolUseId: 't3', name: 'Bash', input: { command: 'npm test' } })

  const done = win.locator('.tool[data-tool-id="t1"] .tool-st')
  await expect(done).toHaveAttribute('data-state', 'done')
  await expect(done).toHaveText('DONE')
  const look = await done.evaluate((el) => { const s = getComputedStyle(el); return { size: s.fontSize, mask: s.maskImage || s.webkitMaskImage, w: el.getBoundingClientRect().width } })
  expect(look.size).toBe('0px')
  expect(look.mask).toContain('data:image/svg+xml')
  expect(look.w).toBeGreaterThan(10)
  await expect(win.locator('.tool[data-tool-id="t2"] .tool-st')).toHaveAttribute('data-state', 'error')
  await expect(win.locator('.tool[data-tool-id="t3"] .tool-st')).toHaveAttribute('data-state', 'run')
  expect(await win.locator('.tool[data-tool-id="t3"] .tool-st').evaluate((el) => getComputedStyle(el).fontSize)).not.toBe('0px')
  await win.screenshot({ path: test.info().outputPath('soft-tools.png') })
})

test('soft: 권한 모드는 다섯 칸 세그먼트로 바로 고른다 (누르면 다음 모드 버튼은 숨김)', async ({ win }) => {
  await win.keyboard.press('Alt+KeyA')
  await expect(win.locator('#composer-input')).toBeVisible()
  const seg = win.getByRole('radiogroup', { name: '권한 모드' })
  await expect(seg).toBeVisible()
  await expect(win.locator('.meta-mode')).toBeHidden()
  await expect(seg.getByRole('radio')).toHaveCount(5)
  await expect(seg.getByRole('radio', { checked: true })).toHaveText('ASK')
  await seg.getByRole('radio', { name: 'Plan' }).click()
  await expect(seg.getByRole('radio', { name: 'Plan' })).toHaveAttribute('aria-checked', 'true')
  await win.screenshot({ path: test.info().outputPath('soft-mode.png'), clip: { x: 230, y: 0, width: 1050, height: 80 } })
})
