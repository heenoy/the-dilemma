let audioContext = null
let audioReady = false
let unlockAudio = null
let lastTypewriterAt = 0
let lastGlitchAt = 0

const TYPEWRITER_MIN_GAP = 30
const GLITCH_MIN_GAP = 200
const GLITCH_PLAY_CHANCE = 0.22
const GLITCH_VOLUME = 0.022

const TYPEWRITER_FREQ = 440
const TYPEWRITER_DURATION = 0.015
const TYPEWRITER_VOLUME = 0.03
const TYPEWRITER_SKIP_CHARS = new Set([' ', '。', '，', '？', '！', '：'])

export function setupAudioUnlock() {
  if (unlockAudio) return

  unlockAudio = async () => {
    if (audioReady) return

    audioContext = new AudioContext()
    if (audioContext.state === 'suspended') {
      await audioContext.resume()
    }
    audioReady = audioContext.state === 'running'

    document.removeEventListener('pointerdown', unlockAudio)
    document.removeEventListener('keydown', unlockAudio)
    unlockAudio = null
  }

  document.addEventListener('pointerdown', unlockAudio)
  document.addEventListener('keydown', unlockAudio)
}

export function destroyAudio() {
  if (unlockAudio) {
    document.removeEventListener('pointerdown', unlockAudio)
    document.removeEventListener('keydown', unlockAudio)
    unlockAudio = null
  }
  if (audioContext) audioContext.close()
  audioContext = null
  audioReady = false
  lastTypewriterAt = 0
  lastGlitchAt = 0
}

export function playTypewriterClick(char) {
  if (char !== undefined && TYPEWRITER_SKIP_CHARS.has(char)) return
  if (!audioReady || !audioContext) return

  const now = performance.now()
  if (now - lastTypewriterAt < TYPEWRITER_MIN_GAP) return
  lastTypewriterAt = now

  const t = audioContext.currentTime
  const osc = audioContext.createOscillator()
  const gain = audioContext.createGain()

  osc.type = 'sine'
  osc.frequency.value = TYPEWRITER_FREQ
  osc.connect(gain)
  gain.connect(audioContext.destination)

  gain.gain.setValueAtTime(TYPEWRITER_VOLUME, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + TYPEWRITER_DURATION)

  osc.start(t)
  osc.stop(t + TYPEWRITER_DURATION)
}

export function playGlitchClick() {
  if (Math.random() > GLITCH_PLAY_CHANCE) return
  if (!audioReady || !audioContext) return

  const now = performance.now()
  if (now - lastGlitchAt < GLITCH_MIN_GAP) return
  lastGlitchAt = now

  const t = audioContext.currentTime
  const duration = 0.022
  const sampleRate = audioContext.sampleRate
  const bufferSize = Math.max(1, Math.floor(sampleRate * duration))
  const buffer = audioContext.createBuffer(1, bufferSize, sampleRate)
  const data = buffer.getChannelData(0)

  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
  }

  const source = audioContext.createBufferSource()
  source.buffer = buffer

  const filter = audioContext.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 350 + Math.random() * 600
  filter.Q.value = 1.5

  const gain = audioContext.createGain()
  gain.gain.setValueAtTime(GLITCH_VOLUME, t)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(audioContext.destination)
  source.start(t)
  source.stop(t + duration)
}
