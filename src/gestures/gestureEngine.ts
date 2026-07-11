// Gesture state machine on top of raw hand poses.
//
// Gestures:
//   PINCH (thumb+index tap)         -> play/pause toggle
//   PALM SWIPE left/right           -> previous/next track
//   POINT + move hand up/down       -> volume (relative to entry point)
//   FIST held ~600ms                -> mute toggle
//
// The engine consumes one classified frame at a time and emits discrete
// actions. All thresholds are normalized by hand size so they work at any
// distance from the camera.

import { classifyPose, palmCenter, type Landmarks, LM } from './handTracker'

export type GestureAction =
  | { type: 'togglePlay' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'volume'; value: number } // absolute 0..1
  | { type: 'muteToggle' }

export type GestureName = 'pinch' | 'swipe-left' | 'swipe-right' | 'volume' | 'fist' | null

export interface GestureFrame {
  action: GestureAction | null
  /** currently active/continuous gesture for UI feedback */
  active: GestureName
  volumePreview: number | null
}

interface TrailPoint {
  x: number
  t: number
}

const SWIPE_WINDOW_MS = 280
const SWIPE_MIN_DX = 0.22 // normalized screen fraction
const SWIPE_COOLDOWN_MS = 900
const PINCH_COOLDOWN_MS = 700
const FIST_HOLD_MS = 550
const FIST_COOLDOWN_MS = 1200
const VOLUME_SENSITIVITY = 2.2 // full volume sweep ≈ half the frame height

export class GestureEngine {
  private trail: TrailPoint[] = []
  private lastSwipeAt = -Infinity
  private lastPinchAt = -Infinity
  private pinchWasActive = false
  private fistStart: number | null = null
  private lastFistToggleAt = -Infinity
  private volumeAnchor: { y: number; volume: number } | null = null

  /** Current player volume, kept in sync by the app so relative volume works. */
  currentVolume = 0.6

  update(landmarks: Landmarks | null, now: number): GestureFrame {
    if (!landmarks || landmarks.length < 21) {
      this.trail = []
      this.fistStart = null
      this.volumeAnchor = null
      this.pinchWasActive = false
      return { action: null, active: null, volumePreview: null }
    }

    const pose = classifyPose(landmarks)

    // --- PINCH: play/pause on the moment fingers touch ---
    if (pose.isPinch) {
      this.volumeAnchor = null
      this.fistStart = null
      if (!this.pinchWasActive && now - this.lastPinchAt > PINCH_COOLDOWN_MS) {
        this.pinchWasActive = true
        this.lastPinchAt = now
        return { action: { type: 'togglePlay' }, active: 'pinch', volumePreview: null }
      }
      this.pinchWasActive = true
      return { action: null, active: 'pinch', volumePreview: null }
    }
    this.pinchWasActive = false

    // --- FIST: hold to mute/unmute ---
    if (pose.isFist) {
      this.volumeAnchor = null
      this.trail = []
      if (this.fistStart === null) this.fistStart = now
      if (now - this.fistStart > FIST_HOLD_MS && now - this.lastFistToggleAt > FIST_COOLDOWN_MS) {
        this.lastFistToggleAt = now
        this.fistStart = null
        return { action: { type: 'muteToggle' }, active: 'fist', volumePreview: null }
      }
      return { action: null, active: 'fist', volumePreview: null }
    }
    this.fistStart = null

    // --- POINT: relative volume control ---
    if (pose.isPoint) {
      this.trail = []
      const tipY = landmarks[LM.INDEX_TIP].y
      if (!this.volumeAnchor) {
        this.volumeAnchor = { y: tipY, volume: this.currentVolume }
        return { action: null, active: 'volume', volumePreview: this.currentVolume }
      }
      // Moving the hand UP (y decreases) raises the volume.
      const delta = (this.volumeAnchor.y - tipY) * VOLUME_SENSITIVITY
      const target = Math.min(1, Math.max(0, this.volumeAnchor.volume + delta))
      return { action: { type: 'volume', value: target }, active: 'volume', volumePreview: target }
    }
    this.volumeAnchor = null

    // --- PALM: swipe left/right for prev/next ---
    if (pose.isPalm) {
      const { x } = palmCenter(landmarks)
      this.trail.push({ x, t: now })
      this.trail = this.trail.filter((p) => now - p.t <= SWIPE_WINDOW_MS)
      if (this.trail.length >= 3 && now - this.lastSwipeAt > SWIPE_COOLDOWN_MS) {
        const dx = this.trail[this.trail.length - 1].x - this.trail[0].x
        if (Math.abs(dx) > SWIPE_MIN_DX) {
          this.lastSwipeAt = now
          this.trail = []
          // Camera coords: the image is NOT mirrored, so a user moving their
          // hand to THEIR right shows up as x decreasing. dx < 0 => user
          // swiped right => next track.
          const userSwipedRight = dx < 0
          return {
            action: { type: userSwipedRight ? 'next' : 'previous' },
            active: userSwipedRight ? 'swipe-right' : 'swipe-left',
            volumePreview: null,
          }
        }
      }
      return { action: null, active: null, volumePreview: null }
    }

    this.trail = []
    return { action: null, active: null, volumePreview: null }
  }
}
