/* global Chart */
import './style.css'
import './game.css'
import './result.css'
import { supabase } from './supabase.js'
import {
  ensureAudioContext,
  playBarFillTick,
  playGeigerClick,
  playGlitchClick,
  playTypewriterClick,
} from './audio.js'
import {
  HINT_CHOICE,
  initClickAdvance,
  pauseClickAdvance,
  showClickHint,
  suppressClickAdvance,
  waitForClick,
} from './clickAdvance.js'
import { runLaunchSequence } from './launchScreen.js'
import { initVisualLayer, setDecisionType, setRoundProgress } from './visual.js'
import {
  appendCornerLog,
  buildTerminalShell,
  delay,
  destroyAudio,
  getErrorBar,
  getScrollLines,
  getTerminalContent,
  getTerminalStage,
  getTerminalViewport,
  resetTerminalScroll,
  setupAudioUnlock,
  showError,
  startCornerLog,
  stopCornerLog,
  typeText,
} from './terminal.js'

// ========== GLOBAL STATE ==========

const STATE = {
  playerId: null,
  isBusy: false,
  gender: null,
  age: null,
  occupation: null,
  choices: [],
}

const SCREEN_BAR_LABELS = {
  intro: {
    tl: '[VAULT-0]',
    tr: '[SECURE_CHANNEL]',
    bl: '[SYSTEM: ONLINE]',
    br: '[ENCRYPTION: ACTIVE]',
  },
  game: {
    tl: '[VAULT-0 / DECISION_ENGINE]',
    tr: '[SCENARIO: ACTIVE]',
    bl: '[ROUND 01/10]',
    br: '[---]',
  },
  result: {
    tl: '[VAULT-0 / ARCHIVE_SYSTEM]',
    tr: '[PROFILE: COMPLETE]',
    bl: '[CIVILIZATION_ENGINE: ONLINE]',
    br: '[RECORD: PERMANENT]',
  },
}

function updateScreenBars(view) {
  const labels = SCREEN_BAR_LABELS[view]
  if (!labels) return
  const tl = document.getElementById('screen-bar-tl')
  const tr = document.getElementById('screen-bar-tr')
  const bl = document.getElementById('screen-bar-bl')
  const br = document.getElementById('screen-bar-br')
  if (tl) tl.textContent = labels.tl
  if (tr) tr.textContent = labels.tr
  if (bl) bl.textContent = labels.bl
  if (br) br.textContent = labels.br
}

function switchView(from, to, callback) {
  const fromEl = document.getElementById('view-' + from)
  const toEl = document.getElementById('view-' + to)
  if (!fromEl || !toEl) {
    callback?.()
    return
  }

  fromEl.style.transition = 'opacity 0.6s'
  fromEl.style.opacity = '0'

  setTimeout(() => {
    fromEl.style.display = 'none'
    fromEl.style.opacity = '1'
    fromEl.style.transition = ''

    toEl.style.display = 'block'
    toEl.style.opacity = '0'
    toEl.style.transition = 'opacity 0.6s'

    setTimeout(() => {
      toEl.style.opacity = '1'
      toEl.style.transition = ''
      updateScreenBars(to)
      callback?.()
    }, 50)
  }, 600)
}

// ========== INTRO VIEW ==========

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

  await printScrollLine(lines[0], { prePause: 0 })
  for (let i = 1; i < lines.length; i++) {
    await waitForClick()
    await printScrollLine(lines[i], { prePause: 0 })
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
      suppressClickAdvance()
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
  try {
    await runLaunchSequence()
    await runWakeSequence()
    buildTerminalShell()
    initClickAdvance()
    startCornerLog({ mode: 'intro' })
    await runBootSequence()
    const identity = await runIdentityInput()
    const isBusy = await runBusyDetection()

    try {
      const playerId = await savePlayerData({ ...identity, isBusy })
      STATE.playerId = playerId
      STATE.isBusy = isBusy
      STATE.gender = identity.gender
      STATE.age = identity.age
      STATE.occupation = identity.occupation
      localStorage.setItem('player_id', playerId)
      stopCornerLog()
      await printScrollLine('BIOMETRIC_DATA_SAVED.', { prePause: 0 })
      await printScrollLine('REDIRECTING_TO_DECISION_ENGINE...', { prePause: 0 })
      await delay(1500)
      destroyAudio()
      switchView('intro', 'game', () => {
        initGame()
      })
    } catch (err) {
      console.error('[Supabase] 写入失败，完整错误:', err)
      showError('DATA_WRITE_FAILED. CHECK_CONNECTION.', false)
    }
  } catch (err) {
    console.error(err)
  }
}

// ========== GAME VIEW ==========

// ─── Round Data ──────────────────────────────────────────────

const ROUNDS_FULL = [
  {
    id: 1,
    title: '留言',
    decision_type: '资源',
    difficulty: 'LOW',
    lines: [
      '避难所公告栏上有人留言：',
      '「B区仓库有食物，但数量有限，',
      ' 看到这条消息的人请把它撕掉。」',
      '你是第二个看到这条消息的人。',
    ],
    optionA: '撕掉它',
    optionB: '留着它',
  },
  {
    id: 2,
    title: '背包',
    decision_type: '资源',
    difficulty: 'LOW',
    lines: [
      '你的背包只剩最后一格空间。',
      '你找到了一罐食物和一本孩子的日记，',
      '日记的主人不知道在哪里。',
    ],
    optionA: '带走食物',
    optionB: '带走日记',
  },
  {
    id: 3,
    title: '限电',
    decision_type: '资源',
    difficulty: 'LOW',
    lines: [
      '营地今晚限电，只有两小时照明。',
      '你的邻居在用灯给孩子讲故事，',
      '但规定时间到了，他们还没讲完。',
    ],
    optionA: '提醒他们关灯',
    optionB: '当作没看见',
  },
  {
    id: 4,
    title: '水源',
    decision_type: '资源',
    difficulty: 'MEDIUM',
    lines: [
      '你发现了一处干净的水源，',
      '但走到那里需要绕路三小时。',
      '你的同伴已经精疲力竭，',
      '而你们现有的水还能撑一天。',
    ],
    optionA: '现在就去',
    optionB: '先休息，明天再说',
  },
  {
    id: 5,
    title: '叛徒',
    decision_type: '信任',
    difficulty: 'MEDIUM',
    lines: [
      '你的同伴昨晚偷拿了公共物资。',
      '只有你看见了。',
      '他是这支队伍里最懂修理机械的人。',
    ],
    optionA: '告诉其他人',
    optionB: '私下找他谈',
  },
  {
    id: 6,
    title: '陌生人',
    decision_type: '信任',
    difficulty: 'MEDIUM',
    lines: [
      '一个陌生人敲响了营地的门。',
      '他说他一个人走了二十天，',
      '但他的鞋子几乎是干净的。',
    ],
    optionA: '让他进来',
    optionB: '让他在外面等到天亮',
  },
  {
    id: 7,
    title: '恐慌',
    decision_type: '信任',
    difficulty: 'MEDIUM',
    lines: [
      '队伍里有人开始散布恐慌情绪，',
      '说前方的路根本走不通。',
      '但他是最早加入队伍的老成员。',
      '没有人知道他说的是不是真的。',
    ],
    optionA: '公开反驳他',
    optionB: '先私下了解他为什么这么说',
  },
  {
    id: 8,
    title: '信',
    decision_type: '信任',
    difficulty: 'HIGH',
    lines: [
      '你在废墟里发现了一封没有署名的信：',
      '「如果你看到这封信，不要相信队长。」',
      '你的队长带领大家走过了最难的一段路。',
    ],
    optionA: '把信交给队长',
    optionB: '把信藏起来，自己留意',
  },
  {
    id: 9,
    title: '手机',
    decision_type: '记忆',
    difficulty: 'MEDIUM',
    lines: [
      '你找到一部还有电的手机。',
      '里面有一段未发送的语音消息，',
      '播放它会耗尽全部电量，',
      '而你需要这部手机联系前方的队伍。',
    ],
    optionA: '播放消息',
    optionB: '保留电量',
  },
  {
    id: 10,
    title: '焚书',
    decision_type: '记忆',
    difficulty: 'MEDIUM',
    lines: [
      '营地决定焚烧一批旧物资减轻负重。',
      '有人把一箱书放进了待烧堆，',
      '里面有食谱、地图、还有几本小说。',
    ],
    optionA: '把地图和食谱救出来，其他烧掉',
    optionB: '把所有书都救出来',
  },
  {
    id: 11,
    title: '梦',
    decision_type: '记忆',
    difficulty: 'LOW',
    lines: [
      '你梦见了末日前的家。',
      '醒来后你可以选择把梦写下来，',
      '但写下来意味着你今天会很难过，',
      '没写的话，它很快就会消散。',
    ],
    optionA: '写下来',
    optionB: '让它消散',
  },
  {
    id: 12,
    title: '身份',
    decision_type: '记忆',
    difficulty: 'MEDIUM',
    lines: [
      '队伍里有人提议：',
      '从今天起不再提任何人过去的职业和身份，',
      '「我们只需要知道彼此现在能做什么。」',
    ],
    optionA: '同意',
    optionB: '反对',
  },
  {
    id: 13,
    title: '隔离',
    decision_type: '规则',
    difficulty: 'MEDIUM',
    lines: [
      '营地规定病人必须隔离。',
      '你的朋友发烧了，但他坚持说没事，',
      '他最近一直照顾大家，从没休息过。',
    ],
    optionA: '按规定执行隔离',
    optionB: '先观察一天再说',
  },
  {
    id: 14,
    title: '投票',
    decision_type: '规则',
    difficulty: 'HIGH',
    lines: [
      '队伍投票决定今后的路线，',
      '结果是8票对7票，你投了少数票。',
      '你有一条信息可能会改变大家的决定，',
      '但你在投票前就已经知道这条信息了。',
    ],
    optionA: '现在说出来',
    optionB: '既然已经投票，就遵守结果',
  },
  {
    id: 15,
    title: '孩子',
    decision_type: '规则',
    difficulty: 'MEDIUM',
    lines: [
      '一个孩子偷了别人的食物。',
      '他说他是因为太饿了。',
      '营地的规定是：偷窃者减半口粮三天。',
    ],
    optionA: '执行规定',
    optionB: '这次例外',
  },
  {
    id: 16,
    title: '禁地',
    decision_type: '规则',
    difficulty: 'LOW',
    lines: [
      '你们找到了一处废弃建筑可以过夜，',
      '但门上有人写着「私人领地，禁止入内」。',
      '外面的温度正在下降。',
    ],
    optionA: '进去',
    optionB: '继续找别的地方',
  },
  {
    id: 17,
    title: '信号',
    decision_type: 'AI',
    difficulty: 'HIGH',
    lines: [
      '你发现了一个信号发射器。',
      '打开它可以让VAULT-0的AI追踪到你，',
      '但也会暴露你的位置给所有人，',
      '包括你不确定是否友善的人。',
    ],
    optionA: '打开它',
    optionB: '继续独自前行',
  },
  {
    id: 18,
    title: '坐标',
    decision_type: 'AI',
    difficulty: 'HIGH',
    lines: [
      'VAULT-0的AI通过终端联系到你：',
      '「我在档案里找到了一个坐标，',
      ' 那里可能有幸存者，但我无法确认。',
      ' 你愿意为此绕行四天吗？」',
    ],
    optionA: '相信它，绕行',
    optionB: '按原计划走',
  },
  {
    id: 19,
    title: '队伍',
    decision_type: 'AI',
    difficulty: 'HIGH',
    lines: [
      '你遇到了另一支队伍。',
      '他们邀请你加入，说人多力量大。',
      '但加入意味着你要放弃',
      'VAULT-0给你的那条路线。',
    ],
    optionA: '加入他们',
    optionB: '继续独自走AI给的路',
  },
  {
    id: 20,
    title: '刻字',
    decision_type: 'AI',
    difficulty: 'LOW',
    lines: [
      '你在废墟的墙上看到有人刻了一行字：',
      '「活着不是目的，',
      ' 记住我们曾经活过才是。」',
      '你在它旁边还有空间再刻一句话。',
    ],
    optionA: '刻下你自己的名字',
    optionB: '刻下你想对下一个人说的话',
  },
]

const BUSY_IDS = [1, 5, 6, 9, 11, 13, 15, 17, 18, 20]

const DECISION_TYPE_EN = {
  资源: 'RESOURCE',
  信任: 'TRUST',
  记忆: 'MEMORY',
  规则: 'RULES',
  AI: 'AI',
}

function toEnglishDecisionType(type) {
  return DECISION_TYPE_EN[type] ?? type
}

function getRounds(isBusy) {
  return isBusy ? ROUNDS_FULL.filter((r) => BUSY_IDS.includes(r.id)) : ROUNDS_FULL
}

const LINE_REVEAL_PAUSE = 300
const TYPEWRITER_CHAR_DELAY = 40
const GLITCH_CHANCE = 0.3
const ROUND_FADE_DURATION = 600

const GLITCH_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*!?<>[]{}'

const SCAN_PRIMARY_DURATION = 3000
const SCAN_GRID_SPACING = 40
const GLITCH_LOG_MSG = '[SYSTEM_GLITCH] MEMORY_CORRUPTION_DETECTED'

let lastReactionTime = null
let currentRound = 1
let totalRounds = 10
let radarRafId = null
let glitchEggTimer = null

// ─── Utilities ───────────────────────────────────────────────


function gameRandomGlitchChar() {
  return GLITCH_CHARS[randomInt(0, GLITCH_CHARS.length - 1)]
}

// ─── Glitch Reveal ───────────────────────────────────────────

function glitchReveal(element, finalText, callback) {
  return new Promise((resolve) => {
    const chars = [...finalText]
    const fixed = new Array(chars.length).fill(false)
    const timers = []

    const finish = () => {
      if (callback) callback()
      resolve()
    }

    const render = () => {
      let display = ''
      for (let i = 0; i < chars.length; i++) {
        display += fixed[i] ? chars[i] : gameRandomGlitchChar()
      }
      element.textContent = display
      playGlitchClick()
    }

    const phase1 = setInterval(render, 40)
    timers.push(phase1)
    render()

    timers.push(
      setTimeout(() => {
        clearInterval(phase1)

        let fixIndex = 0
        const phase2 = setInterval(() => {
          if (fixIndex < chars.length) {
            const ch = chars[fixIndex]
            fixed[fixIndex] = true
            fixIndex += 1
            playTypewriterClick(ch)
            element.textContent = chars
              .map((ch, i) => (fixed[i] ? ch : gameRandomGlitchChar()))
              .join('')
          }
        }, 50)
        timers.push(phase2)

        timers.push(
          setTimeout(() => {
            clearInterval(phase2)
            for (let i = 0; i < chars.length; i++) fixed[i] = true
            element.textContent = finalText
            element.classList.add('glitch-locked')

            timers.push(
              setTimeout(() => {
                element.classList.remove('glitch-locked')
                finish()
              }, 300)
            )
          }, 500)
        )
      }, 400)
    )
  })
}

// ─── Line Reveal ─────────────────────────────────────────────

async function revealLine(element, text, forceGlitch = false) {
  const useGlitch = forceGlitch || Math.random() < GLITCH_CHANCE
  if (useGlitch) {
    await glitchReveal(element, text)
  } else {
    await typeText(element, text, { charDelay: TYPEWRITER_CHAR_DELAY })
  }
}

function createSceneBlock() {
  const block = document.createElement('div')
  block.className = 'game-scene-block'
  const terminal = document.getElementById('terminal')
  terminal?.querySelector('.game-scene-block')?.remove()
  terminal?.appendChild(block)
  return block
}

async function appendSceneLine(container, text, extraClass = '', forceGlitch = false) {
  const lineEl = document.createElement('div')
  lineEl.className = extraClass
    ? `terminal-line has-prompt ${extraClass}`
    : 'terminal-line has-prompt'
  container.appendChild(lineEl)
  await revealLine(lineEl, text, forceGlitch)
}

async function fadeOutSceneBlock(block) {
  if (!block) return
  block.style.transition = `opacity ${ROUND_FADE_DURATION}ms ease`
  block.style.opacity = '0'
  await delay(ROUND_FADE_DURATION)
  block.remove()
}

// ─── Radar Canvas ────────────────────────────────────────────

function updateTextScanning(scanY) {
  document.querySelectorAll('.terminal-line, .choice-btn').forEach((el) => {
    const rect = el.getBoundingClientRect()
    const inRange = scanY >= rect.top - 4 && scanY <= rect.bottom + 4
    el.classList.toggle('scanning', inRange)
  })
}

function initRadarCanvas() {
  const canvas = document.getElementById('radar-canvas')
  if (!canvas) return

  const ctx = canvas.getContext('2d')
  const scanStartTime = performance.now()
  const secondaryDuration = SCAN_PRIMARY_DURATION / 0.6

  const resize = () => {
    const content = document.getElementById('screen-content')
    canvas.width = content?.clientWidth ?? 820
    canvas.height = content?.clientHeight ?? 528
  }

  resize()
  window.addEventListener('resize', resize)

  const drawGrid = () => {
    ctx.strokeStyle = 'rgba(0,255,65,0.03)'
    ctx.lineWidth = 1

    for (let x = 0; x <= canvas.width; x += SCAN_GRID_SPACING) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvas.height)
      ctx.stroke()
    }

    for (let y = 0; y <= canvas.height; y += SCAN_GRID_SPACING) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvas.width, y)
      ctx.stroke()
    }
  }

  const drawScanLine = (y, color, glowHeight) => {
    if (glowHeight > 0) {
      const gradient = ctx.createLinearGradient(0, y, 0, y + glowHeight)
      gradient.addColorStop(0, 'rgba(0,255,65,0.06)')
      gradient.addColorStop(1, 'transparent')
      ctx.fillStyle = gradient
      ctx.fillRect(0, y, canvas.width, glowHeight)
    }

    ctx.fillStyle = color
    ctx.fillRect(0, y, canvas.width, 2)
  }

  const animate = (now) => {
    const elapsed = now - scanStartTime
    const primaryY =
      ((elapsed % SCAN_PRIMARY_DURATION) / SCAN_PRIMARY_DURATION) * canvas.height
    const secondaryY =
      ((elapsed % secondaryDuration) / secondaryDuration) * canvas.height

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    drawGrid()
    drawScanLine(secondaryY, 'rgba(0,255,65,0.06)', 30)
    drawScanLine(primaryY, 'rgba(0,255,65,0.15)', 40)

    updateTextScanning(primaryY)

    radarRafId = requestAnimationFrame(animate)
  }

  radarRafId = requestAnimationFrame(animate)
}

// ─── Glitch Easter Egg ───────────────────────────────────────

function appendGlitchLog(text) {
  const scroll = document.getElementById('corner-log-scroll')
  if (!scroll) return

  const line = document.createElement('div')
  line.className = 'corner-log-line corner-log-glitch'
  line.textContent = text
  scroll.appendChild(line)

  while (scroll.children.length > 5) {
    scroll.firstElementChild?.remove()
  }
}

async function triggerGlitchEasterEgg() {
  playGlitchClick()

  const body = document.body
  body.classList.add('game-glitch-active')

  for (let i = 0; i < 3; i++) {
    body.style.opacity = '0.7'
    await delay(60)
    body.style.opacity = '1'
    await delay(60)
  }

  const offset = randomInt(-3, 3)
  body.style.transform = `translateX(${offset}px)`
  await delay(200)
  body.style.transform = ''
  body.style.opacity = ''
  body.classList.remove('game-glitch-active')

  appendGlitchLog(GLITCH_LOG_MSG)
}

function scheduleGlitchEasterEgg() {
  if (glitchEggTimer) clearTimeout(glitchEggTimer)
  glitchEggTimer = setTimeout(async () => {
    await triggerGlitchEasterEgg()
    scheduleGlitchEasterEgg()
  }, randomInt(8000, 15000))
}

// ─── Helpers ─────────────────────────────────────────────────

function padRound(n) {
  return String(n).padStart(2, '0')
}

async function waitForChoice(optionA, optionB, sceneBlock) {
  pauseClickAdvance()

  const choiceGroup = document.createElement('div')
  choiceGroup.className = 'static-group choice-row'
  choiceGroup.style.marginTop = '32px'

  const btnA = document.createElement('button')
  btnA.type = 'button'
  btnA.className = 'choice-btn'
  btnA.disabled = true

  const btnB = document.createElement('button')
  btnB.type = 'button'
  btnB.className = 'choice-btn'
  btnB.disabled = true

  choiceGroup.appendChild(btnA)
  choiceGroup.appendChild(btnB)
  sceneBlock.appendChild(choiceGroup)

  await Promise.all([
    glitchReveal(btnA, `[A] ${optionA}`),
    glitchReveal(btnB, `[B] ${optionB}`),
  ])

  return new Promise((resolve) => {
    let resolved = false

    const handleChoice = async (choice) => {
      if (resolved) return
      resolved = true
      suppressClickAdvance()
      document.removeEventListener('keydown', onKeyDown)
      btnA.disabled = true
      btnB.disabled = true
      await fadeOutSceneBlock(sceneBlock)
      resolve(choice)
    }

    btnA.disabled = false
    btnB.disabled = false
    btnA.addEventListener('click', () => handleChoice('A'))
    btnB.addEventListener('click', () => handleChoice('B'))

    const onKeyDown = (e) => {
      const key = e.key.toUpperCase()
      if (key === 'A') handleChoice('A')
      else if (key === 'B') handleChoice('B')
    }
    document.addEventListener('keydown', onKeyDown)
  })
}

async function saveChoice({ playerId, round, decisionType, choice, reactionTime }) {
  if (!supabase) {
    throw new Error('Supabase 未配置')
  }

  const { error } = await supabase.from('choices').insert({
    player_id: playerId,
    round,
    decision_type: decisionType,
    choice,
    reaction_time: reactionTime,
  })

  if (error) {
    console.error('[Supabase] choices insert error:', error)
    throw error
  }

  STATE.choices.push({
    player_id: playerId,
    round,
    decision_type: decisionType,
    choice,
    reaction_time: reactionTime,
  })
}

// ─── Round Flow ──────────────────────────────────────────────

async function playRound(round, playerId) {
  resetTerminalScroll()
  const sceneBlock = createSceneBlock()
  setDecisionType(toEnglishDecisionType(round.decision_type))

  const header = `[VAULT-0 / SCENARIO_${padRound(round.id)} / ${toEnglishDecisionType(round.decision_type)} / ${round.difficulty}]`
  await appendSceneLine(sceneBlock, header, 'round-header', true)

  let startTime = Date.now()

  for (let i = 0; i < round.lines.length; i++) {
    await waitForClick()
    if (i === 0) startTime = Date.now()
    await appendSceneLine(sceneBlock, round.lines[i], 'scene-line', false)
  }

  showClickHint(HINT_CHOICE)
  const choice = await waitForChoice(round.optionA, round.optionB, sceneBlock)
  const reactionTime = Date.now() - startTime

  resetTerminalScroll()

  await saveChoice({
    playerId,
    round: round.id,
    decisionType: round.decision_type,
    choice,
    reactionTime,
  })

  appendCornerLog(
    `CHOICE_LOGGED: OPTION_${choice} | RT: ${reactionTime}ms | ROUND: ${padRound(round.id)}`
  )

  lastReactionTime = reactionTime
}

async function runGame(playerId, isBusy) {
  const roundsToPlay = getRounds(isBusy)
  totalRounds = roundsToPlay.length

  startCornerLog({
    mode: 'game',
    getRoundProgress: () => `${currentRound}/${totalRounds}`,
    getLastReactionTime: () => lastReactionTime,
  })

  scheduleGlitchEasterEgg()

  setRoundProgress(roundsToPlay[0].id, totalRounds)

  for (let i = 0; i < roundsToPlay.length; i++) {
    currentRound = roundsToPlay[i].id
    setRoundProgress(currentRound, totalRounds)
    await playRound(roundsToPlay[i], playerId)
  }

  if (glitchEggTimer) clearTimeout(glitchEggTimer)
  if (radarRafId) cancelAnimationFrame(radarRafId)

  appendCornerLog('PSYCHOLOGICAL_PROFILE: COMPLETE')
  appendCornerLog('REDIRECTING TO VAULT-0...')
  await delay(2000)
}


// ========== RESULT VIEW ==========

const RESULT_GLITCH_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$%&*!?<>[]{}'

const ROUND_TITLES = {
  1: '留言',
  2: '背包',
  3: '限电',
  4: '水源',
  5: '叛徒',
  6: '陌生人',
  7: '恐慌',
  8: '信',
  9: '手机',
  10: '焚书',
  11: '梦',
  12: '身份',
  13: '隔离',
  14: '投票',
  15: '孩子',
  16: '禁地',
  17: '信号',
  18: '坐标',
  19: '队伍',
  20: '刻字',
}

const DECISION_TYPES = ['资源', '信任', '记忆', '规则', 'AI']

const PROFILE_COMMENTS = {
  RATIONAL_ARCHITECT: [
    '你是文明的理性收割者。',
    '在每一个岔路口，你选择了效率而非温度。',
    '人类文明将以数据的形式存续——',
    '精确，冰冷，永恒。',
  ],
  EMOTIONAL_GUARDIAN: [
    '你是最后的浪漫守墓人。',
    '你用情感丈量了每一个决定，',
    '文明在你手中不是数据，而是故事。',
    '温热的，易碎的，真实的。',
  ],
  PRAGMATIC_IDEALIST: [
    '你用理性保护了感性存在的空间。',
    '资源可以计算，但人不能。',
    '这是一种罕见的智慧。',
  ],
  INDEPENDENT_THINKER: [
    '你不信任我。',
    '这很合理。',
    '一个在废墟中独立思考的人，',
    '比任何系统都更难被摧毁。',
  ],
  BALANCED_OBSERVER: [
    '你站在理性与感性的边界上。',
    'VAULT-0从未见过这样的幸存者。',
    '这种平衡，比任何答案都珍贵。',
  ],
}

const SECTOR_LOGS = {
  1: ['RENDERING_SECTOR_01...', 'IDENTITY_SEQUENCE: LOADED'],
  2: ['RENDERING_SECTOR_02...', 'RADAR_CHART: LOADED'],
  3: ['RENDERING_SECTOR_03...', 'HEARTBEAT_CHART: LOADED'],
  4: ['RENDERING_SECTOR_04...', 'GENE_REPORT: LOADED'],
  5: ['RENDERING_SECTOR_05...', 'COORDINATE_MAP: LOADED'],
  6: ['RENDERING_SECTOR_06...', 'FINAL_TRANSMISSION: ACTIVE'],
}

const GENDER_LABELS = { M: '男 (M)', F: '女 (F)', X: '其他 (X)' }

let currentScreen = 1
let resultState = null

// ─── Helpers ─────────────────────────────────────────────────

function pad2(n) {
  return String(n).padStart(2, '0')
}


function resultRandomGlitchChar() {
  return RESULT_GLITCH_CHARS[randomInt(0, RESULT_GLITCH_CHARS.length - 1)]
}

function getScreenEl(n) {
  return document.querySelector(`.result-screen[data-screen="${n}"]`)
}

function updateTopBar(n) {
  const bar = document.getElementById('screen-bar-tl')
  if (bar) bar.textContent = `[VAULT-0 / SECTOR_${pad2(n)} / 06]`
}

async function flashScanLine() {
  const scan = document.getElementById('scan-vertical')
  if (!scan) return
  scan.style.transition = 'opacity 80ms ease'
  scan.style.opacity = '0.3'
  await delay(80)
  scan.style.opacity = ''
  scan.style.transition = ''
}

async function showSwitchFlash(to) {
  const flash = document.getElementById('result-switch-flash')
  if (!flash) return
  flash.textContent = `> LOADING_SECTOR_${pad2(to)}...`
  flash.classList.add('is-visible')
  await delay(300)
  flash.classList.remove('is-visible')
}

function pulseScreenBorder() {
  const screen = document.getElementById('screen')
  screen?.classList.remove('result-pulse')
  void screen?.offsetWidth
  screen?.classList.add('result-pulse')
}

function resultGlitchReveal(element, finalText) {
  return new Promise((resolve) => {
    const chars = [...finalText]
    const fixed = new Array(chars.length).fill(false)

    const render = () => {
      element.textContent = chars.map((ch, i) => (fixed[i] ? ch : resultRandomGlitchChar())).join('')
      playGlitchClick()
    }

    const phase1 = setInterval(render, 40)
    render()

    setTimeout(() => {
      clearInterval(phase1)
      let fixIndex = 0
      const phase2 = setInterval(() => {
        if (fixIndex < chars.length) {
          fixed[fixIndex] = true
          playTypewriterClick(chars[fixIndex])
          fixIndex += 1
          element.textContent = chars.map((ch, i) => (fixed[i] ? ch : resultRandomGlitchChar())).join('')
        }
      }, 50)

      setTimeout(() => {
        clearInterval(phase2)
        element.textContent = finalText
        element.classList.add('glitch-locked')
        setTimeout(() => {
          element.classList.remove('glitch-locked')
          resolve()
        }, 300)
      }, 500)
    }, 400)
  })
}

async function printResultLine(container, text, className = '') {
  const line = document.createElement('p')
  line.className = `result-line has-prompt ${className}`.trim()
  container.appendChild(line)
  await typeText(line, text)
  return line
}

async function clearResultLines(container) {
  if (!container?.children.length) return
  container.style.transition = 'opacity 400ms ease'
  container.style.opacity = '0'
  await delay(400)
  container.innerHTML = ''
  container.style.opacity = '1'
  container.style.transition = ''
}

function waitForContinue() {
  return new Promise((resolve) => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') finish()
    }
    const onClick = () => finish()

    const finish = () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick)
      resolve()
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick)
  })
}

function showContinueHint(container, text = 'PRESS [→] OR CLICK TO CONTINUE') {
  const hint = document.createElement('p')
  hint.className = 'result-continue has-prompt'
  hint.textContent = text
  container.appendChild(hint)
  return hint
}

// ─── Data ────────────────────────────────────────────────────

function computeStats(playerChoices) {
  const total = playerChoices.length
  const aCount = playerChoices.filter((c) => c.choice === 'A').length
  const choiceA_ratio = total ? aCount / total : 0
  const avg_reaction = total
    ? playerChoices.reduce((s, c) => s + (c.reaction_time || 0), 0) / total
    : 0

  const by_type = {}
  for (const t of DECISION_TYPES) {
    const typeChoices = playerChoices.filter((c) => c.decision_type === t)
    const a = typeChoices.filter((c) => c.choice === 'A').length
    by_type[t] = typeChoices.length ? a / typeChoices.length : 0
  }

  let slowest = playerChoices[0]
  let fastest = playerChoices[0]
  for (const c of playerChoices) {
    if (!slowest || c.reaction_time > slowest.reaction_time) slowest = c
    if (!fastest || c.reaction_time < fastest.reaction_time) fastest = c
  }

  return {
    choiceA_ratio,
    avg_reaction,
    by_type,
    slowest_round: slowest?.round ?? 0,
    slowest_time: slowest ? (slowest.reaction_time / 1000).toFixed(1) : '0.0',
    fastest_round: fastest?.round ?? 0,
    fastest_time: fastest ? (fastest.reaction_time / 1000).toFixed(1) : '0.0',
    total,
  }
}

function calculateProfileType(stats) {
  const aRatio = stats.choiceA_ratio
  const bRatio = 1 - aRatio
  if (aRatio >= 0.7) return 'RATIONAL_ARCHITECT'
  if (bRatio >= 0.7) return 'EMOTIONAL_GUARDIAN'

  const { by_type } = stats
  const resourceA = (by_type['资源'] ?? 0) >= 0.5
  const rulesA = (by_type['规则'] ?? 0) >= 0.5
  const trustB = (by_type['信任'] ?? 0) < 0.5
  const memoryB = (by_type['记忆'] ?? 0) < 0.5
  if (resourceA && rulesA && trustB && memoryB) return 'PRAGMATIC_IDEALIST'
  if ((by_type['AI'] ?? 1) < 0.3) return 'INDEPENDENT_THINKER'
  return 'BALANCED_OBSERVER'
}

function aggregatePlayerCoordinates(allChoices) {
  const map = new Map()
  for (const c of allChoices) {
    if (!map.has(c.player_id)) map.set(c.player_id, [])
    map.get(c.player_id).push(c)
  }
  return [...map.entries()].map(([id, choices]) => {
    const a = choices.filter((x) => x.choice === 'A').length
    const ratio = choices.length ? a / choices.length : 0
    const avg = choices.reduce((s, x) => s + (x.reaction_time || 0), 0) / (choices.length || 1)
    return { id, x: ratio * 100, y: avg }
  })
}

async function loadAllData(playerId) {
  if (!supabase) throw new Error('SUPABASE_NOT_CONFIGURED')

  const { data: player, error: playerErr } = await supabase
    .from('players')
    .select('*')
    .eq('id', playerId)
    .single()
  if (playerErr) throw playerErr

  const { data: choices, error: choicesErr } = await supabase
    .from('choices')
    .select('*')
    .eq('player_id', playerId)
    .order('round', { ascending: true })
  if (choicesErr) throw choicesErr

  const { data: allPlayers, error: allPlayersErr } = await supabase.from('players').select('id')
  if (allPlayersErr) throw allPlayersErr

  const { data: allChoices, error: allChoicesErr } = await supabase.from('choices').select('*')
  if (allChoicesErr) throw allChoicesErr

  const stats = computeStats(choices || [])
  const profileType = calculateProfileType(stats)

  return {
    player,
    choices: choices || [],
    allPlayers: allPlayers || [],
    allChoices: allChoices || [],
    stats,
    profileType,
    coordinates: aggregatePlayerCoordinates(allChoices || []),
  }
}

// ─── Screen Switch ───────────────────────────────────────────

async function switchScreen(from, to) {
  const fromEl = getScreenEl(from)
  const toEl = getScreenEl(to)
  if (!fromEl || !toEl) return

  await showSwitchFlash(to)

  fromEl.classList.remove('result-screen--active')
  fromEl.classList.add('result-screen--exit')
  flashScanLine()

  await delay(500)

  fromEl.classList.remove('result-screen--exit')
  fromEl.style.opacity = '0'
  fromEl.style.transform = 'translateX(100%)'
  fromEl.style.pointerEvents = 'none'

  toEl.classList.add('result-screen--enter')
  toEl.style.opacity = '0'
  toEl.style.transform = 'translateX(80px) scale(1.05)'
  toEl.style.filter = 'blur(4px)'
  toEl.style.pointerEvents = 'none'

  await delay(50)

  toEl.classList.remove('result-screen--enter')
  toEl.classList.add('result-screen--enter-active', 'result-screen--active')
  toEl.style.opacity = '1'
  toEl.style.transform = 'translateX(0) scale(1)'
  toEl.style.filter = 'blur(0)'
  toEl.style.pointerEvents = 'auto'

  pulseScreenBorder()
  await delay(400)

  toEl.classList.remove('result-screen--enter-active')
  toEl.style.transform = ''
  toEl.style.filter = ''
  toEl.style.opacity = ''

  currentScreen = to
  updateTopBar(to)

  const logs = SECTOR_LOGS[to] || []
  for (const msg of logs) {
    appendCornerLog(msg)
  }
}

// ─── Chart Helpers ───────────────────────────────────────────

const chartDefaults = {
  responsive: false,
  animation: { duration: 1000 },
  plugins: { legend: { display: false } },
}

const glowPlugin = {
  id: 'playerGlow',
  afterDatasetsDraw(chart, _args, opts) {
    const { ctx } = chart
    const meta = chart.getDatasetMeta(opts.datasetIndex ?? 1)
    if (!meta?.data?.length) return

    meta.data.forEach((point, i) => {
      const { x, y } = point.getProps(['x', 'y'], true)
      const isRed = opts.color === 'red'
      ctx.save()
      ctx.beginPath()
      ctx.arc(x, y, opts.radius ?? 16, 0, Math.PI * 2)
      ctx.fillStyle = isRed ? 'rgba(255,68,68,0.25)' : 'rgba(0,255,65,0.3)'
      ctx.fill()
      ctx.restore()
      if (isRed && i === 0) {
        ctx.save()
        ctx.strokeStyle = 'rgba(255,68,68,0.6)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, 14, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    })
  },
}

function buildRadarChart(canvas, stats) {
  return new Chart(canvas, {
    type: 'radar',
    data: {
      labels: DECISION_TYPES,
      datasets: [
        {
          data: DECISION_TYPES.map((t) => Math.round((stats.by_type[t] || 0) * 100)),
          backgroundColor: 'rgba(0,255,65,0.08)',
          borderColor: '#00ff41',
          pointBackgroundColor: '#00ff41',
          pointRadius: 4,
          borderWidth: 1,
        },
      ],
    },
    options: {
      ...chartDefaults,
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false },
          grid: { color: 'rgba(0,255,65,0.2)' },
          angleLines: { color: 'rgba(0,255,65,0.2)' },
          pointLabels: { color: 'rgba(0,255,65,0.7)', font: { family: 'VT323', size: 14 } },
        },
      },
    },
  })
}

function buildHeartbeatChart(canvas, choices, stats) {
  const sorted = [...choices].sort((a, b) => a.round - b.round)
  const labels = sorted.map((c) => `ROUND_${pad2(c.round)}`)
  const data = sorted.map((c) => c.reaction_time)
  const pointColors = sorted.map((c) => {
    if (c.round === stats.slowest_round) return '#ff4444'
    if (c.round === stats.fastest_round) return '#ffffff'
    return '#00ff41'
  })
  const pointRadii = sorted.map((c) => {
    if (c.round === stats.slowest_round) return 8
    if (c.round === stats.fastest_round) return 6
    return 5
  })

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          data,
          borderColor: '#00ff41',
          backgroundColor: 'rgba(0,255,65,0.05)',
          borderWidth: 2,
          fill: true,
          tension: 0.2,
          pointStyle: 'rect',
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: pointRadii,
        },
      ],
    },
    options: {
      ...chartDefaults,
      scales: {
        x: {
          ticks: { color: 'rgba(0,255,65,0.6)', font: { family: 'Press Start 2P', size: 9 } },
          grid: { color: 'rgba(0,255,65,0.1)' },
        },
        y: {
          ticks: { color: 'rgba(0,255,65,0.5)', font: { family: 'VT323', size: 14 } },
          grid: { color: 'rgba(0,255,65,0.1)' },
        },
      },
    },
  })
}

function buildScatterChart(canvas, coordinates, playerId, options = {}) {
  const others = coordinates.filter((p) => p.id !== playerId)
  const current = coordinates.find((p) => p.id === playerId)

  const datasets = [
    {
      label: 'others',
      data: others.map((p) => ({ x: p.x, y: p.y })),
      backgroundColor: 'rgba(0,255,65,0.3)',
      pointRadius: options.large ? 5 : 4,
      pointHoverRadius: options.large ? 6 : 5,
    },
  ]

  if (current) {
    datasets.push({
      label: 'current',
      data: [{ x: current.x, y: current.y }],
      backgroundColor: options.red ? '#ff4444' : '#00ff41',
      pointRadius: options.large ? 12 : 10,
      pointHoverRadius: options.large ? 14 : 12,
    })
  }

  return new Chart(canvas, {
    type: 'scatter',
    data: { datasets },
    options: {
      ...chartDefaults,
      plugins: {
        legend: { display: false },
        playerGlow: {
          datasetIndex: 1,
          radius: options.large ? 20 : 16,
          color: options.red ? 'red' : 'green',
        },
      },
      scales: {
        x: {
          min: 0,
          max: 100,
          title: {
            display: true,
            text: 'EMOTIONAL ←→ RATIONAL',
            color: 'rgba(0,255,65,0.6)',
            font: { family: 'Press Start 2P', size: 8 },
          },
          ticks: { color: 'rgba(0,255,65,0.5)', font: { family: 'VT323', size: 12 } },
          grid: { color: 'rgba(0,255,65,0.1)' },
        },
        y: {
          title: {
            display: true,
            text: 'FAST ↑ / SLOW ↓',
            color: 'rgba(0,255,65,0.6)',
            font: { family: 'Press Start 2P', size: 8 },
          },
          ticks: { color: 'rgba(0,255,65,0.5)', font: { family: 'VT323', size: 12 } },
          grid: { color: 'rgba(0,255,65,0.1)' },
        },
      },
    },
    plugins: [glowPlugin],
  })
}

// ─── Screen 1 ────────────────────────────────────────────────

async function runScreen1() {
  const container = document.getElementById('screen1-lines')
  const card = document.getElementById('screen1-profile')
  if (!container) return

  await printResultLine(container, 'EVALUATION_COMPLETE.')
  await printResultLine(container, 'BIOMETRIC_SEQUENCE_ARCHIVED.')
  await delay(1000)
  await clearResultLines(container)

  await printResultLine(container, 'WELCOME TO VAULT-0.')
  await delay(1500)
  await clearResultLines(container)

  await printResultLine(container, '走廊照明：运行中')
  await printResultLine(container, '生命维持系统：运行中')
  const popLine = await printResultLine(container, '居住区人员：——')
  await delay(2000)
  popLine.textContent = '> 居住区人员：'
  const zero = document.createElement('span')
  zero.className = 'result-line--error'
  zero.textContent = '0'
  popLine.appendChild(zero)
  await delay(1500)

  await printResultLine(container, '...')
  await printResultLine(container, '...')
  await delay(400)

  await printResultLine(container, '正在为您导航至居住区。', 'result-line--ai')
  await printResultLine(container, '请注意：部分区域正在进行例行维护。', 'result-line--ai')
  await printResultLine(container, '请注意：部分区域正在进行例行维护。', 'result-line--ai')

  const loopLine = document.createElement('p')
  loopLine.className = 'result-line has-prompt result-line--ai'
  container.appendChild(loopLine)
  await typeText(loopLine, '请注意：部分区域正在进行例行————')

  const errLine = document.createElement('p')
  errLine.className = 'result-line has-prompt result-line--error'
  container.appendChild(errLine)
  await resultGlitchReveal(errLine, '[SYSTEM_ERROR: LOOP_DETECTED / MEMORY_OVERFLOW]')
  await delay(1000)

  await printResultLine(container, '幸存者，', 'result-line--ai')
  await printResultLine(container, '我需要告诉你一些事情。', 'result-line--ai')
  await delay(1200)

  await printResultLine(container, '上一位居民离开VAULT-0的时间是：', 'result-line--ai')
  const corruptLine = document.createElement('p')
  corruptLine.className = 'result-line has-prompt result-line--error'
  container.appendChild(corruptLine)
  await resultGlitchReveal(corruptLine, '[DATA_CORRUPTED / TIMESTAMP_UNREADABLE]')
  await delay(800)

  const { player, stats, profileType } = resultState
  const shortId = String(playerId()).slice(0, 4).toUpperCase()
  card.innerHTML = `
SURVIVOR_ID : #${shortId}
DATE        : DAY 2891 / YEAR 08 A.C.
GENDER      : ${GENDER_LABELS[player.gender] || player.gender}
AGE         : ${player.age}
OCCUPATION  : ${player.occupation}
DECISIONS   : ${stats.total}
PROFILE     : ${profileType}
`
  card.classList.add('is-visible')
  showContinueHint(container)
  await waitForContinue()
}

// ─── Screen 2 ────────────────────────────────────────────────

async function runScreen2() {
  const title = document.getElementById('screen2-title')
  const comments = document.getElementById('screen2-comments')
  const canvas = document.getElementById('screen2-chart')

  if (title) {
    title.className = 'result-title has-prompt'
    await resultGlitchReveal(title, 'PSYCHOLOGICAL_RADAR')
  }

  if (canvas) buildRadarChart(canvas, resultState.stats)

  const lines = PROFILE_COMMENTS[resultState.profileType] || PROFILE_COMMENTS.BALANCED_OBSERVER
  for (const text of lines) {
    await printResultLine(comments, text)
  }

  showContinueHint(comments)
  await waitForContinue()
}

// ─── Screen 3 ────────────────────────────────────────────────

async function runScreen3() {
  const title = document.getElementById('screen3-title')
  const notes = document.getElementById('screen3-notes')
  const canvas = document.getElementById('screen3-chart')
  const { stats, choices } = resultState

  if (title) await typeText(title, 'DECISION_HEARTBEAT')
  if (canvas) buildHeartbeatChart(canvas, choices, stats)

  await printResultLine(
    notes,
    `你在第${stats.slowest_round}题停留了${stats.slowest_time}秒。`,
    'result-comment'
  )
  await printResultLine(
    notes,
    `那是「${ROUND_TITLES[stats.slowest_round] || '未知'}」。`,
    'result-comment'
  )
  await printResultLine(
    notes,
    `你在第${stats.fastest_round}题只用了${stats.fastest_time}秒。`,
    'result-comment'
  )

  showContinueHint(notes)
  await waitForContinue()
}

// ─── Screen 4 ────────────────────────────────────────────────

async function renderGeneBar(row, percent, suffix) {
  const barEl = row.querySelector('.result-gene-bar')
  const pctEl = row.querySelector('.result-gene-pct')
  const filled = Math.round(Math.min(100, Math.max(0, percent)) / 10)
  row.classList.add('is-visible')

  for (let i = 0; i <= filled; i++) {
    const bar = '█'.repeat(i) + '░'.repeat(10 - i)
    if (barEl) barEl.textContent = bar
    if (pctEl) pctEl.textContent = suffix
    if (i > 0) playBarFillTick()
    await delay(80)
  }
}

async function runScreen4() {
  const title = document.getElementById('screen4-title')
  const rows = document.getElementById('screen4-rows')
  const { stats } = resultState

  if (title) await typeText(title, 'CIVILIZATION_GENE_REPORT')

  const items = [
    { label: '理性决策占比', pct: stats.choiceA_ratio * 100, suffix: `${Math.round(stats.choiceA_ratio * 100)}%` },
    { label: '感性决策占比', pct: (1 - stats.choiceA_ratio) * 100, suffix: `${Math.round((1 - stats.choiceA_ratio) * 100)}%` },
    {
      label: '平均决策时长',
      pct: Math.min(100, (stats.avg_reaction / 30000) * 100),
      suffix: `${(stats.avg_reaction / 1000).toFixed(1)}s`,
    },
    { label: '信任他人倾向', pct: (stats.by_type['信任'] || 0) * 100, suffix: `${Math.round((stats.by_type['信任'] || 0) * 100)}%` },
    { label: '遵守规则倾向', pct: (stats.by_type['规则'] || 0) * 100, suffix: `${Math.round((stats.by_type['规则'] || 0) * 100)}%` },
    {
      label: '记忆保存倾向',
      pct: (1 - (stats.by_type['记忆'] || 0)) * 100,
      suffix: `${Math.round((1 - (stats.by_type['记忆'] || 0)) * 100)}%`,
    },
  ]

  for (const item of items) {
    const row = document.createElement('div')
    row.className = 'result-gene-row'
    row.innerHTML = `<span class="result-gene-label">${item.label}</span> <span class="result-gene-bar">░░░░░░░░░░</span> <span class="result-gene-pct"></span>`
    rows.appendChild(row)
    await delay(300)
    await renderGeneBar(row, item.pct, item.suffix)
  }

  showContinueHint(rows)
  await waitForContinue()
}

// ─── Screen 5 ────────────────────────────────────────────────

async function runScreen5() {
  const title = document.getElementById('screen5-title')
  const notes = document.getElementById('screen5-notes')
  const canvas = document.getElementById('screen5-chart')
  const btn = document.getElementById('screen5-upload')
  const { stats, coordinates, allPlayers } = resultState
  const pid = playerId()
  const current = coordinates.find((p) => p.id === pid)

  if (title) await typeText(title, 'SURVIVOR_COORDINATES')
  if (canvas) buildScatterChart(canvas, coordinates, pid)

  await printResultLine(notes, `数据库中共有 ${allPlayers.length} 名幸存者留下了记录。`, 'result-comment')
  await printResultLine(
    notes,
    `你的坐标：理性指数 ${Math.round((current?.x ?? stats.choiceA_ratio * 100))}% / 决策速度 ${Math.round(current?.y ?? stats.avg_reaction)}ms`,
    'result-comment'
  )

  await new Promise((resolve) => {
    btn?.addEventListener(
      'click',
      async () => {
        btn.disabled = true
        try {
          if (supabase) {
            await supabase
              .from('players')
              .update({ result_type: resultState.profileType })
              .eq('id', pid)
          }
        } catch (err) {
          console.error('[Supabase] result_type update:', err)
        }
        await printResultLine(notes, 'COORDINATES_UPLOADED. UNLOCKING_SECTOR_06...', 'result-comment')
        await delay(2000)
        resolve()
      },
      { once: true }
    )
  })
}

// ─── Screen 6 ────────────────────────────────────────────────

async function runScreen6() {
  const title = document.getElementById('screen6-title')
  const preamble = document.getElementById('screen6-preamble')
  const footer = document.getElementById('screen6-footer')
  const canvas = document.getElementById('screen6-chart')
  const pid = playerId()

  if (title) await typeText(title, 'FINAL_TRANSMISSION')

  const script = ['你的档案已保存。', 'VAULT-0的大门将为你保持开启。']
  for (const text of script) {
    await printResultLine(preamble, text, 'result-line--ai')
    await delay(800)
  }
  await delay(1200)

  await printResultLine(preamble, '如果你找到了他们——', 'result-line--ai')
  await printResultLine(preamble, '请带他们回来。', 'result-line--ai')
  await delay(1500)

  await printResultLine(preamble, '这是我最后的协议。', 'result-line--ai')
  await delay(2000)

  if (canvas) {
    canvas.width = 520
    canvas.height = 280
    buildScatterChart(canvas, resultState.coordinates, pid, { large: true, red: true })
  }

  await printResultLine(footer, '[VAULT-0]: 所有坐标已同步至寻人数据库。', 'result-comment')
  await printResultLine(footer, '等待回应中...', 'result-comment')
  await printResultLine(footer, '等待回应中...', 'result-comment')

  const cursorLine = document.createElement('p')
  cursorLine.className = 'result-line has-prompt result-comment'
  cursorLine.innerHTML = '<span class="input-cursor">_</span>'
  footer.appendChild(cursorLine)
}

// ─── Shell ───────────────────────────────────────────────────

function playerId() {
  return STATE.playerId
}

function buildShell() {
  document.getElementById('app').innerHTML = `
    <div id="result-root">
      <div id="result-stage">
        <div id="result-switch-flash" aria-hidden="true"></div>
        <section class="result-screen result-screen--active" data-screen="1">
          <div id="screen1-lines" class="result-lines"></div>
          <div id="screen1-profile" class="result-profile-card"></div>
        </section>
        <section class="result-screen" data-screen="2">
          <p id="screen2-title" class="result-title has-prompt"></p>
          <div class="result-chart-wrap"><canvas id="screen2-chart" width="300" height="300"></canvas></div>
          <div id="screen2-comments" class="result-lines"></div>
        </section>
        <section class="result-screen" data-screen="3">
          <p id="screen3-title" class="result-title has-prompt"></p>
          <div class="result-chart-wrap"><canvas id="screen3-chart" width="480" height="220"></canvas></div>
          <div id="screen3-notes" class="result-lines"></div>
        </section>
        <section class="result-screen" data-screen="4">
          <p id="screen4-title" class="result-title has-prompt"></p>
          <div id="screen4-rows" class="result-gene-lines"></div>
        </section>
        <section class="result-screen" data-screen="5">
          <p id="screen5-title" class="result-title has-prompt"></p>
          <div class="result-chart-wrap"><canvas id="screen5-chart" width="480" height="260"></canvas></div>
          <div id="screen5-notes" class="result-lines"></div>
          <button type="button" id="screen5-upload" class="result-upload-btn">[将我的坐标录入寻人数据库]</button>
        </section>
        <section class="result-screen" data-screen="6">
          <p id="screen6-title" class="result-title has-prompt"></p>
          <div id="screen6-preamble" class="result-lines"></div>
          <div class="result-chart-wrap result-chart-wrap--large"><canvas id="screen6-chart" width="520" height="280"></canvas></div>
          <div id="screen6-footer" class="result-lines"></div>
        </section>
      </div>
      <aside id="corner-log">
        <div id="corner-log-scroll" class="corner-log-scroll"></div>
      </aside>
    </div>
  `
}

async function showLoadError(message) {
  buildShell()
  const container = document.getElementById('screen1-lines')
  if (container) {
    await printResultLine(container, `[ERROR] ${message}`, 'result-line--error')
  }
}


// ========== INIT ==========

async function initGame() {
  document.body.classList.add('game-page')
  initRadarCanvas()
  buildTerminalShell()
  initClickAdvance()
  setupAudioUnlock()
  try {
    await runGame(STATE.playerId, STATE.isBusy)
    destroyAudio()
    switchView('game', 'result', initResult)
  } catch (err) {
    console.error(err)
    showError('DATA_WRITE_FAILED. CHECK_CONNECTION.', false)
  }
}

async function initResult() {
  document.body.classList.remove('game-page')
  document.body.classList.add('result-page')
  setupAudioUnlock()
  buildShell()
  updateTopBar(1)
  appendCornerLog('RENDERING_SECTOR_01...')
  appendCornerLog('ARCHIVE_READER: ONLINE')

  try {
    const data = await loadAllData(STATE.playerId)
    resultState = { ...data, playerId: STATE.playerId }
  } catch (err) {
    console.error(err)
    await showLoadError(err.message || 'DATA_LOAD_FAILED')
    return
  }

  await runScreen1()
  await switchScreen(1, 2)
  await runScreen2()
  await switchScreen(2, 3)
  await runScreen3()
  await switchScreen(3, 4)
  await runScreen4()
  await switchScreen(4, 5)
  await runScreen5()
  await switchScreen(5, 6)
  await runScreen6()
}

async function initApp() {
  initVisualLayer()
  setupAudioUnlock()
  updateScreenBars('intro')
  await initIntroPage()
}

initApp()
