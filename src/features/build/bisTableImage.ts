// 연운 딜 계산기: 빌드의 조율·정음·심법을 아카라이브 BiS 조율표처럼 한 장의 이미지로 그려요.
// 위에는 유파 아이콘·빌드 이름·평균 DPS, 가운데에 정음과 심법, 아래에 부위 8칸 × 조율 5줄 표와 조율 개수를 적어요.
// 글꼴은 Noto Sans KR(OFL)을 한글 2,350자로 줄여 넣어 어느 기기에서나 같은 모양으로 나와요.

import notoSansKrUrl from "@/assets/fonts/NotoSansKR-ko.woff2?url"

import { isDivinePowerAffix } from "./BuildComparison"

export type BisImageColumn = { header: string; weapon?: boolean; lines: { key: string; label: string }[] }
export type BisImageInput = {
  title: string
  subtitle: string
  icon?: string
  columns: BisImageColumn[]
  attunements: string[]
  innerWays: { name: string; tier: number }[]
  summary: { label: string; count: number; divine?: boolean }[]
  dps?: string
  labels: {
    dps: string
    attunement: string
    innerWay: string
    tier: (tier: number) => string
    rows: string[]
    divine: string
    footer: string
  }
}

const width = 1280
const scale = 2
const margin = 56
const family = '"Noto Sans KR BiS", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif'
const colors = {
  paper: "#f4efe6",
  panel: "#fbf8f2",
  ink: "#211d19",
  muted: "#7a6f63",
  rule: "#ddd2c0",
  cell: "#fdf6e8",
  baseCell: "#f6ead2",
  divine: "#f6c5b3",
  divineInk: "#8a2a14",
  pip: "#d8ccb8",
}

let fontReady: Promise<void> | undefined
function loadFont() {
  fontReady ??= new FontFace("Noto Sans KR BiS", `url(${notoSansKrUrl})`, { weight: "100 900" })
    .load()
    .then(face => {
      document.fonts.add(face)
    })
    .catch(() => undefined)
  return fontReady
}

function loadIcon(url?: string) {
  if (!url) return Promise.resolve(undefined)
  return new Promise<HTMLImageElement | undefined>(resolve => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(undefined)
    image.src = url
  })
}

// 유파 아이콘 바탕색(초록·보라·적갈·남색)을 뽑아 제목줄과 표 머리에 써요.
function accentFromIcon(icon?: HTMLImageElement) {
  const fallback = "#8c2a1c"
  if (!icon) return fallback
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = 32
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return fallback
  context.drawImage(icon, 0, 0, 32, 32)
  const pixels = context.getImageData(0, 0, 32, 32).data
  let red = 0
  let green = 0
  let blue = 0
  let count = 0
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const [r, g, b, a] = [pixels[offset], pixels[offset + 1], pixels[offset + 2], pixels[offset + 3]]
    // 흰 그림은 빼고 바탕만 셉니다.
    if (a < 200 || r + g + b > 560) continue
    red += r
    green += g
    blue += b
    count++
  }
  if (!count) return fallback
  const shade = (value: number) => Math.round((value / count) * 0.84)
  return `rgb(${shade(red)}, ${shade(green)}, ${shade(blue)})`
}

const font = (weight: number, size: number) => `${weight} ${size}px ${family}`

// textBaseline "middle"은 글꼴의 em 상자 기준이라 한글이 살짝 위아래로 치우쳐요.
// 한글이 든 글은 같은 글꼴의 "한" 글자 잉크 높이로, 숫자·영문만 있는 글은 그 글자 잉크로 가운데를 잡아요.
function centerText(context: CanvasRenderingContext2D, text: string, x: number, centerY: number) {
  context.textBaseline = "alphabetic"
  const glyph = context.measureText(/[가-힣]/.test(text) ? "한" : text)
  context.fillText(text, x, centerY + (glyph.actualBoundingBoxAscent - glyph.actualBoundingBoxDescent) / 2)
}

function fitFont(context: CanvasRenderingContext2D, text: string, maxWidth: number, size: number, weight: number) {
  let current = size
  context.font = font(weight, current)
  while (current > 11 && context.measureText(text).width > maxWidth) {
    current -= 1
    context.font = font(weight, current)
  }
}

type Pill = { text: string; strong?: string; x: number; y: number; width: number; tone: "plain" | "divine" | "accent" }

// 알약 모양 칩을 줄 바꿈하며 늘어놓고, 차지하는 높이를 돌려줘요.
function layoutPills(
  context: CanvasRenderingContext2D,
  items: Omit<Pill, "x" | "y" | "width">[],
  left: number,
  top: number,
  maxWidth: number,
  height: number,
  extra = 0,
) {
  const pills: Pill[] = []
  let x = left
  let y = top
  for (const item of items) {
    context.font = font(item.tone === "plain" && extra ? 600 : 500, 17)
    let pillWidth = context.measureText(item.text).width + 32 + extra
    if (item.strong) {
      context.font = font(800, 17)
      pillWidth += context.measureText(item.strong).width + 8
    }
    if (x > left && x + pillWidth > left + maxWidth) {
      x = left
      y += height + 10
    }
    pills.push({ ...item, x, y, width: pillWidth })
    x += pillWidth + 10
  }
  return { pills, bottom: items.length ? y + height : top }
}

function drawPills(context: CanvasRenderingContext2D, pills: Pill[], height: number, accent: string) {
  for (const pill of pills) {
    context.beginPath()
    context.roundRect(pill.x, pill.y, pill.width, height, height / 2)
    context.fillStyle = pill.tone === "divine" ? colors.divine : pill.tone === "accent" ? accent : colors.panel
    context.fill()
    if (pill.tone === "plain") {
      context.strokeStyle = colors.rule
      context.lineWidth = 1.5
      context.stroke()
    }
    const ink = pill.tone === "accent" ? "#ffffff" : pill.tone === "divine" ? colors.divineInk : colors.ink
    context.fillStyle = ink
    context.textAlign = "left"
    context.font = font(500, 17)
    centerText(context, pill.text, pill.x + 16, pill.y + height / 2)
    if (pill.strong) {
      const textWidth = context.measureText(pill.text).width
      context.font = font(800, 17)
      centerText(context, pill.strong, pill.x + 16 + textWidth + 8, pill.y + height / 2)
    }
  }
}

export async function renderBisTableImage(input: BisImageInput) {
  const [, icon] = await Promise.all([loadFont(), loadIcon(input.icon)])
  const accent = accentFromIcon(icon)
  const { labels } = input
  const canvas = document.createElement("canvas")
  const context = canvas.getContext("2d")!

  // 높이를 먼저 잡아요: 정음 칩, 심법 카드, 표, 합계 칩 순서.
  const sectionLeft = margin + 92
  const sectionWidth = width - margin - sectionLeft
  const attunementTop = 176
  const attunementLayout = layoutPills(
    context,
    input.attunements.map(text => ({ text, tone: "plain" as const })),
    sectionLeft,
    attunementTop,
    sectionWidth,
    40,
    34,
  )
  const innerWayTop = attunementLayout.bottom + 22
  const innerWayHeight = input.innerWays.length ? 70 : 0
  const tableTop = innerWayTop + innerWayHeight + 34
  const labelWidth = 70
  const headerHeight = 54
  const rowHeight = 50
  const tableHeight = headerHeight + rowHeight * 5
  const summaryTop = tableTop + tableHeight + 26
  const summaryLayout = layoutPills(
    context,
    input.summary.map(item => ({
      text: item.label,
      strong: `×${item.count}`,
      tone: item.divine ? ("divine" as const) : ("plain" as const),
    })),
    margin,
    summaryTop,
    width - margin * 2,
    40,
  )
  const height = summaryLayout.bottom + 84

  canvas.width = width * scale
  canvas.height = height * scale
  context.scale(scale, scale)
  context.fillStyle = colors.paper
  context.fillRect(0, 0, width, height)
  context.fillStyle = accent
  context.fillRect(0, 0, width, 10)

  // 제목줄
  const iconSize = 88
  const titleLeft = icon ? margin + iconSize + 24 : margin
  if (icon) context.drawImage(icon, margin, 38, iconSize, iconSize)
  const dpsWidth = input.dps ? 300 : 0
  context.textAlign = "left"
  context.fillStyle = colors.ink
  fitFont(context, input.title, width - margin - titleLeft - dpsWidth, 40, 800)
  centerText(context, input.title, titleLeft, 70)
  context.fillStyle = colors.muted
  context.font = font(500, 19)
  centerText(context, input.subtitle, titleLeft, 110)
  if (input.dps) {
    context.textAlign = "right"
    context.fillStyle = colors.muted
    context.font = font(600, 15)
    centerText(context, labels.dps, width - margin, 56)
    context.fillStyle = accent
    context.font = font(900, 40)
    centerText(context, input.dps, width - margin, 96)
  }
  context.fillStyle = colors.rule
  context.fillRect(margin, 146, width - margin * 2, 2)

  // 정음
  const sectionLabel = (text: string, y: number) => {
    context.textAlign = "left"
    context.fillStyle = accent
    context.fillRect(margin, y - 11, 4, 22)
    context.fillStyle = colors.ink
    context.font = font(700, 17)
    centerText(context, text, margin + 14, y)
  }
  sectionLabel(labels.attunement, attunementTop + 20)
  attunementLayout.pills.forEach((pill, index) => {
    context.font = font(800, 15)
    const badge = String(index + 1)
    context.beginPath()
    context.roundRect(pill.x, pill.y, pill.width, 40, 20)
    context.fillStyle = colors.panel
    context.fill()
    context.strokeStyle = colors.rule
    context.lineWidth = 1.5
    context.stroke()
    context.beginPath()
    context.arc(pill.x + 20, pill.y + 20, 13, 0, Math.PI * 2)
    context.fillStyle = accent
    context.fill()
    context.fillStyle = "#ffffff"
    context.textAlign = "center"
    centerText(context, badge, pill.x + 20, pill.y + 20)
    context.textAlign = "left"
    context.fillStyle = colors.ink
    context.font = font(600, 17)
    centerText(context, pill.text, pill.x + 44, pill.y + 20)
  })

  // 심법: 카드마다 이름과 6칸 단계 표시
  if (input.innerWays.length) {
    sectionLabel(labels.innerWay, innerWayTop + innerWayHeight / 2)
    const gap = 12
    const cardWidth = (sectionWidth - gap * 3) / 4
    input.innerWays.slice(0, 4).forEach((innerWay, index) => {
      const x = sectionLeft + index * (cardWidth + gap)
      context.beginPath()
      context.roundRect(x, innerWayTop, cardWidth, innerWayHeight, 12)
      context.fillStyle = colors.panel
      context.fill()
      context.strokeStyle = colors.rule
      context.lineWidth = 1.5
      context.stroke()
      context.textAlign = "left"
      context.fillStyle = colors.ink
      fitFont(context, innerWay.name, cardWidth - 32, 18, 700)
      centerText(context, innerWay.name, x + 16, innerWayTop + 24)
      for (let pip = 0; pip < 6; pip++) {
        context.beginPath()
        context.roundRect(x + 16 + pip * 20, innerWayTop + 44, 15, 10, 3)
        context.fillStyle = pip < innerWay.tier ? accent : colors.pip
        context.fill()
      }
      context.textAlign = "right"
      context.fillStyle = accent
      context.font = font(800, 16)
      centerText(context, labels.tier(innerWay.tier), x + cardWidth - 16, innerWayTop + 49)
    })
  }

  // 조율표
  const tableLeft = margin
  const tableWidth = width - margin * 2
  const columnWidth = (tableWidth - labelWidth) / input.columns.length
  context.save()
  context.beginPath()
  context.roundRect(tableLeft, tableTop, tableWidth, tableHeight, 14)
  context.clip()
  context.fillStyle = colors.cell
  context.fillRect(tableLeft, tableTop, tableWidth, tableHeight)
  context.fillStyle = accent
  context.fillRect(tableLeft, tableTop, tableWidth, headerHeight)
  context.fillStyle = colors.baseCell
  context.fillRect(tableLeft, tableTop + headerHeight, tableWidth, rowHeight)
  input.columns.forEach((column, columnIndex) => {
    const x = tableLeft + labelWidth + columnIndex * columnWidth
    column.lines.slice(0, 5).forEach((line, row) => {
      if (!isDivinePowerAffix(line.key)) return
      context.fillStyle = colors.divine
      context.fillRect(x, tableTop + headerHeight + row * rowHeight, columnWidth, rowHeight)
    })
  })
  context.restore()

  // 칸 사이 선
  context.strokeStyle = colors.rule
  context.lineWidth = 1.5
  for (let row = 1; row < 5; row++) {
    const y = tableTop + headerHeight + row * rowHeight
    context.beginPath()
    context.moveTo(tableLeft, y)
    context.lineTo(tableLeft + tableWidth, y)
    context.stroke()
  }
  for (let column = 0; column < input.columns.length; column++) {
    const x = tableLeft + labelWidth + column * columnWidth
    context.beginPath()
    context.moveTo(x, tableTop + headerHeight)
    context.lineTo(x, tableTop + tableHeight)
    context.stroke()
  }
  // 무기 두 칸과 장신구·방어구 사이는 굵게
  context.strokeStyle = colors.muted
  context.lineWidth = 2
  const weaponCount = input.columns.filter(column => column.weapon).length
  if (weaponCount > 0 && weaponCount < input.columns.length) {
    const x = tableLeft + labelWidth + weaponCount * columnWidth
    context.beginPath()
    context.moveTo(x, tableTop + headerHeight)
    context.lineTo(x, tableTop + tableHeight)
    context.stroke()
  }
  context.beginPath()
  context.roundRect(tableLeft, tableTop, tableWidth, tableHeight, 14)
  context.strokeStyle = accent
  context.lineWidth = 2
  context.stroke()

  context.textAlign = "center"
  input.columns.forEach((column, columnIndex) => {
    const x = tableLeft + labelWidth + columnIndex * columnWidth
    context.fillStyle = "#ffffff"
    fitFont(context, column.header, columnWidth - 14, 19, 700)
    centerText(context, column.header, x + columnWidth / 2, tableTop + headerHeight / 2)
    column.lines.slice(0, 5).forEach((line, row) => {
      const y = tableTop + headerHeight + row * rowHeight + rowHeight / 2 + 1
      const divine = isDivinePowerAffix(line.key)
      context.fillStyle = divine ? colors.divineInk : colors.ink
      fitFont(context, line.label, columnWidth - 14, 18, divine || row === 0 ? 700 : 500)
      centerText(context, line.label, x + columnWidth / 2, y)
    })
  })
  labels.rows.slice(0, 5).forEach((label, row) => {
    context.fillStyle = colors.muted
    context.font = font(600, 14)
    centerText(context, label, tableLeft + labelWidth / 2, tableTop + headerHeight + row * rowHeight + rowHeight / 2)
  })

  // 합계
  drawPills(context, summaryLayout.pills, 40, accent)

  // 바닥글
  const footerY = height - 38
  context.textAlign = "left"
  context.fillStyle = colors.muted
  context.font = font(500, 14)
  centerText(context, labels.footer, margin, footerY)
  context.textAlign = "right"
  context.font = font(600, 14)
  const legendWidth = context.measureText(labels.divine).width
  centerText(context, labels.divine, width - margin, footerY)
  context.beginPath()
  context.roundRect(width - margin - legendWidth - 26, footerY - 8, 18, 16, 4)
  context.fillStyle = colors.divine
  context.fill()
  return canvas
}
