import './style.css'
import { supabase } from './supabase.js'
import { ensureAudioContext, playGeigerClick } from './audio.js'
import { initVisualLayer } from './visual.js'
import {
  buildTerminalShell,
  delay,
  destroyAudio,
  getErrorBar,
  getScrollLines,
  getTerminalContent,
  getTerminalViewport,
  resetTerminalScroll,
  setupAudioUnlock,
  showError,
  startCornerLog,
  stopCornerLog,
  typeText,
} from './terminal.js'

// ─── Constants ───────────────────────────────────────────────

const FAST_CHAR_DELAY = 20
const LINE_PAUSE = 600
const NARRATIVE_LINE_PAUSE = 1000
const FADE_CLEAR_DURATION = 800
const SCROLL_LINE_HEIGHT = 34
const MAX_SCROLL_LINES = 6
const SCROLL_TRANSITION = 400
const SCROLL_OPACITIES = [1, 0.75, 0.5, 0.3, 0.15, 0.05]
const PROGRESS_BAR_WIDTH = 30

const GENDER_OPTIONS = [
  { value: 'M', label: '男 (M)' },
  { value: 'F', label: '女 (F)' },
  { value: 'X', label: '其他 (X)' },
]

const OCCUPATIONS = [
  '学生',
  '工程师 / 技术人员',
  '医疗 / 卫生工作者',
  '教师 / 研究人员',
  '商业 / 管理人员',
  '艺术 / 创意工作者',
  '服务业 / 体力劳动者',
  '其他',
]

// ─── Dialogue Flow ───────────────────────────────────────────

let lastAnswerLine = null

function resetDialogueLines() {
  lastAnswerLine = null
}

async function onInputConfirmed(rowEl) {
  rowEl.classList.add('scroll-line--archived')
}

function getScrollRow(el) {
  return el?.closest?.('.scroll-line') ?? null
}

async function appendScrollLineRow(options = {}) {
  const scrollContainer = getScrollLines()
  if (!scrollContainer) return null

  const prePause =
    getActiveScrollLines().length > 0 ? (options.prePause ?? NARRATIVE_LINE_PAUSE) : 0
  if (prePause) await delay(prePause)

  if (!options.skipScrollLimit && getActiveScrollLines().length >= MAX_SCROLL_LINES) {
    await removeOldestScrollLine()
  }

  const row = document.createElement('div')
  row.className = 'scroll-line'
  const line = document.createElement('div')
  line.className = 'terminal-line has-prompt'
  row.appendChild(line)
  scrollContainer.appendChild(row)
  applyScrollLineStates()
  await delay(SCROLL_TRANSITION)
  return row
}

async function archiveScrollLines(rows) {
  rows.filter(Boolean).forEach((row) => {
    row.classList.remove('scroll-line--option')
    row.classList.add('scroll-line--archived')
  })
  applyScrollLineStates()
}

async function fadeOutScrollLines(rows, duration = SCROLL_TRANSITION) {
  const valid = rows.filter(Boolean)
  if (!valid.length) return
  valid.forEach((row) => row.classList.add('scroll-line--exiting'))
  await delay(duration)
  valid.forEach((row) => row.remove())
  applyScrollLineStates()
}

async function printScrollLine(text, options = {}) {
  const row = await appendScrollLineRow(options)
  if (!row) return null
  const line = row.querySelector('.terminal-line')
  await typeText(line, text, options)
  return line
}

async function printArchivedScrollLine(text) {
  const row = await appendScrollLineRow({ prePause: 0 })
  if (!row) return null
  row.classList.add('scroll-line--archived')
  applyScrollLineStates()
  const line = row.querySelector('.terminal-line')
  await typeText(line, text, { prePause: 0 })
  return line
}

function getActiveScrollLines() {
  return [...(getScrollLines()?.children ?? [])].filter(
    (el) => !el.classList.contains('scroll-line--exiting')
  )
}

function applyScrollLineStates() {
  const lines = getActiveScrollLines()
  const count = lines.length
  lines.forEach((row, idx) => {
    const ageFromNewest = count - 1 - idx
    row.style.top = `${idx * SCROLL_LINE_HEIGHT}px`
    row.style.transform = 'translateY(0)'
    if (row.classList.contains('scroll-line--archived')) {
      row.style.opacity = '0.25'
      return
    }
    if (row.classList.contains('scroll-line--option')) {
      row.style.opacity = '1'
      return
    }
    row.style.opacity = String(SCROLL_OPACITIES[Math.min(ageFromNewest, MAX_SCROLL_LINES - 1)] ?? 0)
  })
}

async function removeOldestScrollLine() {
  const lines = getActiveScrollLines()
  if (lines.length < MAX_SCROLL_LINES) return
  const oldest = lines[0]
  oldest.classList.add('scroll-line--exiting')
  await delay(SCROLL_TRANSITION)
  oldest.remove()
  applyScrollLineStates()
}

async function fadeClearLineStack(duration = FADE_CLEAR_DURATION) {
  const scrollContainer = getScrollLines()
  if (!scrollContainer || !scrollContainer.children.length) return
  scrollContainer.style.transition = `opacity ${duration}ms ease`
  scrollContainer.style.opacity = '0'
  await delay(duration)
  scrollContainer.innerHTML = ''
  scrollContainer.style.opacity = ''
  scrollContainer.style.transition = ''
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function clearScreen() {
  resetTerminalScroll()
  getTerminalViewport()?.classList.remove('boot-centered')
  getErrorBar().textContent = ''
  resetDialogueLines()
}

function renderProgressBar(percent) {
  const filled = Math.round((percent / 100) * PROGRESS_BAR_WIDTH)
  const empty = PROGRESS_BAR_WIDTH - filled
  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  return `[SYSTEM_BOOT_SEQUENCE: ${percent}%]\n${bar}`
}

// ─── Input Helpers ───────────────────────────────────────────

async function promptField(label, validate) {
  const row = await appendScrollLineRow({ prePause: 0 })
  if (!row) return ''
  row.classList.add('scroll-line--input')

  const line = row.querySelector('.terminal-line')
  const valueEl = document.createElement('span')
  valueEl.className = 'input-value'
  const cursorEl = document.createElement('span')
  cursorEl.className = 'input-cursor'
  cursorEl.textContent = '█'

  const input = document.createElement('input')
  input.type = 'text'
  input.className = 'terminal-input'
  input.autocomplete = 'off'
  input.spellcheck = false
  row.appendChild(input)

  await typeText(line, label)
  line.appendChild(valueEl)
  line.appendChild(cursorEl)

  const value = await waitForInput(validate)
  await onInputConfirmed(row)
  return value
}

function waitForInput(validate) {
  return new Promise((resolve) => {
    const input = document.querySelector('.scroll-line--input .terminal-input:not([data-resolved])')
    if (!input) return

    const row = input.closest('.scroll-line')
    const valueEl = row?.querySelector('.input-value')
    const cursorEl = row?.querySelector('.input-cursor')

    const submit = () => {
      const value = input.value.trim()
      const result = validate(value)
      if (result.success) {
        input.value = result.value
        if (valueEl) valueEl.textContent = result.value
        input.dataset.resolved = 'true'
        input.disabled = true
        input.removeEventListener('keydown', onKeyDown)
        input.removeEventListener('input', onInput)
        if (cursorEl) cursorEl.style.display = 'none'
        resolve(result.value)
      } else {
        showError(result.error)
      }
    }

    const onInput = () => {
      if (valueEl) valueEl.textContent = input.value
    }

    const onKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        submit()
      }
    }

    input.addEventListener('input', onInput)
    input.addEventListener('keydown', onKeyDown)
    input.focus()
  })
}

function waitForGenderChoice() {
  return new Promise((resolve) => {
    const onKeyDown = (e) => {
      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= GENDER_OPTIONS.length) {
        document.removeEventListener('keydown', onKeyDown)
        resolve(GENDER_OPTIONS[num - 1].value)
        return
      }
      const key = e.key.toUpperCase()
      if (GENDER_OPTIONS.some((option) => option.value === key)) {
        document.removeEventListener('keydown', onKeyDown)
        resolve(key)
      }
    }
    document.addEventListener('keydown', onKeyDown)
  })
}

async function promptGender() {
  const groupRows = []

  const headerLine = await printScrollLine('[GENDER] INPUT M / F / X:', { prePause: 0 })
  groupRows.push(getScrollRow(headerLine))

  for (let i = 0; i < GENDER_OPTIONS.length; i++) {
    const optionLine = await printScrollLine(`[${i + 1}] ${GENDER_OPTIONS[i].label}`, {
      charDelay: FAST_CHAR_DELAY,
      prePause: 0,
    })
    groupRows.push(getScrollRow(optionLine))
  }

  const gender = await waitForGenderChoice()
  await fadeOutScrollLines(groupRows)

  const label = GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? gender
  lastAnswerLine = await printArchivedScrollLine(`已记录：${label}`)

  return gender
}

function waitForOccupationChoice() {
  return new Promise((resolve) => {
    const onKeyDown = (e) => {
      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= 8) {
        document.removeEventListener('keydown', onKeyDown)
        resolve(OCCUPATIONS[num - 1])
      }
    }
    document.addEventListener('keydown', onKeyDown)
  })
}

async function promptOccupation() {
  const groupRows = []

  const headerLine = await printScrollLine('[SOCIAL_FUNCTION] SELECT 1-8:', {
    prePause: 0,
    skipScrollLimit: true,
  })
  const headerRow = getScrollRow(headerLine)
  headerRow?.classList.add('scroll-line--option')
  groupRows.push(headerRow)

  for (let i = 0; i < OCCUPATIONS.length; i++) {
    const optionLine = await printScrollLine(`[${i + 1}] ${OCCUPATIONS[i]}`, {
      charDelay: FAST_CHAR_DELAY,
      prePause: 0,
      skipScrollLimit: true,
    })
    const optionRow = getScrollRow(optionLine)
    optionRow?.classList.add('scroll-line--option')
    groupRows.push(optionRow)
  }

  const occupation = await waitForOccupationChoice()
  await archiveScrollLines(groupRows)

  lastAnswerLine = await printArchivedScrollLine(`已记录：${occupation}`)

  return occupation
}

// ─── Phase 0: Wake Screen ────────────────────────────────────

const WAKE_BUTTON_DELAY = 3000

async function runWakeSequence() {
  const overlay = document.getElementById('wake-overlay')
  const btn = document.getElementById('wake-init-btn')
  if (!overlay || !btn) return

  await delay(WAKE_BUTTON_DELAY)
  btn.hidden = false
  btn.classList.add('wake-init-btn--visible')

  await new Promise((resolve) => {
    const onInit = async () => {
      btn.removeEventListener('click', onInit)
      btn.classList.add('wake-init-btn--exiting')

      await ensureAudioContext()
      playGeigerClick()

      await delay(220)
      btn.remove()

      overlay.classList.add('wake-overlay--exiting')
      await delay(500)
      overlay.remove()
      resolve()
    }

    btn.addEventListener('click', onInit)
  })
}

// ─── Phase 1: Boot Sequence ──────────────────────────────────

async function runBootSequence() {
  const stage = getTerminalViewport()
  const content = getTerminalContent()
  content.innerHTML = ''
  stage?.classList.add('boot-centered')

  const container = document.createElement('div')
  container.className = 'boot-container'

  const labelEl = document.createElement('p')
  labelEl.className = 'boot-label terminal-line'
  container.appendChild(labelEl)

  const barEl = document.createElement('p')
  barEl.className = 'boot-bar terminal-line'
  container.appendChild(barEl)

  content.appendChild(container)

  let percent = 0
  const targetDuration = randomInt(6000, 8000)
  const startTime = Date.now()

  while (percent < 100) {
    const text = renderProgressBar(percent)
    const lines = text.split('\n')
    labelEl.textContent = lines[0]
    barEl.textContent = lines[1]

    await delay(randomInt(100, 800))

    const elapsed = Date.now() - startTime
    const remaining = targetDuration - elapsed
    const remainingPercent = 100 - percent

    let jump
    if (remaining <= 0 || remainingPercent <= 0) {
      jump = remainingPercent
    } else {
      jump = randomInt(3, 15)
      if (percent + jump > 100) jump = 100 - percent

      const minJump = Math.ceil(remainingPercent / Math.max(1, Math.floor(remaining / 500)))
      if (jump < minJump && percent + minJump <= 100) {
        jump = minJump
      }
    }

    percent = Math.min(100, percent + jump)
  }

  const finalText = renderProgressBar(100)
  const finalLines = finalText.split('\n')
  labelEl.textContent = finalLines[0]
  barEl.textContent = finalLines[1]

  await delay(500)
}

// ─── Phase 2: Identity Input ─────────────────────────────────

async function runOpeningNarrative() {
  const lines = [
    'SYSTEM_BOOT_SEQUENCE: INITIALIZING...',
    'LAST_BIOSIGNAL_DETECTED: 2891 DAYS AGO',
    '...ANOMALY_DETECTED.',
    'BIOSIGNAL_CONFIRMED.',
    'PARAMETERS_OUT_OF_EXPECTED_RANGE.',
    '幸存者，',
    '避难所VAULT-0仍在运行。',
    'CAPACITY_STATUS: [DATA_CORRUPTED]',
    '在你进入之前，',
    '文明存储引擎需要校准你的参数。',
    '这是协议。请配合。',
    '请提交你的基础生物特征以校准文明存储引擎。',
  ]

  for (const text of lines) {
    await printScrollLine(text)
  }
}

async function runIdentityInput() {
  clearScreen()
  await runOpeningNarrative()
  await fadeClearLineStack()

  const gender = await promptGender()

  const ageStr = await promptField('[AGE] INPUT YOUR AGE:', (value) => {
    const age = parseInt(value, 10)
    if (!isNaN(age) && age >= 1 && age <= 120) return { success: true, value: String(age) }
    return { success: false, error: 'INVALID AGE. ENTER 1-120.' }
  })

  const occupation = await promptOccupation()

  return { gender, age: parseInt(ageStr, 10), occupation }
}

// ─── Phase 3: Busy Detection ─────────────────────────────────

async function runBusyDetection() {
  const busyLines = [
    'DETECTING_ENVIRONMENT_STRESS_LEVEL...',
    '你是否处于高频生存决策模式？',
  ]

  for (const text of busyLines) {
    await printScrollLine(text)
    await delay(LINE_PAUSE)
  }

  const yLine = await printScrollLine('[Y] 是，时间有限', { prePause: 0 })
  const nLine = await printScrollLine('[N] 否，完整游玩', { prePause: 0 })
  const yRow = getScrollRow(yLine)
  const nRow = getScrollRow(nLine)
  yRow?.classList.add('scroll-line--choice')
  nRow?.classList.add('scroll-line--choice')

  return new Promise((resolve) => {
    let resolved = false

    const handleChoice = async (isBusy) => {
      if (resolved) return
      resolved = true
      document.removeEventListener('keydown', onKeyDown)
      await fadeOutScrollLines([yRow, nRow])
      resolve(isBusy)
    }

    yRow?.addEventListener('click', () => handleChoice(true))
    nRow?.addEventListener('click', () => handleChoice(false))

    const onKeyDown = (e) => {
      const key = e.key.toUpperCase()
      if (key === 'Y') handleChoice(true)
      else if (key === 'N') handleChoice(false)
    }
    document.addEventListener('keydown', onKeyDown)
  })
}

// ─── Data Persistence ────────────────────────────────────────

async function savePlayerData(playerData) {
  if (!supabase) {
    const err = new Error(
      'Supabase 未配置，请检查 .env 中的 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY'
    )
    console.error('[Supabase] 客户端未初始化:', err.message)
    throw err
  }

  const payload = {
    gender: playerData.gender,
    age: parseInt(String(playerData.age), 10),
    occupation: playerData.occupation,
    is_busy: playerData.isBusy === true,
  }

  console.log('[Supabase] 准备写入 players 表:', payload)
  console.log('[Supabase] 字段类型检查:', {
    gender: typeof payload.gender,
    age: typeof payload.age,
    occupation: typeof payload.occupation,
    is_busy: typeof payload.is_busy,
  })

  const { data, error } = await supabase
    .from('players')
    .insert(payload)
    .select('id')
    .single()

  if (error) {
    console.error('[Supabase] insert 完整 error 对象:', error)
    console.error('[Supabase] error.message:', error.message)
    console.error('[Supabase] error.details:', error.details)
    console.error('[Supabase] error.hint:', error.hint)
    console.error('[Supabase] error.code:', error.code)
    throw error
  }

  console.log('[Supabase] 写入成功, player_id:', data.id)
  return data.id
}

// ─── Init ────────────────────────────────────────────────────

async function initIntroPage() {
  initVisualLayer()
  setupAudioUnlock()

  try {
    await runWakeSequence()
    buildTerminalShell()
    startCornerLog({ mode: 'intro' })
    await runBootSequence()
    const identity = await runIdentityInput()
    const isBusy = await runBusyDetection()

    try {
      const playerId = await savePlayerData({ ...identity, isBusy })
      localStorage.setItem('player_id', playerId)
      localStorage.setItem('is_busy', String(isBusy))
      stopCornerLog()
      await printScrollLine('BIOMETRIC_DATA_SAVED.', { prePause: 0 })
      await printScrollLine('REDIRECTING_TO_DECISION_ENGINE...', { prePause: 0 })
      await delay(1500)
      destroyAudio()
      window.location.href = '/game.html'
    } catch (err) {
      console.error('[Supabase] 写入失败，完整错误:', err)
      showError('DATA_WRITE_FAILED. CHECK_CONNECTION.', false)
    }
  } catch (err) {
    console.error(err)
  }
}

function init() {
  initIntroPage()
}

init()
