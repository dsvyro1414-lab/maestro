import { useEffect, useRef } from 'react'
import { createHandLandmarker } from '../gestures/handTracker'
import { GestureEngine, type GestureFrame } from '../gestures/gestureEngine'

// Landmark pairs for drawing the hand skeleton.
const BONES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
]

interface Props {
  engine: GestureEngine
  onFrame: (frame: GestureFrame) => void
  onCameraError: (message: string) => void
}

export function CameraPanel({ engine, onFrame, onCameraError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  useEffect(() => {
    let cancelled = false
    let raf = 0
    let stream: MediaStream | null = null

    async function start() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas) return
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
          audio: false,
        })
      } catch {
        onCameraError('Camera access denied — Maestro needs your webcam to see gestures')
        return
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      video.srcObject = stream
      await video.play()
      const landmarker = await createHandLandmarker()
      if (cancelled) return

      const ctx = canvas.getContext('2d')!
      let lastVideoTime = -1

      const loop = () => {
        if (cancelled) return
        if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
          lastVideoTime = video.currentTime
          const now = performance.now()
          const result = landmarker.detectForVideo(video, now)
          const lm = result.landmarks?.[0] ?? null
          const frame = engine.update(lm, now)
          onFrameRef.current(frame)

          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          if (lm) {
            // Mirror so it feels like a selfie view.
            ctx.save()
            ctx.translate(canvas.width, 0)
            ctx.scale(-1, 1)
            ctx.strokeStyle = 'rgba(30, 215, 96, 0.9)'
            ctx.lineWidth = 3
            for (const [a, b] of BONES) {
              ctx.beginPath()
              ctx.moveTo(lm[a].x * canvas.width, lm[a].y * canvas.height)
              ctx.lineTo(lm[b].x * canvas.width, lm[b].y * canvas.height)
              ctx.stroke()
            }
            ctx.fillStyle = '#fff'
            for (const p of lm) {
              ctx.beginPath()
              ctx.arc(p.x * canvas.width, p.y * canvas.height, 4, 0, Math.PI * 2)
              ctx.fill()
            }
            ctx.restore()
          }
        }
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }

    start()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [engine, onCameraError])

  return (
    <div className="camera-panel">
      <video ref={videoRef} className="camera-video" muted playsInline />
      <canvas ref={canvasRef} className="camera-canvas" />
    </div>
  )
}
