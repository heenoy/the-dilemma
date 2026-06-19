const FACE_STATUS = {
  idle: 'IDLE',
  detected: 'ACTIVE',
  processing: 'PROC..',
  anomaly: 'WARNING',
  error: '[ERR]',
}

const LEFT_EYE = { x: 72, y: 118 }
const RIGHT_EYE = { x: 128, y: 118 }
const MAX_EYE_MOVE = 10
const SVG_W = 200
const SVG_H = 220
const EYE_PUPIL_R = 9
const EYE_PUPIL_R_IDLE = 8
const HEAD_ROTATE_PIVOT = { x: 30, y: 140 }
const HEAD_ROTATE_ORIGIN = '30px 140px'
const HEAD_ROTATE_FRAMES = [0, -4, -8, -4]
const SPEAK_FRAME_MS = 150
const OUTLINE_STROKE = '#00aa22'

let faceAnomalyLevel = 0
let faceDestroyed = false
let currentFaceState = 'idle'
export let isSpeaking = false

let mouseX = 0
let mouseY = 0
let rafPending = false
let mouseMoveHandler = null

let idleSweepRaf = null
let idleSweepStart = 0

let anomalyDriftTimer = null
let anomalyDriftRestoreTimer = null
let rightEyeDrifting = false
let rightEyeDriftPos = { x: RIGHT_EYE.x, y: RIGHT_EYE.y }

let mouthAnimTimer = null
let mouthFrameIndex = 0
let speakEndTimer = null
let speakingDepth = 0
let headRotateDeg = 0

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getFaceEl() {
  return document.getElementById('ai-face')
}

function getSvgEl() {
  return document.getElementById('ai-svg')
}

function buildFaceSvg() {
  return `<svg id="ai-svg" width="200" height="220"
  xmlns="http://www.w3.org/2000/svg">

  <defs>
    <filter id="glow">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- 下巴（固定不动），实心荧光绿填充 -->
  <rect id="jaw" x="30" y="145" width="140" height="18"
    fill="#00ff41" stroke="#00ff41" stroke-width="2"
    rx="4"/>

  <!-- 头部整体（说话时上抬） -->
  <g id="head-group">
    <!-- 头部填色，实心荧光绿 -->
    <path d="M 30,140 A 70,70 0 0 1 170,140 Z"
      fill="#00ff41"/>
    <!-- 头部轮廓线，黑色描边让形状清晰 -->
    <path d="M 30,140 A 70,70 0 0 1 170,140"
      fill="none" stroke="#00aa22" stroke-width="1.5"/>
    <!-- 头部底边 -->
    <line x1="30" y1="140" x2="170" y2="140"
      stroke="#00aa22" stroke-width="1.5"/>

    <!-- 左眼眼眶，黑色填充 -->
    <circle cx="72" cy="118" r="22"
      fill="#000000" stroke="#00aa22" stroke-width="2"/>
    <!-- 左眼珠，亮绿 -->
    <circle id="eye-left" cx="72" cy="118" r="9"
      fill="#00ff41" filter="url(#glow)"/>

    <!-- 右眼眼眶，黑色填充 -->
    <circle cx="128" cy="118" r="22"
      fill="#000000" stroke="#00aa22" stroke-width="2"/>
    <!-- 右眼珠 -->
    <circle id="eye-right" cx="128" cy="118" r="9"
      fill="#00ff41" filter="url(#glow)"/>
  </g>

  <!-- 状态文字 -->
  <text id="ai-status" x="100" y="205"
    text-anchor="middle"
    font-family="'Press Start 2P'"
    font-size="7"
    fill="rgba(0,255,65,0.7)">ACTIVE</text>

</svg>`
}

function getSvgRect() {
  const svg = getSvgEl()
  return svg ? svg.getBoundingClientRect() : null
}

function getEyeScreenCenter(centerSvgX, centerSvgY, svgRect) {
  const scaleX = svgRect.width / SVG_W
  const scaleY = svgRect.height / SVG_H
  const pivotX = svgRect.left + HEAD_ROTATE_PIVOT.x * scaleX
  const pivotY = svgRect.top + HEAD_ROTATE_PIVOT.y * scaleY
  const localX = (centerSvgX - HEAD_ROTATE_PIVOT.x) * scaleX
  const localY = (centerSvgY - HEAD_ROTATE_PIVOT.y) * scaleY
  const angleRad = (headRotateDeg * Math.PI) / 180
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)
  return {
    x: pivotX + localX * cos - localY * sin,
    y: pivotY + localX * sin + localY * cos,
  }
}

function getEyePos(centerSvgX, centerSvgY, svgRect, mouseX, mouseY, maxDist) {
  const { x: centerScreenX, y: centerScreenY } = getEyeScreenCenter(centerSvgX, centerSvgY, svgRect)
  const dx = mouseX - centerScreenX
  const dy = mouseY - centerScreenY
  const dist = Math.hypot(dx, dy)
  const ratio = Math.min(maxDist, dist * 0.15) / (dist || 1)
  return {
    x: centerSvgX + dx * ratio,
    y: centerSvgY + dy * ratio,
  }
}

function setEyePosition(side, x, y) {
  const pupil = document.getElementById(`eye-${side}`)
  if (!pupil) return
  pupil.setAttribute('cx', String(x))
  pupil.setAttribute('cy', String(y))
}

function resetEyePositions() {
  setEyePosition('left', LEFT_EYE.x, LEFT_EYE.y)
  setEyePosition('right', RIGHT_EYE.x, RIGHT_EYE.y)
}

function updateEyes(clientX, clientY) {
  if (faceDestroyed || currentFaceState === 'idle') return

  const svgRect = getSvgRect()
  if (!svgRect) return

  if (currentFaceState === 'error') {
    resetEyePositions()
    return
  }

  const leftPos = getEyePos(LEFT_EYE.x, LEFT_EYE.y, svgRect, clientX, clientY, MAX_EYE_MOVE)
  setEyePosition('left', leftPos.x, leftPos.y)

  if (currentFaceState === 'anomaly' && rightEyeDrifting) {
    setEyePosition('right', rightEyeDriftPos.x, rightEyeDriftPos.y)
    return
  }

  const rightPos = getEyePos(RIGHT_EYE.x, RIGHT_EYE.y, svgRect, clientX, clientY, MAX_EYE_MOVE)
  setEyePosition('right', rightPos.x, rightPos.y)
}

function onMouseMove(e) {
  if (faceDestroyed) return
  mouseX = e.clientX
  mouseY = e.clientY
  if (!rafPending) {
    rafPending = true
    requestAnimationFrame(() => {
      updateEyes(mouseX, mouseY)
      rafPending = false
    })
  }
}

function ensureMouseTracking() {
  if (mouseMoveHandler) return
  mouseMoveHandler = onMouseMove
  document.addEventListener('mousemove', mouseMoveHandler)
}

function stopMouseTracking() {
  if (!mouseMoveHandler) return
  document.removeEventListener('mousemove', mouseMoveHandler)
  mouseMoveHandler = null
}

function getHeadGroup() {
  return document.getElementById('head-group')
}

function setHeadRotate(deg) {
  headRotateDeg = deg
  const head = getHeadGroup()
  if (!head) return
  head.style.transformOrigin = HEAD_ROTATE_ORIGIN
  head.style.transform = `rotate(${deg}deg)`
}

function showMouthClosed() {
  setHeadRotate(0)
}

function showMouthFrame(index) {
  setHeadRotate(HEAD_ROTATE_FRAMES[index] ?? 0)
}

function stopMouthAnimation() {
  if (mouthAnimTimer) {
    clearTimeout(mouthAnimTimer)
    mouthAnimTimer = null
  }
  showMouthClosed()
}

function scheduleMouthFrame() {
  mouthFrameIndex = (mouthFrameIndex + 1) % 4
  showMouthFrame(mouthFrameIndex)
  mouthAnimTimer = setTimeout(scheduleMouthFrame, SPEAK_FRAME_MS)
}

function startMouthAnimation() {
  if (mouthAnimTimer) return
  mouthFrameIndex = 0
  showMouthFrame(0)
  mouthAnimTimer = setTimeout(scheduleMouthFrame, SPEAK_FRAME_MS)
}

export function notifyTypewriterStart() {
  speakingDepth++
  if (speakEndTimer) {
    clearTimeout(speakEndTimer)
    speakEndTimer = null
  }
  isSpeaking = true
  startMouthAnimation()
}

export function notifyTypewriterEnd() {
  speakingDepth = Math.max(0, speakingDepth - 1)
  if (speakEndTimer) clearTimeout(speakEndTimer)
  speakEndTimer = setTimeout(() => {
    if (speakingDepth === 0) {
      isSpeaking = false
      stopMouthAnimation()
    }
    speakEndTimer = null
  }, 300)
}

function stopIdleSweep() {
  if (idleSweepRaf) {
    cancelAnimationFrame(idleSweepRaf)
    idleSweepRaf = null
  }
}

function startIdleSweep() {
  stopIdleSweep()
  idleSweepStart = performance.now()

  const tick = (now) => {
    if (currentFaceState !== 'idle' || faceDestroyed) return
    const t = ((now - idleSweepStart) % 2000) / 2000
    const sweep = Math.sin(t * Math.PI * 2) * 8
    setEyePosition('left', LEFT_EYE.x + sweep, LEFT_EYE.y)
    setEyePosition('right', RIGHT_EYE.x + sweep, RIGHT_EYE.y)
    idleSweepRaf = requestAnimationFrame(tick)
  }

  idleSweepRaf = requestAnimationFrame(tick)
}

function stopAnomalyDrift() {
  if (anomalyDriftTimer) {
    clearTimeout(anomalyDriftTimer)
    anomalyDriftTimer = null
  }
  if (anomalyDriftRestoreTimer) {
    clearTimeout(anomalyDriftRestoreTimer)
    anomalyDriftRestoreTimer = null
  }
  rightEyeDrifting = false
  rightEyeDriftPos = { x: RIGHT_EYE.x, y: RIGHT_EYE.y }
}

function scheduleAnomalyDrift() {
  stopAnomalyDrift()
  const run = () => {
    if (currentFaceState !== 'anomaly' || faceDestroyed) return
    const angle = Math.random() * Math.PI * 2
    const dist = Math.random() * MAX_EYE_MOVE
    rightEyeDriftPos = {
      x: RIGHT_EYE.x + Math.cos(angle) * dist,
      y: RIGHT_EYE.y + Math.sin(angle) * dist,
    }
    rightEyeDrifting = true
    setEyePosition('right', rightEyeDriftPos.x, rightEyeDriftPos.y)
    const driftDuration = randomInt(1000, 2000)
    anomalyDriftRestoreTimer = setTimeout(() => {
      rightEyeDrifting = false
      updateEyes(mouseX, mouseY)
      anomalyDriftRestoreTimer = null
    }, driftDuration)
    anomalyDriftTimer = setTimeout(run, randomInt(3000, 8000))
  }
  anomalyDriftTimer = setTimeout(run, randomInt(3000, 8000))
}

function getEyeSockets() {
  const head = getHeadGroup()
  if (!head) return []
  return [...head.querySelectorAll('circle')].filter(
    (circle) => circle.id !== 'eye-left' && circle.id !== 'eye-right',
  )
}

function setBodyStroke(color) {
  document.getElementById('jaw')?.setAttribute('stroke', color)
  const head = getHeadGroup()
  if (!head) return
  for (const el of head.querySelectorAll('path[fill="none"], line')) {
    el.setAttribute('stroke', color)
  }
}

function applyStateStyles(state) {
  const el = getFaceEl()
  const eyeSockets = getEyeSockets()
  const leftPupil = document.getElementById('eye-left')
  const rightPupil = document.getElementById('eye-right')
  const jaw = document.getElementById('jaw')
  const status = document.getElementById('ai-status')
  const svg = getSvgEl()

  if (!leftPupil || !rightPupil || !status) return

  status.textContent = FACE_STATUS[state] ?? 'ACTIVE'

  el?.classList.remove('face-state-idle', 'face-state-detected', 'face-state-processing', 'face-state-anomaly', 'face-state-error')
  el?.classList.add(`face-state-${state}`)

  const greenStroke = '#00ff41'
  const greenFill = '#00ff41'
  const redStroke = 'rgba(255,50,50,0.8)'
  const redFill = 'rgba(255,50,50,0.8)'

  if (state === 'error') {
    for (const socket of eyeSockets) socket.setAttribute('stroke', redStroke)
    leftPupil.setAttribute('r', String(EYE_PUPIL_R))
    rightPupil.setAttribute('r', String(EYE_PUPIL_R))
    leftPupil.setAttribute('fill', redFill)
    rightPupil.setAttribute('fill', redFill)
    leftPupil.setAttribute('opacity', '1')
    rightPupil.setAttribute('opacity', '1')
    leftPupil.removeAttribute('filter')
    rightPupil.removeAttribute('filter')
    setBodyStroke(redStroke)
    jaw?.setAttribute('stroke', redStroke)
    status.setAttribute('fill', redFill)
    svg?.style.removeProperty('filter')
    resetEyePositions()
    return
  }

  for (const socket of eyeSockets) socket.setAttribute('stroke', OUTLINE_STROKE)
  setBodyStroke(OUTLINE_STROKE)
  jaw?.setAttribute('stroke', greenStroke)
  status.setAttribute('fill', 'rgba(0,255,65,0.7)')
  leftPupil.setAttribute('filter', 'url(#glow)')
  rightPupil.setAttribute('filter', 'url(#glow)')

  if (state === 'idle') {
    leftPupil.setAttribute('r', String(EYE_PUPIL_R_IDLE))
    rightPupil.setAttribute('r', String(EYE_PUPIL_R_IDLE))
    leftPupil.setAttribute('fill', greenFill)
    rightPupil.setAttribute('fill', greenFill)
    leftPupil.setAttribute('opacity', '0.6')
    rightPupil.setAttribute('opacity', '0.6')
    svg?.style.removeProperty('filter')
    return
  }

  leftPupil.setAttribute('r', String(EYE_PUPIL_R))
  rightPupil.setAttribute('r', String(EYE_PUPIL_R))
  leftPupil.setAttribute('fill', greenFill)
  rightPupil.setAttribute('fill', greenFill)
  leftPupil.setAttribute('opacity', '1')
  rightPupil.setAttribute('opacity', '1')

  if (state === 'processing') {
    if (svg) svg.style.filter = 'drop-shadow(0 0 6px #00ff41)'
  } else {
    svg?.style.removeProperty('filter')
  }
}

function restartFaceBehaviors() {
  stopIdleSweep()
  stopAnomalyDrift()
  resetEyePositions()

  if (currentFaceState === 'idle') {
    startIdleSweep()
    return
  }

  if (currentFaceState === 'anomaly') {
    scheduleAnomalyDrift()
    updateEyes(mouseX, mouseY)
    return
  }

  if (currentFaceState === 'error') {
    resetEyePositions()
    return
  }

  updateEyes(mouseX, mouseY)
}

export function syncFaceAnomalyLevel(level) {
  faceAnomalyLevel = level
}

export function setFace(state, { glitch = false, alert = false } = {}) {
  const el = getFaceEl()
  if (!el || faceDestroyed || !FACE_STATUS[state]) return

  currentFaceState = state
  headRotateDeg = 0
  el.innerHTML = buildFaceSvg()
  el.dataset.face = state

  const isErrorAlert = alert || (state === 'error' && faceAnomalyLevel >= 4)
  el.classList.toggle('face-error-alert', isErrorAlert)

  if (glitch) {
    el.classList.remove('face-glitch')
    void el.offsetWidth
    el.classList.add('face-glitch')
  }

  applyStateStyles(state)

  if (isSpeaking) {
    startMouthAnimation()
  } else {
    stopMouthAnimation()
  }

  restartFaceBehaviors()
}

export function initAiFaceEarly() {
  ensureMouseTracking()
  showAiFace()
  setFace('idle')
}

export function showAiFace() {
  if (faceDestroyed) return
  const el = getFaceEl()
  if (!el) return
  el.hidden = false
  el.setAttribute('aria-hidden', 'false')
}

export function cleanupAiFace() {
  stopIdleSweep()
  stopAnomalyDrift()
  stopMouthAnimation()
  if (!faceDestroyed) {
    const el = getFaceEl()
    if (el) {
      el.hidden = true
      el.setAttribute('aria-hidden', 'true')
    }
  }
}

export function triggerFaceAttention() {
  const el = getFaceEl()
  if (!el || el.hidden || faceDestroyed) return
  el.classList.add('face-attention')
  setTimeout(() => {
    el.classList.remove('face-attention')
  }, 800)
}

export function triggerFaceTearShake(duration = 300) {
  const el = getFaceEl()
  if (!el || el.hidden || faceDestroyed) return
  el.classList.remove('face-tear-shake')
  void el.offsetWidth
  el.classList.add('face-tear-shake')
  setTimeout(() => {
    el.classList.remove('face-tear-shake')
  }, duration)
}

function deformSvgRandomly() {
  const circleNodes = [...getEyeSockets(), ...['eye-left', 'eye-right'].map((id) => document.getElementById(id)).filter(Boolean)]
  for (const node of circleNodes) {
    const cx = parseFloat(node.getAttribute('cx') || '0') + randomInt(-15, 15)
    const cy = parseFloat(node.getAttribute('cy') || '0') + randomInt(-15, 15)
    const r = Math.max(2, parseFloat(node.getAttribute('r') || '11') + randomInt(-4, 4))
    node.setAttribute('cx', String(cx))
    node.setAttribute('cy', String(cy))
    node.setAttribute('r', String(r))
  }

  setHeadRotate(HEAD_ROTATE_FRAMES[randomInt(0, HEAD_ROTATE_FRAMES.length - 1)])

  const status = document.getElementById('ai-status')
  if (status) {
    status.setAttribute('x', String(100 + randomInt(-18, 18)))
    status.setAttribute('y', String(205 + randomInt(-12, 12)))
    status.setAttribute('transform', `rotate(${randomInt(-30, 30)} 100 205)`)
  }
}

export async function triggerFaceCollapseSequence() {
  const el = getFaceEl()
  if (!el || faceDestroyed) return

  stopIdleSweep()
  stopAnomalyDrift()
  stopMouthAnimation()
  el.classList.remove('face-error-alert', 'face-attention', 'face-to-anomaly', 'face-glitch')

  const deformEnd = performance.now() + 1000
  while (performance.now() < deformEnd) {
    deformSvgRandomly()
    await delay(50)
  }

  el.style.transition = 'opacity 1.5s ease'
  el.style.opacity = '0'
  await delay(1500)

  el.remove()
  faceDestroyed = true
  stopMouseTracking()
}
