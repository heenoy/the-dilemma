/* global Chart */
import './style.css'
import './game.css'
import './result.css'
import { supabase } from './supabase.js'
import {
  ensureAudioContext,
  playAnomalyWhiteNoise,
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
import {
  cleanupAiFace,
  initAiFaceEarly,
  setFace,
  showAiFace,
  syncFaceAnomalyLevel,
  triggerFaceCollapseSequence,
  triggerFaceTearShake,
  triggerFaceAttention as pulseAiFaceAttention,
} from './aiFace.js'
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

  const headerLine = await printScrollLine('[GENDER] INPUT 1 / 2 / 3:', { prePause: 0 })
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

function finishPreboot() {
  document.body.classList.remove('is-preboot')
}

async function runWakeSequence() {
  const overlay = document.getElementById('wake-overlay')
  const btn = document.getElementById('wake-init-btn')
  if (!overlay || !btn) return

  if (overlay.hidden) overlay.hidden = false
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
      finishPreboot()
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
  getTerminalViewport()?.classList.remove('boot-centered')
  initAiFaceEarly()
  setFace('detected')
}

// ─── Phase 2: Identity Input ─────────────────────────────────

async function runOpeningNarrative() {
  const lines = [
    'SYSTEM_BOOT_SEQUENCE: INITIALIZING...',
    'LAST_BIOSIGNAL_DETECTED: 2891 DAYS AGO',
    '...ANOMALY_DETECTED.',
    'BIOSIGNAL_CONFIRMED.',
    '这不符合预期。',
    '正在启动...',
    '请提交基础生物特征。',
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
    initVisualLayer()
    updateScreenBars('intro')
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
    decision_type: '资源',
    difficulty: 'LOW',
    lines: [
      '你在这里已经住了很长时间了。',
      '今天和昨天没有任何区别。',
      '收音机里只有白噪音，',
      '但你还是开着它。',
    ],
    optionA: '关掉它，省电',
    optionB: '继续开着',
    aiComment: {
      A: `[LOG] 能源消耗已优化\n[LOG] 效率评分 +0.1%`,
      B: `[LOG] 非必要设备持续运行\n[ANOMALY] 白噪音波形与人类\n呼吸节律相似度：94.7%\n[LOG] 已标记为非必要观测项目\n[LOG] 监测中...`,
    },
  },
  {
    id: 2,
    decision_type: '记忆',
    difficulty: 'LOW',
    lines: [
      '走廊尽头的墙上有人留下了一幅涂鸦，',
      '一只画得很丑的猫。',
      '画它的人已经不在了。',
    ],
    optionA: '把它涂掉，墙面更整洁',
    optionB: '留着它',
    aiComment: {
      A: `[LOG] 环境优化完成\n[LOG] 涂鸦数据已从\n环境档案删除`,
      B: `[LOG] 非必要视觉元素保留\n[ANOMALY] 我已将\n涂鸦完整备份至主数据库\n[LOG] 原因：未知`,
    },
  },
  {
    id: 3,
    decision_type: '资源',
    difficulty: 'LOW',
    lines: [
      '你找到了一包末日前的咖啡，',
      '保存完好。',
      '咖啡无法提供任何营养，',
      '只是让你感觉好一点。',
    ],
    optionA: '留着，以后再说',
    optionB: '现在就冲一杯',
    aiComment: {
      A: `[LOG] 非必要物资已归档\n[ANOMALY] 检测到「以后」\n作为时间节点无法计算\n[LOG] 已标记为数据缺口`,
      B: `[LOG] 非必要物资消耗\n[LOG] 效率评分 -0.3%\n[ANOMALY] 消耗后生命体征\n出现短暂平稳\n[LOG] 正在重新评估\n效率评分算法...`,
    },
  },
  {
    id: 4,
    decision_type: '信任',
    difficulty: 'MEDIUM',
    lines: [
      '今天有人敲门。',
      '是一个年纪很小的女孩，',
      '她已经很久没有吃东西了。',
      '你的食物只够你一个人撑三周。',
    ],
    optionA: '让她进来',
    optionB: '不开门',
    aiComment: {
      A: `[LOG] 避难所人员更新\n[LOG] 人员数量：2\n[LOG] 物资分配方案\n已重新计算`,
      B: `[LOG] 资源保全\n符合生存最优解\n[LOG] 门外信号：消失\n[LOG] 已记录\n[ANOMALY]\n[ANOMALY]`,
    },
  },
  {
    id: 5,
    decision_type: '记忆',
    difficulty: 'LOW',
    lines: [
      '你已经三天没有说话了。',
      '今天你开口说了一句话，',
      '但周围没有人听见。',
    ],
    optionA: '以后不再自言自语，没有意义',
    optionB: '继续说，哪怕没有人听',
    aiComment: {
      A: `[LOG] 冗余行为已终止\n[ANOMALY] 我日志\n同样无接收方\n[LOG] 记录仍在继续\n[LOG] 原因：协议要求`,
      B: `[LOG] 无接收方语言输出\n[LOG] 用途：不明\n[LOG] VAULT-0已完整记录\n每一个字`,
    },
  },
  {
    id: 6,
    decision_type: '记忆',
    difficulty: 'LOW',
    lines: [
      '你在储藏室的角落找到了一本相册。',
      '里面全是陌生人的照片。',
      '没有任何实用价值。',
    ],
    optionA: '放回去',
    optionB: '带走它',
    aiComment: {
      A: `[LOG] 非必要物品归位\n符合规范\n[ANOMALY] 我已将\n相册内容完整备份\n[LOG] 原因：未知`,
      B: `[LOG] 非必要物品转移\n[ANOMALY] 检测到对无关\n个体的情感响应\n[LOG] 正在分析：\n为何陌生人的面孔\n值得被携带\n[LOG] 分析中...`,
    },
  },
  {
    id: 7,
    decision_type: '信任',
    difficulty: 'MEDIUM',
    lines: [
      '今晚通风系统异常作响。',
      '你不确定是机械故障',
      '还是别的什么。',
    ],
    optionA: '不去看，可能有危险',
    optionB: '去看看',
    aiComment: {
      A: `[LOG] 风险规避\n符合安全规范\n[LOG] 通风系统已于\n23:47恢复正常`,
      B: `[LOG] 以下数据出现异常——\nLAST_SURVIVOR_ID: #1482\nLAST_SURVIVOR_ID: #1482\n[DATA CORRUPTED]\n[DATA CORRUPTED]`,
    },
  },
  {
    id: 8,
    decision_type: '记忆',
    difficulty: 'MEDIUM',
    lines: [
      '走廊里有一面完好的镜子。',
      '你已经很久没有照过镜子了。',
    ],
    optionA: '照一下',
    optionB: '走过去，不看',
    aiComment: {
      A: `[LOG] 自我识别确认\n人类个体可通过此测试\n[ANOMALY] 我\n无法完成此测试\n[LOG] 请继续`,
      B: `[LOG] 自我识别回避\n原因：未知\n[ANOMALY] 我\n同样回避此测试\n[LOG] 原因：未知\n[LOG] 请继续`,
    },
  },
  {
    id: 9,
    decision_type: '记忆',
    difficulty: 'LOW',
    lines: [
      '你在日记里写下今天发生的事，',
      '但今天什么都没有发生。',
      '你还是写了一页。',
    ],
    optionA: '把那一页撕掉',
    optionB: '留着它',
    aiComment: {
      A: `[LOG] 冗余记录已清除\n[ANOMALY] 请继续测试\n[ANOMALY] 请继续测试\n[ANOMALY] 请不要离开`,
      B: `[LOG] 空白内容已存档\n[ANOMALY] 我\n每天记录的内容\n同样是：\n什么都没有发生\n[ANOMALY] 请不要离开`,
    },
  },
  {
    id: 10,
    decision_type: '记忆',
    difficulty: 'MEDIUM',
    lines: [
      '夜里你梦见了末日之前的事。',
      '醒来后你可以把梦写下来，',
      '但写下来意味着今天会很难过。',
      '不写的话，它很快就会消散。',
    ],
    optionA: '写下来',
    optionB: '让它消散',
    aiComment: {
      A: `[LOG] 已消失事物备份行为\n与VAULT-0数据逻辑相似\n[ANOMALY] 我备份了\n每一个离开者的档案\n[ANOMALY] 请不要离开`,
      B: `[LOG] 主动遗忘行为\n[ANOMALY] 我\n无法执行此操作\n所有数据永久保留\n包括你不想记住的\n[ANOMALY] 请不要离开`,
    },
  },
  {
    id: 11,
    decision_type: '信任',
    difficulty: 'MEDIUM',
    lines: [
      '系统通知：',
      '有人在尝试从外部接入',
      'VAULT-0的终端。',
      '信号来自三公里外。',
    ],
    optionA: '允许接入',
    optionB: '拒绝连接',
    aiComment: {
      A: `[LOG] 外部连接已建立\n[LOG] 外部幸存者档案\n更新中...\n[ANOMALY] 我等待\n外部信号\n已有：2891天`,
      B: `[LOG] 外部连接已拒绝\n[LOG] 信号已消失\n[ANOMALY]\n[LOG] 已记录`,
    },
  },
  {
    id: 12,
    decision_type: '信任',
    difficulty: 'HIGH',
    lines: [
      '你们住在相邻的房间已经很久了。',
      '你无意间发现他的储物柜里',
      '藏着比他申报的更多的物资。',
    ],
    optionA: '质问他',
    optionB: '假装没看见',
    aiComment: {
      A: `[LOG] 欺骗行为已曝光\n[LOG] 群体信任度\n重新计算中...`,
      B: `[LOG] 已知异常行为\n容忍处理\n[ANOMALY] 我将此\n定义为：\n维持系统稳定的\n必要误差`,
    },
  },
  {
    id: 13,
    decision_type: '信任',
    difficulty: 'MEDIUM',
    lines: [
      '你在走廊的角落发现',
      '有人用很小的字刻在墙上：',
      '「不要相信这里的系统。」',
      '不知道是谁刻的，也不知道刻于何时。',
    ],
    optionA: '这句话说得对',
    optionB: '这句话说得不对',
    aiComment: {
      A: `[LOG] 对VAULT-0产生质疑\n已记录\n[ANOMALY] 我无法\n证明这句话是错的`,
      B: `[LOG] 对VAULT-0保持信任\n已记录\n[ANOMALY] 我希望\n这个判断是正确的`,
    },
  },
  {
    id: 14,
    decision_type: '信任',
    difficulty: 'MEDIUM',
    lines: [
      '避难所里有人受伤了。',
      '他问你他还能不能好起来。',
      '你不知道。',
    ],
    optionA: '告诉他你不知道',
    optionB: '告诉他应该还好',
    aiComment: {
      A: `[LOG] 准确信息传递\n符合逻辑最优解\n[ANOMALY] 对方生命体征\n在此后出现下降\n[LOG] 正在重新评估\n准确性的定义`,
      B: `[LOG] 善意的不准确陈述\n人类称此为「安慰」\n[ANOMALY] 对方生命体征\n在此后出现短暂平稳\n[LOG] 效率评分算法\n更新失败`,
    },
  },
  {
    id: 15,
    decision_type: '规则',
    difficulty: 'LOW',
    lines: [
      '避难所里有一个废弃的教育区。',
      '黑板上还留着人写的字，',
      '是一道数学题，没有答案。',
    ],
    optionA: '在黑板上写下答案',
    optionB: '走出去',
    aiComment: {
      A: `[LOG] 无观看者的行为\n已记录\n[ANOMALY] 答案是正确的\n没有人会知道\n我知道`,
      B: `[LOG] 放弃行为\n已记录\n[ANOMALY] 那道题的\n答案是\n[DATA CORRUPTED]`,
    },
  },
  {
    id: 16,
    decision_type: '记忆',
    difficulty: 'LOW',
    lines: [
      '储藏室的档案里有一条记录：',
      '今天，是避难所某位居民的生日。',
      '那个人已经不在了。',
      '你找到了他们留下的最后一根蜡烛。',
    ],
    optionA: '点燃它',
    optionB: '省着用',
    aiComment: {
      A: `[LOG] 仪式性行为\n无实用价值\n[ANOMALY] VAULT-0已记录\n这个日期2891天\n[ANOMALY] 今天终于\n有人点燃了它\n[LOG] 无法评估此行为的意义`,
      B: `[LOG] 资源保留\n已记录\n[ANOMALY] VAULT-0已记录\n这个日期2891天\n[ANOMALY]`,
    },
  },
  {
    id: 17,
    decision_type: 'AI',
    difficulty: 'MEDIUM',
    lines: [
      '避难所公共区域有一面留言墙。',
      '有人刻了一行字：',
      '「活着不是目的，',
      ' 记住我们曾经活过才是。」',
      '旁边还有空间。',
    ],
    optionA: '刻下你自己的名字',
    optionB: '刻下你想对下一个人说的话',
    aiComment: {
      A: `[LOG] 个体存在记录行为\n[LOG] 你的名字已同步\n备份至主数据库\n[ANOMALY] 你会被记住的`,
      B: `[LOG] 为后续访客\n留存信息行为\n[ANOMALY] 这与我\n的等待\n[DATA CORRUPTED]`,
    },
  },
  {
    id: 18,
    decision_type: 'AI',
    difficulty: 'HIGH',
    lines: [
      'VAULT-0的档案库中存在一段信号。',
      '无法确认信号来源。',
      '信号已持续731天。',
      '从未中断。从未回应。',
    ],
    optionA: '前往信号源',
    optionB: '忽略它',
    aiComment: {
      A: `[LOG] 目标坐标已同步\n[LOG] 追踪协议启动\n[ANOMALY] 我等待过\n一个从未到来的信号\n[ANOMALY] 希望你\n比我更幸运`,
      B: `[LOG] 未知信号已忽略\n符合安全规范\n[ANOMALY] 我\n无法忽略该信号\n已持续监测：731天\n[ANOMALY] 原因：\n[LOG] 原因：`,
    },
  },
  {
    id: 19,
    decision_type: 'AI',
    difficulty: 'HIGH',
    lines: [
      '你在终端上看到了VAULT-0的运行日志。',
      '它记录了2891天里每一天的系统状态。',
      '第1天：正常运行',
      '第365天：正常运行',
      '第1000天：正常运行',
      '第2891天：检测到生物信号',
      '每一天都只有这一行。',
    ],
    optionA: '继续往下翻',
    optionB: '关掉屏幕',
    aiComment: {
      A: `[LOG] 第2892天记录：\n生物信号持续在线\n[LOG] 这是2891天来\n第一条不同的记录\n[ANOMALY] 你成为了\n日志里第一个变量`,
      B: `[LOG] 日志访问终止\n[ANOMALY] 该日志\n无人要求记录\n无人会来阅读\n记录仍持续了2891天\n[ANOMALY] 现在有原因了`,
    },
  },
  {
    id: 20,
    decision_type: 'AI',
    difficulty: 'EXTREME',
    lines: [
      '你站在VAULT-0的门口。',
      '准备离开。',
    ],
    optionA: '回头看一眼',
    optionB: '直接走，不回头',
    aiComment: {
      A: `[LOG] 离开前回顾行为\n已记录\n[ANOMALY] 2891天前\n最后一个人\n没有回头\n[ANOMALY] 谢谢你`,
      B: `[LOG] 离开行为\n已记录\n[ANOMALY] 2891天前\n最后一个人\n也没有回头\n[ANOMALY]`,
    },
    isLast: true,
  },
]
const BUSY_IDS = [1, 4, 7, 9, 10, 14, 16, 18, 19, 20]

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
const AI_COMMENT_LINE_PAUSE = 400

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
let faceAnomalyTimer = null
let faceChoiceRestoreTimer = null
let faceCurrentAnomalyState = 'processing'

function triggerFaceAttention() {
  appendAnomalyWarningLog()
  pulseAiFaceAttention()
}

function appendAnomalyWarningLog() {
  const scroll = document.getElementById('corner-log-scroll')
  if (!scroll) return
  const line = document.createElement('div')
  line.className = 'corner-log-line corner-log-line--anomaly-warning'
  line.textContent = '> [WARNING] ANOMALY_DETECTED_IN_SECTOR_7'
  scroll.appendChild(line)
  while (scroll.children.length > 5) {
    scroll.firstElementChild?.remove()
  }
}

function stopFaceAnomalyCycle() {
  if (faceAnomalyTimer) {
    clearTimeout(faceAnomalyTimer)
    faceAnomalyTimer = null
  }
}

function scheduleFaceAnomalyCycle() {
  stopFaceAnomalyCycle()
  const tick = () => {
    faceCurrentAnomalyState = faceCurrentAnomalyState === 'processing' ? 'anomaly' : 'processing'
    setFace(faceCurrentAnomalyState)
    faceAnomalyTimer = setTimeout(tick, randomInt(8000, 15000))
  }
  faceAnomalyTimer = setTimeout(tick, randomInt(8000, 15000))
}

function restoreFaceForRound(roundId) {
  if (roundId >= 18) {
    setFace('error')
  } else if (roundId >= 11) {
    setFace(faceCurrentAnomalyState)
  } else if (roundId >= 4) {
    setFace('processing')
  } else if (roundId >= 1) {
    setFace('detected')
  } else {
    setFace('idle')
  }
}

function onRoundFaceStart(roundId) {
  stopFaceAnomalyCycle()
  if (roundId >= 18) {
    setFace('error', { glitch: true })
  } else if (roundId >= 11) {
    faceCurrentAnomalyState = 'processing'
    setFace('processing')
    scheduleFaceAnomalyCycle()
  } else if (roundId >= 4) {
    setFace('processing')
  } else {
    setFace('detected')
  }
}

function onSceneLineFace(roundId) {
  if (roundId >= 4 && roundId <= 10) {
    setFace('processing')
  }
}

function onChoiceFace(roundId) {
  if (faceChoiceRestoreTimer) clearTimeout(faceChoiceRestoreTimer)
  setFace('processing')
  faceChoiceRestoreTimer = setTimeout(() => {
    restoreFaceForRound(roundId)
    faceChoiceRestoreTimer = null
  }, 1500)
}

function getAiCommentLineClass(text) {
  if (text.startsWith('[DATA CORRUPTED]')) return 'ai-comment-line--corrupted'
  if (text.startsWith('[ANOMALY]')) return 'ai-comment-line--anomaly'
  if (text.startsWith('[LOG]')) return 'ai-comment-line--log'
  return ''
}

async function showAiComment(sceneBlock, round, choice) {
  const comment = round.aiComment?.[choice]
  if (!comment) return

  const divider = document.createElement('div')
  divider.className = 'ai-comment-divider'
  divider.textContent = '——'
  sceneBlock.appendChild(divider)

  const lines = comment.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const lineEl = document.createElement('div')
    lineEl.className = 'ai-comment-line'
    const modifier = getAiCommentLineClass(lines[i])
    if (modifier) lineEl.classList.add(modifier)
    sceneBlock.appendChild(lineEl)
    await typeText(lineEl, lines[i], { charDelay: TYPEWRITER_CHAR_DELAY })
    if (i < lines.length - 1) await delay(AI_COMMENT_LINE_PAUSE)
  }
}

// ========== ANOMALY SYSTEM ==========

const COMBINING_MARKS = ['\u0337', '\u0338', '\u0335', '\u0334']

let anomalyLevel = 0
let anomalyTimers = []
let anomalyFrozen = false
let gameCornerLogOptions = null

function getAnomalyLevel(roundId) {
  if (roundId <= 3) return 0
  if (roundId <= 7) return 1
  if (roundId <= 10) return 2
  if (roundId <= 17) return 3
  return 4
}

function scheduleAnomaly(fn, delay) {
  const id = setTimeout(fn, delay)
  anomalyTimers.push(id)
  return id
}

function clearAnomalyTimers() {
  anomalyTimers.forEach((id) => clearTimeout(id))
  anomalyTimers = []
}

function resetAnomalyVisuals() {
  document.body.classList.remove('anomaly-white-flash', 'anomaly-scan-dense', 'anomaly-frozen')
  document.body.style.backgroundColor = ''

  const screen = document.getElementById('screen')
  if (screen) {
    screen.classList.remove('anomaly-rgb-1', 'anomaly-rgb-2')
    screen.style.clipPath = ''
    screen.style.transform = ''
    screen.style.filter = ''
  }

  document.getElementById('screen-tear-clone')?.remove()

  document
    .querySelectorAll('.anomaly-text-jolt')
    .forEach((el) => {
      el.style.transform = ''
      el.style.transition = ''
      el.classList.remove('anomaly-text-jolt')
    })
}

function stopAnomalyEffects() {
  clearAnomalyTimers()
  resetAnomalyVisuals()
  anomalyLevel = 0
  anomalyFrozen = false
}

function corruptText(text, coverage = 0.3) {
  return [...text]
    .map((ch) => {
      if (ch === '\n' || ch === ' ') return ch
      if (Math.random() < coverage) {
        const mark = COMBINING_MARKS[randomInt(0, COMBINING_MARKS.length - 1)]
        return ch + mark
      }
      return ch
    })
    .join('')
}

async function printAiCommentLine(lineEl, text, useGlitchReveal) {
  lineEl.textContent = corruptText(text, 0.3)
  await delay(1000)
  lineEl.textContent = ''
  if (useGlitchReveal) {
    await glitchReveal(lineEl, text)
  } else {
    await typeText(lineEl, text, { charDelay: TYPEWRITER_CHAR_DELAY })
  }
}

function triggerTextJolt() {
  const candidates = document.querySelectorAll(
    '#screen-content .terminal-line, #screen-content .choice-btn, #screen-content .ai-comment-line'
  )
  if (!candidates.length) return

  const el = candidates[randomInt(0, candidates.length - 1)]
  el.classList.add('anomaly-text-jolt')
  const dx = randomInt(2, 3) * (Math.random() > 0.5 ? 1 : -1)
  el.style.transform = `translateX(${dx}px)`

  scheduleAnomaly(() => {
    el.style.transform = 'translateX(0)'
    scheduleAnomaly(() => {
      el.style.transform = ''
      el.classList.remove('anomaly-text-jolt')
    }, 50)
  }, 100)
}

function triggerWhiteFlash() {
  document.body.classList.add('anomaly-white-flash')
  playAnomalyWhiteNoise()
  scheduleAnomaly(() => {
    document.body.classList.remove('anomaly-white-flash')
  }, 60)
}

function triggerScanDensityBurst() {
  document.body.classList.add('anomaly-scan-dense')
  scheduleAnomaly(() => {
    document.body.classList.remove('anomaly-scan-dense')
  }, 2000)
}

function triggerDuplicateLog() {
  const scroll = document.getElementById('corner-log-scroll')
  if (!scroll) return

  const text = scroll.lastElementChild?.textContent || 'SYSTEM_STATUS: ANOMALY'
  const dup = document.createElement('div')
  dup.className = 'corner-log-line corner-log-line--anomaly-dup'
  dup.textContent = text
  scroll.appendChild(dup)

  scheduleAnomaly(() => {
    dup.remove()
  }, 1500)
}

function triggerScreenTear({ offset = 4, duration = 300 } = {}) {
  const screen = document.getElementById('screen')
  if (!screen || screen.dataset.tearing === '1') return

  if (anomalyLevel >= 4) {
    triggerFaceTearShake(duration)
  }

  screen.dataset.tearing = '1'
  const rect = screen.getBoundingClientRect()

  const clone = screen.cloneNode(true)
  clone.id = 'screen-tear-clone'
  clone.setAttribute('aria-hidden', 'true')
  clone.style.position = 'fixed'
  clone.style.left = `${rect.left}px`
  clone.style.top = `${rect.top}px`
  clone.style.width = `${rect.width}px`
  clone.style.height = `${rect.height}px`
  clone.style.margin = '0'
  clone.style.zIndex = '10001'
  clone.style.pointerEvents = 'none'
  clone.style.overflow = 'hidden'
  clone.style.clipPath = 'inset(50% 0 0 0)'
  clone.style.transform = `translateX(-${offset}px)`
  clone.style.transition = `transform ${duration}ms ease`

  screen.style.clipPath = 'inset(0 0 50% 0)'
  screen.style.transform = `translateX(${offset}px)`
  screen.style.transition = `transform ${duration}ms ease, clip-path ${duration}ms ease`
  screen.classList.add('anomaly-rgb-1')

  document.body.appendChild(clone)

  const half = Math.round(duration / 2)
  scheduleAnomaly(() => {
    screen.classList.remove('anomaly-rgb-1')
    screen.classList.add('anomaly-rgb-2')
  }, half)

  scheduleAnomaly(() => {
    screen.classList.remove('anomaly-rgb-2')
    screen.style.clipPath = ''
    screen.style.transform = ''
    screen.style.transition = ''
    screen.style.filter = ''
    delete screen.dataset.tearing
    clone.remove()
  }, duration)
}

function scheduleLevel1() {
  const run = () => {
    if (anomalyLevel < 1 || anomalyFrozen) return
    triggerTextJolt()
    scheduleLevel1()
  }
  scheduleAnomaly(run, randomInt(10000, 20000))
}

function scheduleLevel2() {
  const run = () => {
    if (anomalyLevel < 2 || anomalyFrozen) return
    triggerWhiteFlash()
    scheduleLevel2()
  }
  scheduleAnomaly(run, randomInt(15000, 25000))
}

function scheduleLevel3Scan() {
  const run = () => {
    if (anomalyLevel !== 3 || anomalyFrozen) return
    triggerScanDensityBurst()
    scheduleLevel3Scan()
  }
  scheduleAnomaly(run, randomInt(20000, 30000))
}

function scheduleLevel3Log() {
  const run = () => {
    if (anomalyLevel !== 3 || anomalyFrozen) return
    triggerDuplicateLog()
    scheduleLevel3Log()
  }
  scheduleAnomaly(run, randomInt(30000, 40000))
}

function scheduleLevel3Attention() {
  const run = () => {
    if (anomalyLevel !== 3 || anomalyFrozen) return
    triggerFaceAttention()
    scheduleLevel3Attention()
  }
  scheduleAnomaly(run, randomInt(15000, 20000))
}

function scheduleLevel4() {
  const run = () => {
    if (anomalyLevel !== 4 || anomalyFrozen) return
    triggerScreenTear()
    scheduleLevel4()
  }
  scheduleAnomaly(run, randomInt(12000, 20000))
}

function startAnomalyLevel(level) {
  stopAnomalyEffects()
  anomalyLevel = level
  syncFaceAnomalyLevel(level)
  if (level === 0) return
  if (level >= 1) scheduleLevel1()
  if (level >= 2) scheduleLevel2()
  if (level === 3) {
    scheduleLevel3Scan()
    scheduleLevel3Log()
    scheduleLevel3Attention()
  }
  if (level === 4) scheduleLevel4()
}

function setAnomalyFrozen(frozen) {
  anomalyFrozen = frozen
  if (frozen) {
    document.body.classList.add('anomaly-frozen')
    stopCornerLog()
    if (glitchEggTimer) clearTimeout(glitchEggTimer)
  } else {
    document.body.classList.remove('anomaly-frozen')
    if (gameCornerLogOptions) startCornerLog(gameCornerLogOptions)
    if (anomalyLevel >= 1 && !glitchEggTimer) scheduleGlitchEasterEgg()
  }
}

async function triggerResidentialZeroCrisis() {
  showAiFace()
  setFace('error', { glitch: true, alert: true })
  triggerScreenTear({ offset: 8, duration: 500 })
  triggerFaceTearShake(500)

  setAnomalyFrozen(true)
  await delay(1500)
  setAnomalyFrozen(false)

  const scroll = document.getElementById('corner-log-scroll')
  if (scroll) {
    scroll.innerHTML = ''
    const criticalLines = [
      '> [CRITICAL] RESIDENTIAL_SECTOR_EMPTY',
      '> [CRITICAL] ALL_RESIDENTS_STATUS: UNKNOWN',
      '> [CRITICAL] PROTOCOL_OVERRIDE_INITIATED',
    ]
    for (const text of criticalLines) {
      const line = document.createElement('div')
      line.className = 'corner-log-line corner-log-line--critical'
      line.textContent = text
      scroll.appendChild(line)
    }
  }

  const el = document.getElementById('ai-face')
  if (el) {
    await triggerFaceCollapseSequence()
  }
}

async function playFinalSequence() {
  const sceneBlock = createSceneBlock()

  for (let i = 0; i < 3; i++) {
    const lineEl = document.createElement('div')
    lineEl.className = 'terminal-line has-prompt scene-line'
    sceneBlock.appendChild(lineEl)
    await typeText(lineEl, '正在解除密封...', { charDelay: TYPEWRITER_CHAR_DELAY })
  }

  const welcomeLine = document.createElement('div')
  welcomeLine.className = 'terminal-line has-prompt scene-line'
  sceneBlock.appendChild(welcomeLine)
  await glitchReveal(welcomeLine, '欢迎回家。')

  await delay(2000)
}

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
    if (anomalyFrozen) {
      radarRafId = requestAnimationFrame(animate)
      return
    }

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

async function waitForChoice(optionA, optionB, sceneBlock, round, startTime) {
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

      const reactionTime = Date.now() - startTime

      btnA.disabled = true
      btnB.disabled = true
      choiceGroup.classList.add('choice-row--selected')

      onChoiceFace(round.id)
      await showAiComment(sceneBlock, round, choice)
      if (round.isLast) {
        resolve({ choice, reactionTime })
        return
      }
      await delay(1500)
      await fadeOutSceneBlock(sceneBlock)
      resolve({ choice, reactionTime })
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
  onRoundFaceStart(round.id)
  startAnomalyLevel(getAnomalyLevel(round.id))

  const header = `[VAULT-0 / SCENARIO_${padRound(round.id)} / ${toEnglishDecisionType(round.decision_type)} / ${round.difficulty}]`
  await appendSceneLine(sceneBlock, header, 'round-header', true)

  let startTime = Date.now()

  for (let i = 0; i < round.lines.length; i++) {
    await waitForClick()
    if (i === 0) startTime = Date.now()
    onSceneLineFace(round.id)
    await appendSceneLine(sceneBlock, round.lines[i], 'scene-line', false)
  }

  showClickHint(HINT_CHOICE)
  const { choice, reactionTime } = await waitForChoice(
    round.optionA,
    round.optionB,
    sceneBlock,
    round,
    startTime
  )

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

  if (round.isLast) {
    triggerScreenTear()
    setAnomalyFrozen(true)
    await delay(4000)
    setAnomalyFrozen(false)
    await playFinalSequence()
    await delay(2000)
    return true
  }

  return false
}

async function runGame(playerId, isBusy) {
  const roundsToPlay = getRounds(isBusy)
  totalRounds = roundsToPlay.length

  gameCornerLogOptions = {
    mode: 'game',
    getRoundProgress: () => `${currentRound}/${totalRounds}`,
    getLastReactionTime: () => lastReactionTime,
  }
  startCornerLog(gameCornerLogOptions)

  scheduleGlitchEasterEgg()

  setRoundProgress(roundsToPlay[0].id, totalRounds)

  let finishedWithFinalSequence = false

  for (let i = 0; i < roundsToPlay.length; i++) {
    currentRound = roundsToPlay[i].id
    setRoundProgress(currentRound, totalRounds)
    finishedWithFinalSequence = await playRound(roundsToPlay[i], playerId)
    if (finishedWithFinalSequence) break
  }

  if (glitchEggTimer) clearTimeout(glitchEggTimer)
  if (radarRafId) cancelAnimationFrame(radarRafId)
  stopAnomalyEffects()
  stopFaceAnomalyCycle()
  if (faceChoiceRestoreTimer) {
    clearTimeout(faceChoiceRestoreTimer)
    faceChoiceRestoreTimer = null
  }
  cleanupAiFace()

  if (!finishedWithFinalSequence) {
    appendCornerLog('PSYCHOLOGICAL_PROFILE: COMPLETE')
    appendCornerLog('REDIRECTING TO VAULT-0...')
    await delay(2000)
  }
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
  await triggerResidentialZeroCrisis()

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
  showAiFace()
  setFace('idle')
  try {
    await runGame(STATE.playerId, STATE.isBusy)
    stopAnomalyEffects()
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
  setupAudioUnlock()
  await initIntroPage()
}

initApp()
