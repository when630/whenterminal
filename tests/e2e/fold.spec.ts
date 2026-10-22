import { expect, test } from './fixtures'

/** 메인이 렌더러로 보내는 대화 이벤트를 흉내 낸다 (모델을 부르지 않는다) */
async function emit(app: import('@playwright/test').ElectronApplication, event: Record<string, unknown>): Promise<void> {
  await app.evaluate(({ BrowserWindow }, e) => {
    BrowserWindow.getAllWindows()[0].webContents.send('agent:event', { projectId: 'p1', conversationId: 'c1', event: e })
  }, event)
}

test('백그라운드 에이전트의 긴 보고는 한 줄로 접고, 펼치면 본문을 보인다. 메인 답은 접지 않는다', async ({ app, win }) => {
  await win.keyboard.press('Alt+KeyA')
  await expect(win.locator('#composer-input')).toBeVisible()
  await emit(app, { kind: 'task_note', text: 'TASK DONE · Background command "sleep 5" completed (exit code 0)' })
  const report = ['조사를 마쳤어요.', '', '## 찾은 것', '', ...Array.from({ length: 30 }, (_, i) => `- 항목 ${i + 1}`)].join('\n')
  await emit(app, { kind: 'task_note', text: `TASK DONE · ${report}` })
  await emit(app, { kind: 'assistant_text', text: Array.from({ length: 80 }, (_, i) => `- 메인 답 ${i + 1}`).join('\n') })

  // 짧은 알림은 그대로 한 줄
  const short = win.locator('div.divider')
  await expect(short).toHaveCount(1)
  await expect(short).toContainText('sleep 5')

  // 긴 보고: 머리와 첫 줄만, 본문은 닫혀 있다
  const fold = win.locator('details.divider.fold')
  await expect(fold).toHaveCount(1)
  await expect(fold.locator('.divider-k')).toHaveText('■ TASK DONE')
  await expect(fold.locator('.divider-first')).toHaveText('조사를 마쳤어요.')
  await expect(fold.getByText('항목 30')).toBeHidden()
  expect((await fold.boundingBox())!.height).toBeLessThan(60)
  await fold.scrollIntoViewIfNeeded()
  await win.screenshot({ path: test.info().outputPath('folded.png') })

  await fold.locator('summary').click()
  await expect(fold.getByText('항목 30')).toBeVisible()
  await expect(fold.locator('.divider-body h2')).toHaveText('찾은 것')
  await win.screenshot({ path: test.info().outputPath('open.png') })

  // 메인 답은 길어도 다 보인다
  await expect(win.locator('.msg.assistant .answer-fold')).toHaveCount(0)
  await expect(win.getByText('메인 답 80')).toBeVisible()
})

test('작업 중에 보낸 메시지: 지금 턴에 끼워 넣으면 NEXT STEP(고치기·빼기 없음), 모델이 읽으면 표시가 떨어진다. 끝난 뒤 보내기는 NEXT·EDIT·CANCEL', async ({ app, win }) => {
  await win.keyboard.press('Alt+KeyA')
  await expect(win.locator('#composer-input')).toBeVisible()
  await emit(app, { kind: 'user', text: '처음 지시' })
  await emit(app, { kind: 'status', status: 'running' })
  await emit(app, { kind: 'user', text: '중간에 덧붙인 말', next: true, queuedId: 'q1', steer: true })
  await emit(app, { kind: 'user', text: '끝난 뒤에 할 일', next: true, queuedId: 'q2' })

  const steer = win.locator('.msg.user', { hasText: '중간에 덧붙인 말' })
  await expect(steer).toHaveClass(/pending/)
  await expect(steer.locator('.msg-wait')).toHaveText('NEXT STEP')
  await expect(steer.getByRole('button', { name: 'EDIT' })).toHaveCount(0)
  const after = win.locator('.msg.user', { hasText: '끝난 뒤에 할 일' })
  await expect(after.locator('.msg-wait')).toHaveText('NEXT')
  await expect(after.getByRole('button', { name: 'EDIT' })).toHaveCount(1)

  // 모델이 읽었다: 대기 표시가 떨어지고 작업은 그대로 이어진다
  await emit(app, { kind: 'folded', queuedId: 'q1' })
  await expect(steer).not.toHaveClass(/pending/)
  await expect(steer.locator('.msg-wait')).toHaveCount(0)
  await expect(after).toHaveClass(/pending/)
})
