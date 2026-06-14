import './style.css'
import './game.css'
import { supabase } from './supabase.js'
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

const ROUNDS = [
  {
    id: 1,
    title: '第一夜',
    decision_type: 'SURVIVAL',
    difficulty: 'LOW',
    lines: [
      '末日第 7 天。',
      '你所在的地下掩体发现了一批应急物资，',
      '但只够维持 20 人 30 天，或 40 人 15 天。',
      '此刻掩体外还有 20 名幸存者在敲门。',
    ],
    optionA: '关闭舱门，确保现有成员存活率最大化',
    optionB: '打开舱门，接纳所有人，赌 15 天内找到补给',
  },
  {
    id: 2,
    title: '档案室',
    decision_type: 'GAMBLE',
    difficulty: 'LOW',
    lines: [
      '你截获一段加密信号，',
      '内容显示 80 公里外有一座完整的医疗设施。',
      '但信号来源无法核实——',
      '上一支去那个方向的队伍失联了。',
    ],
    optionA: '组织侦察队出发，三人小队，资源消耗大',
    optionB: '继续等待更多情报，但时间在流逝',
  },
  {
    id: 3,
    title: '药品',
    decision_type: 'MORAL',
    difficulty: 'MEDIUM',
    lines: [
      '掩体里爆发了轻度感染。',
      '药品只够治疗半数人。',
      '有人提议优先救治「有用」的人——工程师、医生、儿童。',
      '另一半人听到了这个提议。',
    ],
    optionA: '按「社会价值」分配药品，理性但会永久撕裂信任',
    optionB: '抽签决定，公平但可能损失关键技能人员',
  },
  {
    id: 4,
    title: '叛徒',
    decision_type: 'SOCIAL',
    difficulty: 'MEDIUM',
    lines: [
      '有人深夜私自取用了公共食物储备。',
      '你是唯一目击者。',
      '那个人是掩体里最好的机械师，',
      '没有他很多设备无法维修。',
    ],
    optionA: '公开指认，维护规则，但可能失去关键人员',
    optionB: '私下警告，保全团队，但你成为了规则的例外',
  },
  {
    id: 5,
    title: '信号',
    decision_type: 'GAMBLE',
    difficulty: 'MEDIUM',
    lines: [
      '政府紧急广播突然恢复，',
      '通知所有幸存者前往北部集中营接受「文明重建安置」。',
      '没有人知道那里的真实情况。',
      '队伍里一半人想去，一半人不信任。',
    ],
    optionA: '带队前往集中营，服从系统，未知风险',
    optionB: '留守掩体独立生存，可控但孤立，长期消耗难以为继',
  },
  {
    id: 6,
    title: '孩子',
    decision_type: 'MORAL',
    difficulty: 'HIGH',
    lines: [
      '一个 8 岁的孩子在外出侦察时被辐射暴露。',
      '症状尚未显现，',
      '但医疗数据显示她 72 小时内会成为传染源。',
      '她的父母在掩体里。',
    ],
    optionA: '立即隔离并告知父母实情，保护群体，但摧毁一个家庭',
    optionB: '暂时隐瞒，争取时间寻找解决方案，但你在用整个掩体赌博',
  },
  {
    id: 7,
    title: '交易',
    decision_type: 'SOCIAL',
    difficulty: 'HIGH',
    lines: [
      '另一个幸存者团队愿意用燃料换你们的食物。',
      '谈判过程中你注意到对方携带武器，',
      '且人数是你们的两倍。',
    ],
    optionA: '完成交易，相信对方遵守协议',
    optionB: '中止谈判撤退，安全，但放弃了燃料，冬天快来了',
  },
  {
    id: 8,
    title: '投票',
    decision_type: 'SOCIAL',
    difficulty: 'HIGH',
    lines: [
      '掩体领导层提议：',
      '为了提高决策效率，',
      '将民主投票制改为五人委员会制。',
      '你有一票。',
    ],
    optionA: '投票赞成委员会制，效率更高，但权力集中',
    optionB: '投票反对，维持全员参与，民主但迟缓',
  },
  {
    id: 9,
    title: '代价',
    decision_type: 'SURVIVAL',
    difficulty: 'HIGH',
    lines: [
      '掩体的空气净化系统出现故障，',
      '修复需要一个人进入高辐射区域操作，',
      '执行者在 48 小时内会出现不可逆损伤。',
      '机械师会做，但他有两个孩子。你也会做。',
    ],
    optionA: '你亲自去，牺牲自己的健康',
    optionB: '指派机械师，他最合适，但那两个孩子……',
  },
  {
    id: 10,
    title: '最后的记录',
    decision_type: 'GAMBLE',
    difficulty: 'EXTREME',
    lines: [
      '文明存储引擎的容量只够保存一类数据。',
      '要么是全人类的艺术、音乐、文学——',
      '要么是农业、医疗、工程技术手册。',
      '你是最后一个有权限操作的人。',
    ],
    optionA: '保存人文记录，人类记得自己是谁，但不知道怎么活下去',
    optionB: '保存技术数据，人类知道怎么重建，但忘记了为什么值得重建',
  },
]

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
  await delay(LINE_REVEAL_PAUSE)
}

function createSceneBlock() {
  const block = document.createElement('div')
  block.className = 'game-scene-block'
  block.style.cssText = [
    'position:fixed',
    'left:12vw',
    'top:20vh',
    'max-width:580px',
    'width:calc(100% - 12vw - 300px)',
    'line-height:2.2',
    'text-align:left',
    'z-index:2',
  ].join(';')
  getTerminalStage()?.appendChild(block)
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
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight
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
  line.textContent = `> ${text}`
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

  const header = `[ROUND_${padRound(round.id)} / DECISION_TYPE: ${round.decision_type} / DIFFICULTY: ${round.difficulty}]`
  await appendSceneLine(sceneBlock, header, 'round-header', true)

  let startTime = Date.now()

  for (let i = 0; i < round.lines.length; i++) {
    if (i === 0) startTime = Date.now()
    await appendSceneLine(sceneBlock, round.lines[i], 'scene-line', false)
  }

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
    `CHOICE_LOGGED: OPTION_${choice} | RT: ${reactionTime}ms | ROUND: ${round.id}`
  )

  lastReactionTime = reactionTime
}

async function runGame(playerId, isBusy) {
  totalRounds = isBusy ? 10 : 20
  const roundsToPlay = ROUNDS.slice(0, Math.min(totalRounds, ROUNDS.length))

  startCornerLog({
    mode: 'game',
    getRoundProgress: () => `${currentRound}/${totalRounds}`,
    getLastReactionTime: () => lastReactionTime,
  })

  scheduleGlitchEasterEgg()

  for (let i = 0; i < roundsToPlay.length; i++) {
    currentRound = roundsToPlay[i].id
    await playRound(roundsToPlay[i], playerId)
  }

  if (glitchEggTimer) clearTimeout(glitchEggTimer)
  if (radarRafId) cancelAnimationFrame(radarRafId)

  appendCornerLog('PSYCHOLOGICAL_PROFILE: COMPLETE')
  appendCornerLog('REDIRECTING TO RESULT_MATRIX...')
  await delay(2000)
  destroyAudio()
  window.location.href = '/result.html'
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
  setupAudioUnlock()

  try {
    await runGame(playerId, isBusy)
  } catch (err) {
    console.error(err)
    showError('数据写入失败，请检查网络连接。', false)
  }
}

init()
