// Demo mode: no Spotify, no account, no permissions — gestures drive a tiny
// in-browser synthesizer with procedurally generated tracks (WebAudio).
// Exists so anyone (a judge!) can try Maestro five seconds after opening the
// page. Implements the same PlayerControls surface as the Spotify controller.
import type { PlayerControls, PlayerEvents } from './spotifyPlayer'

interface DemoTrack {
  name: string
  artists: string
  hue: number
  bpm: number
  bassType: OscillatorType
  leadType: OscillatorType
  bass: number[] // midi notes, 16 steps, 0 = rest
  lead: number[]
  kick: number[]
  hat: number[]
}

const TRACKS: DemoTrack[] = [
  {
    name: 'Neon Drive',
    artists: 'Maestro Demo Synth',
    hue: 285,
    bpm: 118,
    bassType: 'sawtooth',
    leadType: 'square',
    bass: [33, 0, 33, 0, 36, 0, 33, 0, 31, 0, 31, 0, 38, 0, 36, 0],
    lead: [57, 0, 60, 64, 0, 64, 0, 62, 55, 0, 59, 62, 0, 67, 66, 64],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
  },
  {
    name: 'Midnight Lo-Fi',
    artists: 'Maestro Demo Synth',
    hue: 215,
    bpm: 84,
    bassType: 'triangle',
    leadType: 'sine',
    bass: [38, 0, 0, 38, 0, 0, 41, 0, 36, 0, 0, 36, 0, 0, 33, 0],
    lead: [62, 0, 0, 65, 0, 69, 0, 0, 60, 0, 0, 64, 0, 67, 0, 0],
    kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
    hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
  },
  {
    name: 'Solar Bounce',
    artists: 'Maestro Demo Synth',
    hue: 40,
    bpm: 128,
    bassType: 'square',
    leadType: 'sawtooth',
    bass: [29, 0, 29, 29, 0, 29, 0, 29, 34, 0, 34, 34, 0, 33, 0, 31],
    lead: [65, 0, 69, 0, 72, 0, 69, 65, 0, 67, 0, 70, 0, 74, 72, 70],
    kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    hat: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1, 1],
  },
]

function makeArt(hue: number, name: string): string {
  const c = document.createElement('canvas')
  c.width = c.height = 300
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 300, 300)
  g.addColorStop(0, `hsl(${hue}, 75%, 55%)`)
  g.addColorStop(1, `hsl(${(hue + 70) % 360}, 75%, 22%)`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 300, 300)
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'
  ctx.lineWidth = 2
  for (const r of [42, 72, 102, 132]) {
    ctx.beginPath()
    ctx.arc(150, 150, r, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)'
  ctx.fillRect(0, 232, 300, 68)
  ctx.fillStyle = '#fff'
  ctx.font = 'bold 26px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(name, 150, 274)
  return c.toDataURL()
}

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12)

export class DemoPlayer implements PlayerControls {
  private events: PlayerEvents | null = null
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private idx = 0
  private playing = false
  private step = 0
  private nextTime = 0
  private timer: number | null = null
  private volume = 0.6
  private arts: string[] | null = null

  async init(events: PlayerEvents): Promise<void> {
    this.events = events
    events.onDevices([])
    this.emit()
  }

  private emit() {
    if (!this.arts) this.arts = TRACKS.map((t) => makeArt(t.hue, t.name))
    const t = TRACKS[this.idx]
    this.events?.onSnapshot({
      track: { name: t.name, artists: t.artists, albumArt: this.arts[this.idx], paused: !this.playing },
      deviceName: 'in-browser demo synth',
      volumePercent: Math.round(this.volume * 100),
    })
  }

  async activate(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.master = this.ctx.createGain()
      this.master.gain.value = this.volume
      this.master.connect(this.ctx.destination)
    }
    await this.ctx.resume()
  }

  private playNote(freq: number, when: number, dur: number, type: OscillatorType, gain: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(gain, when)
    g.gain.exponentialRampToValueAtTime(0.001, when + dur)
    osc.connect(g)
    g.connect(this.master!)
    osc.start(when)
    osc.stop(when + dur + 0.02)
  }

  private playKick(when: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.frequency.setValueAtTime(150, when)
    osc.frequency.exponentialRampToValueAtTime(45, when + 0.12)
    g.gain.setValueAtTime(0.9, when)
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.25)
    osc.connect(g)
    g.connect(this.master!)
    osc.start(when)
    osc.stop(when + 0.3)
  }

  private playHat(when: number) {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * 0.05)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 6500
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.2, when)
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.05)
    src.connect(hp)
    hp.connect(g)
    g.connect(this.master!)
    src.start(when)
  }

  private tick = () => {
    const ctx = this.ctx
    if (!ctx || !this.playing) return
    const t = TRACKS[this.idx]
    const stepDur = 60 / t.bpm / 4
    while (this.nextTime < ctx.currentTime + 0.12) {
      const s = this.step % 16
      if (t.kick[s]) this.playKick(this.nextTime)
      if (t.hat[s]) this.playHat(this.nextTime)
      if (t.bass[s]) this.playNote(midi(t.bass[s]), this.nextTime, stepDur * 0.9, t.bassType, 0.22)
      if (t.lead[s]) this.playNote(midi(t.lead[s]), this.nextTime, stepDur * 1.8, t.leadType, 0.1)
      this.nextTime += stepDur
      this.step++
    }
  }

  private startScheduler() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.nextTime = this.ctx!.currentTime + 0.06
    this.timer = window.setInterval(this.tick, 30)
  }

  async togglePlay(): Promise<void> {
    await this.activate()
    if (this.playing) {
      this.playing = false
      if (this.timer !== null) window.clearInterval(this.timer)
      this.timer = null
      await this.ctx!.suspend()
    } else {
      this.playing = true
      await this.ctx!.resume()
      this.startScheduler()
    }
    this.emit()
  }

  private async switchTrack(dir: 1 | -1): Promise<void> {
    this.idx = (this.idx + dir + TRACKS.length) % TRACKS.length
    this.step = 0
    if (this.playing) this.startScheduler()
    this.emit()
  }

  async next(): Promise<void> {
    await this.switchTrack(1)
  }

  async previous(): Promise<void> {
    await this.switchTrack(-1)
  }

  async setVolume(v: number): Promise<void> {
    this.volume = Math.min(1, Math.max(0, v))
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03)
    }
  }

  async playTopTracks(): Promise<void> {
    if (!this.playing) await this.togglePlay()
  }

  disconnect() {
    if (this.timer !== null) window.clearInterval(this.timer)
    this.ctx?.close().catch(() => {})
    this.ctx = null
  }
}
