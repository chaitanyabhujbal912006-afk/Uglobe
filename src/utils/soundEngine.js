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

export function playMeasureSound() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc1 = ctx.createOscillator()
  const osc2 = ctx.createOscillator()
  const gain = ctx.createGain()

  osc1.type = 'triangle'
  osc2.type = 'sine'

  osc1.frequency.setValueAtTime(523.25, now) // C5
  osc1.frequency.exponentialRampToValueAtTime(1046.50, now + 0.1) // C6

  osc2.frequency.setValueAtTime(659.25, now) // E5
  osc2.frequency.exponentialRampToValueAtTime(1318.51, now + 0.1) // E6

  gain.gain.setValueAtTime(0.06, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15)

  osc1.connect(gain)
  osc2.connect(gain)
  gain.connect(ctx.destination)

  osc1.start(now)
  osc2.start(now)
  osc1.stop(now + 0.15)
  osc2.stop(now + 0.15)
}

export function playIntelChime() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(440, now)
  osc.frequency.exponentialRampToValueAtTime(880, now + 0.08)

  gain.gain.setValueAtTime(0.05, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.18)
}

// Ambient Mission Control Space Drone
let droneGain = null
let droneOsc1 = null
let droneOsc2 = null
let droneFilter = null
let droneActive = false

export function isDroneActive() {
  return droneActive
}

export function startAmbientDrone() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx || droneActive) return

  const now = ctx.currentTime

  droneGain = ctx.createGain()
  droneGain.gain.setValueAtTime(0.001, now)
  droneGain.gain.linearRampToValueAtTime(0.02, now + 1.5)

  droneFilter = ctx.createBiquadFilter()
  droneFilter.type = 'lowpass'
  droneFilter.frequency.setValueAtTime(140, now)

  droneOsc1 = ctx.createOscillator()
  droneOsc1.type = 'sawtooth'
  droneOsc1.frequency.setValueAtTime(55, now) // A1 55Hz

  droneOsc2 = ctx.createOscillator()
  droneOsc2.type = 'sine'
  droneOsc2.frequency.setValueAtTime(110, now) // A2 110Hz

  droneOsc1.connect(droneFilter)
  droneOsc2.connect(droneFilter)
  droneFilter.connect(droneGain)
  droneGain.connect(ctx.destination)

  droneOsc1.start(now)
  droneOsc2.start(now)
  droneActive = true
}

export function stopAmbientDrone() {
  if (!droneActive || !audioCtx) return
  const now = audioCtx.currentTime
  if (droneGain) {
    droneGain.gain.linearRampToValueAtTime(0.0001, now + 1.0)
    setTimeout(() => {
      try {
        droneOsc1?.stop()
        droneOsc2?.stop()
        droneOsc1?.disconnect()
        droneOsc2?.disconnect()
        droneGain?.disconnect()
      } catch {}
      droneActive = false
    }, 1100)
  } else {
    droneActive = false
  }
}

export function toggleAmbientDrone() {
  if (droneActive) {
    stopAmbientDrone()
    return false
  } else {
    startAmbientDrone()
    return true
  }
}

export function playTransponderBlip() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(1400, now)
  osc.frequency.setValueAtTime(1800, now + 0.03)

  gain.gain.setValueAtTime(0.04, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.08)
}

export function playSeismicRumble() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(80, now)
  osc.frequency.exponentialRampToValueAtTime(32, now + 0.35)

  gain.gain.setValueAtTime(0.08, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4)

  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + 0.4)
}

export function playSatelliteTelemetry() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return
  const now = ctx.currentTime

  const freqs = [1046.5, 1318.5, 1567.9]
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f, now + i * 0.04)

    gain.gain.setValueAtTime(0.03, now + i * 0.04)
    gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.08)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(now + i * 0.04)
    osc.stop(now + i * 0.04 + 0.08)
  })
}

