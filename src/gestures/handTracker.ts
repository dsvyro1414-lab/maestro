// MediaPipe HandLandmarker: 21 hand keypoints per frame, fully in-browser.
import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision'

export type Landmarks = NormalizedLandmark[]

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export async function createHandLandmarker(): Promise<HandLandmarker> {
  const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
    runningMode: 'VIDEO',
    numHands: 1,
    minHandDetectionConfidence: 0.6,
    minHandPresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
  })
}

/** Hand landmark indices (MediaPipe convention). */
export const LM = {
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_TIP: 20,
} as const

export function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/** Palm center: average of wrist + finger MCPs — stable point for swipe tracking. */
export function palmCenter(lm: Landmarks): { x: number; y: number } {
  const ids = [LM.WRIST, LM.INDEX_MCP, LM.MIDDLE_MCP, LM.RING_MCP, LM.PINKY_MCP]
  let x = 0
  let y = 0
  for (const i of ids) {
    x += lm[i].x
    y += lm[i].y
  }
  return { x: x / ids.length, y: y / ids.length }
}

/** Scale reference so thresholds work at any distance from the camera. */
export function handScale(lm: Landmarks): number {
  return dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP])
}

/** A finger is "extended" if its tip is farther from the wrist than its PIP joint. */
function fingerExtended(lm: Landmarks, tip: number, pip: number): boolean {
  const wrist = lm[LM.WRIST]
  return dist(lm[tip], wrist) > dist(lm[pip], wrist) * 1.15
}

export interface HandPose {
  index: boolean
  middle: boolean
  ring: boolean
  pinky: boolean
  extendedCount: number
  isPinch: boolean
  isFist: boolean
  isPalm: boolean
  isPoint: boolean
}

export function classifyPose(lm: Landmarks): HandPose {
  const index = fingerExtended(lm, LM.INDEX_TIP, LM.INDEX_PIP)
  const middle = fingerExtended(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP)
  const ring = fingerExtended(lm, LM.RING_TIP, LM.RING_PIP)
  const pinky = fingerExtended(lm, LM.PINKY_TIP, LM.PINKY_PIP)
  const extendedCount = [index, middle, ring, pinky].filter(Boolean).length
  const scale = handScale(lm)
  const pinchDist = dist(lm[LM.THUMB_TIP], lm[LM.INDEX_TIP]) / scale
  // Pinch: thumb+index touching while middle/ring extended (so it can't be
  // confused with a fist or the pointing pose).
  const isPinch = pinchDist < 0.35 && middle && ring
  const isFist = extendedCount === 0 && !isPinch
  const isPalm = extendedCount === 4 && !isPinch
  const isPoint = index && !middle && !ring && !pinky && !isPinch
  return { index, middle, ring, pinky, extendedCount, isPinch, isFist, isPalm, isPoint }
}
