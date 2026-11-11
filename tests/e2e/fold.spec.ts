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

test('답변 글 사이의 도구·훅·생각은 한 줄 묶음으로: 도는 동안 끝 3줄만, 다음 글이 오면 접히고, 훅은 도구 줄 안에, Ctrl+Shift+D로 모두 펼친다', async ({ app, win }) => {
  await win.keyboard.press('Alt+KeyA')
  await expect(win.locator('#composer-input')).toBeVisible()
  await emit(app, { kind: 'user', text: '세션 끊김 원인 찾기' })
  await emit(app, { kind: 'status', status: 'running' })
  await emit(app, { kind: 'thinking', text: '먼저 세션 코드를 읽어 볼게요' })
  const tools = ['t1', 't2', 't3', 't4', 't5']
  for (const [i, id] of tools.entries()) {
    await emit(app, { kind: 'tool_use', toolUseId: id, name: i % 2 ? 'Grep' : 'Read', input: i % 2 ? { pattern: `p${i}` } : { file_path: `src/f${i}.ts` } })
    // 도구에 딸린 훅은 줄 대신 도구 줄 안에
    await emit(app, { kind: 'hook', hookId: `h${i}`, name: `PreToolUse:${id}`, event: 'PreToolUse', phase: 'done', outcome: i === 1 ? 'error' : 'success', exitCode: i === 1 ? 2 : undefined, output: i === 1 ? 'blocked by hook' : undefined })
    if (i < 4) await emit(app, { kind: 'tool_result', toolUseId: id, content: 'ok', isError: false })
  }

  const group = win.locator('details.tgroup')
  await expect(group).toHaveCount(1)
  await expect(group).toHaveAttribute('open', '')
  await expect(win.locator('details.hook')).toHaveCount(0)
  await expect(group.locator('.tgroup-k')).toHaveText('TOOLS')
  await expect(group.locator('.tgroup-n')).toHaveText('5')
  await expect(group.locator('.tgroup-s')).toHaveText('READ 3 · GREP 2')
  await expect(group.locator('> summary .tool-st')).toHaveText('RUNNING')
  // 도는 동안 끝 3줄(t3·t4·t5)과 오류 훅이 걸린 t2만 보이고 생각·t1은 +2 EARLIER로 접힌다
  await expect(win.locator('[data-tool-id="t5"]')).toBeVisible()
  await expect(win.locator('[data-tool-id="t3"]')).toBeVisible()
  await expect(win.locator('[data-tool-id="t2"]')).toBeVisible()
  await expect(win.locator('[data-tool-id="t1"]')).toBeHidden()
  await expect(group.locator('.thinking')).toBeHidden()
  await expect(group.locator('.tgroup-more')).toHaveText('+2 EARLIER')
  await expect(win.locator('[data-tool-id="t2"] .tool-hook')).toHaveText(' · HOOK ERROR 1')
  await expect(win.locator('[data-tool-id="t2"] .tool-hook')).toHaveClass(/error/)
  await expect(win.locator('[data-tool-id="t3"] .tool-hook')).toHaveText(' · HOOK 1')
  await win.screenshot({ path: test.info().outputPath('live.png') })
  await group.locator('.tgroup-more').click()
  await expect(win.locator('[data-tool-id="t1"]')).toBeVisible()
  await expect(group.locator('.tgroup-more')).toHaveCount(0)
  // 훅 출력은 도구 줄을 펼치면
  await win.locator('[data-tool-id="t2"] > summary').click()
  await expect(win.locator('[data-tool-id="t2"] .tool-hooks')).toContainText('blocked by hook')

  // 다음 글이 오면 묶음이 접히고 글이 그 아래에. 오류 훅이 있으면 펼친 채로 → 오류 없는 묶음으로 확인
  await emit(app, { kind: 'tool_result', toolUseId: 't5', content: 'ok', isError: false })
  await emit(app, { kind: 'assistant_text', text: '원인을 찾았어요. 이제 고칠게요.' })
  await expect(group).toHaveAttribute('open', '') // 오류(훅)가 있는 묶음은 접지 않는다
  await emit(app, { kind: 'tool_use', toolUseId: 'e1', name: 'Edit', input: { file_path: 'src/auth/session.ts', old_string: 'a', new_string: 'b' } })
  await emit(app, { kind: 'tool_result', toolUseId: 'e1', content: 'ok', isError: false })
  await emit(app, { kind: 'tool_use', toolUseId: 'e2', name: 'Bash', input: { command: 'npm test' } })
  await emit(app, { kind: 'tool_summary', summary: 'Edited session.ts and ran tests', toolUseIds: ['e1', 'e2'] })
  const second = win.locator('details.tgroup').nth(1)
  await expect(second).toHaveAttribute('open', '')
  // CLI 요약이 오면 그게 묶음 이름 (요약은 따로 줄을 두지 않는다)
  await expect(second.locator('.tgroup-s')).toHaveText('Edited session.ts and ran tests')
  await expect(win.locator('.tsum')).toHaveCount(0)
  await emit(app, { kind: 'tool_result', toolUseId: 'e2', content: 'pass', isError: false })
  await emit(app, { kind: 'assistant_text', text: '테스트가 통과했어요.' })
  await expect(second).not.toHaveAttribute('open', '')
  await expect(second.locator('> summary .tool-st')).toHaveText('DONE')
  await expect(win.locator('.msg.assistant', { hasText: '원인을 찾았어요' })).toBeVisible()
  await expect(win.locator('.msg.assistant', { hasText: '테스트가 통과했어요' })).toBeVisible()

  // 도구 하나만이면 묶지 않고 그 줄 그대로
  await emit(app, { kind: 'tool_use', toolUseId: 's1', name: 'Read', input: { file_path: 'README.md' } })
  await emit(app, { kind: 'tool_result', toolUseId: 's1', content: 'ok', isError: false })
  await expect(win.locator('.transcript > details.tool[data-tool-id="s1"]')).toBeVisible()
  await expect(win.locator('details.tgroup')).toHaveCount(2)

  // Ctrl+Shift+D: 모두 펼치기 ↔ 평소대로
  await win.keyboard.press('Control+Shift+KeyD')
  await expect(second).toHaveAttribute('open', '')
  await expect(win.locator('[data-tool-id="e1"]')).toBeVisible()
  await win.screenshot({ path: test.info().outputPath('expanded.png') })
  await win.keyboard.press('Control+Shift+KeyD')
  await expect(second).not.toHaveAttribute('open', '')
  await emit(app, { kind: 'status', status: 'done' })
  await win.screenshot({ path: test.info().outputPath('done.png') })
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
