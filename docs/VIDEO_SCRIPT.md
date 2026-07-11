# Maestro demo video — 75 seconds (demo-mode edition)

Setup before recording: good front lighting, camera at chest height so your hand and the browser UI are both visible. Open https://maestro-lemon.vercel.app, click "Start conducting — instant demo", allow the camera. Record the screen WITH system audio on — judges must HEAR the track change. Keep the webcam preview + gesture legend visible in frame.

**0:00–0:06 — THE HOOK (cold open, no title card)**
SHOW: Music already playing. Your open palm swipes right on camera — the track audibly changes and the "⏭ Next track" toast flashes.
SAY: "I just skipped a song without touching anything."

**0:06–0:13 — PLAY/PAUSE**
SHOW: Pinch thumb+index — music stops. Pinch again — it resumes. The 👁 pose indicator flips to "pinch" in frame.
SAY: "This is Maestro. Your webcam is the remote. Pinch to pause, pinch to play."

**0:13–0:22 — VOLUME DIAL**
SHOW: Point index finger, draw circles — volume bar rides the rotation. Clockwise up, counter-clockwise down.
SAY: "My favorite part: draw circles, like a BMW iDrive dial. Clockwise — louder. Counter-clockwise — quieter."

**0:22–0:32 — INSTANT FOR EVERYONE**
SHOW: Reload the page, click "Start conducting — instant demo" — music starts, hand up, conducting again within seconds.
SAY: "No login, no account, no install. The demo tracks are generated in the browser with WebAudio oscillators — even the album art is drawn on a canvas. Anyone can conduct five seconds after opening the link."

**0:32–0:45 — HOW IT WORKS**
SHOW: The 21-point hand skeleton overlay in the camera panel; 2-second cut to gestureEngine.ts in the editor.
SAY: "MediaPipe tracks 21 hand keypoints on the GPU, right in the browser. My gesture state machine turns 30 noisy frames a second into exactly one clean action — thresholds normalized by hand size, hysteresis, cooldowns, and a volume dial that measures the rotation of the fingertip's velocity vector."

**0:45–0:55 — SPOTIFY MODE + ZERO BACKEND**
SHOW: The landing page's "Connect Spotify" button; flash the code of spotifyPlayer.ts (Web API + Web Playback SDK + PKCE).
SAY: "There's a full Spotify mode too — OAuth with PKCE and the Web API driving whatever device is playing, even the desktop app. And there is no backend anywhere: hand tracking, auth, playback — all client-side. Camera frames never leave your machine."

**0:55–1:05 — THE TESTS**
SHOW: Terminal running `npx tsx test/engine-test.ts` — 20 tests passing.
SAY: "The gesture engine is unit tested with synthetic hand landmarks — no camera needed — and the tests caught real bugs before any human hand did."

**1:05–1:15 — CLOSE**
SHOW: One fluid combo: pinch-pause, pinch-play, swipe-skip, volume circle. End card: "Maestro — conduct your music." + your name + "Built solo in 12 hours at JecHacks."
SAY: "Built solo in twelve hours. Maestro — conduct your music."
