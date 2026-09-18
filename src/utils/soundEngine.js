// Web Audio API procedural sound synthesizer
let audioCtx = null
let soundEnabled = true

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

export function setAudioEnabled(enabled) {
  soundEnabled = enabled
}

export function isAudioEnabled() {
  return soundEnabled
}

export function playTargetLockSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  
  // Oscillators for dual-tone sci-fi lock sound
  const osc1 = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  const gain = ctx.createGain()

  osc1.type = 'sine'
  osc2.type = 'triangle'

  // Frequency chirp: 880Hz -> 1320Hz
  osc1.frequency.setValueAtTime(880, now)
  osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.08)

  osc2.frequency.setValueAtTime(1760, now)
  osc2.frequency.exponentialRampToValueAtTime(2640, now + 0.08)

  gain.gain.setValueAtTime(0.08, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

  osc1.connect(gain)
  osc2.connect(gain)
  gain.connect(ctx.destination)

  osc1.start(now)
  osc2.start(now)
  osc1.stop(now + 0.12)
  osc2.stop(now + 0.12)
}

export function playClickSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(600, now)
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.04)

  gain.gain.setValueAtTime(0.05, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.04)
}

export function playFilterSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(350, now)
  osc.frequency.linearRampToValueAtTime(750, now + 0.06)

  gain.gain.setValueAtTime(0.04, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.07)
}

export function playRadarPing() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(1200, now)
  osc.frequency.exponentialRampToValueAtTime(400, now + 0.3)

  gain.gain.setValueAtTime(0.03, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.35)
}
