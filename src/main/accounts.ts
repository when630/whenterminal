import { safeStorage } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync, type FSWatcher } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { SavedAccount } from '@shared/types'

/**
 * 구독 계정 여러 개를 오가기 (Team 시트 하나를 두 계정이 나눠 쓸 때 등).
 * CLI는 로그인을 `<설정 폴더>/.credentials.json`(토큰)과 `~/.claude.json`의 `oauthAccount`(누구인지)에 둔다.
 * 한 번씩 로그인해 두면 계정마다 그 두 가지를 userData/accounts.json에 OS 암호화(safeStorage)로 보관하고, 고르면 되돌려 쓴다.
 * 쓰는 동안 CLI가 토큰을 갱신하면(파일이 바뀌면)·프로필(시트 등급)이 바뀌면 보관본도 따라 갱신한다 (갱신 토큰은 한 번 쓰면 바뀌므로 옛 보관본은 못 쓴다).
 * macOS는 토큰이 키체인에 있어 파일이 없으면 쓰지 않는다
 */

interface Stored extends SavedAccount {
  /** safeStorage로 암호화한 { credentials, oauthAccount } (base64) */
  blob: string
  /** 보관한 토큰 파일 내용의 해시 (바뀌었을 때만 다시 쓴다) */
  hash: string
}

type OAuthAccount = Record<string, unknown> & { accountUuid?: string; emailAddress?: string; organizationUuid?: string; organizationName?: string; seatTier?: string }

const configDir = (): string => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
const credentialsPath = (): string => join(configDir(), '.credentials.json')
/** 전역 설정. CLAUDE_CONFIG_DIR을 쓰면 그 안에 (추정: CLI가 그 폴더의 .claude.json을 읽는다) */
const globalConfigPath = (): string => (process.env.CLAUDE_CONFIG_DIR ? join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : join(homedir(), '.claude.json'))

const idOf = (a: OAuthAccount): string | null => (a.accountUuid ? `${a.accountUuid}:${a.organizationUuid ?? ''}` : null)

/** 파일을 통째로 바꾼다 (쓰는 도중에 CLI가 반쯤 쓴 파일을 읽지 않게) */
function writeAtomic(path: string, text: string): void {
  const tmp = `${path}.wt-${process.pid}.tmp`
  writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, path)
}

function readJson(path: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

export class AccountStore {
  private list: Stored[] = []
  private watchers: FSWatcher[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  /** 마지막으로 본 로그인 계정. 바뀌면 onChange */
  private currentId: string | null = null

  constructor(
    private readonly file: string,
    /** 로그인한 계정이 바뀌었다 (앱 밖에서 /login 했거나 switchTo) */
    private readonly onChange: () => void,
  ) {
    const saved = readJson(file)
    if (Array.isArray(saved?.accounts)) this.list = saved.accounts as Stored[]
  }

  /** 계정을 바꿔 쓸 수 있는 환경인지 (토큰이 파일에 있고 OS 암호화를 쓸 수 있을 때) */
  supported(): boolean {
    return safeStorage.isEncryptionAvailable() && (process.platform !== 'darwin' || existsSync(credentialsPath()))
  }

  /** 지금 로그인을 보관하고, 토큰 파일·전역 설정이 바뀌는지 지켜본다 */
  start(): void {
    this.currentId = this.capture()
    const onFs = (name: string | null): void => {
      if (name && name !== '.credentials.json' && name !== '.claude.json') return
      // 로그인은 토큰을 쓰고 프로필을 받아 전역 설정을 쓰므로 둘 다 잠잠해진 뒤에 읽는다
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => this.check(), 3000)
    }
    for (const dir of new Set([dirname(credentialsPath()), dirname(globalConfigPath())])) {
      try {
        this.watchers.push(watch(dir, { persistent: false }, (_e, name) => onFs(name ? String(name) : null)))
      } catch (err) {
        console.warn('로그인 파일을 지켜보지 못함', dir, err)
      }
    }
  }

  dispose(): void {
    for (const w of this.watchers) w.close()
    this.watchers = []
    if (this.timer) clearTimeout(this.timer)
  }

  private check(): void {
    const id = this.capture()
    if (id === this.currentId) return
    this.currentId = id
    this.onChange()
  }

  private oauthAccount(): OAuthAccount | null {
    const a = readJson(globalConfigPath())?.oauthAccount
    return a && typeof a === 'object' ? (a as OAuthAccount) : null
  }

  /** 지금 로그인(토큰+계정)을 보관한다. 지금 계정 ID (로그인 안 했으면 null) */
  private capture(): string | null {
    const account = this.oauthAccount()
    const id = account ? idOf(account) : null
    if (!account || !id || !this.supported()) return id
    let credentials: string
    try {
      credentials = readFileSync(credentialsPath(), 'utf8')
      if (!JSON.parse(credentials)?.claudeAiOauth) return id
    } catch {
      return id
    }
    // 프로필도 같이 본다: 관리자가 시트를 옮기면 토큰은 그대로이고 CLI가 받은 seatTier만 바뀐다
    const hash = createHash('sha256').update(credentials).update(JSON.stringify(account)).digest('hex')
    const prev = this.list.find((a) => a.id === id)
    if (prev?.hash === hash) return id
    const entry: Stored = {
      id,
      email: account.emailAddress ?? '?',
      organization: account.organizationName,
      seatTier: account.seatTier,
      savedAt: Date.now(),
      hash,
      blob: safeStorage.encryptString(JSON.stringify({ credentials, oauthAccount: account })).toString('base64'),
    }
    this.list = prev ? this.list.map((a) => (a.id === id ? entry : a)) : [...this.list, entry]
    this.save()
    return id
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true })
    writeAtomic(this.file, JSON.stringify({ accounts: this.list }, null, 2))
  }

  /** 보관한 계정들과 지금 로그인한 계정 */
  accounts(): { current: string | null; list: SavedAccount[]; supported: boolean } {
    return {
      current: this.currentId,
      list: this.list.map(({ id, email, organization, seatTier, savedAt }) => ({ id, email, organization, seatTier, savedAt })),
      supported: this.supported(),
    }
  }

  /** 보관한 계정으로 바꾼다. 떠 있는 CLI는 부르는 쪽(before)이 먼저 정리한다 */
  switchTo(id: string, before: () => void): void {
    if (!this.supported()) throw new Error('이 컴퓨터에서는 계정을 바꿔 끼울 수 없어요')
    // 지금 계정의 최신 토큰부터 보관한다 (그사이 갱신됐을 수 있다)
    this.currentId = this.capture()
    if (id === this.currentId) return
    const target = this.list.find((a) => a.id === id)
    if (!target) throw new Error('보관한 계정이 없어요')
    const { credentials, oauthAccount } = JSON.parse(safeStorage.decryptString(Buffer.from(target.blob, 'base64'))) as { credentials: string; oauthAccount: OAuthAccount }
    const config = readJson(globalConfigPath())
    if (!config) throw new Error('Claude Code 설정 파일(.claude.json)을 읽지 못했어요')
    before()
    writeAtomic(credentialsPath(), credentials)
    writeAtomic(globalConfigPath(), JSON.stringify({ ...config, oauthAccount }, null, 2))
    this.currentId = id
    this.onChange()
  }
}
