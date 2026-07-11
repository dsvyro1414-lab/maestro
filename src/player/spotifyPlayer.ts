// Wrapper around the Spotify Web Playback SDK: the browser becomes a
// Spotify Connect device ("Maestro") and we control it locally.
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
    togglePlay(): Promise<void>
    nextTrack(): Promise<void>
    previousTrack(): Promise<void>
    setVolume(volume: number): Promise<void>
    getVolume(): Promise<number>
    activateElement(): Promise<void>
  }
}

export interface TrackInfo {
  name: string
  artists: string
  albumArt: string
  paused: boolean
}

export interface PlayerEvents {
  onReady: (deviceId: string) => void
  onState: (track: TrackInfo | null) => void
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

export class MaestroPlayer {
  private player: Spotify.Player | null = null
  deviceId: string | null = null
  private lastVolume = 0.6
  muted = false

  async init(events: PlayerEvents): Promise<void> {
    await loadSdk()
    this.player = new window.Spotify.Player({
      name: 'Maestro',
      getOAuthToken: (cb) => {
        getAccessToken().then((t) => t && cb(t))
      },
      volume: 0.6,
    })
    this.player.addListener('ready', (payload) => {
      const { device_id } = payload as { device_id: string }
      this.deviceId = device_id
      events.onReady(device_id)
    })
    this.player.addListener('player_state_changed', (payload) => {
      const state = payload as {
        paused: boolean
        track_window: {
          current_track: {
            name: string
            artists: { name: string }[]
            album: { images: { url: string }[] }
          }
        }
      } | null
      if (!state || !state.track_window?.current_track) {
        events.onState(null)
        return
      }
      const t = state.track_window.current_track
      events.onState({
        name: t.name,
        artists: t.artists.map((a) => a.name).join(', '),
        albumArt: t.album.images[0]?.url || '',
        paused: state.paused,
      })
    })
    for (const ev of ['initialization_error', 'authentication_error', 'account_error', 'playback_error']) {
      this.player.addListener(ev, (payload) => {
        const { message } = payload as { message: string }
        events.onError(`${ev}: ${message}`)
      })
    }
    await this.player.connect()
  }

  /** Make this browser the active Spotify device. */
  async transferPlayback(): Promise<void> {
    if (!this.deviceId) return
    await apiFetch('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [this.deviceId], play: false }),
    })
  }

  /** Start playing the user's top tracks on this device (great for demos). */
  async playTopTracks(): Promise<void> {
    if (!this.deviceId) return
    const res = await apiFetch('/me/top/tracks?limit=50')
    let uris: string[] = []
    if (res.ok) {
      const data = await res.json()
      uris = (data.items as { uri: string }[]).map((t) => t.uri)
    }
    if (uris.length === 0) {
      // New accounts may have no top tracks — fall back to saved tracks.
      const saved = await apiFetch('/me/tracks?limit=50')
      if (saved.ok) {
        const data = await saved.json()
        uris = (data.items as { track: { uri: string } }[]).map((t) => t.track.uri)
      }
    }
    if (uris.length === 0) throw new Error('No tracks found — play something in Spotify once, or like a few songs')
    await apiFetch(`/me/player/play?device_id=${this.deviceId}`, {
      method: 'PUT',
      body: JSON.stringify({ uris }),
    })
  }

  // Called from a user click so the browser allows audio playback.
  async activate(): Promise<void> {
    await this.player?.activateElement()
  }

  async togglePlay(): Promise<void> {
    await this.player?.togglePlay()
  }

  async next(): Promise<void> {
    await this.player?.nextTrack()
  }

  async previous(): Promise<void> {
    await this.player?.previousTrack()
  }

  async setVolume(v: number): Promise<void> {
    const vol = Math.min(1, Math.max(0, v))
    if (!this.muted) this.lastVolume = vol
    await this.player?.setVolume(vol)
  }

  async getVolume(): Promise<number> {
    return (await this.player?.getVolume()) ?? this.lastVolume
  }

  async toggleMute(): Promise<boolean> {
    if (this.muted) {
      this.muted = false
      await this.player?.setVolume(this.lastVolume)
    } else {
      this.lastVolume = (await this.getVolume()) || this.lastVolume
      this.muted = true
      await this.player?.setVolume(0)
    }
    return this.muted
  }

  disconnect() {
    this.player?.disconnect()
  }
}
