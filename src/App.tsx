import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  beginLogin,
  getClientId,
  setClientId,
  handleCallback,
  isLoggedIn,
  logout,
} from './auth/spotifyAuth'
import {
  MaestroPlayer,
  type TrackInfo,
  type SpotifyDevice,
  type PlayerControls,
  type PlayerEvents,
} from './player/spotifyPlayer'
import { DemoPlayer } from './player/demoPlayer'
import { GestureEngine, type GestureFrame, type GestureName } from './gestures/gestureEngine'
import { CameraPanel } from './components/CameraPanel'

type Stage = 'landing' | 'connecting' | 'conducting'

const GESTURE_LABELS: Record<Exclude<GestureName, null>, string> = {
  pinch: '🤏 Tap = Play / Pause',
  'swipe-left': '⏮ Swipe left',
  'swipe-right': '⏭ Swipe right',
  volume: '🔄 Circle = Volume',
}

export default function App() {
  const [stage, setStage] = useState<Stage>('landing')
  const [error, setError] = useState<string | null>(null)
  const [track, setTrack] = useState<TrackInfo | null>(null)
  const [deviceName, setDeviceName] = useState<string | null>(null)
  const [devices, setDevices] = useState<SpotifyDevice[]>([])
  const [volume, setVolume] = useState(0.6)
  const [activeGesture, setActiveGesture] = useState<GestureName>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [clientIdInput, setClientIdInput] = useState(getClientId())
  const [pose, setPose] = useState('no hand')

  const spotify = useMemo(() => new MaestroPlayer(), [])
  const demo = useMemo(() => new DemoPlayer(), [])
  const [mode, setMode] = useState<'spotify' | 'demo'>('spotify')
  const player: PlayerControls = mode === 'demo' ? demo : spotify
  const engine = useMemo(() => new GestureEngine(), [])
  const toastTimer = useRef<number>(0)
  const lastVolumeSent = useRef(0)
  const lastVolumeGestureAt = useRef(-Infinity)
  const gestureRef = useRef<GestureName>(null)
  gestureRef.current = activeGesture

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

  const playerEvents: PlayerEvents = useMemo(
    () => ({
      onSnapshot: (snap) => {
        setTrack(snap.track)
        setDeviceName(snap.deviceName)
        // The poll lags the API by up to a few seconds — don't let a stale
        // volume overwrite what the user just dialed in with a gesture.
        const dialing =
          gestureRef.current === 'volume' || performance.now() - lastVolumeGestureAt.current < 3000
        if (snap.volumePercent !== null && !dialing) {
          setVolume(snap.volumePercent / 100)
          engine.currentVolume = snap.volumePercent / 100
        }
      },
      onDevices: setDevices,
      onError: (msg) => {
        if (msg.startsWith('authentication_error')) {
          logout()
          setStage('landing')
        }
        setError(msg)
      },
    }),
    [engine],
  )

  // Once logged in, start the hybrid controller (API polling + SDK device).
  useEffect(() => {
    if (stage !== 'connecting') return
    spotify.init(playerEvents).catch((e) => setError(String(e)))
    setStage('conducting')
  }, [stage, spotify, playerEvents])

  // Tear the players down only when the app unmounts — NOT on stage changes
  // (an earlier version disconnected right after init and silently killed the
  // status polling).
  useEffect(
    () => () => {
      spotify.disconnect()
      demo.disconnect()
    },
    [spotify, demo],
  )

  const handleGestureFrame = useCallback(
    (frame: GestureFrame) => {
      // Leaving the volume gesture: flush the final dialed value (individual
      // updates are throttled, the last one may have been swallowed).
      if (gestureRef.current === 'volume' && frame.active !== 'volume') {
        player.setVolume(engine.currentVolume)
      }
      setActiveGesture(frame.active)
      setPose(frame.pose)
      if (frame.volumePreview !== null) setVolume(frame.volumePreview)
      const action = frame.action
      if (!action) return
      console.log('[maestro] gesture action:', action)
      switch (action.type) {
        case 'togglePlay':
          player.togglePlay().catch((e) => setError(String(e)))
          showToast('⏯ Play / Pause')
          break
        case 'next':
          player.next().catch((e) => setError(String(e)))
          showToast('⏭ Next track')
          break
        case 'previous':
          player.previous().catch((e) => setError(String(e)))
          showToast('⏮ Previous track')
          break
        case 'volume': {
          const now = performance.now()
          lastVolumeGestureAt.current = now
          if (now - lastVolumeSent.current > 200) {
            lastVolumeSent.current = now
            player.setVolume(action.value)
          }
          break
        }
      }
    },
    [player, engine, showToast],
  )

  const connect = useCallback(async () => {
    setError(null)
    if (!getClientId() && clientIdInput.trim()) setClientId(clientIdInput)
    try {
      await spotify.activate()
    } catch {
      /* activation is best-effort */
    }
    beginLogin().catch((e) => setError(String(e)))
  }, [clientIdInput, spotify])

  const startDemo = useCallback(async () => {
    setError(null)
    setMode('demo')
    try {
      await demo.activate() // inside the click = browser allows audio
      await demo.init(playerEvents)
      setStage('conducting')
      await demo.togglePlay()
    } catch (e) {
      setError(String(e))
    }
  }, [demo, playerEvents])

  const exitToLanding = useCallback(() => {
    demo.disconnect()
    if (mode === 'spotify') logout()
    setMode('spotify')
    setTrack(null)
    setStage('landing')
  }, [demo, mode])

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
          <button className="btn-primary" onClick={startDemo}>
            🖐 Start conducting — instant demo
          </button>
          <button className="btn-ghost" onClick={connect}>
            Connect Spotify (Premium, whitelisted accounts)
          </button>
          <p className="hint">No account needed for the demo · Everything runs in your browser</p>
        </main>
      )}

      {stage === 'connecting' && (
        <main className="landing">
          <h1 className="logo">Maestro</h1>
          <p className="tagline">Waking up your player…</p>
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
                <p className="play-state">
                  {track.paused ? 'Paused' : 'Playing'}
                  {deviceName ? ` · on ${deviceName}` : ''}
                </p>
              </>
            ) : (
              <div className="no-track">
                <p>No music playing yet.</p>
                <button className="btn-primary" onClick={() => player.playTopTracks().catch((e) => setError(String(e)))}>
                  ▶️ Start my top tracks
                </button>
                <p className="hint">…or just hit play in Spotify on any device — Maestro controls whatever is playing.</p>
              </div>
            )}
            <div className="volume-bar">
              <span>🔊</span>
              <div className="volume-track">
                <div className="volume-fill" style={{ width: `${Math.round(volume * 100)}%` }} />
              </div>
              <span className="volume-num">{Math.round(volume * 100)}</span>
            </div>
            <div className="manual-controls">
              <button onClick={() => { player.previous().catch((e) => setError(String(e))); showToast('⏮ Previous track') }}>⏮</button>
              <button onClick={() => { player.togglePlay().catch((e) => setError(String(e))); showToast('⏯ Play / Pause') }}>⏯</button>
              <button onClick={() => { player.next().catch((e) => setError(String(e))); showToast('⏭ Next track') }}>⏭</button>
            </div>
            {mode === 'spotify' && devices.length > 0 && (
              <div className="device-row">
                {devices.map((d) => (
                  <button
                    key={d.id}
                    className={`device-pill ${d.isActive ? 'active' : ''}`}
                    onClick={() => spotify.transferTo(d.id).catch((e) => setError(String(e)))}
                    title={d.type}
                  >
                    {d.type === 'Computer' ? '💻' : d.type === 'Smartphone' ? '📱' : '🔈'} {d.name}
                  </button>
                ))}
              </div>
            )}
          </section>

          <CameraPanel engine={engine} onFrame={handleGestureFrame} onCameraError={setError} />
          <div className="pose-debug">👁 {pose}</div>

          <footer className="legend">
            {(Object.keys(GESTURE_LABELS) as Exclude<GestureName, null>[]).map((g) => (
              <span key={g} className={`legend-item ${activeGesture === g ? 'active' : ''}`}>
                {GESTURE_LABELS[g]}
              </span>
            ))}
            <button className="btn-ghost small" onClick={exitToLanding}>
              {mode === 'demo' ? 'Exit demo' : 'Log out'}
            </button>
          </footer>

          {toast && <div className="toast">{toast}</div>}
        </main>
      )}

      {error && (
        <div className="error-banner" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </div>
  )
}
