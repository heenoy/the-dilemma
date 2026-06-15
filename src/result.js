/* global Chart */
import './style.css'
import './result.css'
import { supabase } from './supabase.js'
import { playBarFillTick, playGlitchClick, playTypewriterClick, setupAudioUnlock } from './audio.js'
import { appendCornerLog, delay, typeText } from './terminal.js'
import { initVisualLayer } from './visual.js'

const GLITCH_CHARS =
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
let state = null

// ─── Helpers ─────────────────────────────────────────────────

function pad2(n) {
  return String(n).padStart(2, '0')
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomGlitchChar() {
  return GLITCH_CHARS[randomInt(0, GLITCH_CHARS.length - 1)]
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

function glitchReveal(element, finalText) {
  return new Promise((resolve) => {
    const chars = [...finalText]
    const fixed = new Array(chars.length).fill(false)

    const render = () => {
      element.textContent = chars.map((ch, i) => (fixed[i] ? ch : randomGlitchChar())).join('')
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
          element.textContent = chars.map((ch, i) => (fixed[i] ? ch : randomGlitchChar())).join('')
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
  await glitchReveal(errLine, '[SYSTEM_ERROR: LOOP_DETECTED / MEMORY_OVERFLOW]')
  await delay(1000)

  await printResultLine(container, '幸存者，', 'result-line--ai')
  await printResultLine(container, '我需要告诉你一些事情。', 'result-line--ai')
  await delay(1200)

  await printResultLine(container, '上一位居民离开VAULT-0的时间是：', 'result-line--ai')
  const corruptLine = document.createElement('p')
  corruptLine.className = 'result-line has-prompt result-line--error'
  container.appendChild(corruptLine)
  await glitchReveal(corruptLine, '[DATA_CORRUPTED / TIMESTAMP_UNREADABLE]')
  await delay(800)

  const { player, stats, profileType } = state
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
    await glitchReveal(title, 'PSYCHOLOGICAL_RADAR')
  }

  if (canvas) buildRadarChart(canvas, state.stats)

  const lines = PROFILE_COMMENTS[state.profileType] || PROFILE_COMMENTS.BALANCED_OBSERVER
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
  const { stats, choices } = state

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
  const { stats } = state

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
  const { stats, coordinates, allPlayers } = state
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
              .update({ result_type: state.profileType })
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
    buildScatterChart(canvas, state.coordinates, pid, { large: true, red: true })
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
  return state?.playerId
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

// ─── Init ────────────────────────────────────────────────────

async function init() {
  initVisualLayer()
  setupAudioUnlock()
  buildShell()
  updateTopBar(1)
  appendCornerLog('RENDERING_SECTOR_01...')
  appendCornerLog('ARCHIVE_READER: ONLINE')

  const params = new URLSearchParams(location.search)
  const id = params.get('player_id') || localStorage.getItem('player_id')

  if (!id) {
    window.location.href = '/index.html'
    return
  }

  try {
    const data = await loadAllData(id)
    state = { ...data, playerId: id }
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

init()
