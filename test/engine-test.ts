// Synthetic sanity test for the gesture engine — no camera needed.
import { GestureEngine } from '../src/gestures/gestureEngine'
import { classifyPose, type Landmarks } from '../src/gestures/handTracker'

type P = { x: number; y: number; z: number }
const pt = (x: number, y: number): P => ({ x, y, z: 0 })

// Build a synthetic upright hand at palm center (cx, cy).
// Fingers point up (smaller y). extended[] = [index, middle, ring, pinky].
// pinch=true curls the index down to meet the thumb (a real pinch shape),
// leaving the other fingers wherever extended[] puts them.
function hand(cx: number, cy: number, extended: boolean[], pinch = false): Landmarks {
  const lm: P[] = new Array(21).fill(null).map(() => pt(cx, cy))
  const s = 0.1 // hand scale: wrist->middle_mcp distance
  lm[0] = pt(cx, cy + s) // wrist
  // MCPs across the palm
  lm[5] = pt(cx - 0.03, cy)
  lm[9] = pt(cx - 0.01, cy)
  lm[13] = pt(cx + 0.01, cy)
  lm[17] = pt(cx + 0.03, cy)
  // Fingers: [mcp, pip, dip, tip] indices per finger
  const fingers = [
    [5, 6, 7, 8],
    [9, 10, 11, 12],
    [13, 14, 15, 16],
    [17, 18, 19, 20],
  ]
  fingers.forEach(([mcp, pip, dip, tip], i) => {
    const base = lm[mcp]
    if (extended[i]) {
      lm[pip] = pt(base.x, base.y - 0.05)
      lm[dip] = pt(base.x, base.y - 0.09)
      lm[tip] = pt(base.x, base.y - 0.13)
    } else {
      // curled: tip folds back toward the palm/wrist
      lm[pip] = pt(base.x, base.y - 0.02)
      lm[dip] = pt(base.x, base.y + 0.01)
      lm[tip] = pt(base.x, base.y + 0.03)
    }
  })
  // Thumb: 1,2,3,4
  lm[1] = pt(cx - 0.05, cy + 0.05)
  lm[2] = pt(cx - 0.07, cy + 0.02)
  lm[3] = pt(cx - 0.08, cy - 0.01)
  if (pinch) {
    // index curls down to meet the thumb below the middle finger's tip
    const meet = pt(cx - 0.04, cy - 0.06)
    lm[8] = meet
    lm[4] = meet
  } else {
    lm[4] = pt(cx - 0.1, cy - 0.03)
  }
  return lm as unknown as Landmarks
}

const FIST = [false, false, false, false]
const PALM = [true, true, true, true]
const POINT = [true, false, false, false]
const PINCH_POSE = [true, true, true, false]

let failures = 0
function expect(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`)
  if (!cond) failures++
}

// --- pose classification ---
expect('fist classified', classifyPose(hand(0.5, 0.5, FIST)).isFist)
expect('palm classified', classifyPose(hand(0.5, 0.5, PALM)).isPalm)
expect('point classified', classifyPose(hand(0.5, 0.5, POINT)).isPoint)
expect('pinch classified', classifyPose(hand(0.5, 0.5, PINCH_POSE, true)).isPinch)
expect('palm is not pinch', !classifyPose(hand(0.5, 0.5, PALM)).isPinch)
{
  // Fist with the thumb wrapped over the fingers: thumb tip lands near the
  // index tip (pinch-like distance) but ALSO near the middle tip — the
  // thumb-middle guard must reject it.
  const wrapped = hand(0.5, 0.5, FIST)
  wrapped[4] = { ...wrapped[8] }
  expect('wrapped fist is not a pinch', !classifyPose(wrapped).isPinch)
}

// --- pinch tap triggers togglePlay once, then hysteresis holds ---
{
  const e = new GestureEngine()
  let t = 0
  const f1 = e.update(hand(0.5, 0.5, PINCH_POSE, true), (t += 16))
  const f2 = e.update(hand(0.5, 0.5, PINCH_POSE, true), (t += 16))
  expect('pinch fires togglePlay', f1.action?.type === 'togglePlay')
  expect('held pinch does not re-fire', f2.action === null)
}

// --- pinch release + second pinch after cooldown fires again ---
{
  const e = new GestureEngine()
  let t = 60000
  let count = 0
  const step = (h: ReturnType<typeof hand>) => {
    const f = e.update(h, (t += 40))
    if (f.action?.type === 'togglePlay') count++
  }
  for (let i = 0; i < 3; i++) step(hand(0.5, 0.5, PINCH_POSE, true)) // pinch #1
  for (let i = 0; i < 20; i++) step(hand(0.5, 0.5, PALM)) // release, wait out cooldown
  for (let i = 0; i < 3; i++) step(hand(0.5, 0.5, PINCH_POSE, true)) // pinch #2
  expect(`pinch-release-pinch fires twice (got ${count})`, count === 2)
}

// --- swipe right (user perspective): x decreases in camera coords => next ---
{
  const e = new GestureEngine()
  let t = 1000
  let fired: string | null = null
  for (let i = 0; i < 12; i++) {
    const x = 0.7 - i * 0.04 // moving left in image = user's right
    const f = e.update(hand(x, 0.5, PALM), (t += 30))
    if (f.action) fired = f.action.type
  }
  expect('user right-swipe => next', fired === 'next')
}

// --- swipe left (user perspective): x increases => previous ---
{
  const e = new GestureEngine()
  let t = 5000
  let fired: string | null = null
  for (let i = 0; i < 12; i++) {
    const x = 0.3 + i * 0.04
    const f = e.update(hand(x, 0.5, PALM), (t += 30))
    if (f.action) fired = f.action.type
  }
  expect('user left-swipe => previous', fired === 'previous')
}

// --- swipe survives a single-frame pose flicker (motion blur) ---
{
  const e = new GestureEngine()
  let t = 40000
  let fired: string | null = null
  for (let i = 0; i < 12; i++) {
    const x = 0.7 - i * 0.04
    const h = i === 5 ? hand(x, 0.5, FIST) : hand(x, 0.5, PALM)
    const f = e.update(h, (t += 30))
    if (f.action) fired = f.action.type
  }
  expect('swipe survives one-frame pose flicker', fired === 'next')
}

// --- swipe survives the tracker LOSING the hand for two frames ---
{
  const e = new GestureEngine()
  let t = 45000
  let fired: string | null = null
  for (let i = 0; i < 12; i++) {
    const lost = i === 4 || i === 5
    const f = e.update(lost ? null : hand(0.7 - i * 0.04, 0.5, PALM), (t += 30))
    if (f.action) fired = f.action.type
  }
  expect('swipe survives 2-frame hand loss', fired === 'next')
}

// --- return stroke does not cancel a new swipe (monotonic run) ---
{
  const e = new GestureEngine()
  let t = 47000
  // slow drift right (image +x, below threshold) then a decisive swipe left
  // (image -x --> user right)
  const xs = [0.4, 0.42, 0.44, 0.46, 0.48, 0.4, 0.3, 0.2, 0.1]
  let fired: string | null = null
  for (const x of xs) {
    const f = e.update(hand(x, 0.5, PALM), (t += 30))
    if (f.action) fired = f.action.type
  }
  expect('direction change starts a fresh run (fires next)', fired === 'next')
}

// --- swipe works with an imperfect palm (3 of 4 fingers read as extended) ---
{
  const e = new GestureEngine()
  let t = 50000
  let fired: string | null = null
  const THREE = [true, true, true, false]
  for (let i = 0; i < 12; i++) {
    const f = e.update(hand(0.7 - i * 0.04, 0.5, THREE), (t += 30))
    if (f.action) fired = f.action.type
  }
  expect('3-finger "palm" still swipes', fired === 'next')
}

// --- volume dial: user-clockwise circle raises volume ---
// The camera image is unmirrored, so the user's clockwise circle appears
// counter-clockwise in image coords => decreasing atan2 angle (y-down).
{
  const e = new GestureEngine()
  e.currentVolume = 0.3
  let t = 70000
  let last = 0.3
  const R = 0.08
  for (let i = 0; i < 20; i++) {
    const theta = -i * 0.33 // decreasing angle = image-CCW = user clockwise
    const x = 0.5 + R * Math.cos(theta)
    const y = 0.5 + R * Math.sin(theta)
    const f = e.update(hand(x, y, POINT), (t += 30))
    if (f.action?.type === 'volume') last = f.action.value
  }
  expect(`clockwise circle raises volume (got ${last.toFixed(2)})`, last > 0.55)
}

// --- volume dial: user-counter-clockwise circle lowers volume ---
{
  const e = new GestureEngine()
  e.currentVolume = 0.7
  let t = 80000
  let last = 0.7
  const R = 0.08
  for (let i = 0; i < 20; i++) {
    const theta = i * 0.33 // increasing angle = image-CW = user counter-clockwise
    const x = 0.5 + R * Math.cos(theta)
    const y = 0.5 + R * Math.sin(theta)
    const f = e.update(hand(x, y, POINT), (t += 30))
    if (f.action?.type === 'volume') last = f.action.value
  }
  expect(`counter-clockwise circle lowers volume (got ${last.toFixed(2)})`, last < 0.45)
}

// --- straight-line point movement does NOT change volume (no rotation) ---
{
  const e = new GestureEngine()
  e.currentVolume = 0.5
  let t = 85000
  let maxDrift = 0
  for (let i = 0; i < 20; i++) {
    const f = e.update(hand(0.3 + i * 0.02, 0.5, POINT), (t += 30))
    if (f.action?.type === 'volume') maxDrift = Math.max(maxDrift, Math.abs(f.action.value - 0.5))
  }
  expect(`linear point motion keeps volume (drift ${maxDrift.toFixed(3)})`, maxDrift < 0.05)
}

// --- static pointing does NOT change volume (jitter is not a circle) ---
{
  const e = new GestureEngine()
  e.currentVolume = 0.5
  let t = 90000
  let changed = false
  for (let i = 0; i < 20; i++) {
    // tiny jitter around a fixed spot
    const f = e.update(hand(0.5 + (i % 2) * 0.003, 0.5, POINT), (t += 30))
    if (f.action?.type === 'volume' && Math.abs(f.action.value - 0.5) > 0.02) changed = true
  }
  expect('static point does not change volume', !changed)
}

// --- no hand => no action ---
{
  const e = new GestureEngine()
  const f = e.update(null, 30000)
  expect('no hand => idle', f.action === null && f.active === null)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
