# Maestro demo video — 80 seconds

Setup before recording: good front lighting, camera at chest height so your hand and the browser UI are both visible, Spotify queue loaded with recognizable (copyright-safe) tracks, app already authenticated so no login dead air. Record the screen with the webcam preview + gesture-feedback overlay visible; keep system audio on so judges HEAR the track change.

**0:00–0:05 — THE HOOK (cold open, no title card)**
SHOW: Music already playing. Your open palm swipes right on camera — the track audibly changes and the on-screen "NEXT TRACK" toast flashes.
SAY: "I just skipped a song without touching anything."

**0:05–0:12 — PLAY/PAUSE**
SHOW: Pinch thumb+index — music stops. Pinch again — it resumes. Keep the gesture indicator in frame.
SAY: "This is Maestro. Your webcam is the Spotify remote. Pinch to pause, pinch to play."

**0:12–0:19 — VOLUME DIAL**
SHOW: Point index finger, draw circles — volume bar rides the rotation. Clockwise up, counter-clockwise down.
SAY: "And this is my favorite: draw circles like a BMW iDrive dial. Clockwise, louder. Counter-clockwise, quieter."

**0:19–0:25 — CONTROLS ANY DEVICE**
SHOW: Spotify DESKTOP app visibly playing; you swipe on camera in the browser — the desktop app switches tracks.
SAY: "It's not just the browser — Maestro drives whatever Spotify device is playing. That's my desktop app obeying my hand."

**0:25–0:35 — WHO IT'S FOR**
SHOW: Quick cut: you holding a guitar with both hands on the fretboard, swiping to skip the backing track. (If no time for a second setup, stay on the app and let the voice-over carry it.)
SAY: "I built this for anyone who can't click: a guitarist mid-song, a cook with flour everywhere, and especially people with limited fine motor control — a big swipe beats a tiny button."

**0:35–0:50 — HOW IT WORKS**
SHOW: Screen recording of the app with the 21-point hand landmark overlay visible; optionally a 2-second cut to gestureEngine.ts in the editor.
SAY: "MediaPipe tracks 21 hand keypoints on the GPU, right in the browser. My gesture state machine turns 30 noisy frames a second into exactly one clean action — thresholds normalized by hand size, debouncing, cooldowns."

**0:50–1:00 — ZERO BACKEND**
SHOW: DevTools Network tab open while gestures fire — nothing but Spotify API calls; no server of yours anywhere. Flash the Spotify Connect device list showing the browser tab as a device.
SAY: "There is no backend. Hand tracking, OAuth with PKCE, playback — all client-side. Camera frames are never uploaded, because there's nowhere to upload them."

**1:00–1:10 — THE TESTS**
SHOW: Terminal running `npx tsx test/engine-test.ts` — 17 tests passing.
SAY: "I even unit tested it with synthetic hand landmarks — no camera needed — and the tests caught a real bug where the very first gesture after page load got silently swallowed."

**1:10–1:20 — CLOSE**
SHOW: One fluid combo: pinch-pause, pinch-play, swipe-skip, volume ride. End card: "Maestro — conduct your music." + your name + "Built solo in 12 hours at JecHacks."
SAY: "Built solo in twelve hours. Maestro — conduct your music."
