import './style.css'
import { supabase } from './supabase.js'
import {
  advanceTerminalLine,
  buildTerminalShell,
  createLine,
  createStaticGroup,
  delay,
  destroyAudio,
  fadeOutStaticGroup,
  getErrorBar,
  getLineStack,
  getTerminalContent,
  getTerminalViewport,
  printLine,
  registerCurrentLayer,
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
  await advanceTerminalLine()
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

function waitForInput(validate) {
  return new Promise((resolve) => {
    const input = document.querySelector('.terminal-input:not([data-resolved])')
    if (!input) return

    const row = input.closest('.input-row')
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

async function promptField(label, validate) {
  await advanceTerminalLine()

  const row = document.createElement('div')
  row.className = 'input-row terminal-line-layer'

  const line = document.createElement('span')
  line.className = 'input-line'

  const promptChar = document.createElement('span')
  promptChar.className = 'prompt-char'
  promptChar.textContent = '>'

  const promptText = document.createElement('span')
  promptText.className = 'input-prompt'

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

  line.appendChild(promptChar)
  line.appendChild(document.createTextNode(' '))
  line.appendChild(promptText)
  line.appendChild(valueEl)
  line.appendChild(cursorEl)
  row.appendChild(line)
  row.appendChild(input)

  getLineStack().appendChild(row)
  registerCurrentLayer(row)
  await typeText(promptText, label)
  const value = await waitForInput(validate)
  await onInputConfirmed(row)
  return value
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
  await advanceTerminalLine()

  const group = createStaticGroup('static-group gender-group')

  const headerLine = document.createElement('div')
  headerLine.className = 'terminal-line has-prompt'
  group.appendChild(headerLine)
  await typeText(headerLine, '[性别] 请输入编号选择：')

  for (let i = 0; i < GENDER_OPTIONS.length; i++) {
    const optionLine = document.createElement('div')
    optionLine.className = 'terminal-line has-prompt'
    group.appendChild(optionLine)
    await typeText(optionLine, `[${i + 1}] ${GENDER_OPTIONS[i].label}`, {
      charDelay: FAST_CHAR_DELAY,
    })
  }

  const gender = await waitForGenderChoice()
  await fadeOutStaticGroup(group)

  const label = GENDER_OPTIONS.find((option) => option.value === gender)?.label ?? gender
  lastAnswerLine = await printLine(`已记录：${label}`)

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
  await advanceTerminalLine()

  const group = createStaticGroup('static-group occupation-group')

  const headerLine = document.createElement('div')
  headerLine.className = 'terminal-line has-prompt'
  group.appendChild(headerLine)
  await typeText(headerLine, '[社会职能] 请输入编号选择你的职业：')

  for (let i = 0; i < OCCUPATIONS.length; i++) {
    const optionLine = document.createElement('div')
    optionLine.className = 'terminal-line has-prompt'
    group.appendChild(optionLine)
    await typeText(optionLine, `[${i + 1}] ${OCCUPATIONS[i]}`, { charDelay: FAST_CHAR_DELAY })
  }

  const occupation = await waitForOccupationChoice()
  await fadeOutStaticGroup(group)

  lastAnswerLine = await printLine(`已记录：${occupation}`)

  return occupation
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

async function runIdentityInput() {
  clearScreen()

  const introLines = [
    '监测到生物电信号。',
    '幸存者，请提交你的基础生物特征以校准文明存储引擎。',
    '警告：数据将被永久写入人类文明存储库。',
  ]

  for (const text of introLines) {
    await printLine(text)
    await delay(LINE_PAUSE)
  }

  const gender = await promptGender()

  const ageStr = await promptField('[年龄] 请输入你的年龄：', (value) => {
    const age = parseInt(value, 10)
    if (!isNaN(age) && age >= 1 && age <= 120) return { success: true, value: String(age) }
    return { success: false, error: '请输入有效年龄（1-120）' }
  })

  const occupation = await promptOccupation()

  return { gender, age: parseInt(ageStr, 10), occupation }
}

// ─── Phase 3: Busy Detection ─────────────────────────────────

async function runBusyDetection() {
  const busyLines = [
    '检测到系统环境压力值。',
    '你是否处于高频生存决策模式？',
  ]

  for (const text of busyLines) {
    await printLine(text)
    await delay(LINE_PAUSE)
  }

  const choiceGroup = createStaticGroup('static-group choice-row')

  return new Promise((resolve) => {
    let resolved = false

    const handleChoice = async (isBusy) => {
      if (resolved) return
      resolved = true
      document.removeEventListener('keydown', onKeyDown)
      choiceGroup.querySelectorAll('.choice-btn').forEach((b) => {
        b.disabled = true
      })
      await fadeOutStaticGroup(choiceGroup)
      resolve(isBusy)
    }

    const makeBtn = (key, label, isBusy) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'choice-btn'
      btn.textContent = `[${key}] ${label}`
      btn.addEventListener('click', () => handleChoice(isBusy))
      return btn
    }

    choiceGroup.appendChild(makeBtn('Y', '是，我时间有限', true))
    choiceGroup.appendChild(makeBtn('N', '否，我可以完整游玩', false))

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
  buildTerminalShell()
  setupAudioUnlock()
  startCornerLog({ mode: 'intro' })

  try {
    await runBootSequence()
    const identity = await runIdentityInput()
    const isBusy = await runBusyDetection()

    try {
      const playerId = await savePlayerData({ ...identity, isBusy })
      localStorage.setItem('player_id', playerId)
      localStorage.setItem('is_busy', String(isBusy))
      stopCornerLog()
      destroyAudio()
      window.location.href = '/game.html'
    } catch (err) {
      console.error('[Supabase] 写入失败，完整错误:', err)
      showError('数据写入失败，请检查网络连接。', false)
    }
  } catch (err) {
    console.error(err)
  }
}

function init() {
  initIntroPage()
}

init()
