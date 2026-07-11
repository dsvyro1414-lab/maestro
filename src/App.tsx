import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  beginLogin,
  getClientId,
  setClientId,
  handleCallback,
  isLoggedIn,
  logout,
} from './auth/spotifyAuth'
import { MaestroPlayer, type TrackInfo } from './player/spotifyPlayer'
import { GestureEngine, type GestureFrame, type GestureName } from './gestures/gestureEngine'
import { CameraPanel } from './components/CameraPanel'

type Stage = 'landing' | 'connecting' | 'ready' | 'conducting'

const GESTURE_LABELS: Record<Exclude<GestureName, null>, string> = {
  pinch: '🤏 Play / Pause',
  'swipe-left': '⏮ Previous track',
  'swipe-right': '⏭ Next track',
  volume: '☝️ Volume',
  fist: '✊ Mute',
}

export default function App() {
  const [stage, setStage] = useState<Stage>('landing')
  const [error, setError] = useState<string | null>(null)
  const [track, setTrack] = useState<TrackInfo | null>(null)
  const [volume, setVolume] = useState(0.6)
  const [activeGesture, setActiveGesture] = useState<GestureName>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [clientIdInput, setClientIdInput] = useState(getClientId())
  const [muted, setMuted] = useState(false)

  const player = useMemo(() => new MaestroPlayer(), [])
  const engine = useMemo(() => new GestureEngine(), [])
  const toastTimer = useRef<number>(0)
  const lastVolumeSent = useRef(0)

  const showToast = useCallback((text: string) => {
    setToast(text)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 1400)
  }, [])

  // Handle the OAuth redirect back from Spotify.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.pathname === '/callback' && url.searchParams.get('code')) {
      handleCallback(url.searchParams.get('code')!)
        .then(() => {
          window.history.replaceState({}, '', '/')
          setStage('connecting')
        })
        .catch((e) => setError(String(e)))
    } else if (isLoggedIn()) {
      setStage('connecting')
    }
  }, [])

  // Once logged in, bring up the Web Playback SDK device.
  useEffect(() => {
    if (stage !== 'connecting') return
    player
      .init({
        onReady: async () => {
          try {
            await player.transferPlayback()
          } catch {
            /* non-fatal: user can transfer from the Spotify app */
          }
          setStage('ready')
        },
        onState: (t) => setTrack(t),
        onError: (msg) => {
          if (msg.startsWith('authentication_error')) {
            logout()
            setStage('landing')
          }
          setError(msg)
        },
      })
      .catch((e) => setError(String(e)))
    return () => player.disconnect()
  }, [stage, player])

  const handleGestureFrame = useCallback(
    (frame: GestureFrame) => {
      setActiveGesture(frame.active)
      if (frame.volumePreview !== null) setVolume(frame.volumePreview)
      const action = frame.action
      if (!action) return
      switch (action.type) {
        case 'togglePlay':
          player.togglePlay()
          showToast(track?.paused ? '▶️ Play' : '⏸ Pause')
          break
        case 'next':
          player.next()
          showToast('⏭ Next track')
          break
        case 'previous':
          player.previous()
          showToast('⏮ Previous track')
          break
        case 'volume': {
          engine.currentVolume = action.value
          const now = performance.now()
          if (now - lastVolumeSent.current > 120) {
            lastVolumeSent.current = now
            player.setVolume(action.value)
          }
          break
        }
        case 'muteToggle':
          player.toggleMute().then((m) => {
            setMuted(m)
            showToast(m ? '🔇 Muted' : '🔊 Unmuted')
          })
          break
      }
    },
    [player, engine, showToast, track],
  )

  const startConducting = useCallback(async () => {
    setError(null)
    try {
      await player.activate()
    } catch {
      /* activateElement can fail silently on some browsers */
    }
    try {
      const vol = await player.getVolume()
      engine.currentVolume = vol
      setVolume(vol)
    } catch {
      /* keep defaults */
    }
    setStage('conducting')
    if (!track) {
      player.playTopTracks().catch((e) => setError(String(e)))
    }
  }, [player, engine, track])

  const connect = useCallback(() => {
    setError(null)
    if (!getClientId() && clientIdInput.trim()) setClientId(clientIdInput)
    beginLogin().catch((e) => setError(String(e)))
  }, [clientIdInput])

  return (
    <div className="app">
      {track?.albumArt && stage === 'conducting' && (
        <div className="backdrop" style={{ backgroundImage: `url(${track.albumArt})` }} />
      )}

      {stage === 'landing' && (
        <main className="landing">
          <h1 className="logo">
            Maestro <span className="logo-hand">🖐</span>
          </h1>
          <p className="tagline">Conduct your music. Control Spotify with hand gestures — no touch, no clicks.</p>
          {!getClientId() && (
            <input
              className="client-id-input"
              placeholder="Spotify Client ID"
              value={clientIdInput}
              onChange={(e) => setClientIdInput(e.target.value)}
            />
          )}
          <button className="btn-primary" onClick={connect}>
            Connect Spotify
          </button>
          <p className="hint">Requires Spotify Premium · Everything runs in your browser</p>
        </main>
      )}

      {stage === 'connecting' && (
        <main className="landing">
          <h1 className="logo">Maestro</h1>
          <p className="tagline">Waking up your player…</p>
        </main>
      )}

      {stage === 'ready' && (
        <main className="landing">
          <h1 className="logo">
            Maestro <span className="logo-hand">🖐</span>
          </h1>
          <p className="tagline">Player connected. Allow the camera and raise your hand — you're the conductor now.</p>
          <button className="btn-primary" onClick={startConducting}>
            🎬 Start conducting
          </button>
          <button className="btn-ghost" onClick={() => { logout(); setStage('landing') }}>
            Log out
          </button>
        </main>
      )}

      {stage === 'conducting' && (
        <main className="stage">
          <section className="now-playing">
            {track ? (
              <>
                <img className="album-art" src={track.albumArt} alt="Album art" />
                <h2 className="track-name">{track.name}</h2>
                <p className="track-artists">{track.artists}</p>
                <p className="play-state">{track.paused ? 'Paused' : 'Playing'}</p>
              </>
            ) : (
              <div className="no-track">
                <p>Starting your music…</p>
                <p className="hint">If nothing plays, hit play in any Spotify app and pick the “Maestro” device.</p>
              </div>
            )}
            <div className="volume-bar">
              <span>{muted ? '🔇' : '🔊'}</span>
              <div className="volume-track">
                <div className="volume-fill" style={{ width: `${Math.round(volume * 100)}%` }} />
              </div>
              <span className="volume-num">{Math.round(volume * 100)}</span>
            </div>
          </section>

          <CameraPanel engine={engine} onFrame={handleGestureFrame} onCameraError={setError} />

          <footer className="legend">
            {(Object.keys(GESTURE_LABELS) as Exclude<GestureName, null>[]).map((g) => (
              <span key={g} className={`legend-item ${activeGesture === g ? 'active' : ''}`}>
                {GESTURE_LABELS[g]}
              </span>
            ))}
          </footer>

          {toast && <div className="toast">{toast}</div>}
        </main>
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  )
}
