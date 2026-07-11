// Synthetic sanity test for the gesture engine — no camera needed.
import { GestureEngine } from '../src/gestures/gestureEngine'
import { classifyPose, type Landmarks } from '../src/gestures/handTracker'

type P = { x: number; y: number; z: number }
const pt = (x: number, y: number): P => ({ x, y, z: 0 })

// Build a synthetic upright hand at palm center (cx, cy).
// Fingers point up (smaller y). extended[] = [index, middle, ring, pinky].
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
  lm[4] = pinch ? pt(lm[8].x, lm[8].y) : pt(cx - 0.1, cy - 0.03)
  return lm as unknown as Landmarks
}

const FIST = [false, false, false, false]
const PALM = [true, true, true, true]
const POINT = [true, false, false, false]
const PINCH_POSE = [true, true, true, false] // index+middle+ring extended, thumb touches index tip

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

// --- pinch triggers togglePlay once, with cooldown ---
{
  const e = new GestureEngine()
  let t = 0
  const f1 = e.update(hand(0.5, 0.5, PINCH_POSE, true), (t += 16))
  const f2 = e.update(hand(0.5, 0.5, PINCH_POSE, true), (t += 16))
  expect('pinch fires togglePlay', f1.action?.type === 'togglePlay')
  expect('held pinch does not re-fire', f2.action === null)
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

// --- point + move up raises volume ---
{
  const e = new GestureEngine()
  e.currentVolume = 0.5
  let t = 9000
  e.update(hand(0.5, 0.6, POINT), (t += 30)) // anchor
  let last = 0.5
  for (let i = 1; i <= 8; i++) {
    const f = e.update(hand(0.5, 0.6 - i * 0.02, POINT), (t += 30))
    if (f.action?.type === 'volume') last = f.action.value
  }
  expect(`volume rises when hand moves up (got ${last.toFixed(2)})`, last > 0.7)
}

// --- fist held triggers mute once ---
{
  const e = new GestureEngine()
  let t = 20000
  let count = 0
  for (let i = 0; i < 40; i++) {
    const f = e.update(hand(0.5, 0.5, FIST), (t += 30))
    if (f.action?.type === 'muteToggle') count++
  }
  expect(`fist hold fires mute exactly once in 1.2s (got ${count})`, count === 1)
}

// --- no hand => no action ---
{
  const e = new GestureEngine()
  const f = e.update(null, 30000)
  expect('no hand => idle', f.action === null && f.active === null)
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)
