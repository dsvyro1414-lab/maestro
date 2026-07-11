// Gesture state machine on top of raw hand poses.
//
// Gestures (v3):
//   PINCH TAP (thumb+index tap)     -> play/pause toggle
//   SWIPE left/right (any pose)     -> previous/next track
//   POINT + CIRCLE the finger       -> volume, BMW iDrive style:
//                                      clockwise = louder, counter = quieter
//
// Real-world robustness (learned from live testing):
//   - Fast swipes motion-blur the hand: the classifier misreads fingers and
//     the tracker can LOSE the hand entirely for a few frames. So the swipe
//     trail accepts ANY pose except pinch/point, and a short hand-loss gap
//     does not reset gesture state.
//   - Swipe detection looks for the longest monotonic horizontal run, so the
//     return stroke of a previous swipe can't cancel a new one.
//   - The volume dial measures the ROTATION OF THE FINGERTIP'S VELOCITY
//     vector (curvature), not angles around a trail centroid — a centroid is
//     garbage until a full circle exists, velocity heading works from the
//     first centimetre of arc. Positions are smoothed and gated by a minimum
//     step so hand tremor doesn't move the volume.

import { classifyPose, type Landmarks, LM, palmCenter } from './handTracker'

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
  t: number
}

const HAND_LOSS_GRACE_MS = 300 // brief tracking dropouts don't reset gestures
const SWIPE_WINDOW_MS = 400
const SWIPE_MIN_DX = 0.15 // normalized screen fraction, monotonic run
const SWIPE_COOLDOWN_MS = 1000
const PINCH_ENTER = 0.3
const PINCH_EXIT = 0.48
const PINCH_COOLDOWN_MS = 600
// Volume dial (iDrive style) — curvature of the fingertip path
const DIAL_SMOOTH_ALPHA = 0.55 // EMA weight of the newest sample
const DIAL_MIN_STEP = 0.012 // normalized units the finger must move before a heading sample counts
const DIAL_MAX_TURN = 1.2 // rad between heading samples — bigger = reversal/noise, skip
const DIAL_GAIN = 0.09 // volume change per radian of turn; full circle ≈ 55%

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI
  while (a < -Math.PI) a += 2 * Math.PI
  return a
}

export class GestureEngine {
  private lastHandAt = -Infinity
  private swipeTrail: TrailPoint[] = []
  private lastSwipeAt = -Infinity
  private pinchActive = false
  private lastPinchAt = -Infinity
  // Volume dial state
  private dialSmoothed: { x: number; y: number } | null = null
  private dialAnchor: { x: number; y: number } | null = null
  private dialHeading: number | null = null

  /** Current player volume, kept in sync by the app so relative volume works. */
  currentVolume = 0.6

  private resetAll() {
    this.swipeTrail = []
    this.pinchActive = false
    this.resetDial()
  }

  private resetDial() {
    this.dialSmoothed = null
    this.dialAnchor = null
    this.dialHeading = null
  }

  update(landmarks: Landmarks | null, now: number): GestureFrame {
    if (!landmarks || landmarks.length < 21) {
      // Brief tracking dropouts (motion blur mid-swipe) keep all state.
      if (now - this.lastHandAt > HAND_LOSS_GRACE_MS) this.resetAll()
      return { action: null, active: null, volumePreview: null, pose: 'no hand' }
    }
    this.lastHandAt = now

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
      this.resetDial()
      if (now - this.lastPinchAt > PINCH_COOLDOWN_MS) {
        this.lastPinchAt = now
        return { action: { type: 'togglePlay' }, active: 'pinch', volumePreview: null, pose: poseLabel }
      }
      return { action: null, active: 'pinch', volumePreview: null, pose: poseLabel }
    }

    // --- POINT + CIRCLE: volume dial via velocity-heading rotation ---
    if (pose.isPoint) {
      this.swipeTrail = [] // pointing is never a swipe
      const tip = landmarks[LM.INDEX_TIP]
      if (!this.dialSmoothed) {
        this.dialSmoothed = { x: tip.x, y: tip.y }
        this.dialAnchor = { x: tip.x, y: tip.y }
        this.dialHeading = null
        return { action: null, active: 'volume', volumePreview: this.currentVolume, pose: poseLabel }
      }
      this.dialSmoothed = {
        x: this.dialSmoothed.x * (1 - DIAL_SMOOTH_ALPHA) + tip.x * DIAL_SMOOTH_ALPHA,
        y: this.dialSmoothed.y * (1 - DIAL_SMOOTH_ALPHA) + tip.y * DIAL_SMOOTH_ALPHA,
      }
      const anchor = this.dialAnchor!
      const dx = this.dialSmoothed.x - anchor.x
      const dy = this.dialSmoothed.y - anchor.y
      const step = Math.hypot(dx, dy)
      let action: GestureAction | null = null
      if (step >= DIAL_MIN_STEP) {
        const heading = Math.atan2(dy, dx)
        if (this.dialHeading !== null) {
          const delta = wrapAngle(heading - this.dialHeading)
          if (Math.abs(delta) < DIAL_MAX_TURN) {
            // Camera image is NOT mirrored: the user's clockwise circle shows
            // up counter-clockwise in image coords => negative heading delta
            // (atan2 with y pointing down). Clockwise (user) = volume UP.
            const target = Math.min(1, Math.max(0, this.currentVolume - delta * DIAL_GAIN))
            if (target !== this.currentVolume) {
              this.currentVolume = target
              action = { type: 'volume', value: target }
            }
          }
        }
        this.dialHeading = heading
        this.dialAnchor = { ...this.dialSmoothed }
      }
      return { action, active: 'volume', volumePreview: this.currentVolume, pose: poseLabel }
    }
    this.resetDial()

    // --- SWIPE: fast horizontal motion in any non-pinch, non-point pose.
    // Motion blur wrecks pose classification mid-swipe, so we don't demand a
    // clean palm — intent is in the motion, not the finger count.
    const { x } = palmCenter(landmarks)
    this.swipeTrail.push({ x, t: now })
    this.swipeTrail = this.swipeTrail.filter((p) => now - p.t <= SWIPE_WINDOW_MS)

    if (this.swipeTrail.length >= 3 && now - this.lastSwipeAt > SWIPE_COOLDOWN_MS) {
      // Longest monotonic run ending at the newest point: a direction change
      // (e.g. the return stroke) stops the walk instead of cancelling out.
      const trail = this.swipeTrail
      const last = trail.length - 1
      const dir = Math.sign(trail[last].x - trail[last - 1].x)
      let start = last
      while (start > 0 && Math.sign(trail[start].x - trail[start - 1].x) * dir >= 0) start--
      const runDx = trail[last].x - trail[start].x
      if (Math.abs(runDx) > SWIPE_MIN_DX) {
        this.lastSwipeAt = now
        this.swipeTrail = []
        // Camera coords: the image is NOT mirrored, so a user moving their
        // hand to THEIR right shows up as x decreasing. dx < 0 => user
        // swiped right => next track.
        const userSwipedRight = runDx < 0
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
