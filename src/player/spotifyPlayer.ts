// Hybrid Spotify controller.
//
// Two channels, one interface:
//   1. Spotify Web API player endpoints — control WHATEVER device is active:
//      the desktop app, a phone, a smart speaker. This is the primary path.
//   2. Spotify Web Playback SDK — registers this browser tab as a Spotify
//      Connect device ("Maestro") so music can also play right in the page
//      when no other device is around.
//
// State comes from polling GET /me/player, so the UI reflects the active
// device no matter where the music actually plays.
import { getAccessToken } from '../auth/spotifyAuth'

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady: () => void
    Spotify: typeof Spotify
  }
}

declare namespace Spotify {
  class Player {
    constructor(options: {
      name: string
      getOAuthToken: (cb: (token: string) => void) => void
      volume?: number
    })
    connect(): Promise<boolean>
    disconnect(): void
    addListener(event: string, cb: (payload: unknown) => void): void
    setVolume(volume: number): Promise<void>
    activateElement(): Promise<void>
  }
}

export interface TrackInfo {
  name: string
  artists: string
  albumArt: string
  paused: boolean
}

export interface SpotifyDevice {
  id: string
  name: string
  type: string
  isActive: boolean
}

export interface PlayerSnapshot {
  track: TrackInfo | null
  deviceName: string | null
  volumePercent: number | null
}

export interface PlayerEvents {
  onSnapshot: (snap: PlayerSnapshot) => void
  onDevices: (devices: SpotifyDevice[]) => void
  onError: (message: string) => void
}

const API = 'https://api.spotify.com/v1'

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken()
  if (!token) throw new Error('Not logged in')
  return fetch(`${API}${path}`, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token}` },
  })
}

let sdkLoaded: Promise<void> | null = null

function loadSdk(): Promise<void> {
  if (sdkLoaded) return sdkLoaded
  sdkLoaded = new Promise((resolve) => {
    window.onSpotifyWebPlaybackSDKReady = () => resolve()
    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.async = true
    document.body.appendChild(script)
  })
  return sdkLoaded
}

const POLL_MS = 2000

export class MaestroPlayer {
  private sdkPlayer: Spotify.Player | null = null
  /** device id of THIS browser tab (may stay null if the SDK fails, e.g. DRM disabled) */
  sdkDeviceId: string | null = null
  private events: PlayerEvents | null = null
  private pollTimer: number | null = null
  private lastIsPlaying = false
  private activeDeviceId: string | null = null
  private stopped = false

  async init(events: PlayerEvents): Promise<void> {
    this.events = events
    this.startPolling()
    // The SDK device is a bonus, not a requirement — never block on it.
    this.initSdk().catch(() => {
      /* browser without DRM/EME support: API control still works */
    })
  }

  private async initSdk(): Promise<void> {
    await loadSdk()
    if (this.stopped) return
    this.sdkPlayer = new window.Spotify.Player({
      name: 'Maestro (this browser tab)',
      getOAuthToken: (cb) => {
        getAccessToken().then((t) => t && cb(t))
      },
      volume: 0.6,
    })
    this.sdkPlayer.addListener('ready', (payload) => {
      this.sdkDeviceId = (payload as { device_id: string }).device_id
      this.refreshDevices()
    })
    this.sdkPlayer.addListener('player_state_changed', () => this.pollNow())
    for (const ev of ['initialization_error', 'authentication_error', 'account_error']) {
      this.sdkPlayer.addListener(ev, (payload) => {
        const { message } = payload as { message: string }
        // Auth errors matter for the whole app; the rest only degrade the
        // in-tab playback bonus.
        if (ev === 'authentication_error') this.events?.onError(`authentication_error: ${message}`)
      })
    }
    await this.sdkPlayer.connect()
  }

  private startPolling() {
    const tick = () => {
      this.pollNow()
      this.refreshDevices()
    }
    tick()
    this.pollTimer = window.setInterval(tick, POLL_MS)
  }

  /** Fetch current playback state (whatever device is active). */
  async pollNow(): Promise<void> {
    try {
      const res = await apiFetch('/me/player')
      if (res.status === 204) {
        this.activeDeviceId = null
        this.events?.onSnapshot({ track: null, deviceName: null, volumePercent: null })
        return
      }
      if (!res.ok) return
      const s = await res.json()
      this.lastIsPlaying = !!s.is_playing
      this.activeDeviceId = s.device?.id ?? null
      const item = s.item
      this.events?.onSnapshot({
        track: item
          ? {
              name: item.name,
              artists: (item.artists as { name: string }[]).map((a) => a.name).join(', '),
              albumArt: item.album?.images?.[0]?.url || '',
              paused: !s.is_playing,
            }
          : null,
        deviceName: s.device?.name ?? null,
        volumePercent: s.device?.volume_percent ?? null,
      })
    } catch {
      /* transient network error — next poll will recover */
    }
  }

  async refreshDevices(): Promise<void> {
    try {
      const res = await apiFetch('/me/player/devices')
      if (!res.ok) return
      const data = await res.json()
      this.events?.onDevices(
        (data.devices as { id: string; name: string; type: string; is_active: boolean }[]).map((d) => ({
          id: d.id,
          name: d.name,
          type: d.type,
          isActive: d.is_active,
        })),
      )
    } catch {
      /* ignore */
    }
  }

  /** Ensure SOME device is active; prefer an already-active one, then the
   * desktop/phone app, then this browser tab. Returns the device id or null. */
  private async ensureActiveDevice(): Promise<string | null> {
    if (this.activeDeviceId) return this.activeDeviceId
    const res = await apiFetch('/me/player/devices')
    if (!res.ok) return null
    const data = await res.json()
    const devices = data.devices as { id: string; name: string; is_active: boolean }[]
    const target = devices.find((d) => d.is_active) ?? devices.find((d) => d.id !== this.sdkDeviceId) ?? devices[0]
    if (!target) return null
    if (!target.is_active) await this.transferTo(target.id)
    this.activeDeviceId = target.id
    return target.id
  }

  async transferTo(deviceId: string): Promise<void> {
    await apiFetch('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [deviceId], play: true }),
    })
    this.activeDeviceId = deviceId
    window.setTimeout(() => this.pollNow(), 400)
  }

  /** Start playing the user's top tracks (fallback when nothing is queued). */
  async playTopTracks(): Promise<void> {
    const deviceId = (await this.ensureActiveDevice()) ?? this.sdkDeviceId
    if (!deviceId) throw new Error('No Spotify device found — open Spotify on any device or use a DRM-enabled browser')
    const res = await apiFetch('/me/top/tracks?limit=50')
    let uris: string[] = []
    if (res.ok) {
      const data = await res.json()
      uris = (data.items as { uri: string }[]).map((t) => t.uri)
    }
    if (uris.length === 0) {
      const saved = await apiFetch('/me/tracks?limit=50')
      if (saved.ok) {
        const data = await saved.json()
        uris = (data.items as { track: { uri: string } }[]).map((t) => t.track.uri)
      }
    }
    if (uris.length === 0) throw new Error('No tracks found — play something in Spotify once, or like a few songs')
    await apiFetch(`/me/player/play?device_id=${deviceId}`, {
      method: 'PUT',
      body: JSON.stringify({ uris }),
    })
    window.setTimeout(() => this.pollNow(), 400)
  }

  // Called from a user click so the browser allows in-tab audio playback.
  async activate(): Promise<void> {
    await this.sdkPlayer?.activateElement()
  }

  async togglePlay(): Promise<void> {
    const deviceId = await this.ensureActiveDevice()
    if (!deviceId) {
      await this.playTopTracks()
      return
    }
    const path = this.lastIsPlaying ? '/me/player/pause' : '/me/player/play'
    const res = await apiFetch(path, { method: 'PUT' })
    if (res.status === 404) {
      await this.playTopTracks()
      return
    }
    this.lastIsPlaying = !this.lastIsPlaying
    window.setTimeout(() => this.pollNow(), 350)
  }

  async next(): Promise<void> {
    await this.ensureActiveDevice()
    await apiFetch('/me/player/next', { method: 'POST' })
    window.setTimeout(() => this.pollNow(), 350)
  }

  async previous(): Promise<void> {
    await this.ensureActiveDevice()
    await apiFetch('/me/player/previous', { method: 'POST' })
    window.setTimeout(() => this.pollNow(), 350)
  }

  async setVolume(v: number): Promise<void> {
    const percent = Math.round(Math.min(1, Math.max(0, v)) * 100)
    // Local SDK device also gets the low-latency direct call.
    if (this.activeDeviceId && this.activeDeviceId === this.sdkDeviceId) {
      this.sdkPlayer?.setVolume(percent / 100)
    }
    try {
      await apiFetch(`/me/player/volume?volume_percent=${percent}`, { method: 'PUT' })
    } catch {
      /* some devices don't allow remote volume — non-fatal */
    }
  }

  disconnect() {
    this.stopped = true
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer)
    this.sdkPlayer?.disconnect()
  }
}
