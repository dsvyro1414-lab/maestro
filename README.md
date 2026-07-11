# Maestro 🖐🎵

**Conduct your music.** Maestro turns your webcam into a touchless Spotify remote — control playback with nothing but hand gestures, like a conductor in front of an orchestra.

Built in 12 hours for [JecHacks 2026](https://jechacks.devpost.com/).

## Gestures

| Gesture | Action |
|---|---|
| 🤏 Pinch tap (thumb + index) | Play / Pause |
| 👋 Open palm, swipe right | Next track |
| 👋 Open palm, swipe left | Previous track |
| 🔄 Point a finger, draw circles | Volume — clockwise = louder, like a BMW iDrive dial |

## Controls any Spotify device

Maestro is a hybrid controller: it drives **whatever Spotify device is active** through the Web API — the desktop app, your phone, a smart speaker — and also registers the browser tab itself as a Spotify Connect device ("Maestro") via the Web Playback SDK, so it works even with nothing else running. Pick the target device right in the UI.

## Why it matters

Touchless control isn't a gimmick:

- **Accessibility** — people with limited fine motor control can't always use a mouse or tiny media keys. A broad hand swipe is far easier than a precise click.
- **Messy hands** — cooking, painting, working out, eating wings.
- **Musicians** — skip a backing track without putting the guitar down.

## How it works

Everything runs **100% in your browser** — no backend, no server, nothing leaves your machine (fits the serverless theme!):

1. **[MediaPipe Hand Landmarker](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)** tracks 21 hand keypoints per frame on the GPU via WebAssembly.
2. A custom **gesture state machine** (`src/gestures/gestureEngine.ts`) classifies poses (pinch / palm / point / fist), normalizes all thresholds by hand size so gestures work at any distance, and debounces with cooldowns so one swipe = exactly one track skip.
3. The **[Spotify Web Playback SDK](https://developer.spotify.com/documentation/web-playback-sdk)** turns the browser tab itself into a Spotify Connect device — your music plays right in the page, and gestures drive it through the official API.
4. Auth is **Authorization Code + PKCE**, fully client-side — no client secret, no token server.

Camera frames are processed locally and **never uploaded anywhere**.

## Run it

Requirements: **Spotify Premium** (Web Playback SDK limitation), Node 20+, a webcam, Chrome/Edge.

1. Create an app at the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard):
   - Redirect URI: `http://127.0.0.1:5173/callback`
   - APIs: Web API + Web Playback SDK
2. ```bash
   npm install
   echo "VITE_SPOTIFY_CLIENT_ID=<your client id>" > .env.local
   npm run dev
   ```
   (or skip `.env.local` — the app also lets you paste the Client ID in the UI)
3. Open **http://127.0.0.1:5173** (must be `127.0.0.1`, not `localhost` — Spotify only allows loopback-IP redirect URIs), connect Spotify, allow the camera, raise your hand.

> Note: while the Spotify app is in development mode, only users added under *User Management* in the dashboard can log in. Add your testers' Spotify emails there.

## Testing

Synthetic-landmark tests for the gesture engine (no camera needed):

```bash
npx tsx test/engine-test.ts
```

## Stack

React 19 · TypeScript · Vite · MediaPipe Tasks Vision · Spotify Web Playback SDK · zero backend
