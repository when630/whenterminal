import { expect, test } from './fixtures'

// 전역 호출 키로 끄기·Alt+F4는 창을 트레이로 숨긴다(hideWindow). 숨기기만 하면 Windows에서 포커스를 가진 창이 없어지므로
// 바로 뒤에 있던 창(원래 쓰던 창)으로 포커스가 돌아가는지 본다. 앱 밖의 창 대신 같은 앱의 다른 창으로 흉내 낸다
test('창을 숨기면 원래 쓰던 창으로 포커스가 돌아간다', async ({ app }) => {
  test.skip(process.platform === 'darwin', 'macOS는 app.hide()로 앱째 숨겨 같은 앱의 창으로는 확인할 수 없다')
  const r = await app.evaluate(async ({ BrowserWindow }) => {
    const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms))
    const main = BrowserWindow.getAllWindows()[0]
    const other = new BrowserWindow({ width: 300, height: 200, show: true })
    await other.loadURL('data:text/html,<p>other</p>')
    other.focus()
    await sleep(300)
    main.show()
    main.focus()
    await sleep(400)
    const before = main.isFocused()
    // Alt+F4와 같은 길 (close → 트레이로 숨김)
    main.close()
    await sleep(500)
    const res = { before, mainVisible: main.isVisible(), otherFocused: other.isFocused() }
    other.destroy()
    return res
  })
  expect(r.before).toBe(true)
  expect(r.mainVisible).toBe(false)
  expect(r.otherFocused).toBe(true)
})

test.describe('작업 표시줄에서 숨기기', () => {
  test.use({ seed: { projects: [{ name: 'alpha' }], settings: { hideTaskbar: true } } })

  // 작업 표시줄 버튼이 없는 창은 최소화해도 Windows가 다음 창을 활성화하지 않는다. 트레이로 숨길 때 원래 쓰던 창으로 포커스를 돌려줘야 한다
  test('최소화하면 트레이로 숨고 원래 쓰던 창으로 포커스가 돌아간다', async ({ app }) => {
    test.skip(process.platform !== 'win32', '작업 표시줄에서 숨기기는 Windows만')
    const r = await app.evaluate(async ({ BrowserWindow }) => {
      const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms))
      const main = BrowserWindow.getAllWindows()[0]
      const other = new BrowserWindow({ width: 300, height: 200, show: true })
      await other.loadURL('data:text/html,<p>other</p>')
      other.focus()
      await sleep(300)
      main.show()
      main.focus()
      await sleep(400)
      const before = main.isFocused()
      main.minimize()
      await sleep(800)
      const res = { before, mainVisible: main.isVisible(), otherFocused: other.isFocused() }
      other.destroy()
      return res
    })
    expect(r.before).toBe(true)
    expect(r.mainVisible).toBe(false)
    expect(r.otherFocused).toBe(true)
  })

  // 전역 호출 키(Ctrl+Space)·Alt+F4로 숨길 때도 같다 (hideWindow가 최소화한 뒤 숨긴다)
  test('전역 호출 키로 숨겨도 원래 쓰던 창으로 포커스가 돌아가고, 다시 열면 보인다', async ({ app }) => {
    test.skip(process.platform !== 'win32', '작업 표시줄에서 숨기기는 Windows만')
    const r = await app.evaluate(async ({ BrowserWindow }) => {
      const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms))
      const main = BrowserWindow.getAllWindows()[0]
      const other = new BrowserWindow({ width: 300, height: 200, show: true })
      await other.loadURL('data:text/html,<p>other</p>')
      other.focus()
      await sleep(300)
      main.show()
      main.focus()
      await sleep(400)
      const before = main.isFocused()
      main.close()
      await sleep(800)
      const hidden = { mainVisible: main.isVisible(), otherFocused: other.isFocused() }
      // 트레이·전역 호출 키로 다시 여는 것과 같은 길 (showWindow: 최소화돼 있으면 restore)
      if (main.isMinimized()) main.restore()
      main.show()
      main.focus()
      await sleep(600)
      const res = { before, ...hidden, reshown: main.isVisible() && !main.isMinimized() }
      other.destroy()
      return res
    })
    expect(r.before).toBe(true)
    expect(r.mainVisible).toBe(false)
    expect(r.otherFocused).toBe(true)
    expect(r.reshown).toBe(true)
  })
})
