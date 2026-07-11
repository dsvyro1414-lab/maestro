# Maestro

**Tagline:** Wave to skip, pinch to pause — Spotify without a mouse.

## Inspiration

I was practicing guitar over a Spotify backing track and needed to skip a song. Both hands were busy — that's kind of the whole deal with guitar. And I remember thinking: a conductor controls a hundred musicians without touching anything, while I couldn't control one browser tab without touching everything.

Then I started listing everyone else stuck in the same spot. Every music app assumes you can hit a tiny pause button with a precise click. If you're cooking with flour on your hands, you can't. If you're mid-workout, you won't. And if you have limited fine motor control, a small click target is a wall — but a big, loose swipe of your whole hand? Way easier.

Conductors have moved music with their hands for centuries. JecHacks gave me 12 hours to bring that to a browser tab. So I built Maestro.

## What it does

Maestro turns your webcam into a touchless Spotify remote. Connect Spotify, allow the camera, raise your hand:

- **Pinch** your thumb and index finger — a quick tap — to play or pause.
- **Swipe** an open palm right for the next track, left for the previous one.
- **Point** your index finger and draw circles in the air to control volume: clockwise = louder, counter-clockwise = quieter. If you've seen BMW's iDrive gesture control — yes, that, in a browser tab.

And here's my favorite part: Maestro controls **whatever Spotify device is playing** — the desktop app, your phone, a smart speaker — through the Web API, and the browser tab itself also registers as a Spotify Connect device through the Web Playback SDK. Wave at your laptop, the music changes on your desktop app. On-screen feedback shows which gesture Maestro currently sees, so you always know it's listening.

Don't have Premium? Hit **demo mode**: gestures drive a tiny in-browser synthesizer playing procedurally generated tracks (WebAudio oscillators, a step sequencer, and canvas-generated album art) — so anyone can try Maestro five seconds after opening the page, no account at all.

And everything — camera, hand tracking, gesture recognition, auth, playback — runs 100% in your browser. There is no backend. Your camera frames are processed locally and never uploaded, because there's no server in this project to upload them to.

## How I built it

Three layers, zero servers.

**Layer 1: eyes.** MediaPipe's Hand Landmarker tracks 21 hand keypoints every frame, on the GPU through WebAssembly, entirely in-browser. I assumed hand tracking meant a Python server with a GPU; turns out it's a WASM module and a model file.

**Layer 2: judgment.** Raw computer-vision output is chaos, and the interesting engineering is the layer that turns chaos into intent. My gesture state machine (written from scratch in TypeScript) classifies each frame's pose — pinch, palm, point, fist — and turns 30 noisy frames per second into exactly one clean action. A swipe has to cover a minimum distance inside a 350ms window. Every gesture has a cooldown (900ms for swipes). Pinch has enter/exit hysteresis so a borderline pinch can't flicker, and a thumb-to-middle-finger distance guard so a closed fist can't masquerade as a pinch. The volume dial fits a circle to the fingertip's recent path and converts angular velocity into volume — one full circle is about a 50% volume change. And every threshold is normalized by hand size, so gestures work whether you're one foot from the camera or six.

**Layer 3: sound.** Actions feed the Spotify Web Playback SDK, which registers the tab as a Spotify Connect device. Login is OAuth Authorization Code + PKCE, fully client-side: hash a random secret, send the hash, prove you knew the original later — no client secret, no token server needed anywhere.

React 19 + TypeScript + Vite. No server, no database, no cloud function.

## Challenges I ran into

Coordinate systems humbled me. The camera feed isn't mirrored, so when you swipe to YOUR right, x *decreases* on screen — my first version skipped tracks in the wrong direction, every single time. I stared at that way too long.

Then gesture spam. Hand tracking is the easy part — making it not fire constantly is the hard part. My first detector was if-statement soup that triggered three "next track"s per swipe, then again when my hand returned. Fixing it took a sliding position trail, a minimum travel distance, and the 900ms cooldown. Then the opposite problem: a fast swipe motion-blurs the hand, the classifier drops the "palm" pose for one frame, and a naive engine throws the whole swipe away. The trail now survives brief pose flickers.

The sneakiest bug: my cooldown timers were initialized to 0, so the very first gesture after page load got silently eaten by the cooldown check. My unit tests caught it — 17 tests that feed synthetic hand landmarks into the engine, testing a camera app with no camera. The fix was initializing the timers to -Infinity.

Also, Spotify rejects `localhost` redirect URIs — it has to be `127.0.0.1`. Ask me how long that one took.

## Accomplishments that I'm proud of

I built this alone, in under 12 hours, and it actually works. The thing I'm proudest of is that the gestures feel trustworthy — one pinch is one pause, one swipe is one skip, every time. That took real engineering: a proper state machine, hand-size normalization, cooldowns, hysteresis — not just raw model output wired to an API. The difference between a cool demo and a usable tool is a state machine.

I also wrote unit tests during a hackathon (I know). Seventeen of them, pushing fake hand landmarks through the gesture engine, and they caught a genuine bug before any human hand did. Writing tests felt like a waste of precious minutes right up until the exact moment it wasn't.

And the whole thing is 100% client-side. That's not a privacy policy, that's an architecture.

## What I learned

Gesture recognition sounded like a machine learning problem. It isn't — MediaPipe hands you the landmarks for free. The real problem is UX engineering: when does a pose become an intent? "Is a pinch happening" is easy; "did the user just pinch once, on purpose" needs memory, cooldowns, and debouncing.

Specific things now permanently lodged in my brain: normalize every threshold by hand size instead of hardcoding pixel distances; webcam coordinates aren't mirrored the way your brain expects; a cooldown is what separates "next track" from "next five tracks"; and when Spotify says loopback, it means `127.0.0.1`.

I learned OAuth PKCE deeply enough to run login with zero servers, and that you can unit test "wave your hand at a camera" by faking 21 landmark coordinates. Also, apparently I can ship something real in 12 hours if I stop fiddling with the landing page.

## What's next for Maestro

First: put Maestro in front of the people I designed it for. I built the gestures thinking about users with limited fine motor control, but nobody from that community has tested it yet — so that's step one, before I trust my own guesses about which motions are comfortable. That feedback drives the next feature: custom gesture mapping, so every action can be rebound to whatever motion works for you. Meeting people's hands where they are is the whole point.

After that: a quick calibration screen that learns your personal pinch distance, a seek/scrub gesture, and two-handed combos.

Longer term — the gesture engine doesn't care that Spotify is on the other end. The same raised hand could drive YouTube, slide decks, recipe sites, e-readers, smart lights. I want to split it out into its own open-source library, so "control it with a wave" is something any web app can offer.

## Built with

react, typescript, vite, mediapipe, webassembly, spotify-web-playback-sdk, spotify-web-api, oauth-pkce, getusermedia, html5, css3
