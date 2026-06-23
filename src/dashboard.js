// ========================================
// 末日抉择 · 幸存者数据可视化大屏
// 文件：src/dashboard.js
// 说明：本文件包含数据可视化大屏的完整实现
// 依赖：ECharts, ECharts-GL, Three.js, Chart.js
// 数据来源：Supabase players 表 + choices 表
// ========================================

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
