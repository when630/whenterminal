import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, makeEnv, quit, test } from './fixtures'

/**
 * 구독 계정 오가기: 가짜 설정 폴더(CLAUDE_CONFIG_DIR)에 로그인 두 개를 차례로 흉내 내고, 앱이 둘 다 보관했다가 바꿔 끼우는지 본다.
 * 실제 ~/.claude는 건드리지 않는다 (모델도 부르지 않음)
 */
test('로그인한 계정을 보관하고 명령 팔레트에서 바꿔 끼운다', async () => {
  test.setTimeout(60_000)
  const env = makeEnv({ projects: [{ name: 'alpha' }] })
  const config = join(env.root, 'claude-config')
  mkdirSync(config, { recursive: true })
  const creds = join(config, '.credentials.json')
  const global = join(config, '.claude.json')
  const login = (n: string): void => {
    writeFileSync(creds, JSON.stringify({ claudeAiOauth: { accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresAt: Date.now() + 3_600_000 } }))
    const prev = existsSync(global) ? JSON.parse(readFileSync(global, 'utf8')) : { keep: 'me' }
    writeFileSync(global, JSON.stringify({ ...prev, oauthAccount: { accountUuid: `u-${n}`, organizationUuid: 'org', emailAddress: `${n}@test`, organizationName: 'Team', seatTier: 'premium' } }))
  }
  login('a')
  const { app, win, errors } = await env.launch({ CLAUDE_CONFIG_DIR: config })
  try {
    await expect.poll(() => win.evaluate(() => window.api.accounts().then((i) => i.list.map((a) => a.email)))).toEqual(['a@test'])

    // 앱 밖에서(터미널) b로 로그인: 잠잠해진 뒤 알아채고 보관한다
    login('b')
    await expect.poll(() => win.evaluate(() => window.api.accounts().then((i) => ({ current: i.current, list: i.list.map((a) => a.email) }))), { timeout: 15_000 }).toEqual({ current: 'u-b:org', list: ['a@test', 'b@test'] })

    // 팔레트에는 지금 계정이 아닌 a만
    await win.keyboard.press('Control+Shift+P')
    await win.keyboard.type('account')
    const row = win.locator('.pal-row', { hasText: 'Account · a@test' })
    await expect(row).toBeVisible()
    await expect(win.locator('.pal-row', { hasText: 'b@test' })).toHaveCount(0)
    await row.click()

    await expect.poll(() => JSON.parse(readFileSync(creds, 'utf8')).claudeAiOauth.accessToken).toBe('access-a')
    const after = JSON.parse(readFileSync(global, 'utf8'))
    expect(after.oauthAccount.emailAddress).toBe('a@test')
    // 전역 설정의 다른 값은 그대로
    expect(after.keep).toBe('me')
    expect(await win.evaluate(() => window.api.accounts().then((i) => i.current))).toBe('u-a:org')
    // 보관본은 암호화돼 있다
    expect(readFileSync(join(env.userData, 'accounts.json'), 'utf8')).not.toContain('access-')
    expect(errors).toEqual([])
  } finally {
    await quit(app)
  }
})
