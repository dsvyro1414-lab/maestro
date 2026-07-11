// Spotify Authorization Code flow with PKCE — fully client-side, no secret.

const AUTH_URL = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-top-read',
].join(' ')

const LS = {
  clientId: 'maestro_client_id',
  verifier: 'maestro_pkce_verifier',
  accessToken: 'maestro_access_token',
  refreshToken: 'maestro_refresh_token',
  expiresAt: 'maestro_expires_at',
}

export function getClientId(): string {
  return (
    localStorage.getItem(LS.clientId) ||
    (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) ||
    ''
  )
}

export function setClientId(id: string) {
  localStorage.setItem(LS.clientId, id.trim())
}

function redirectUri(): string {
  return `${window.location.origin}/callback`
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  const values = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(values, (v) => chars[v % chars.length]).join('')
}

async function sha256base64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export async function beginLogin(): Promise<void> {
  const clientId = getClientId()
  if (!clientId) throw new Error('No Spotify Client ID configured')
  const verifier = randomString(64)
  localStorage.setItem(LS.verifier, verifier)
  const challenge = await sha256base64url(verifier)
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
  })
  window.location.href = `${AUTH_URL}?${params}`
}

function storeTokens(data: { access_token: string; refresh_token?: string; expires_in: number }) {
  localStorage.setItem(LS.accessToken, data.access_token)
  if (data.refresh_token) localStorage.setItem(LS.refreshToken, data.refresh_token)
  localStorage.setItem(LS.expiresAt, String(Date.now() + (data.expires_in - 60) * 1000))
}

export async function handleCallback(code: string): Promise<void> {
  const verifier = localStorage.getItem(LS.verifier)
  if (!verifier) throw new Error('Missing PKCE verifier — start login again')
  const body = new URLSearchParams({
    client_id: getClientId(),
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    code_verifier: verifier,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`)
  storeTokens(await res.json())
  localStorage.removeItem(LS.verifier)
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(LS.refreshToken)
  if (!refreshToken) return null
  const body = new URLSearchParams({
    client_id: getClientId(),
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    logout()
    return null
  }
  const data = await res.json()
  storeTokens(data)
  return data.access_token
}

/** Returns a valid access token, refreshing if needed. Null = not logged in. */
export async function getAccessToken(): Promise<string | null> {
  const token = localStorage.getItem(LS.accessToken)
  const expiresAt = Number(localStorage.getItem(LS.expiresAt) || 0)
  if (!token) return null
  if (Date.now() < expiresAt) return token
  return refreshAccessToken()
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem(LS.accessToken)
}

export function logout() {
  localStorage.removeItem(LS.accessToken)
  localStorage.removeItem(LS.refreshToken)
  localStorage.removeItem(LS.expiresAt)
}
