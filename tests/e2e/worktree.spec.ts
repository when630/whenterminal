import { execSync } from 'node:child_process'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from './fixtures'

test.use({ seed: { projects: [{ name: 'repo', git: true, files: { 'a.txt': 'hello\n' } }, { name: 'plain' }] } })

const wtOf = (userData: string) =>
  JSON.parse(readFileSync(join(userData, 'projects.json'), 'utf8'))[0].conversations.find((c: { worktree?: unknown; closedAt?: number }) => c.worktree && !c.closedAt)

test('작업 공간 탭은 worktree에서: 변경 보기·합치기·충돌·버리기', async ({ win, env }) => {
  const repo = env.path('repo')
  await win.keyboard.press('Alt+KeyA')
  await win.locator('.tab.add-wt').click()
  await expect.poll(() => wtOf(env.userData)?.worktree?.path).toBeTruthy()
  const wt = wtOf(env.userData).worktree as { path: string; branch: string }
  await expect(win.locator('.tab.active .wt-tag')).toHaveText('WT')

  appendFileSync(join(wt.path, 'a.txt'), 'from worktree\n')
  writeFileSync(join(wt.path, 'new.md'), '# new\n')
  expect(wt.branch).toMatch(/^worktree-/)
  // 변경이 있는 작업 공간 탭은 닫기 확인이 UNMERGED?이고 안내가 뜬다 (한 번만 눌러 닫지 않는다)
  await win.locator('.tab-wrap.active .tab-x').click()
  await expect(win.locator('.tab-x.unmerged')).toHaveText('UNMERGED?')
  await expect(win.locator('.side-flash')).toContainText('커밋하지 않은 변경')
  await win.locator('.tb-btn', { hasText: 'CHANGES' }).click()
  await expect(win.locator('.wt-files li')).toHaveCount(2)

  await win.locator('.wt-actions .btn-pri').click()
  await expect(win.locator('.wt-msg.ok')).toContainText('합쳤어요')
  expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('hello\nfrom worktree\n')
  expect(existsSync(join(repo, 'new.md'))).toBe(true)

  // 같은 줄을 양쪽에서 다르게 고치면 충돌: 병합을 되돌리고 알린다
  writeFileSync(join(repo, 'a.txt'), 'main side\n')
  execSync('git commit -qam main-edit', { cwd: repo })
  writeFileSync(join(wt.path, 'a.txt'), 'worktree side\n')
  await win.locator('.wt-actions .btn', { hasText: 'REFRESH' }).click()
  await win.locator('.wt-actions .btn-pri').click()
  await expect(win.locator('.wt-msg.bad')).toContainText('CONFLICT')
  expect(execSync('git status --porcelain', { cwd: repo }).toString().trim()).toBe('')

  // 작업 공간이 병합 중(UPDATE 충돌, 모델을 부르지 않게 git으로 직접)이면 CONFLICT 줄이 뜨고 합치기를 막는다. ABORT로 되돌린다
  const main = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repo }).toString().trim()
  try {
    execSync(`git -c merge.ff=true merge --no-edit ${main}`, { cwd: wt.path, stdio: 'ignore' })
  } catch {
    // 충돌하면 종료 코드 1
  }
  await win.locator('.wt-actions .btn', { hasText: 'REFRESH' }).click()
  await expect(win.locator('.wt-conflict')).toContainText('a.txt')
  await expect(win.locator('.wt-actions .btn-pri')).toBeDisabled()
  await win.locator('.wt-conflict .btn', { hasText: 'ABORT' }).click()
  await expect(win.locator('.wt-conflict')).toHaveCount(0)

  await win.locator('.wt-actions .btn', { hasText: 'DISCARD' }).click()
  await win.locator('.wt-actions .btn.armed').click()
  await expect(win.locator('.wt-panel')).toHaveCount(0)
  expect(existsSync(wt.path)).toBe(false)
  expect(execSync(`git branch --list ${wt.branch}`, { cwd: repo }).toString().trim()).toBe('')
})

test('일반 탭(+·Ctrl+T)은 프로젝트 폴더에서, 작업 공간 탭(Ctrl+Shift+T)은 worktree에서', async ({ win, env }) => {
  await win.keyboard.press('Alt+KeyA')
  await win.locator('#composer-input').click()
  await win.keyboard.press('Control+t')
  await expect(win.locator('.tab-wrap')).toHaveCount(2)
  await win.locator('.tab.add').first().click()
  await expect(win.locator('.tab-wrap')).toHaveCount(3)
  expect(wtOf(env.userData)).toBeUndefined()
  await win.locator('#composer-input').click()
  await win.keyboard.press('Control+Shift+t')
  await expect(win.locator('.tab-wrap')).toHaveCount(4)
  await expect.poll(() => wtOf(env.userData)?.worktree?.path).toBeTruthy()
  await expect(win.locator('.tb-wt .wt-tag')).toHaveText('WORKTREE')

  // +WT 옆 ▾: 시작점 목록 (새 브랜치의 기준 · 탭에 안 열린 worktree). 기준 브랜치를 고르면 작업 공간 탭이 하나 더
  await win.locator('.add-wt-more').click()
  const list = win.locator('.wt-pick-list')
  await expect(list).toContainText('NEW FROM')
  await list.locator('.model-row').first().click()
  await expect(win.locator('.tab-wrap')).toHaveCount(5)
  await expect(list).toHaveCount(0)
})

test('git이 아닌 폴더: +WT가 없고, 작업 공간 탭 키는 안내만', async ({ win }) => {
  await win.keyboard.press('Alt+KeyS')
  await expect(win.locator('.tab.add-wt')).toHaveCount(0)
  await win.locator('#composer-input').click()
  await win.keyboard.press('Control+Shift+t')
  await expect(win.locator('.side-flash')).toContainText('git 저장소가 아니라')
  await expect(win.locator('.tab-wrap')).toHaveCount(1)
  // 일반 탭은 그대로 열리고 플랜 모드로 바꾸지 않는다
  await win.locator('.tab.add').click()
  await expect(win.locator('.tab-wrap')).toHaveCount(2)
  await expect(win.locator('.meta-mode .meta-v')).not.toHaveText('PLAN')
})
