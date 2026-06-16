import './style.css'
import './game.css'
import { supabase } from './supabase.js'
import { HINT_CHOICE, initClickAdvance, pauseClickAdvance, showClickHint, suppressClickAdvance, waitForClick } from './clickAdvance.js'
import { initVisualLayer, setDecisionType, setRoundProgress } from './visual.js'
import {
  appendCornerLog,
  buildTerminalShell,
  delay,
  getTerminalStage,
  resetTerminalScroll,
  showError,
  startCornerLog,
  typeText,
} from './terminal.js'
import { destroyAudio, playGlitchClick, playTypewriterClick, setupAudioUnlock } from './audio.js'

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

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomGlitchChar() {
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
        display += fixed[i] ? chars[i] : randomGlitchChar()
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
              .map((ch, i) => (fixed[i] ? ch : randomGlitchChar()))
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
  destroyAudio()
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen().catch(() => {})
  }
  window.location.href = `/result.html?player_id=${playerId}`
}

// ─── Init ────────────────────────────────────────────────────

async function init() {
  const playerId = localStorage.getItem('player_id')
  if (!playerId) {
    window.location.href = '/index.html'
    return
  }

  const isBusy = localStorage.getItem('is_busy') === 'true'

  initRadarCanvas()
  buildTerminalShell()
  initClickAdvance()
  initVisualLayer()
  setupAudioUnlock()

  try {
    await runGame(playerId, isBusy)
  } catch (err) {
    console.error(err)
    showError('DATA_WRITE_FAILED. CHECK_CONNECTION.', false)
  }
}

init()
