// Gesture state machine on top of raw hand poses.
//
// Gestures (v2 — three clean gestures, no confusion matrix):
//   PINCH TAP (thumb+index tap)     -> play/pause toggle
//   PALM SWIPE left/right           -> previous/next track
//   POINT + CIRCLE the finger       -> volume, BMW iDrive style:
//                                      clockwise = louder, counter = quieter
//
// The engine consumes one classified frame at a time and emits discrete
// actions. All thresholds are normalized by hand size so they work at any
// distance from the camera. Robustness tricks:
//   - pinch uses enter/exit hysteresis so a borderline pinch doesn't flicker
//   - pinch is distinguished from a fist by the thumb-to-middle-tip distance
//   - trails survive brief pose flickers (motion blur during fast movement
//     often drops one frame's classification)
//   - swipes accept any "mostly open" hand (>= 3 fingers), not a perfect palm

import { classifyPose, handScale, palmCenter, type Landmarks, LM } from './handTracker'

export type GestureAction =
  | { type: 'togglePlay' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'volume'; value: number } // absolute 0..1

export type GestureName = 'pinch' | 'swipe-left' | 'swipe-right' | 'volume' | null

export interface GestureFrame {
  action: GestureAction | null
  /** currently active/continuous gesture for UI feedback */
  active: GestureName
  volumePreview: number | null
  /** live debug: what the engine thinks the hand is doing right now */
  pose: string
}

interface TrailPoint {
  x: number
  y: number
  t: number
}

const SWIPE_WINDOW_MS = 350
const SWIPE_MIN_DX = 0.18 // normalized screen fraction
const SWIPE_COOLDOWN_MS = 900
const TRAIL_GRACE_MS = 150 // keep trails through brief pose flickers
const PINCH_ENTER = 0.3
const PINCH_EXIT = 0.48
const PINCH_COOLDOWN_MS = 600
// Volume dial (iDrive style)
const DIAL_WINDOW_MS = 700
const DIAL_MIN_POINTS = 6
const DIAL_MIN_RADIUS = 0.22 // of hand scale — jitter is not a circle
const DIAL_GAIN = 0.08 // volume change per radian; full circle ≈ 50%
const DIAL_MAX_STEP = 0.6 // rad per frame — anything bigger is tracking noise

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

export class GestureEngine {
  private swipeTrail: TrailPoint[] = []
  private lastPalmishAt = -Infinity
  private lastSwipeAt = -Infinity
  private pinchActive = false
  private lastPinchAt = -Infinity
  private dialTrail: TrailPoint[] = []
  private lastPointAt = -Infinity

  /** Current player volume, kept in sync by the app so relative volume works. */
  currentVolume = 0.6

  private reset() {
    this.swipeTrail = []
    this.dialTrail = []
    this.pinchActive = false
  }

  update(landmarks: Landmarks | null, now: number): GestureFrame {
    if (!landmarks || landmarks.length < 21) {
      this.reset()
      return { action: null, active: null, volumePreview: null, pose: 'no hand' }
    }

    const pose = classifyPose(landmarks)
    const poseLabel = pose.isPinch
      ? 'pinch'
      : pose.isFist
        ? 'fist'
        : pose.isPoint
          ? 'point'
          : pose.extendedCount >= 3
            ? 'palm'
            : `fingers:${pose.extendedCount}`

    // --- PINCH TAP with hysteresis: play/pause the moment fingers touch ---
    if (this.pinchActive) {
      if (pose.pinchDist > PINCH_EXIT) {
        this.pinchActive = false
      } else {
        return { action: null, active: 'pinch', volumePreview: null, pose: poseLabel }
      }
    }
    if (!this.pinchActive && pose.isPinch && pose.pinchDist < PINCH_ENTER) {
      this.pinchActive = true
      this.swipeTrail = []
      this.dialTrail = []
      if (now - this.lastPinchAt > PINCH_COOLDOWN_MS) {
        this.lastPinchAt = now
        return { action: { type: 'togglePlay' }, active: 'pinch', volumePreview: null, pose: poseLabel }
      }
      return { action: null, active: 'pinch', volumePreview: null, pose: poseLabel }
    }

    // --- POINT + CIRCLE: volume dial ---
    if (pose.isPoint) {
      this.lastPointAt = now
      const tip = landmarks[LM.INDEX_TIP]
      this.dialTrail.push({ x: tip.x, y: tip.y, t: now })
    } else if (now - this.lastPointAt > TRAIL_GRACE_MS) {
      this.dialTrail = []
    }
    this.dialTrail = this.dialTrail.filter((p) => now - p.t <= DIAL_WINDOW_MS)

    if (pose.isPoint && this.dialTrail.length >= DIAL_MIN_POINTS) {
      const n = this.dialTrail.length
      let cx = 0
      let cy = 0
      for (const p of this.dialTrail) {
        cx += p.x
        cy += p.y
      }
      cx /= n
      cy /= n
      let meanR = 0
      for (const p of this.dialTrail) meanR += Math.hypot(p.x - cx, p.y - cy)
      meanR /= n
      const scale = handScale(landmarks)
      if (meanR / scale > DIAL_MIN_RADIUS) {
        const prev = this.dialTrail[n - 2]
        const curr = this.dialTrail[n - 1]
        const delta = wrapAngle(
          Math.atan2(curr.y - cy, curr.x - cx) - Math.atan2(prev.y - cy, prev.x - cx),
        )
        if (Math.abs(delta) < DIAL_MAX_STEP && Math.abs(delta) > 0.005) {
          // Camera image is NOT mirrored: the user's clockwise circle shows
          // up counter-clockwise in image coords, i.e. a NEGATIVE angle delta
          // (atan2 with y pointing down). Clockwise (user) = volume UP.
          const target = Math.min(1, Math.max(0, this.currentVolume - delta * DIAL_GAIN))
          this.currentVolume = target
          return { action: { type: 'volume', value: target }, active: 'volume', volumePreview: target, pose: poseLabel }
        }
      }
      return { action: null, active: 'volume', volumePreview: this.currentVolume, pose: poseLabel }
    }

    // --- SWIPE: mostly-open hand moving fast left/right ---
    const palmish = pose.extendedCount >= 3
    if (palmish) {
      this.lastPalmishAt = now
      const { x, y } = palmCenter(landmarks)
      this.swipeTrail.push({ x, y, t: now })
    } else if (now - this.lastPalmishAt > TRAIL_GRACE_MS) {
      this.swipeTrail = []
    }
    this.swipeTrail = this.swipeTrail.filter((p) => now - p.t <= SWIPE_WINDOW_MS)

    if (palmish && this.swipeTrail.length >= 3 && now - this.lastSwipeAt > SWIPE_COOLDOWN_MS) {
      const dx = this.swipeTrail[this.swipeTrail.length - 1].x - this.swipeTrail[0].x
      if (Math.abs(dx) > SWIPE_MIN_DX) {
        this.lastSwipeAt = now
        this.swipeTrail = []
        // Camera coords: the image is NOT mirrored, so a user moving their
        // hand to THEIR right shows up as x decreasing. dx < 0 => user
        // swiped right => next track.
        const userSwipedRight = dx < 0
        return {
          action: { type: userSwipedRight ? 'next' : 'previous' },
          active: userSwipedRight ? 'swipe-right' : 'swipe-left',
          volumePreview: null,
          pose: poseLabel,
        }
      }
    }

    return { action: null, active: null, volumePreview: null, pose: poseLabel }
  }
}
