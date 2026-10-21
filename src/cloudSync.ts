import { applicationStorageKeys } from "./application/persistence/keys"

// Optional sign-in that mirrors this browser's saved calculator data to a
// Supabase row. Only the project URL and the public (publishable) key belong
// here; row-level security on public.user_state keeps each row private to its
// owner. The 비결 계산기 page (public/mystic) shares the same session key.
const supabaseUrl = "https://aiwyjwsuiurujubwkjiy.supabase.co"
const supabaseKey = "sb_publishable_CpaoT6leMSbmAx4Esmvt3w_b6QKIULM"
const app = "calc"
const authKey = "wwm-auth"
const syncKey = "wwm-calc-sync"
const verifierKey = "wwm-pkce"
const uuidPattern = /^[0-9a-f-]{36}$/
const maxValueLength = 900_000

export const cloudProviders = [{ id: "google", label: "Google" }] as const

// Same shape as the 비결 계산기 page writes, since both pages share this session.
type Auth = { access_token: string; refresh_token: string; expires_at: number; id: string; name: string }
type SyncMeta = { uid: string; at: string; hash: string }
type Payload = { v: 1; items: Record<string, string> }
type Row = { data: unknown; updated_at: string }
type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in?: number
  user?: { id?: string; email?: string; user_metadata?: { nickname?: string; name?: string; full_name?: string } }
}

export type CloudStatus = "idle" | "syncing" | "saved" | "synced" | "conflict" | "failed" | "signInFailed"
export type CloudState = { enabled: boolean; name: string | null; status: CloudStatus }

const listeners = new Set<() => void>()
let state: CloudState = { enabled: false, name: null, status: "idle" }
let auth: Auth | null = null
let ready = false
let pending: Row | null = null
let timer: ReturnType<typeof setTimeout> | undefined

function setState(next: Partial<CloudState>) {
  state = { ...state, ...next, name: auth?.name ?? null }
  listeners.forEach(listener => listener())
}

export function subscribeToCloud(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getCloudState() {
  return state
}

function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Sign-in still works for this page view when storage is blocked.
  }
}

function base64Url(bytes: ArrayBuffer | Uint8Array) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")
}

// Cheap 53-bit string hash, only used to tell whether local data changed since the last sync.
function hash(text: string) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

function localPayload(): Payload {
  const items: Record<string, string> = {}
  for (const key of [...applicationStorageKeys].sort()) {
    const value = localStorage.getItem(key)
    if (value !== null) items[key] = value
  }
  return { v: 1, items }
}

const payloadHash = (payload: Payload) => hash(JSON.stringify(payload.items))

// Keep only known calculator keys with string values; each store validates its own JSON on load.
function remotePayload(data: unknown): Payload {
  const items: Record<string, string> = {}
  const source = (data as { items?: unknown } | null)?.items
  if (source && typeof source === "object") {
    for (const [key, value] of Object.entries(source)) {
      if (applicationStorageKeys.has(key) && typeof value === "string" && value.length <= maxValueLength)
        items[key] = value
    }
  }
  return { v: 1, items }
}

function keepAuth(token: TokenResponse | null) {
  const id = token?.user?.id ?? ""
  auth =
    token && uuidPattern.test(id)
      ? {
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: Date.now() + (token.expires_in ?? 3600) * 1000,
          id,
          name:
            token.user?.user_metadata?.nickname ||
            token.user?.user_metadata?.name ||
            token.user?.user_metadata?.full_name ||
            token.user?.email ||
            "",
        }
      : null
  writeJson(authKey, auth)
}

async function request<T>(path: string, init: RequestInit = {}, withAuth = true): Promise<T> {
  const headers: Record<string, string> = { apikey: supabaseKey, "Content-Type": "application/json" }
  if (withAuth && auth) headers.Authorization = `Bearer ${auth.access_token}`
  const response = await fetch(supabaseUrl + path, {
    ...init,
    headers: { ...headers, ...(init.headers as Record<string, string> | undefined) },
  })
  if (!response.ok) throw new Error(`${response.status}`)
  return (response.status === 204 ? null : await response.json()) as T
}

async function freshAuth() {
  if (!auth) return null
  if (Date.now() < auth.expires_at - 60_000) return auth
  try {
    keepAuth(
      await request<TokenResponse>(
        "/auth/v1/token?grant_type=refresh_token",
        { method: "POST", body: JSON.stringify({ refresh_token: auth.refresh_token }) },
        false,
      ),
    )
  } catch {
    keepAuth(null)
  }
  return auth
}

// PKCE: the provider sends back a one-time code, so tokens never appear in the address bar.
export async function signIn(provider: string) {
  const verifier = base64Url(crypto.getRandomValues(new Uint8Array(32)))
  sessionStorage.setItem(verifierKey, verifier)
  const challenge = base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))
  const back = location.origin + location.pathname
  location.href = `${supabaseUrl}/auth/v1/authorize?provider=${encodeURIComponent(provider)}&redirect_to=${encodeURIComponent(back)}&code_challenge=${challenge}&code_challenge_method=s256`
}

async function finishSignIn() {
  const query = new URLSearchParams(location.search)
  const code = query.get("code")
  if (!code) return
  query.delete("code")
  const rest = query.toString()
  history.replaceState(history.state, "", location.pathname + (rest ? `?${rest}` : "") + location.hash)
  const verifier = sessionStorage.getItem(verifierKey)
  sessionStorage.removeItem(verifierKey)
  if (!verifier) return
  try {
    keepAuth(
      await request<TokenResponse>(
        "/auth/v1/token?grant_type=pkce",
        { method: "POST", body: JSON.stringify({ auth_code: code, code_verifier: verifier }) },
        false,
      ),
    )
  } catch {
    setState({ status: "signInFailed" })
  }
}

export const maxNicknameLength = 20

// The nickname lives in the account's user metadata, so the 비결 계산기 page shows it too.
export async function setNickname(nickname: string) {
  const value = nickname.trim().slice(0, maxNicknameLength)
  if (!value || !(await freshAuth())) return false
  try {
    const user = await request<{ user_metadata?: { nickname?: string } }>("/auth/v1/user", {
      method: "PUT",
      body: JSON.stringify({ data: { nickname: value } }),
    })
    auth = { ...auth!, name: user.user_metadata?.nickname || value }
    writeJson(authKey, auth)
    setState({})
    return true
  } catch {
    setState({ status: "failed" })
    return false
  }
}

export async function signOut() {
  try {
    if (await freshAuth()) await request("/auth/v1/logout", { method: "POST" })
  } catch {
    // The local session is dropped either way.
  }
  keepAuth(null)
  writeJson(syncKey, null)
  ready = false
  pending = null
  setState({ status: "idle" })
}

async function pull() {
  const rows = await request<Row[]>(`/rest/v1/user_state?select=data,updated_at&user_id=eq.${auth!.id}&app=eq.${app}`)
  return rows[0] ?? null
}

async function push() {
  const payload = localPayload()
  setState({ status: "syncing" })
  const rows = await request<Row[]>("/rest/v1/user_state?on_conflict=user_id,app", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ user_id: auth!.id, app, data: payload }),
  })
  writeJson(syncKey, { uid: auth!.id, at: rows[0].updated_at, hash: payloadHash(payload) } satisfies SyncMeta)
  setState({ status: "saved" })
}

function applyRemote(row: Row) {
  const payload = remotePayload(row.data)
  ready = false
  for (const key of applicationStorageKeys) {
    if (key in payload.items) localStorage.setItem(key, payload.items[key])
    else localStorage.removeItem(key)
  }
  writeJson(syncKey, { uid: auth!.id, at: row.updated_at, hash: payloadHash(payload) } satisfies SyncMeta)
  location.reload()
}

export function chooseRemoteData() {
  if (pending && auth) applyRemote(pending)
}

export async function chooseLocalData() {
  pending = null
  ready = true
  try {
    await push()
  } catch {
    setState({ status: "failed" })
  }
}

// Called after every saved change; uploads once things settle.
export function noteLocalChange() {
  if (!ready || !auth) return
  clearTimeout(timer)
  timer = setTimeout(async () => {
    const meta = readJson<SyncMeta>(syncKey)
    if (meta?.uid === auth?.id && meta?.hash === payloadHash(localPayload())) return
    try {
      if (await freshAuth()) await push()
    } catch {
      setState({ status: "failed" })
    }
  }, 1500)
}

export async function startCloudSync() {
  const saved = readJson<Auth>(authKey)
  auth = saved && uuidPattern.test(saved.id ?? "") ? saved : null
  // Checked before the app mounts, because mounting writes default settings.
  const startedBlank = Object.keys(localPayload().items).every(key => key === "wwm-locale")
  setState({ enabled: true })
  await finishSignIn()
  if (!(await freshAuth())) return setState({ status: state.status === "signInFailed" ? "signInFailed" : "idle" })
  try {
    const row = await pull()
    const meta = readJson<SyncMeta>(syncKey)
    const mine = meta?.uid === auth!.id ? meta : null
    const local = localPayload()
    const localHash = payloadHash(local)
    if (!row) await push()
    else if (mine && mine.hash === localHash) {
      if (row.updated_at !== mine.at) return applyRemote(row)
      setState({ status: "synced" })
    } else if (mine && row.updated_at === mine.at) await push()
    else if (payloadHash(remotePayload(row.data)) === localHash) {
      writeJson(syncKey, { uid: auth!.id, at: row.updated_at, hash: localHash } satisfies SyncMeta)
      setState({ status: "synced" })
    } else if (startedBlank) return applyRemote(row)
    else {
      pending = row
      return setState({ status: "conflict" })
    }
    ready = true
  } catch {
    setState({ status: "failed" })
  }
}
