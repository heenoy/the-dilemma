// ========== RESULT.JS ==========
// 通过 window 访问主程序数据：
// window.STATE, window.supabase, window.typeText

window.startResult = async function() {
  const aiFace = document.getElementById('ai-face')
  if (aiFace) aiFace.style.display = 'none'

  const resultView = document.getElementById('view-result')

  resultView.innerHTML = ''

  // 注入样式
  if (!document.getElementById('result-styles')) {
    const style = document.createElement('style')
    style.id = 'result-styles'
    style.textContent = `
      @keyframes rs-scan {
        0% { top: 0; } 100% { top: 100%; }
      }
      @keyframes rs-blink {
        0%,100% { opacity:1; } 50% { opacity:0; }
      }
      @keyframes rs-pulse {
        0%,100% { box-shadow: 0 0 10px rgba(0,255,65,0.3); }
        50% { box-shadow: 0 0 25px rgba(0,255,65,0.7); }
      }
      .rs-hint {
        font-family: 'Press Start 2P', monospace;
        font-size: 9px;
        color: rgba(0,255,65,0.4);
        animation: rs-blink 1.5s infinite;
        margin-top: 24px;
      }
      .rs-title {
        font-family: 'Press Start 2P', monospace;
        font-size: 10px;
        color: rgba(0,255,65,0.6);
        margin-bottom: 20px;
        letter-spacing: 2px;
      }
    `
    document.head.appendChild(style)
  }

  // 加载提示
  const loading = document.createElement('div')
  loading.style.cssText = `
    position:absolute; top:48px; left:48px;
    font-family:VT323,monospace; font-size:18px;
    color:rgba(0,255,65,0.7); line-height:2;
  `
  resultView.appendChild(loading)

  async function addLoadingLine(text) {
    const div = document.createElement('div')
    loading.appendChild(div)
    if (window.typeText) {
      await window.typeText(div, text, { charDelay: 25, playSound: false })
    } else {
      div.textContent = text
    }
    await sleep(300)
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

  await addLoadingLine('> FETCHING_ARCHIVE_DATA...')
  await addLoadingLine('> DECRYPTING_PSYCHOLOGICAL_PROFILE...')

  // 读取数据
  const STATE = window.STATE
  const supabase = window.supabase
  const playerId = STATE.playerId

  const { data: choices } = await supabase
    .from('choices').select('*').eq('player_id', playerId)
  const { data: allPlayers } = await supabase
    .from('players').select('*')
  const { data: allChoices } = await supabase
    .from('choices').select('*')

  console.log('[DEBUG] allPlayers count:', allPlayers?.length)
  console.log('[DEBUG] allChoices count:', allChoices?.length)
  console.log('[DEBUG] current playerId:', playerId)
  console.log('[DEBUG] current choices:', choices?.length)

  if (!choices || choices.length === 0) {
    resultView.innerHTML =
      '<div style="color:#ff4444;padding:48px;font-family:VT323,monospace;font-size:20px">' +
      '> [ERROR] NO_DATA_FOUND<br>> 请重新开始游戏</div>'
    return
  }

  await addLoadingLine('> PROFILE_READY.')
  await sleep(400)
  loading.style.transition = 'opacity 0.6s'
  loading.style.opacity = '0'
  await sleep(600)
  resultView.innerHTML = ''

  // 计算统计数据
  const totalRounds = choices.length
  const choiceACount = choices.filter(c => c.choice === 'A').length
  const choiceBCount = totalRounds - choiceACount
  const ratioA = choiceACount / totalRounds
  const avgReaction = choices.reduce((s,c) => s+c.reaction_time, 0) / totalRounds
  const types = ['资源','信任','记忆','规则','AI']
  const byType = {}
  types.forEach(t => {
    const tc = choices.filter(c => c.decision_type === t)
    const a = tc.filter(c => c.choice === 'A').length
    byType[t] = {
      total: tc.length, A: a, B: tc.length-a,
      ratioA: tc.length ? a/tc.length : 0,
      avgRT: tc.length
        ? tc.reduce((s,c)=>s+c.reaction_time,0)/tc.length : 0
    }
  })
  const slowestType = types.reduce((a,b)=>
    byType[a].avgRT > byType[b].avgRT ? a : b)
  let profileType = 'BALANCED_OBSERVER'
  if (ratioA >= 0.7) profileType = 'RATIONAL_ARCHITECT'
  else if (ratioA <= 0.3) profileType = 'EMOTIONAL_GUARDIAN'
  else if (byType['AI'].ratioA <= 0.4) profileType = 'INDEPENDENT_THINKER'
  else if (byType['资源'].ratioA > 0.6 && byType['信任'].ratioA < 0.5)
    profileType = 'PRAGMATIC_IDEALIST'
  const playerRank = allPlayers
    ? allPlayers.findIndex(p=>p.id===playerId)+1 : '???'

  const D = {
    playerId, choices, allPlayers, allChoices,
    totalRounds, choiceACount, choiceBCount,
    ratioA, avgReaction, byType, types,
    slowestType, profileType, playerRank,
    STATE, supabase, sleep
  }

  // 构建七屏框架
  const screens = []
  for (let i = 1; i <= 8; i++) {
    const s = document.createElement('div')
    s.id = `rs-${i}`
    s.style.cssText = `
      position:absolute;
      top:36px; left:0; right:0; bottom:36px;
      display:${i===1?'block':'none'};
      box-sizing:border-box;
      overflow:hidden;
    `
    resultView.appendChild(s)
    screens.push(s)
  }

  // 底部导航点
  const navBar = document.createElement('div')
  navBar.style.cssText = `
    position:absolute; bottom:40px; left:50%;
    transform:translateX(-50%);
    display:flex; gap:10px; z-index:20;
  `
  resultView.appendChild(navBar)
  for (let i = 1; i <= 8; i++) {
    const dot = document.createElement('div')
    dot.id = `rsdot-${i}`
    dot.style.cssText = `
      width:7px; height:7px;
      border:1px solid rgba(0,255,65,0.5);
      cursor:pointer;
      transition:background .3s;
      background:${i===1?'#00ff41':'transparent'};
    `
    dot.onclick = () => goTo(i)
    navBar.appendChild(dot)
  }

  let current = 1
  const initialized = new Array(9).fill(false)

  function updateNav(n) {
    for (let i = 1; i <= 8; i++) {
      const d = document.getElementById(`rsdot-${i}`)
      if (d) d.style.background = i===n ? '#00ff41' : 'transparent'
    }
  }

  async function goTo(n) {
    if (n<1||n>8||n===current) return
    const fromEl = screens[current-1]
    const toEl = screens[n-1]

    fromEl.style.transition = 'transform .5s ease, opacity .5s ease'
    fromEl.style.transform = 'translateX(-80px)'
    fromEl.style.opacity = '0'
    await sleep(500)
    fromEl.style.display = 'none'
    fromEl.style.transform = ''
    fromEl.style.opacity = ''
    fromEl.style.transition = ''

    toEl.style.display = 'block'
    toEl.style.transform = 'translateX(80px) scale(1.05)'
    toEl.style.filter = 'blur(3px)'
    toEl.style.opacity = '0'
    toEl.style.transition = 'transform .4s ease, opacity .4s ease, filter .4s ease'
    await sleep(20)
    toEl.style.transform = 'translateX(0) scale(1)'
    toEl.style.filter = 'blur(0)'
    toEl.style.opacity = '1'
    await sleep(400)
    toEl.style.transition = ''

    current = n
    updateNav(n)

    if (!initialized[n]) {
      initialized[n] = true
      SCREENS[n](toEl, D)
    }
  }

  // 键盘导航
  const keyHandler = (e) => {
    if (e.key === 'ArrowRight') goTo(current+1)
    if (e.key === 'ArrowLeft') goTo(current-1)
  }
  document.addEventListener('keydown', keyHandler)

  // 七屏内容映射
  const SCREENS = {
    1: rs_screen1,
    2: rs_screen2,
    3: rs_screen3,
    4: rs_screen4,
    5: rs_screen5,
    6: (el,d) => rs_screen6(el, d, goTo),
    7: (el,d) => rs_screen7(el, d),
    8: (el,d) => {
      Array.from(document.querySelectorAll('[id^="rsdot-"]'))
        .forEach(dot => { dot.parentElement.style.display = 'none' })
      rs_screen8(el, d)
    }
  }

  // 初始化第一屏
  initialized[1] = true
  SCREENS[1](screens[0], D)
}

// ===== 第一屏：幸存者身份确认 =====
async function rs_screen1(el, D) {
  const { playerId, totalRounds, profileType, STATE, sleep } = D
  const shortId = playerId.replace(/-/g,'').substring(0,6).toUpperCase()

  el.style.cssText += `
    display:flex; flex-direction:column;
    justify-content:center; align-items:flex-start;
    padding:0 10%;
  `

  // 滚动编号
  const idEl = document.createElement('div')
  idEl.style.cssText = `
    font-family:'Press Start 2P',monospace;
    font-size:32px; color:#00ff41;
    text-shadow:0 0 20px #00ff41, 0 0 40px rgba(0,255,65,0.4);
    margin-bottom:32px; letter-spacing:6px;
  `
  el.appendChild(idEl)

  const roll = setInterval(() => {
    const r = Math.random().toString(36).substring(2,8).toUpperCase()
    idEl.textContent = `#${r}`
  }, 60)
  await sleep(2500)
  clearInterval(roll)
  idEl.textContent = `#${shortId}`
  await sleep(300)

  // 档案卡
  const card = document.createElement('div')
  card.style.cssText = `
    border:1px dashed rgba(0,255,65,0.35);
    padding:28px 36px;
    min-width:520px;
    box-shadow:0 0 24px rgba(0,255,65,0.08),
               inset 0 0 24px rgba(0,255,65,0.03);
    animation:rs-pulse 3s infinite;
  `
  el.appendChild(card)

  const rows = [
    ['GENDER',   STATE.gender || '--'],
    ['AGE',      STATE.age || '--'],
    ['FUNCTION', STATE.occupation || '--'],
    ['MODE',     STATE.isBusy ? '忙碌模式' : '常规模式'],
    ['DECISIONS', totalRounds],
    ['TIMESTAMP', 'DAY 2891 / YEAR 08 A.C.'],
    ['PROFILE',  profileType],
  ]

  for (const [k, v] of rows) {
    await sleep(120)
    const row = document.createElement('div')
    row.style.cssText = `
      display:flex; gap:20px; align-items:baseline;
      border-bottom:1px solid rgba(0,255,65,0.08);
      padding:6px 0;
    `
    const key = document.createElement('span')
    key.style.cssText = `
      font-family:'Press Start 2P',monospace;
      font-size:8px; color:rgba(0,255,65,0.4);
      width:100px; flex-shrink:0;
      line-height:2.5;
    `
    key.textContent = k
    const val = document.createElement('span')
    val.style.cssText = `
      font-family:VT323,monospace;
      font-size:22px; color:rgba(0,255,65,0.9);
    `
    val.textContent = v
    row.appendChild(key)
    row.appendChild(val)
    card.appendChild(row)
  }

  await sleep(400)
  const hint = document.createElement('div')
  hint.className = 'rs-hint'
  hint.textContent = '> PRESS → OR SCROLL TO CONTINUE'
  el.appendChild(hint)
}

// ===== 第二屏：人格雷达图 =====
async function rs_screen2(el, D) {
  const { byType, types, profileType, sleep } = D

  el.style.cssText += `
    display:flex; align-items:center;
    justify-content:center; padding:20px 32px;
    box-sizing:border-box;
  `

  const wrap = document.createElement('div')
  wrap.style.cssText = `
    display:flex; width:100%; height:100%;
    align-items:center; gap:0;
  `
  el.appendChild(wrap)

  // 左侧
  const leftPanel = document.createElement('div')
  leftPanel.style.cssText = `
    flex:0 0 58%; display:flex;
    flex-direction:column; align-items:center;
    justify-content:center; height:100%;
  `
  wrap.appendChild(leftPanel)

  const titleL = document.createElement('div')
  titleL.className = 'rs-title'
  titleL.textContent = '> PSYCHOLOGICAL_RADAR'
  leftPanel.appendChild(titleL)

  // Canvas 雷达扫描仪
  const canvas = document.createElement('canvas')
  const SIZE = 500
  canvas.width = SIZE
  canvas.height = SIZE
  canvas.style.cssText = `
    cursor: crosshair;
    display: block;
  `
  leftPanel.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  const CX = SIZE / 2
  const CY = SIZE / 2
  const R = 195
  const N = types.length
  const values = types.map(t => byType[t].ratioA)

  // 鼠标位置
  let mouseX = -999, mouseY = -999
  let hoveredIdx = -1
  canvas.addEventListener('mousemove', e => {
    const rect = canvas.getBoundingClientRect()
    mouseX = e.clientX - rect.left
    mouseY = e.clientY - rect.top
  })
  canvas.addEventListener('mouseleave', () => {
    mouseX = -999; mouseY = -999; hoveredIdx = -1
  })

  // 轴角度
  function axisAngle(i) {
    return (i / N) * Math.PI * 2 - Math.PI / 2
  }

  // 数据点坐标
  function dataPoint(i, scale) {
    const a = axisAngle(i)
    const r = values[i] * R * scale
    return [CX + Math.cos(a)*r, CY + Math.sin(a)*r]
  }

  // 生长动画
  let growScale = 0
  let scanAngle = -Math.PI / 2
  let breathe = 0
  let trailAngles = []
  const MAX_TRAIL = 60

  // 扫描轨迹（余晖）
  const offCanvas = document.createElement('canvas')
  offCanvas.width = SIZE
  offCanvas.height = SIZE
  const offCtx = offCanvas.getContext('2d')

  let lastTime = null
  let animating = true

  function draw(now) {
    if (!lastTime) lastTime = now
    const dt = now - lastTime
    lastTime = now

    if (growScale < 1) {
      growScale = Math.min(1, growScale + dt / 1600)
    }
    const ease = 1 - Math.pow(1 - growScale, 3)
    scanAngle += dt * 0.0018
    breathe += dt * 0.002

    // 检测悬停
    hoveredIdx = -1
    if (mouseX > 0) {
      for (let i = 0; i < N; i++) {
        const [px, py] = dataPoint(i, ease)
        const dist = Math.hypot(mouseX - px, mouseY - py)
        if (dist < 18) { hoveredIdx = i; break }
      }
    }

    ctx.clearRect(0, 0, SIZE, SIZE)

    // 背景网格
    for (let ring = 1; ring <= 5; ring++) {
      const rr = (ring / 5) * R
      ctx.beginPath()
      for (let i = 0; i <= N; i++) {
        const a = axisAngle(i % N)
        const x = CX + Math.cos(a)*rr
        const y = CY + Math.sin(a)*rr
        i === 0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y)
      }
      ctx.strokeStyle = ring === 5
        ? 'rgba(0,255,65,0.2)' : 'rgba(0,255,65,0.07)'
      ctx.lineWidth = ring === 5 ? 1.5 : 1
      ctx.stroke()

      // 圆环（很淡）
      ctx.beginPath()
      ctx.arc(CX, CY, rr, 0, Math.PI*2)
      ctx.strokeStyle = 'rgba(0,255,65,0.04)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // 轴线
    for (let i = 0; i < N; i++) {
      const a = axisAngle(i)
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.lineTo(CX + Math.cos(a)*R, CY + Math.sin(a)*R)
      ctx.strokeStyle = 'rgba(0,255,65,0.12)'
      ctx.lineWidth = 1
      ctx.stroke()

      // 轴标签
      const lx = CX + Math.cos(a)*(R+26)
      const ly = CY + Math.sin(a)*(R+26)
      ctx.fillStyle = hoveredIdx === i
        ? '#00ff41' : 'rgba(0,255,65,0.65)'
      ctx.font = "8px 'Press Start 2P'"
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(types[i], lx, ly)
    }

    // 余晖：从扫描线向后渐变消失，很窄很淡
    const trailLen = Math.PI * 0.35
    for (let t = 0; t < 40; t++) {
      const ta = scanAngle - (t / 40) * trailLen
      const alpha = (1 - t/40) * 0.06
      ctx.beginPath()
      ctx.moveTo(CX, CY)
      ctx.arc(CX, CY, R, ta - Math.PI/60, ta)
      ctx.closePath()
      ctx.fillStyle = `rgba(0,255,65,${alpha})`
      ctx.fill()
    }

    // 扫描线
    ctx.beginPath()
    ctx.moveTo(CX, CY)
    ctx.lineTo(
      CX + Math.cos(scanAngle)*R,
      CY + Math.sin(scanAngle)*R
    )
    ctx.strokeStyle = 'rgba(0,255,65,0.9)'
    ctx.lineWidth = 1.5
    ctx.shadowBlur = 8
    ctx.shadowColor = '#00ff41'
    ctx.stroke()
    ctx.shadowBlur = 0

    // 数据填充（呼吸感）
    const breathAlpha = 0.08 + Math.sin(breathe)*0.04
    ctx.beginPath()
    for (let i = 0; i <= N; i++) {
      const [px, py] = dataPoint(i % N, ease)
      i === 0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py)
    }
    ctx.fillStyle = `rgba(0,255,65,${breathAlpha})`
    ctx.fill()

    // 数据轮廓
    ctx.beginPath()
    for (let i = 0; i <= N; i++) {
      const [px, py] = dataPoint(i % N, ease)
      i === 0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py)
    }
    ctx.strokeStyle = '#00ff41'
    ctx.lineWidth = 2
    ctx.shadowBlur = 6
    ctx.shadowColor = '#00ff41'
    ctx.stroke()
    ctx.shadowBlur = 0

    // 数据点
    for (let i = 0; i < N; i++) {
      const [px, py] = dataPoint(i, ease)
      const isHovered = hoveredIdx === i

      // 扫描线扫过时发光
      const angleDiff = ((scanAngle - axisAngle(i))
        % (Math.PI*2) + Math.PI*2) % (Math.PI*2)
      const justScanned = angleDiff < 0.3

      const r = isHovered ? 12 : justScanned ? 9 : 6
      const glow = isHovered ? 16 : justScanned ? 10 : 4

      // 外圈
      ctx.beginPath()
      ctx.arc(px, py, r+4, 0, Math.PI*2)
      ctx.strokeStyle = isHovered
        ? 'rgba(255,255,255,0.4)'
        : 'rgba(0,255,65,0.2)'
      ctx.lineWidth = 1
      ctx.stroke()

      // 点
      ctx.beginPath()
      ctx.arc(px, py, r, 0, Math.PI*2)
      ctx.fillStyle = isHovered ? '#ffffff' : '#00ff41'
      ctx.shadowBlur = glow
      ctx.shadowColor = isHovered ? '#ffffff' : '#00ff41'
      ctx.fill()
      ctx.shadowBlur = 0

      // 悬停时更新详情
      if (isHovered) {
        updateDetail(i)
      }
    }

    if (animating) requestAnimationFrame(draw)
  }

  requestAnimationFrame(draw)

  // 离开屏幕时停止动画
  const observer = new IntersectionObserver(entries => {
    animating = entries[0].isIntersecting
    if (animating) requestAnimationFrame(draw)
  })
  observer.observe(canvas)

  // 右侧面板
  const rightPanel = document.createElement('div')
  rightPanel.style.cssText = `
    flex:1; height:100%;
    display:flex; flex-direction:column;
    justify-content:center;
    padding:0 16px 0 36px;
    border-left:1px solid rgba(0,255,65,0.15);
    box-sizing:border-box;
    opacity:0; transition:opacity 0.6s;
  `
  wrap.appendChild(rightPanel)

  const profileTag = document.createElement('div')
  profileTag.style.cssText = `
    font-family:'Press Start 2P',monospace;
    font-size:8px; color:rgba(0,255,65,0.4);
    margin-bottom:16px; letter-spacing:2px;
  `
  profileTag.textContent = '// ' + profileType
  rightPanel.appendChild(profileTag)

  const detailArea = document.createElement('div')
  detailArea.style.cssText = `
    margin-bottom:20px; padding:14px;
    border:1px solid rgba(0,255,65,0.12);
    min-height:140px;
    transition:border-color 0.3s, box-shadow 0.3s;
  `
  rightPanel.appendChild(detailArea)

  const verdictArea = document.createElement('div')
  rightPanel.appendChild(verdictArea)

  const hoverHint = document.createElement('div')
  hoverHint.style.cssText = `
    margin-top:16px;
    font-family:'Press Start 2P',monospace;
    font-size:7px; color:rgba(0,255,65,0.2);
    letter-spacing:1px;
  `
  hoverHint.textContent = '> HOVER DOTS TO INSPECT'
  rightPanel.appendChild(hoverHint)

  const typeDescs = {
    '资源':'在资源分配类决策中，你倾向于',
    '信任':'在信任与背叛类决策中，你倾向于',
    '记忆':'在记忆保存类决策中，你倾向于',
    '规则':'在规则遵守类决策中，你倾向于',
    'AI':'在人机信任类决策中，你倾向于'
  }

  let lastDetail = -1
  function updateDetail(idx) {
    if (lastDetail === idx) return
    lastDetail = idx
    const t = types[idx]
    const pct = Math.round(byType[t].ratioA * 100)
    const rt = (byType[t].avgRT / 1000).toFixed(1)
    const tendency = pct >= 50 ? '效率导向' : '情感导向'
    detailArea.style.borderColor = 'rgba(0,255,65,0.4)'
    detailArea.style.boxShadow = '0 0 12px rgba(0,255,65,0.2)'
    setTimeout(() => {
      detailArea.style.borderColor = 'rgba(0,255,65,0.12)'
      detailArea.style.boxShadow = ''
    }, 800)
    detailArea.innerHTML = `
      <div style="font-family:'Press Start 2P',monospace;
        font-size:10px;color:#00ff41;margin-bottom:10px;
        text-shadow:0 0 8px #00ff41">[ ${t} ]</div>
      <div style="font-family:VT323,monospace;font-size:17px;
        color:rgba(0,255,65,0.7);line-height:1.8;margin-bottom:10px">
        ${typeDescs[t]}${pct>=50?'效率导向。':'情感导向。'}
      </div>
      <div style="font-family:VT323,monospace;font-size:16px;
        color:rgba(0,255,65,0.55);line-height:2">
        A选择比例：<span style="color:#00ff41">${pct}%</span><br>
        平均用时：<span style="color:#00ff41">${rt}s</span><br>
        倾向标签：<span style="color:#00ff41">${tendency}</span>
      </div>
    `
  }

  updateDetail(0)

  const verdicts = {
    RATIONAL_ARCHITECT: ['你是文明的理性收割者，','人类将作为纯粹的数据存续。'],
    EMOTIONAL_GUARDIAN: ['你是一位浪漫的守墓人，','人类文明在最后的火光中温情脉脉。'],
    INDEPENDENT_THINKER: ['你不信任系统。这很合理。','在废墟中独立思考的人','比任何协议都更难被终止。'],
    PRAGMATIC_IDEALIST: ['你用理性保护了感性存在的空间。','资源可以计算，但人不能。'],
    BALANCED_OBSERVER: ['你站在理性与感性的边界上。','VAULT-0从未见过这样的幸存者。']
  }

  await sleep(1700)
  rightPanel.style.opacity = '1'
  await sleep(400)

  for (const line of (verdicts[profileType]||[])) {
    const div = document.createElement('div')
    div.style.cssText = `
      font-family:VT323,monospace;
      font-size:19px; color:rgba(0,255,65,0.85);
      line-height:1.8;
    `
    verdictArea.appendChild(div)
    if (window.typeText) {
      await window.typeText(div, line,
        { charDelay:30, playSound:false })
    } else {
      div.textContent = line
    }
    await sleep(150)
  }
}

// ===== 第三屏：决策热力图 =====
async function rs_screen3(el, D) {
  const { choices, byType, types, sleep } = D

  el.style.cssText += `
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 40px;
    box-sizing: border-box;
  `

  const title = document.createElement('div')
  title.className = 'rs-title'
  title.textContent = '> DECISION_TIMELINE'
  el.appendChild(title)

  // 提示
  const hint = document.createElement('div')
  hint.style.cssText = `
    font-family: 'Press Start 2P', monospace;
    font-size: 7px;
    color: rgba(0,255,65,0.25);
    margin-bottom: 16px;
    letter-spacing: 1px;
  `
  hint.textContent = '> HOVER BARS FOR DETAILS'
  el.appendChild(hint)

  // 图表容器
  const chartWrap = document.createElement('div')
  chartWrap.style.cssText = `
    width: 100%;
    position: relative;
    display: flex;
    align-items: flex-end;
    gap: 4px;
    height: 260px;
    border-bottom: 1px solid rgba(0,255,65,0.3);
    border-left: 1px solid rgba(0,255,65,0.3);
    padding: 0 8px 0 8px;
    box-sizing: border-box;
  `
  el.appendChild(chartWrap)

  const sorted = [...choices].sort((a,b) => a.round - b.round)
  const maxRT = Math.max(...sorted.map(c => c.reaction_time))

  // tooltip
  const tooltip = document.createElement('div')
  tooltip.style.cssText = `
    display: none;
    position: absolute;
    background: rgba(0,0,0,0.92);
    border: 1px solid rgba(0,255,65,0.5);
    padding: 10px 14px;
    font-family: VT323, monospace;
    font-size: 15px;
    color: #00ff41;
    pointer-events: none;
    z-index: 100;
    white-space: nowrap;
    bottom: 270px;
    transform: translateX(-50%);
    box-shadow: 0 0 12px rgba(0,255,65,0.2);
    line-height: 1.8;
  `
  el.appendChild(tooltip)

  // 每题一个竖条
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]
    await sleep(40)

    const barWrap = document.createElement('div')
    barWrap.style.cssText = `
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      height: 100%;
      cursor: pointer;
      position: relative;
    `
    chartWrap.appendChild(barWrap)

    const heightPct = c.reaction_time / maxRT
    const isA = c.choice === 'A'
    const barColor = isA
      ? 'rgba(0,255,65,0.7)'
      : 'rgba(0,180,65,0.4)'

    const bar = document.createElement('div')
    bar.style.cssText = `
      width: 100%;
      height: 0;
      background: ${barColor};
      border-top: 2px solid ${isA ? '#00ff41' : 'rgba(0,255,65,0.5)'};
      transition: height 0.6s ease ${i * 40}ms,
                  background 0.2s;
      position: relative;
    `
    barWrap.appendChild(bar)

    // 标签
    const label = document.createElement('div')
    label.style.cssText = `
      font-family: 'Press Start 2P', monospace;
      font-size: 6px;
      color: rgba(0,255,65,0.4);
      margin-top: 4px;
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      height: 24px;
      overflow: hidden;
    `
    label.textContent = `#${String(c.round).padStart(2,'0')}`
    barWrap.appendChild(label)

    // 触发高度动画
    await sleep(20)
    bar.style.height = `${heightPct * 240}px`

    const rt = (c.reaction_time / 1000).toFixed(1)

    barWrap.onmouseenter = (e) => {
      bar.style.background = isA
        ? 'rgba(0,255,65,0.95)'
        : 'rgba(0,255,65,0.6)'
      bar.style.boxShadow = '0 0 8px rgba(0,255,65,0.5)'
      tooltip.style.display = 'block'
      tooltip.style.left = barWrap.offsetLeft +
        barWrap.offsetWidth / 2 + 'px'
      tooltip.innerHTML = `
        第${c.round}题 · ${c.decision_type}<br>
        选择：<span style="color:#fff">${c.choice}</span>
        · 用时：<span style="color:#fff">${rt}s</span>
      `
    }
    barWrap.onmouseleave = () => {
      bar.style.background = barColor
      bar.style.boxShadow = ''
      tooltip.style.display = 'none'
    }
  }

  // 图例
  await sleep(200)
  const legend = document.createElement('div')
  legend.style.cssText = `
    display: flex;
    gap: 24px;
    margin-top: 12px;
    font-family: VT323, monospace;
    font-size: 15px;
    color: rgba(0,255,65,0.6);
  `
  legend.innerHTML = `
    <span>
      <span style="display:inline-block;width:12px;height:12px;
        background:rgba(0,255,65,0.7);margin-right:6px;
        vertical-align:middle"></span>选A
    </span>
    <span>
      <span style="display:inline-block;width:12px;height:12px;
        background:rgba(0,180,65,0.4);margin-right:6px;
        vertical-align:middle"></span>选B
    </span>
    <span style="margin-left:16px">竖条高度 = 决策用时</span>
  `
  el.appendChild(legend)

  // 最慢最快标注
  const slowest = sorted.reduce((a,b) =>
    a.reaction_time > b.reaction_time ? a : b)
  const fastest = sorted.reduce((a,b) =>
    a.reaction_time < b.reaction_time ? a : b)

  const notes = document.createElement('div')
  notes.style.cssText = `
    margin-top: 8px;
    font-family: VT323, monospace;
    font-size: 15px;
    color: rgba(0,255,65,0.5);
    display: flex;
    gap: 24px;
  `
  notes.innerHTML = `
    <span style="color:rgba(255,80,80,0.8)">
      ▲ 第${slowest.round}题最慢：${(slowest.reaction_time/1000).toFixed(1)}s
    </span>
    <span style="color:rgba(255,255,255,0.6)">
      ▼ 第${fastest.round}题最快：${(fastest.reaction_time/1000).toFixed(1)}s
    </span>
  `
  el.appendChild(notes)
}

// ===== 第四屏：反应时间折线图 =====
async function rs_screen4(el, D) {
  const { choices, allPlayers, allChoices,
          playerId, sleep } = D

  el.style.cssText += `
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px 40px;
    box-sizing: border-box;
  `

  const title = document.createElement('div')
  title.className = 'rs-title'
  title.textContent = '> SURVIVOR_NETWORK'
  el.appendChild(title)

  const hint = document.createElement('div')
  hint.style.cssText = `
    font-family: 'Press Start 2P', monospace;
    font-size: 7px;
    color: rgba(0,255,65,0.25);
    margin-bottom: 12px;
    letter-spacing: 1px;
  `
  hint.textContent = '> DRAG TO EXPLORE · SCROLL TO ZOOM'
  el.appendChild(hint)

  // ECharts 容器
  const chartDiv = document.createElement('div')
  chartDiv.style.cssText = `
    width: 100%;
    height: 420px;
  `
  el.appendChild(chartDiv)

  if (typeof echarts === 'undefined') {
    chartDiv.innerHTML =
      '<div style="color:rgba(255,50,50,0.6);' +
      'font-family:VT323,monospace;font-size:18px;padding:20px">' +
      '> [ERROR] ECHARTS_NOT_LOADED</div>'
    return
  }

  const chart = echarts.init(chartDiv, null, {
    backgroundColor: 'transparent'
  })

  // 构建节点和边
  // 当前玩家的选择
  const myChoiceMap = {}
  choices.forEach(c => { myChoiceMap[c.round] = c.choice })
  console.log('[DEBUG] myChoiceMap:', myChoiceMap)
  console.log('[DEBUG] choices length:', choices.length)
  console.log('[DEBUG] sample allChoices:',
    (allChoices||[]).slice(0,3))

  // 计算所有玩家与当前玩家的相似度
  const nodes = []
  const edges = []

  // 当前玩家节点（中心）
  nodes.push({
    id: playerId,
    name: 'YOU',
    x: 400, y: 300,
    fixed: true,
    symbolSize: 20,
    itemStyle: {
      color: '#00ff41',
      shadowBlur: 20,
      shadowColor: '#00ff41'
    },
    label: {
      show: true,
      color: '#00ff41',
      fontFamily: "'Press Start 2P'",
      fontSize: 8
    }
  })

  // 其他玩家节点
  const others = (allPlayers || [])
    .filter(p => p.id !== playerId)
    .slice(0, 1000)

  others.forEach((p, idx) => {
    const pc = (allChoices || []).filter(c => c.player_id === p.id)

    // 没有choices记录的玩家也显示，作为孤立节点
    const shortId = p.id.replace(/-/g,'').substring(0,4).toUpperCase()

    let similarity = 0
    if (pc.length > 0 && choices.length > 0) {
      let same = 0
      pc.forEach(c => {
        if (myChoiceMap[c.round] === c.choice) same++
      })
      similarity = same / Math.max(pc.length, choices.length)
    } else {
      // 没有choices就给一个随机相似度用于显示
      similarity = Math.random() * 0.5
    }

    nodes.push({
      id: p.id,
      name: '#' + shortId,
      symbolSize: 5 + similarity * 12,
      itemStyle: {
        color: `rgba(0,${Math.round(80 + similarity*175)},65,${0.25 + similarity*0.6})`,
        shadowBlur: similarity > 0.7 ? 10 : 0,
        shadowColor: '#00ff41'
      },
      label: { show: false }
    })

    if (similarity > 0.4) {
      edges.push({
        source: playerId,
        target: p.id,
        lineStyle: {
          color: `rgba(0,255,65,${similarity * 0.35})`,
          width: 0.5 + similarity * 1.5
        }
      })
    }
  })

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0,0,0,0.85)',
      borderColor: 'rgba(0,255,65,0.4)',
      borderWidth: 1,
      textStyle: {
        color: '#00ff41',
        fontFamily: 'VT323',
        fontSize: 16
      },
      formatter: params => {
        if (params.dataType === 'node') {
          if (params.data.id === playerId) {
            return `你<br>决策总数：${choices.length}`
          }
          const pc = allChoices
            ? allChoices.filter(c => c.player_id === params.data.id)
            : []
          let same = 0
          pc.forEach(c => {
            if (myChoiceMap[c.round] === c.choice) same++
          })
          const sim = pc.length
            ? Math.round(same/pc.length*100) : 0
          return `幸存者 ${params.data.name}<br>与你的选择相似度：${sim}%`
        }
        return ''
      }
    },
    series: [{
      type: 'graph',
      layout: 'force',
      roam: true,
      data: nodes,
      edges: edges,
      force: {
        repulsion: 80,
        edgeLength: [50, 150],
        gravity: 0.1,
        layoutAnimation: true
      },
      lineStyle: {
        curveness: 0.2
      },
      emphasis: {
        focus: 'adjacency',
        itemStyle: {
          shadowBlur: 20,
          shadowColor: '#00ff41'
        }
      },
      animationDuration: 2000,
      animationEasingUpdate: 'quinticInOut'
    }]
  }

  chart.setOption(option)

  // 底部统计
  await sleep(500)
  const statsEl = document.createElement('div')
  statsEl.style.cssText = `
    margin-top: 12px;
    font-family: VT323, monospace;
    font-size: 16px;
    color: rgba(0,255,65,0.5);
    text-align: center;
  `
  const totalNodes = nodes.length
  const connectedNodes = edges.length
  statsEl.textContent =
    `> 数据库中 ${totalNodes} 名幸存者  ·  ` +
    `${connectedNodes} 条高相似度连接`
  el.appendChild(statsEl)
}

// ===== 第五屏：文明基因进度条 =====
async function rs_screen5(el, D) {
  const { ratioA, avgReaction, byType, sleep } = D

  el.style.cssText += `
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px 40px;
    box-sizing: border-box;
  `

  const title = document.createElement('div')
  title.className = 'rs-title'
  title.textContent = '> PSYCHOLOGICAL_INDEX'
  el.appendChild(title)

  // ECharts 容器
  const chartDiv = document.createElement('div')
  chartDiv.style.cssText = `
    width: 500px;
    height: 420px;
  `
  el.appendChild(chartDiv)

  if (typeof echarts === 'undefined') {
    chartDiv.innerHTML =
      '<div style="color:rgba(255,50,50,0.6);' +
      'font-family:VT323,monospace;font-size:18px">' +
      '> [ERROR] ECHARTS_NOT_LOADED</div>'
    return
  }

  const chart = echarts.init(chartDiv, null, {
    backgroundColor: 'transparent'
  })

  // 计算三个指标
  const rationalValue = Math.round(ratioA * 100)

  // 决策速度：反应时间越短分数越高
  // 最快2秒=100分，最慢30秒=0分
  const speedValue = Math.round(
    Math.max(0, Math.min(100,
      (1 - (avgReaction - 2000) / 28000) * 100
    ))
  )

  // 系统信任度：AI类题目选A的比例
  const trustValue = Math.round(
    (byType['AI']?.ratioA || 0) * 100
  )

  const gaugeData = [
    {
      value: 0,
      targetValue: rationalValue,
      name: 'RATIONAL',
      title: {
        offsetCenter: ['0%', '-32%'],
        color: 'rgba(0,255,65,0.6)',
        fontFamily: "'Press Start 2P'",
        fontSize: 9
      },
      detail: {
        valueAnimation: true,
        offsetCenter: ['0%', '-20%'],
        color: '#00ff41',
        fontFamily: "'Press Start 2P'",
        fontSize: 11,
        formatter: '{value}%'
      },
      itemStyle: { color: '#00ff41' }
    },
    {
      value: 0,
      targetValue: speedValue,
      name: 'SPEED',
      title: {
        offsetCenter: ['0%', '2%'],
        color: 'rgba(0,255,65,0.6)',
        fontFamily: "'Press Start 2P'",
        fontSize: 9
      },
      detail: {
        valueAnimation: true,
        offsetCenter: ['0%', '14%'],
        color: '#00ff41',
        fontFamily: "'Press Start 2P'",
        fontSize: 11,
        formatter: '{value}%'
      },
      itemStyle: { color: 'rgba(0,200,65,0.8)' }
    },
    {
      value: 0,
      targetValue: trustValue,
      name: 'TRUST_AI',
      title: {
        offsetCenter: ['0%', '36%'],
        color: 'rgba(0,255,65,0.6)',
        fontFamily: "'Press Start 2P'",
        fontSize: 9
      },
      detail: {
        valueAnimation: true,
        offsetCenter: ['0%', '48%'],
        color: '#00ff41',
        fontFamily: "'Press Start 2P'",
        fontSize: 11,
        formatter: '{value}%'
      },
      itemStyle: { color: 'rgba(0,150,65,0.7)' }
    }
  ]

  const option = {
    backgroundColor: 'transparent',
    series: [
      {
        type: 'gauge',
        startAngle: 90,
        endAngle: -270,
        pointer: { show: false },
        progress: {
          show: true,
          overlap: false,
          roundCap: true,
          clip: false,
          itemStyle: {
            borderWidth: 1,
            borderColor: 'rgba(0,255,65,0.2)'
          }
        },
        axisLine: {
          lineStyle: {
            width: 36,
            color: [[1, 'rgba(0,255,65,0.06)']]
          }
        },
        splitLine: { show: false },
        axisTick: { show: false },
        axisLabel: { show: false },
        data: gaugeData,
        title: { fontSize: 9 },
        detail: {
          width: 60,
          height: 16,
          fontSize: 12,
          borderRadius: 4,
          borderWidth: 1,
          borderColor: 'rgba(0,255,65,0.3)',
          backgroundColor: 'rgba(0,0,0,0.5)',
          formatter: '{value}%'
        }
      }
    ]
  }

  chart.setOption(option)

  // 动画：数值从0增长到目标值
  await sleep(300)
  let progress = 0
  const animDuration = 1800
  const startTime = performance.now()

  function animateValues() {
    const elapsed = performance.now() - startTime
    progress = Math.min(1, elapsed / animDuration)
    const ease = 1 - Math.pow(1 - progress, 3)

    gaugeData[0].value = Math.round(rationalValue * ease)
    gaugeData[1].value = Math.round(speedValue * ease)
    gaugeData[2].value = Math.round(trustValue * ease)

    chart.setOption({ series: [{ data: gaugeData }] })

    if (progress < 1) requestAnimationFrame(animateValues)
  }
  requestAnimationFrame(animateValues)

  // 底部说明
  await sleep(2000)
  const desc = document.createElement('div')
  desc.style.cssText = `
    margin-top: 16px;
    font-family: VT323, monospace;
    font-size: 16px;
    color: rgba(0,255,65,0.45);
    text-align: center;
    line-height: 2;
  `
  desc.innerHTML = `
    RATIONAL: A选择占比 &nbsp;·&nbsp;
    SPEED: 决策速度指数 &nbsp;·&nbsp;
    TRUST_AI: 对AI的信任程度
  `
  el.appendChild(desc)
}

// ===== 第六屏：AI最终评估 =====
async function rs_screen6(el, D, goTo) {
  const {
    playerId, totalRounds, choiceBCount,
    ratioA, byType, slowestType,
    playerRank, profileType, sleep,
    allPlayers, allChoices, choices
  } = D

  el.style.padding = '0'
  el.style.width = '100%'
  el.style.height = '100%'
  el.style.boxSizing = 'border-box'

  const title = document.createElement('div')
  title.textContent = '> SURVIVOR_DISTRIBUTION_3D'
  title.style.cssText = `
    position: absolute;
    top: 12px;
    left: 16px;
    z-index: 10;
    font-family: 'Press Start 2P', monospace;
    font-size: 9px;
    color: rgba(0,255,65,0.6);
    letter-spacing: 2px;
    pointer-events: none;
  `

  const hint = document.createElement('div')
  hint.textContent = '> DRAG TO ROTATE · SCROLL TO ZOOM'
  hint.style.cssText = `
    position: absolute;
    top: 32px;
    left: 16px;
    z-index: 10;
    font-family: 'Press Start 2P', monospace;
    font-size: 7px;
    color: rgba(0,255,65,0.2);
    letter-spacing: 1px;
    pointer-events: none;
  `

  const stats = document.createElement('div')
  const avgRatioA = allPlayers && allChoices
    ? (() => {
        let total = 0, count = 0
        allPlayers.forEach(p => {
          const pc = allChoices.filter(c => c.player_id === p.id)
          if (pc.length > 0) {
            total += pc.filter(c => c.choice === 'A').length / pc.length
            count++
          }
        })
        return count ? Math.round(total/count*100) : 50
      })()
    : 50

  stats.innerHTML = `
    <span style="color:rgba(0,255,65,0.6)">
      数据库共 ${allPlayers?.length || 0} 名幸存者
    </span>
    &nbsp;·&nbsp;
    <span style="color:rgba(0,255,65,0.6)">
      你是第 ${playerRank} 个
    </span>
    &nbsp;·&nbsp;
    <span style="color:rgba(0,255,65,0.6)">
      全体平均理性指数 ${avgRatioA}%
    </span>
    <br>
    <span style="color:rgba(0,255,65,0.35);font-size:13px">
      X轴：理性程度 &nbsp; Y轴：决策时长 &nbsp; Z轴：AI信任度
    </span>
  `
  stats.style.cssText = `
    position: absolute;
    top: 12px;
    right: 16px;
    z-index: 10;
    font-family: VT323, monospace;
    font-size: 14px;
    color: rgba(0,255,65,0.5);
    text-align: right;
    pointer-events: none;
  `

  const chartDiv = document.createElement('div')
  chartDiv.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
  `
  el.appendChild(chartDiv)
  el.appendChild(title)
  el.appendChild(hint)
  el.appendChild(stats)

  if (typeof echarts === 'undefined') {
    chartDiv.innerHTML =
      '<div style="color:rgba(255,50,50,0.6);' +
      'font-family:VT323,monospace;font-size:18px">' +
      '> [ERROR] ECHARTS_NOT_LOADED</div>'
    return
  }

  try {
  const chart = echarts.init(chartDiv, null, {
    backgroundColor: 'transparent'
  })

  // 构建所有玩家的3D数据点
  const scatterData = []
  const myChoiceMap = {}
  choices.forEach(c => { myChoiceMap[c.round] = c.choice })

  if (allPlayers && allChoices) {
    allPlayers.forEach(p => {
      const pc = allChoices.filter(c => c.player_id === p.id)
      if (pc.length === 0) return

      const pRatioA = pc.filter(c => c.choice === 'A').length / pc.length
      const pAvgRT = pc.reduce((s,c) => s+c.reaction_time, 0) / pc.length
      const pAITrust = pc.filter(c =>
        c.decision_type === 'AI' && c.choice === 'A').length /
        Math.max(1, pc.filter(c => c.decision_type === 'AI').length)

      const isMe = p.id === playerId
      scatterData.push({
        value: [
          Math.round(pRatioA * 100),
          Math.round(pAvgRT / 100) / 10,
          Math.round(pAITrust * 100)
        ],
        isMe,
        symbolSize: isMe ? 16 : 5,
        itemStyle: {
          color: isMe
            ? '#00ff41'
            : `rgba(0,${Math.round(80+pRatioA*120)},65,0.5)`,
          shadowBlur: isMe ? 20 : 0,
          shadowColor: '#00ff41',
          opacity: isMe ? 1 : 0.6
        }
      })
    })
  }

  // 你的点放最后确保在最上层渲染
  scatterData.sort((a, b) => a.isMe ? 1 : -1)

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      backgroundColor: 'rgba(0,0,0,0.85)',
      borderColor: 'rgba(0,255,65,0.4)',
      borderWidth: 1,
      textStyle: {
        color: '#00ff41',
        fontFamily: 'VT323',
        fontSize: 15
      },
      formatter: params => {
        const v = params.value
        const label = params.data.isMe ? '[ 你 ]' : '幸存者'
        return `${label}<br>` +
          `理性指数：${v[0]}%<br>` +
          `决策时长：${v[1]}s<br>` +
          `AI信任度：${v[2]}%`
      }
    },
    visualMap: {
      show: true,
      dimension: 0,
      min: 0,
      max: 100,
      inRange: {
        color: [
          'rgba(0,80,65,0.8)',
          'rgba(0,255,65,0.9)'
        ]
      },
      text: ['RATIONAL', 'EMOTIONAL'],
      textStyle: {
        color: 'rgba(0,255,65,0.6)',
        fontFamily: "'Press Start 2P'",
        fontSize: 7
      },
      orient: 'vertical',
      right: 8,
      top: 'center',
      itemWidth: 12,
      itemHeight: 80,
      borderColor: 'rgba(0,255,65,0.2)',
      backgroundColor: 'transparent'
    },
    xAxis3D: {
      name: 'RATIONAL',
      nameTextStyle: {
        color: 'rgba(0,255,65,0.6)',
        fontFamily: "'Press Start 2P'",
        fontSize: 8
      },
      axisLine: { lineStyle: { color: 'rgba(0,255,65,0.3)' } },
      axisTick: { lineStyle: { color: 'rgba(0,255,65,0.2)' } },
      axisLabel: {
        color: 'rgba(0,255,65,0.5)',
        fontFamily: 'VT323',
        fontSize: 12,
        formatter: v => v + '%'
      },
      splitLine: { lineStyle: { color: 'rgba(0,255,65,0.05)' } },
      min: 0, max: 100
    },
    yAxis3D: {
      name: 'SPEED',
      nameTextStyle: {
        color: 'rgba(0,255,65,0.6)',
        fontFamily: "'Press Start 2P'",
        fontSize: 8
      },
      axisLine: { lineStyle: { color: 'rgba(0,255,65,0.3)' } },
      axisTick: { lineStyle: { color: 'rgba(0,255,65,0.2)' } },
      axisLabel: {
        color: 'rgba(0,255,65,0.5)',
        fontFamily: 'VT323',
        fontSize: 12,
        formatter: v => v + 's'
      },
      splitLine: { lineStyle: { color: 'rgba(0,255,65,0.05)' } }
    },
    zAxis3D: {
      name: 'TRUST_AI',
      nameTextStyle: {
        color: 'rgba(0,255,65,0.6)',
        fontFamily: "'Press Start 2P'",
        fontSize: 8
      },
      axisLine: { lineStyle: { color: 'rgba(0,255,65,0.3)' } },
      axisTick: { lineStyle: { color: 'rgba(0,255,65,0.2)' } },
      axisLabel: {
        color: 'rgba(0,255,65,0.5)',
        fontFamily: 'VT323',
        fontSize: 12,
        formatter: v => v + '%'
      },
      splitLine: { lineStyle: { color: 'rgba(0,255,65,0.05)' } },
      min: 0, max: 100
    },
    grid3D: {
      boxWidth: 200,
      boxHeight: 130,
      boxDepth: 160,
      viewControl: {
        autoRotate: true,
        autoRotateSpeed: 6,
        rotateSensitivity: 2,
        zoomSensitivity: 1.5,
        distance: 250
      },
      light: {
        main: { intensity: 1.2 },
        ambient: { intensity: 0.4 }
      },
      axisPointer: { show: false },
      environment: 'none'
    },
    series: [{
      type: 'scatter3D',
      data: scatterData,
      symbolSize: d => d.isMe ? 16 : 5,
      itemStyle: {
        borderWidth: 0,
        opacity: 0.8
      },
      emphasis: {
        itemStyle: {
          color: '#ffffff',
          shadowBlur: 20,
          shadowColor: '#00ff41'
        }
      },
      animation: true
    }]
  }

  chart.setOption(option)
  setTimeout(() => {
    chart.resize()
  }, 100)
  setTimeout(() => {
    chart.resize()
  }, 400)
  } catch (err) {
    console.error('[rs_screen6] chart error:', err)
    chartDiv.innerHTML =
      '<div style="color:rgba(255,50,50,0.6);' +
      'font-family:VT323,monospace;font-size:18px;padding:24px">' +
      '> [ERROR] CHART_INIT_FAILED<br>' + err.message + '</div>'
  }

  const btn = document.createElement('button')
  btn.style.cssText = `
    position: absolute;
    bottom: 56px;
    right: 16px;
    z-index: 25;
    font-family: 'Press Start 2P', monospace;
    font-size: 9px;
    color: #00ff41;
    background: rgba(0,255,65,0.12);
    border: 1px solid #00ff41;
    padding: 10px 16px;
    cursor: pointer;
    box-shadow: 0 0 16px rgba(0,255,65,0.5),
                inset 0 0 12px rgba(0,255,65,0.15);
    text-shadow: 0 0 8px rgba(0,255,65,0.8);
    letter-spacing: 1px;
    transition: all .2s;
    animation: rs-pulse 2s infinite;
  `
  btn.textContent = '将我的坐标录入寻人数据库'
  el.appendChild(btn)

  btn.onmouseenter = () => {
    btn.style.background = 'rgba(0,255,65,0.22)'
    btn.style.boxShadow = '0 0 28px rgba(0,255,65,0.85), inset 0 0 16px rgba(0,255,65,0.25)'
    btn.style.transform = 'translateX(2px) scale(1.03)'
    btn.style.animation = 'none'
  }
  btn.onmouseleave = () => {
    btn.style.background = 'rgba(0,255,65,0.12)'
    btn.style.boxShadow = '0 0 16px rgba(0,255,65,0.5), inset 0 0 12px rgba(0,255,65,0.15)'
    btn.style.transform = ''
    btn.style.animation = 'rs-pulse 2s infinite'
  }

  btn.onclick = async () => {
    btn.disabled = true
    btn.style.opacity = '0.4'
    await D.supabase.from('players')
      .update({ result_type: profileType })
      .eq('id', playerId)
    const msg = document.createElement('div')
    msg.style.cssText = `
      font-family: VT323, monospace;
      font-size: 17px; color: rgba(0,255,65,0.6);
      text-align: center;
    `
    el.appendChild(msg)
    if (window.typeText) {
      await window.typeText(msg,
        '> COORDINATES_UPLOADED...',
        { charDelay: 30, playSound: false })
    } else {
      msg.textContent = '> COORDINATES_UPLOADED...'
    }
    await sleep(1500)
    goTo(7)
  }
}

// ===== 第七屏：散点图 =====
async function rs_screen7(el, D) {
  const {
    playerId, allPlayers, allChoices,
    choices, ratioA, avgReaction,
    byType, profileType, playerRank, sleep
  } = D

  el.style.cssText += `
    display: flex;
    flex-direction: row;
    align-items: stretch;
    padding: 0;
    box-sizing: border-box;
    overflow: hidden;
  `

  // 左侧：3D地球
  const leftPanel = document.createElement('div')
  leftPanel.style.cssText = `
    flex: 0 0 62%;
    position: relative;
    overflow: hidden;
  `
  el.appendChild(leftPanel)

  const globeDiv = document.createElement('div')
  globeDiv.style.cssText = `
    width: 100%;
    height: 100%;
  `
  leftPanel.appendChild(globeDiv)

  // 右侧：数据大屏
  const rightPanel = document.createElement('div')
  rightPanel.style.cssText = `
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 24px 20px;
    border-left: 1px solid rgba(0,255,65,0.15);
    box-sizing: border-box;
    overflow: hidden;
  `
  el.appendChild(rightPanel)

  // 右侧顶部标题
  const rtitle = document.createElement('div')
  rtitle.style.cssText = `
    font-family: 'Press Start 2P', monospace;
    font-size: 9px;
    color: rgba(0,255,65,0.5);
    letter-spacing: 2px;
    margin-bottom: 16px;
  `
  rtitle.textContent = '> VAULT-0 / FINAL_TRANSMISSION'
  rightPanel.appendChild(rtitle)

  // AI 独白区域
  const monologue = document.createElement('div')
  monologue.style.cssText = `
    font-family: VT323, monospace;
    font-size: 17px;
    color: rgba(0,255,65,0.8);
    line-height: 2;
    flex: 1;
  `
  rightPanel.appendChild(monologue)

  // 统计数字区域
  const statsGrid = document.createElement('div')
  statsGrid.style.cssText = `
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 16px 0;
  `
  rightPanel.appendChild(statsGrid)

  // 底部光标
  const cursor = document.createElement('div')
  cursor.style.cssText = `
    font-family: 'Press Start 2P', monospace;
    font-size: 9px;
    color: rgba(0,255,65,0.4);
    animation: rs-blink 1.2s infinite;
  `
  cursor.textContent = '> 等待回应中..._'
  rightPanel.appendChild(cursor)

  const initGlobe = () => {
    if (typeof THREE === 'undefined') {
      globeDiv.innerHTML =
        '<div style="color:rgba(255,50,50,0.5);font-family:VT323,monospace;font-size:16px;padding:40px;text-align:center">> THREE.JS_NOT_LOADED</div>'
      return
    }

    const W = globeDiv.offsetWidth || 700
    const H = globeDiv.offsetHeight || 500

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setSize(W, H)
    renderer.setClearColor(0x000000, 0)
    renderer.setPixelRatio(window.devicePixelRatio)
    globeDiv.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, W/H, 0.1, 1000)
    camera.position.set(0, 0, 3)

    // 地球黑色底球
    const earthGeo = new THREE.SphereGeometry(1, 64, 64)
    const earthMat = new THREE.MeshBasicMaterial({ color: 0x000000 })
    scene.add(new THREE.Mesh(earthGeo, earthMat))

    // 经线
    for (let lon = 0; lon < 360; lon += 20) {
      const pts = []
      for (let lat = -90; lat <= 90; lat += 2) {
        const phi = (90 - lat) * Math.PI / 180
        const theta = (lon) * Math.PI / 180
        pts.push(new THREE.Vector3(
          1.001 * Math.sin(phi) * Math.cos(theta),
          1.001 * Math.cos(phi),
          1.001 * Math.sin(phi) * Math.sin(theta)
        ))
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      scene.add(new THREE.Line(geo,
        new THREE.LineBasicMaterial({
          color: 0x00ff41, transparent: true, opacity: 0.25
        })
      ))
    }

    // 纬线
    for (let lat = -80; lat <= 80; lat += 20) {
      const pts = []
      const phi = (90 - lat) * Math.PI / 180
      for (let lon = 0; lon <= 360; lon += 2) {
        const theta = lon * Math.PI / 180
        pts.push(new THREE.Vector3(
          1.001 * Math.sin(phi) * Math.cos(theta),
          1.001 * Math.cos(phi),
          1.001 * Math.sin(phi) * Math.sin(theta)
        ))
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts)
      const isEquator = lat === 0
      scene.add(new THREE.Line(geo,
        new THREE.LineBasicMaterial({
          color: 0x00ff41,
          transparent: true,
          opacity: isEquator ? 0.5 : 0.2
        })
      ))
    }

    // 大气外圈
    const atmGeo = new THREE.SphereGeometry(1.02, 64, 64)
    const atmMat = new THREE.MeshBasicMaterial({
      color: 0x00ff41, transparent: true,
      opacity: 0.04, side: THREE.BackSide
    })
    scene.add(new THREE.Mesh(atmGeo, atmMat))

    const halo1 = new THREE.Mesh(
      new THREE.SphereGeometry(1.04, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x00ff41, transparent: true,
        opacity: 0.06, side: THREE.BackSide
      })
    )
    scene.add(halo1)

    const halo2 = new THREE.Mesh(
      new THREE.SphereGeometry(1.08, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x00ff41, transparent: true,
        opacity: 0.03, side: THREE.BackSide
      })
    )
    scene.add(halo2)

    // 北极圈
    const npPts = []
    for (let lon = 0; lon <= 360; lon += 2) {
      const phi = (90 - 66.5) * Math.PI / 180
      const theta = lon * Math.PI / 180
      npPts.push(new THREE.Vector3(
        1.002 * Math.sin(phi) * Math.cos(theta),
        1.002 * Math.cos(phi),
        1.002 * Math.sin(phi) * Math.sin(theta)
      ))
    }
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(npPts),
      new THREE.LineBasicMaterial({
        color: 0x00ff41, transparent: true, opacity: 0.4
      })
    ))

    // 南极圈（对称）
    const spPts = npPts.map(p =>
      new THREE.Vector3(p.x, -p.y, p.z))
    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(spPts),
      new THREE.LineBasicMaterial({
        color: 0x00ff41, transparent: true, opacity: 0.4
      })
    ))

    // 玩家散点
    const myChoiceMap = {}
    choices.forEach(c => { myChoiceMap[c.round] = c.choice })

    const dotGroup = new THREE.Group()
    scene.add(dotGroup)

    if (allPlayers && allChoices) {
      allPlayers.forEach(p => {
        const pc = allChoices.filter(c => c.player_id === p.id)
        if (pc.length === 0) return

        const pRatioA = pc.filter(c=>c.choice==='A').length / pc.length
        const pAITrust = pc.filter(c=>
          c.decision_type==='AI' && c.choice==='A').length /
          Math.max(1, pc.filter(c=>c.decision_type==='AI').length)

        const lon = pRatioA * 360
        const lat = (pAITrust * 120) - 60
        const isMe = p.id === playerId

        const phi = (90 - lat) * Math.PI / 180
        const theta = lon * Math.PI / 180
        const r = 1.015

        const dotGeo = new THREE.SphereGeometry(
          isMe ? 0.022 : 0.007, 8, 8)
        const dotMat = new THREE.MeshBasicMaterial({
          color: isMe ? 0x00ff41 : 0x00dd55,
          transparent: true,
          opacity: isMe ? 1 : 0.7
        })

        if (isMe) {
          // 中心亮点
          const coreDot = new THREE.Mesh(
            new THREE.SphereGeometry(0.022, 12, 12),
            new THREE.MeshBasicMaterial({ color: 0x00ff41 })
          )
          coreDot.position.set(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
          )
          dotGroup.add(coreDot)

          // 外圈1
          const ring1 = new THREE.Mesh(
            new THREE.SphereGeometry(0.038, 12, 12),
            new THREE.MeshBasicMaterial({
              color: 0x00ff41, transparent: true,
              opacity: 0.3, wireframe: true
            })
          )
          ring1.position.copy(coreDot.position)
          ring1.userData.isPulse = true
          ring1.userData.baseOpacity = 0.3
          dotGroup.add(ring1)

          // 外圈2
          const ring2 = new THREE.Mesh(
            new THREE.SphereGeometry(0.055, 12, 12),
            new THREE.MeshBasicMaterial({
              color: 0x00ff41, transparent: true,
              opacity: 0.1, wireframe: true
            })
          )
          ring2.position.copy(coreDot.position)
          ring2.userData.isPulse = true
          ring2.userData.baseOpacity = 0.1
          dotGroup.add(ring2)
        } else {
          const dot = new THREE.Mesh(dotGeo, dotMat)
          dot.position.set(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
          )
          dotGroup.add(dot)
        }
      })
    }

    // 鼠标拖拽旋转
    let isDragging = false
    let prevX = 0, prevY = 0
    let rotX = 0.1, rotY = 0
    let autoRotate = true
    let autoRotateTimer = null

    renderer.domElement.style.cursor = 'grab'

    renderer.domElement.addEventListener('mousedown', e => {
      isDragging = true
      autoRotate = false
      if (autoRotateTimer) clearTimeout(autoRotateTimer)
      prevX = e.clientX
      prevY = e.clientY
      renderer.domElement.style.cursor = 'grabbing'
    })

    window.addEventListener('mousemove', e => {
      if (!isDragging) return
      const dx = e.clientX - prevX
      const dy = e.clientY - prevY
      rotY += dx * 0.004
      rotX += dy * 0.004
      rotX = Math.max(-1.2, Math.min(1.2, rotX))
      prevX = e.clientX
      prevY = e.clientY
    })

    window.addEventListener('mouseup', () => {
      if (!isDragging) return
      isDragging = false
      renderer.domElement.style.cursor = 'grab'
      autoRotateTimer = setTimeout(() => { autoRotate = true }, 2000)
    })

    // 渲染循环
    let animating = true

    function applyRotation() {
      const q = new THREE.Quaternion()
      q.setFromEuler(new THREE.Euler(rotX, rotY, 0, 'YXZ'))
      scene.children.forEach(obj => {
        if (obj !== camera) obj.quaternion.copy(q)
      })
    }

    function animate() {
      if (!animating) return
      requestAnimationFrame(animate)
      if (autoRotate) rotY += 0.004
      applyRotation()

      // 你的点脉冲动画
      const t = Date.now() * 0.002
      dotGroup.children.forEach(obj => {
        if (obj.userData.isPulse) {
          obj.material.opacity =
            obj.userData.baseOpacity *
            (0.5 + 0.5 * Math.sin(t * 2))
        }
      })

      renderer.render(scene, camera)
    }
    animate()

    // 离开时停止
    const obs = new IntersectionObserver(entries => {
      animating = entries[0].isIntersecting
      if (animating) animate()
    })
    obs.observe(globeDiv)
  }

  // 等容器有尺寸后初始化
  const waitForSize = () => new Promise(resolve => {
    const check = () => {
      if (globeDiv.offsetWidth > 0 && globeDiv.offsetHeight > 0) {
        resolve()
      } else {
        requestAnimationFrame(check)
      }
    }
    requestAnimationFrame(check)
  })
  await waitForSize()
  await sleep(100)
  initGlobe()

  // 右侧：逐行打印 AI 独白
  await sleep(800)

  const lines = [
    '> 你的档案已保存。',
    '> VAULT-0的大门',
    '> 将为你保持开启。',
    '>',
    '> 如果你找到了他们——',
    '> 请带他们回来。',
    '>',
    '> 这是我最后的协议。'
  ]

  for (const line of lines) {
    const div = document.createElement('div')
    monologue.appendChild(div)
    if (window.typeText) {
      await window.typeText(div, line,
        { charDelay: 25, playSound: false })
    } else {
      div.textContent = line
    }
    await sleep(400)
  }

  // 统计数字
  await sleep(600)

  const totalPlayers = allPlayers?.length || 0
  const avgRational = allPlayers && allChoices
    ? (() => {
        let total = 0, count = 0
        allPlayers.forEach(p => {
          const pc = allChoices.filter(c => c.player_id === p.id)
          if (pc.length > 0) {
            total += pc.filter(c=>c.choice==='A').length / pc.length
            count++
          }
        })
        return count ? Math.round(total/count*100) : 50
      })()
    : 50

  // profileType 分布
  const profileCounts = {}
  ;(allPlayers||[]).forEach(p => {
    if (p.result_type) {
      profileCounts[p.result_type] =
        (profileCounts[p.result_type]||0) + 1
    }
  })
  const topProfile = Object.entries(profileCounts)
    .sort((a,b)=>b[1]-a[1])[0]?.[0] || '--'

  const statItems = [
    { label: 'SURVIVORS', value: totalPlayers },
    { label: 'AVG RATIONAL', value: avgRational + '%' },
    { label: 'TOP PROFILE', value: topProfile.split('_')[0] },
    { label: 'YOUR RANK', value: '#' + playerRank }
  ]

  for (const item of statItems) {
    const card = document.createElement('div')
    card.style.cssText = `
      border: 1px solid rgba(0,255,65,0.15);
      padding: 8px 10px;
      box-sizing: border-box;
    `
    card.innerHTML = `
      <div style="
        font-family:'Press Start 2P',monospace;
        font-size:7px;
        color:rgba(0,255,65,0.35);
        margin-bottom:6px;
        letter-spacing:1px;
      ">${item.label}</div>
      <div style="
        font-family:'Press Start 2P',monospace;
        font-size:13px;
        color:#00ff41;
        text-shadow:0 0 8px #00ff41;
      ">${item.value}</div>
    `
    statsGrid.appendChild(card)
    await sleep(200)
  }
}

// ===== 第八屏：大屏展示 =====
async function rs_screen8(el, D) {
  const { byType, types, profileType, STATE,
          ratioA, avgReaction, allPlayers,
          allChoices, choices, playerId,
          playerRank, sleep } = D

  const navBar = document.getElementById('rsdot-8')?.parentElement
  if (navBar) navBar.style.display = 'none'
  document.querySelectorAll('[id^="rsdot-"]').forEach(d => {
    d.style.display = 'none'
  })
  const clickHint = document.getElementById('click-advance-hint')
  if (clickHint) clickHint.style.display = 'none'

  // 释放第六屏后台 3D 图表，避免与第八屏双重 WebGL 竞争
  if (typeof echarts !== 'undefined') {
    const s6 = document.getElementById('rs-6')
    s6?.querySelectorAll('div').forEach(div => {
      const inst = echarts.getInstanceByDom(div)
      if (inst) inst.dispose()
    })
  }

  // 铺满整屏
  el.style.top = '0'
  el.style.bottom = '0'
  el.style.left = '0'
  el.style.right = '0'
  el.style.display = 'flex'
  el.style.flexDirection = 'column'
  el.style.padding = '0'
  el.style.width = '100%'
  el.style.height = '100%'
  el.style.boxSizing = 'border-box'
  el.style.overflow = 'hidden'

  const header = document.createElement('div')
  header.style.cssText = `
    flex-shrink: 0;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid rgba(0,255,65,0.2);
    background: rgba(0,255,65,0.03);
    position: relative;
  `
  header.innerHTML = `
    <div style="
      font-family:'Press Start 2P',monospace;
      font-size:9px; color:#00ff41;
      text-shadow:0 0 8px #00ff41;
      letter-spacing:2px;
    ">末日录屏 · 幸存者数据总览</div>
    <div style="
      position:absolute; right:12px;
      font-family:'Press Start 2P',monospace;
      font-size:7px; color:rgba(0,255,65,0.4);
    ">DAY 2891 / YEAR 08 A.C.</div>
  `
  el.appendChild(header)

  // 散点/地球跨两行占满下半屏，右下保留动态节点
  const body = document.createElement('div')
  body.style.cssText = `
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1.8fr 1fr;
    grid-template-rows: 1fr 1.1fr 0.9fr;
    grid-template-areas:
      "profile timeline radar"
      "scatter globe gauge"
      "scatter globe network";
    gap: 0;
    min-height: 0;
    overflow: hidden;
  `
  el.appendChild(body)

  function makeCell(titleText, area) {
    const cell = document.createElement('div')
    cell.style.cssText = `
      grid-area: ${area};
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(0,255,65,0.12);
      overflow: hidden;
      min-height: 0;
      min-width: 0;
    `
    const cellTitle = document.createElement('div')
    cellTitle.style.cssText = `
      flex-shrink: 0;
      padding: 2px 8px;
      font-family: 'Press Start 2P', monospace;
      font-size: 6px;
      color: rgba(0,255,65,0.5);
      border-bottom: 1px solid rgba(0,255,65,0.1);
      letter-spacing: 1px;
      background: rgba(0,255,65,0.02);
    `
    cellTitle.textContent = titleText
    cell.appendChild(cellTitle)
    const content = document.createElement('div')
    content.style.cssText = `
      flex: 1;
      min-height: 0;
      overflow: hidden;
      position: relative;
    `
    cell.appendChild(content)
    body.appendChild(cell)
    return content
  }

  const profileCell = makeCell('> SURVIVOR_PROFILE', 'profile')
  const timelineCell = makeCell('> DECISION_TIMELINE', 'timeline')
  const radarCell = makeCell('> PSYCH_RADAR', 'radar')
  const scatterCell = makeCell('> SURVIVOR_DISTRIBUTION_3D', 'scatter')
  const gaugeCell = makeCell('> PSYCH_INDEX', 'gauge')
  const networkCell = makeCell('> SURVIVOR_NETWORK', 'network')

  const globeCell = document.createElement('div')
  globeCell.style.cssText = `
    grid-area: globe;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(0,255,65,0.2);
    overflow: hidden;
    min-height: 0;
    min-width: 0;
    background: rgba(0,255,65,0.02);
  `
  const globeTitle = document.createElement('div')
  globeTitle.style.cssText = `
    flex-shrink: 0;
    padding: 2px 8px;
    font-family: 'Press Start 2P', monospace;
    font-size: 6px;
    color: rgba(0,255,65,0.6);
    border-bottom: 1px solid rgba(0,255,65,0.15);
    letter-spacing: 1px;
    text-align: center;
  `
  globeTitle.textContent = '> SURVIVOR_GLOBE'
  globeCell.appendChild(globeTitle)
  const globeDiv = document.createElement('div')
  globeDiv.style.cssText = `
    flex: 1;
    min-height: 0;
    overflow: hidden;
  `
  globeCell.appendChild(globeDiv)
  body.appendChild(globeCell)

  const footer = document.createElement('div')
  footer.style.cssText = `
    flex-shrink: 0;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 28px;
    border-top: 1px solid rgba(0,255,65,0.15);
    background: rgba(0,255,65,0.02);
  `

  const totalPlayers = allPlayers?.length || 0
  const avgRational = allPlayers && allChoices ? (() => {
    const byPlayer = new Map()
    for (const c of allChoices) {
      if (!byPlayer.has(c.player_id)) byPlayer.set(c.player_id, [])
      byPlayer.get(c.player_id).push(c)
    }
    let total = 0, count = 0
    for (const p of allPlayers) {
      const pc = byPlayer.get(p.id)
      if (pc && pc.length > 0) {
        total += pc.filter(c => c.choice === 'A').length / pc.length
        count++
      }
    }
    return count ? Math.round(total / count * 100) : 55
  })() : 55

  ;[
    `SURVIVORS: ${totalPlayers}`,
    `AVG_RATIONAL: ${avgRational}%`,
    `TOP_PROFILE: ${profileType.split('_')[0]}`,
    `YOUR_RANK: #${playerRank}`
  ].forEach(item => {
    const span = document.createElement('span')
    span.style.cssText = `
      font-family: 'Press Start 2P', monospace;
      font-size: 6px;
      color: rgba(0,255,65,0.5);
      letter-spacing: 1px;
    `
    span.textContent = item
    footer.appendChild(span)
  })
  el.appendChild(footer)

  await sleep(200)

  // 分批初始化，避免主线程长时间阻塞
  rs_screen1_mini(profileCell, D)
  rs_screen2_mini(radarCell, D)
  rs_screen3_mini(timelineCell, D)
  await sleep(0)
  rs_screen4_mini(networkCell, D, { animated: true })
  rs_screen5_mini(gaugeCell, D)
  await sleep(0)
  rs_screen6_mini(scatterCell, D)
  rs_globe_mini(globeDiv, D)

  setTimeout(() => {
    if (typeof echarts === 'undefined') return
    ;[timelineCell, scatterCell, radarCell, gaugeCell, networkCell].forEach(cell => {
      cell.querySelectorAll('div').forEach(div => {
        const inst = echarts.getInstanceByDom(div)
        if (inst) inst.resize()
      })
    })
  }, 400)
}

// ===== 迷你版图表函数 =====

function rs_screen1_mini(el, D) {
  const { playerId, totalRounds, profileType, STATE } = D
  const shortId = playerId.replace(/-/g, '').substring(0, 6).toUpperCase()

  el.style.cssText = `
    padding: 4px 10px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    box-sizing: border-box;
  `

  const idEl = document.createElement('div')
  idEl.style.cssText = `
    font-family: 'Press Start 2P', monospace;
    font-size: 13px;
    color: #00ff41;
    text-shadow: 0 0 10px rgba(0,255,65,0.5);
    letter-spacing: 3px;
    margin-bottom: 4px;
  `
  idEl.textContent = `#${shortId}`
  el.appendChild(idEl)

  const card = document.createElement('div')
  card.style.cssText = `
    border: 1px dashed rgba(0,255,65,0.25);
    padding: 6px 8px;
    box-shadow: inset 0 0 8px rgba(0,255,65,0.03);
  `
  el.appendChild(card)

  const rows = [
    ['GENDER', STATE.gender || '--'],
    ['AGE', STATE.age || '--'],
    ['FUNCTION', STATE.occupation || '--'],
    ['MODE', STATE.isBusy ? '忙碌模式' : '常规模式'],
    ['DECISIONS', totalRounds],
    ['PROFILE', profileType.split('_')[0]],
  ]

  rows.forEach(([k, v]) => {
    const row = document.createElement('div')
    row.style.cssText = `
      display: flex;
      gap: 8px;
      align-items: baseline;
      border-bottom: 1px solid rgba(0,255,65,0.06);
      padding: 2px 0;
    `
    const key = document.createElement('span')
    key.style.cssText = `
      font-family: 'Press Start 2P', monospace;
      font-size: 5px;
      color: rgba(0,255,65,0.4);
      width: 52px;
      flex-shrink: 0;
      line-height: 1.8;
    `
    key.textContent = k
    const val = document.createElement('span')
    val.style.cssText = `
      font-family: VT323, monospace;
      font-size: 14px;
      color: rgba(0,255,65,0.85);
    `
    val.textContent = v
    row.appendChild(key)
    row.appendChild(val)
    card.appendChild(row)
  })
}

function rs_screen2_mini(el, D) {
  const { byType, types } = D
  if (!types?.length) return

  el.style.display = 'flex'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'

  const side = Math.min(el.offsetWidth, el.offsetHeight) || 160
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  canvas.style.cssText = `
    display: block;
    max-width: 100%;
    max-height: 100%;
  `
  el.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  const cx = side / 2
  const cy = side / 2
  const R = side * 0.36
  const N = types.length
  const values = types.map(t => byType[t]?.ratioA ?? 0)

  function axisAngle(i) {
    return (i / N) * Math.PI * 2 - Math.PI / 2
  }

  ctx.clearRect(0, 0, side, side)

  // 网格
  for (let r = 1; r <= 4; r++) {
    ctx.beginPath()
    for (let i = 0; i < N; i++) {
      const a = axisAngle(i)
      const rr = (r / 4) * R
      const x = cx + Math.cos(a) * rr
      const y = cy + Math.sin(a) * rr
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.closePath()
    ctx.strokeStyle = 'rgba(0,255,65,0.1)'
    ctx.lineWidth = 0.5
    ctx.stroke()
  }

  // 轴线 + 标签
  types.forEach((label, i) => {
    const a = axisAngle(i)
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
    ctx.strokeStyle = 'rgba(0,255,65,0.15)'
    ctx.lineWidth = 0.5
    ctx.stroke()

    ctx.fillStyle = 'rgba(0,255,65,0.6)'
    ctx.font = '6px "Press Start 2P"'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(
      label,
      cx + Math.cos(a) * (R + 10),
      cy + Math.sin(a) * (R + 10)
    )
  })

  // 数据多边形
  ctx.beginPath()
  values.forEach((v, i) => {
    const a = axisAngle(i)
    const x = cx + Math.cos(a) * v * R
    const y = cy + Math.sin(a) * v * R
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.closePath()
  ctx.fillStyle = 'rgba(0,255,65,0.12)'
  ctx.fill()
  ctx.strokeStyle = '#00ff41'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // 数据点
  values.forEach((v, i) => {
    const a = axisAngle(i)
    ctx.beginPath()
    ctx.arc(
      cx + Math.cos(a) * v * R,
      cy + Math.sin(a) * v * R,
      3, 0, Math.PI * 2
    )
    ctx.fillStyle = '#00ff41'
    ctx.fill()
  })
}

function rs_screen5_mini(el, D) {
  const { ratioA, avgReaction, byType } = D

  if (typeof echarts === 'undefined') return

  const chartDiv = document.createElement('div')
  chartDiv.style.cssText = 'width:100%;height:100%'
  el.appendChild(chartDiv)

  const chart = echarts.init(chartDiv, null, {
    backgroundColor: 'transparent'
  })

  const rationalValue = Math.round(ratioA * 100)
  const speedValue = Math.round(
    Math.max(0, Math.min(100, (1-(avgReaction-2000)/28000)*100)))
  const trustValue = Math.round((byType['AI']?.ratioA||0)*100)

  chart.setOption({
    backgroundColor: 'transparent',
    series: [{
      type: 'gauge',
      startAngle: 90, endAngle: -270,
      pointer: { show: false },
      progress: {
        show: true, overlap: false,
        roundCap: true, clip: false,
        itemStyle: {
          borderWidth: 1,
          borderColor: 'rgba(0,255,65,0.15)'
        }
      },
      axisLine: {
        lineStyle: {
          width: 20,
          color: [[1,'rgba(0,255,65,0.05)']]
        }
      },
      splitLine: { show: false },
      axisTick: { show: false },
      axisLabel: { show: false },
      data: [
        {
          value: rationalValue,
          name: 'RATIONAL',
          title: {
            offsetCenter: ['0%','-28%'],
            color: 'rgba(0,255,65,0.5)',
            fontFamily:"'Press Start 2P'",
            fontSize: 7
          },
          detail: {
            valueAnimation: true,
            offsetCenter: ['0%','-16%'],
            color: '#00ff41',
            fontFamily:"'Press Start 2P'",
            fontSize: 10,
            formatter: '{value}%'
          },
          itemStyle: { color: '#00ff41' }
        },
        {
          value: speedValue,
          name: 'SPEED',
          title: {
            offsetCenter: ['0%','5%'],
            color: 'rgba(0,255,65,0.5)',
            fontFamily:"'Press Start 2P'",
            fontSize: 7
          },
          detail: {
            valueAnimation: true,
            offsetCenter: ['0%','17%'],
            color: '#00ff41',
            fontFamily:"'Press Start 2P'",
            fontSize: 10,
            formatter: '{value}%'
          },
          itemStyle: { color: 'rgba(0,200,65,0.8)' }
        },
        {
          value: trustValue,
          name: 'TRUST_AI',
          title: {
            offsetCenter: ['0%','38%'],
            color: 'rgba(0,255,65,0.5)',
            fontFamily:"'Press Start 2P'",
            fontSize: 7
          },
          detail: {
            valueAnimation: true,
            offsetCenter: ['0%','50%'],
            color: '#00ff41',
            fontFamily:"'Press Start 2P'",
            fontSize: 10,
            formatter: '{value}%'
          },
          itemStyle: { color: 'rgba(0,150,65,0.7)' }
        }
      ],
      detail: {
        width: 40, height: 12, fontSize: 10,
        borderRadius: 3, borderWidth: 1,
        borderColor: 'rgba(0,255,65,0.3)',
        backgroundColor: 'rgba(0,0,0,0.5)'
      }
    }]
  })
  setTimeout(() => chart.resize(), 200)
}

function rs_screen3_mini(el, D) {
  const { choices } = D

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'width:100%;height:100%'
  canvas.width = el.offsetWidth || 300
  canvas.height = el.offsetHeight || 200
  el.appendChild(canvas)

  const ctx = canvas.getContext('2d')
  const W = canvas.width, H = canvas.height
  const sorted = [...choices].sort((a,b)=>a.round-b.round)
  const maxRT = Math.max(...sorted.map(c=>c.reaction_time))
  const PAD = { t:10, r:10, b:20, l:30 }
  const cW = W-PAD.l-PAD.r
  const cH = H-PAD.t-PAD.b
  const bW = cW/sorted.length - 2

  ctx.clearRect(0,0,W,H)

  // 轴线
  ctx.strokeStyle = 'rgba(0,255,65,0.2)'
  ctx.lineWidth = 0.5
  ctx.beginPath()
  ctx.moveTo(PAD.l, PAD.t)
  ctx.lineTo(PAD.l, H-PAD.b)
  ctx.lineTo(W-PAD.r, H-PAD.b)
  ctx.stroke()

  sorted.forEach((c,i) => {
    const x = PAD.l + i*(cW/sorted.length) + 1
    const h = (c.reaction_time/maxRT)*cH
    const y = H-PAD.b-h
    const isA = c.choice === 'A'
    ctx.fillStyle = isA
      ? 'rgba(0,255,65,0.7)' : 'rgba(0,180,65,0.4)'
    ctx.fillRect(x, y, bW, h)
  })
}

function rs_screen4_mini(el, D, opts = {}) {
  const { allPlayers, allChoices, choices, playerId } = D
  const animated = opts.animated === true

  if (typeof echarts === 'undefined') return

  const chartDiv = document.createElement('div')
  chartDiv.style.cssText = 'width:100%;height:100%'
  el.appendChild(chartDiv)

  const chart = echarts.init(chartDiv, null, {
    backgroundColor: 'transparent'
  })

  const myChoiceMap = {}
  choices.forEach(c => { myChoiceMap[c.round] = c.choice })

  const nodes = [{
    id: playerId, name: 'YOU',
    symbolSize: 14,
    itemStyle: {
      color: '#00ff41',
      shadowBlur: 10, shadowColor: '#00ff41'
    },
    label: {
      show: true, color: '#00ff41',
      fontFamily:"'Press Start 2P'", fontSize: 6
    }
  }]
  const edges = []

  const others = (allPlayers||[])
    .filter(p=>p.id!==playerId).slice(0,60)

  const choiceMap = new Map()
  for (const c of (allChoices || [])) {
    if (!choiceMap.has(c.player_id)) choiceMap.set(c.player_id, [])
    choiceMap.get(c.player_id).push(c)
  }

  others.forEach(p => {
    const pc = choiceMap.get(p.id) || []
    let sim = Math.random()*0.5
    if (pc.length > 0) {
      let same = 0
      pc.forEach(c=>{if(myChoiceMap[c.round]===c.choice)same++})
      sim = same/Math.max(pc.length,choices.length)
    }
    nodes.push({
      id: p.id,
      symbolSize: 3+sim*8,
      itemStyle: {
        color:`rgba(0,${Math.round(80+sim*175)},65,${0.3+sim*0.5})`
      },
      label: { show: false }
    })
    if (sim > 0.5) {
      edges.push({
        source: playerId, target: p.id,
        lineStyle: {
          color:`rgba(0,255,65,${sim*0.3})`,
          width: sim
        }
      })
    }
  })

  chart.setOption({
    backgroundColor: 'transparent',
    series: [{
      type: 'graph',
      layout: 'force',
      roam: false,
      data: nodes, edges,
      force: {
        repulsion: animated ? 80 : 60,
        edgeLength: [20, 80],
        gravity: 0.12,
        layoutAnimation: animated
      },
      lineStyle: { curveness: 0.2 },
      animation: animated,
      animationDuration: animated ? 1500 : 0
    }]
  })
  setTimeout(() => chart.resize(), 200)
}

function rs_screen6_mini(el, D) {
  const { playerId, allPlayers, allChoices } = D

  if (typeof echarts === 'undefined') return

  const chartDiv = document.createElement('div')
  chartDiv.style.cssText = 'width:100%;height:100%'
  el.appendChild(chartDiv)

  try {
    const chart = echarts.init(chartDiv, null, {
      backgroundColor: 'transparent'
    })

    const byPlayer = new Map()
    for (const c of (allChoices || [])) {
      if (!byPlayer.has(c.player_id)) byPlayer.set(c.player_id, [])
      byPlayer.get(c.player_id).push(c)
    }

    const scatterData = []
    const players = (allPlayers || []).slice(0, 200)
    if (playerId && !players.some(p => p.id === playerId)) {
      const me = allPlayers.find(p => p.id === playerId)
      if (me) players.push(me)
    }
    for (const p of players) {
      const pc = byPlayer.get(p.id)
      if (!pc || pc.length === 0) continue

      const pRatioA = pc.filter(c => c.choice === 'A').length / pc.length
      const pAvgRT = pc.reduce((s, c) => s + c.reaction_time, 0) / pc.length
      const aiChoices = pc.filter(c => c.decision_type === 'AI')
      const pAITrust = pc.filter(c =>
        c.decision_type === 'AI' && c.choice === 'A').length /
        Math.max(1, aiChoices.length)

      const isMe = p.id === playerId
      scatterData.push({
        value: [
          Math.round(pRatioA * 100),
          Math.round(pAvgRT / 100) / 10,
          Math.round(pAITrust * 100)
        ],
        isMe,
        symbolSize: isMe ? 10 : 4,
        itemStyle: {
          color: isMe
            ? '#00ff41'
            : `rgba(0,${Math.round(80 + pRatioA * 120)},65,0.5)`,
          shadowBlur: isMe ? 12 : 0,
          shadowColor: '#00ff41',
          opacity: isMe ? 1 : 0.6
        }
      })
    }
    scatterData.sort((a, b) => a.isMe ? 1 : -1)

    chart.setOption({
      backgroundColor: 'transparent',
      visualMap: {
        show: false,
        dimension: 0,
        min: 0,
        max: 100,
        inRange: {
          color: ['rgba(0,80,65,0.8)', 'rgba(0,255,65,0.9)']
        }
      },
      xAxis3D: {
        name: 'RAT',
        nameTextStyle: {
          color: 'rgba(0,255,65,0.5)',
          fontFamily: "'Press Start 2P'",
          fontSize: 6
        },
        axisLine: { lineStyle: { color: 'rgba(0,255,65,0.2)' } },
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: 'rgba(0,255,65,0.05)' } },
        min: 0, max: 100
      },
      yAxis3D: {
        name: 'SPD',
        nameTextStyle: {
          color: 'rgba(0,255,65,0.5)',
          fontFamily: "'Press Start 2P'",
          fontSize: 6
        },
        axisLine: { lineStyle: { color: 'rgba(0,255,65,0.2)' } },
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: 'rgba(0,255,65,0.05)' } }
      },
      zAxis3D: {
        name: 'AI',
        nameTextStyle: {
          color: 'rgba(0,255,65,0.5)',
          fontFamily: "'Press Start 2P'",
          fontSize: 6
        },
        axisLine: { lineStyle: { color: 'rgba(0,255,65,0.2)' } },
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: 'rgba(0,255,65,0.05)' } },
        min: 0, max: 100
      },
      grid3D: {
        boxWidth: 160,
        boxHeight: 50,
        boxDepth: 120,
        viewControl: {
          autoRotate: true,
          autoRotateSpeed: 8,
          rotateSensitivity: 1,
          zoomSensitivity: 0.8,
          distance: 180
        },
        light: {
          main: { intensity: 1.2 },
          ambient: { intensity: 0.4 }
        },
        axisPointer: { show: false },
        environment: 'none'
      },
      series: [{
        type: 'scatter3D',
        data: scatterData,
        itemStyle: { borderWidth: 0, opacity: 0.8 },
        animation: false
      }]
    })

    setTimeout(() => chart.resize(), 100)
    setTimeout(() => chart.resize(), 300)
  } catch (err) {
    console.error('[rs_screen6_mini] chart error:', err)
  }
}

function rs_globe_mini(globeDiv, D) {
  const { allPlayers, allChoices, playerId } = D

  if (typeof THREE === 'undefined') return

  const W = globeDiv.offsetWidth || 400
  const H = globeDiv.offsetHeight || 400

  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true
  })
  renderer.setSize(W, H)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
  renderer.setClearColor(0x000000, 0)
  globeDiv.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 1000)
  camera.position.set(0, 0, 2.8)

  const globeGroup = new THREE.Group()
  scene.add(globeGroup)

  globeGroup.add(new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  ))

  // 经纬线（精简）
  for (let lon = 0; lon < 360; lon += 45) {
    const pts = []
    for (let lat = -90; lat <= 90; lat += 6) {
      const phi = (90 - lat) * Math.PI / 180
      const theta = lon * Math.PI / 180
      pts.push(new THREE.Vector3(
        1.001 * Math.sin(phi) * Math.cos(theta),
        1.001 * Math.cos(phi),
        1.001 * Math.sin(phi) * Math.sin(theta)
      ))
    }
    globeGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: 0x00ff41, transparent: true, opacity: 0.2
      })
    ))
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const pts = []
    const phi = (90 - lat) * Math.PI / 180
    for (let lon = 0; lon <= 360; lon += 6) {
      const theta = lon * Math.PI / 180
      pts.push(new THREE.Vector3(
        1.001 * Math.sin(phi) * Math.cos(theta),
        1.001 * Math.cos(phi),
        1.001 * Math.sin(phi) * Math.sin(theta)
      ))
    }
    globeGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: 0x00ff41, transparent: true, opacity: 0.15
      })
    ))
  }

  const byPlayer = new Map()
  for (const c of (allChoices || [])) {
    if (!byPlayer.has(c.player_id)) byPlayer.set(c.player_id, [])
    byPlayer.get(c.player_id).push(c)
  }

  const meFirst = (allPlayers || []).slice(0, 120)
  if (playerId && !meFirst.some(p => p.id === playerId)) {
    const me = allPlayers.find(p => p.id === playerId)
    if (me) meFirst.push(me)
  }
  for (const p of meFirst) {
    const pc = byPlayer.get(p.id)
    if (!pc || pc.length === 0) continue

    const pRatioA = pc.filter(c => c.choice === 'A').length / pc.length
    const aiChoices = pc.filter(c => c.decision_type === 'AI')
    const pAITrust = pc.filter(c =>
      c.decision_type === 'AI' && c.choice === 'A').length /
      Math.max(1, aiChoices.length)
    const lon = pRatioA * 360
    const lat = (pAITrust * 120) - 60
    const isMe = p.id === playerId
    const phi = (90 - lat) * Math.PI / 180
    const theta = lon * Math.PI / 180
    const r = 1.015
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(isMe ? 0.02 : 0.006, 4, 4),
      new THREE.MeshBasicMaterial({
        color: isMe ? 0x00ff41 : 0x00cc41,
        transparent: true, opacity: isMe ? 1 : 0.6
      })
    )
    dot.position.set(
      r * Math.sin(phi) * Math.cos(theta),
      r * Math.cos(phi),
      r * Math.sin(phi) * Math.sin(theta)
    )
    globeGroup.add(dot)
  }

  globeGroup.add(new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0x00ff41, transparent: true,
      opacity: 0.04, side: THREE.BackSide
    })
  ))

  let rotY = 0
  let animating = true
  let rafId = null

  function animate() {
    if (!animating) {
      rafId = null
      return
    }
    rafId = requestAnimationFrame(animate)
    rotY += 0.003
    globeGroup.rotation.y = rotY
    renderer.render(scene, camera)
  }
  animate()

  const obs = new IntersectionObserver(entries => {
    animating = entries[0].isIntersecting
    if (animating && rafId == null) animate()
  }, { threshold: 0.05 })
  obs.observe(globeDiv)

  globeDiv._globeCleanup = () => {
    animating = false
    if (rafId != null) cancelAnimationFrame(rafId)
    obs.disconnect()
    renderer.dispose()
  }
}
