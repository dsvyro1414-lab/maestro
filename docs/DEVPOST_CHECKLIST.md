# Devpost form checklist

- **Tagline field:** "Wave to skip, pinch to pause — Spotify without a mouse." (55 chars, under the 60 limit)
- **Video:** upload to YouTube as Unlisted, paste the link. Keep it under 90s. Add captions — judges often skim muted. Make the 0:00 thumbnail the hand-swipe moment, not a title card.
- **Gallery images** (Devpost crops to 3:2; export ~1200x800 or larger). Take these 5:
  1. Hero: app UI with your hand in frame, landmark overlay and "NEXT TRACK" toast visible (this becomes the thumbnail — make it the best one)
  2. Gesture cheat sheet: simple graphic of the gestures → actions (pinch tap, swipe L/R, circle dial)
  3. Architecture diagram: "Three layers, zero servers" — MediaPipe → gesture state machine → Spotify SDK, with a crossed-out server icon
  4. Terminal screenshot: 17 passing synthetic-landmark tests
  5. Spotify Connect device picker showing the browser tab listed as a device (proof it really is a Connect device)
- **Built with tags:** react, typescript, vite, mediapipe, webassembly, spotify-web-playback-sdk, spotify-web-api, oauth-pkce, getusermedia, html5, css3
- **"Try it out" links:** https://github.com/dsvyro1414-lab/maestro + https://maestro-lemon.vercel.app. The Spotify app is in development mode, so judges' Spotify emails must be added under User Management in the Spotify dashboard. Add a one-line note near the link: "Click *Try the demo* to play with gestures instantly — no account needed. For full Spotify control (needs Premium + whitelist while the app is in dev mode) message me your Spotify email and I'll add you in 30 seconds."
- **Team/solo field:** mark as solo — it strengthens the "built alone in under 12 hours" claim.
- **Final proofread:** confirm the submission nowhere claims 60fps, user testing that hasn't happened, or that frames "cannot" leave the machine.
