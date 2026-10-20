// 연운 딜 계산기: BiS 조율표 이미지(머리글 1줄 + 조율 5줄, 부위 8칸)의 칸 경계를 찾아요.
// 표는 어두운 실선으로 칸이 나뉘어 있어서, 가로로 길게 이어진 선과 그 사이의 세로선을 세어요.

export type RawImage = { width: number; height: number; pixels: Uint8ClampedArray }
export type TableGrid = { rows: number[]; columns: number[] }
export type CellBox = { left: number; top: number; width: number; height: number }

export const bisTableRowCount = 6
export const bisTableColumnCount = 8

const darkLimit = 110

function luminance(pixels: Uint8ClampedArray, offset: number) {
  return 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]
}

function isDark(image: RawImage, x: number, y: number) {
  return luminance(image.pixels, (y * image.width + x) * 4) < darkLimit
}

// 가는 선만 남기고, 붉은 띠처럼 두꺼운 덩어리는 버려요.
function groupThinLines(flags: boolean[], maxThickness: number) {
  const lines: number[] = []
  let start = -1
  for (let index = 0; index <= flags.length; index++) {
    if (index < flags.length && flags[index]) {
      if (start < 0) start = index
      continue
    }
    if (start >= 0 && index - start <= maxThickness) lines.push((start + index - 1) / 2)
    start = -1
  }
  return lines
}

function longestDarkRun(image: RawImage, y: number) {
  let best = 0
  let current = 0
  for (let x = 0; x < image.width; x++) {
    // 글씨 안티에일리어싱이나 JPEG 번짐으로 선이 한두 칸 끊겨도 이어서 세요.
    if (isDark(image, x, y) || (x + 1 < image.width && isDark(image, x + 1, y) && current > 0)) current++
    else current = 0
    if (current > best) best = current
  }
  return best
}

function horizontalLines(image: RawImage) {
  const minimum = image.width * 0.45
  const flags = Array.from({ length: image.height }, (_, y) => longestDarkRun(image, y) >= minimum)
  return groupThinLines(flags, Math.max(6, Math.round(image.height / 200)))
}

function verticalLines(image: RawImage, top: number, bottom: number) {
  const from = Math.ceil(top) + 2
  const to = Math.floor(bottom) - 2
  const span = Math.max(1, to - from + 1)
  const flags = Array.from({ length: image.width }, (_, x) => {
    let dark = 0
    for (let y = from; y <= to; y++) if (isDark(image, x, y)) dark++
    return dark / span >= 0.7
  })
  return groupThinLines(flags, Math.max(6, Math.round(image.width / 200)))
}

// 간격이 고른 가로선 7개(행 6개)를 한 표로 봐요. 한 이미지에 표가 여러 개면 모두 돌려줘요.
export function findTableGrids(image: RawImage): TableGrid[] {
  const lines = horizontalLines(image)
  const grids: TableGrid[] = []
  let index = 0
  while (index + bisTableRowCount < lines.length) {
    const candidate = lines.slice(index, index + bisTableRowCount + 1)
    const gaps = candidate.slice(1).map((line, gapIndex) => line - candidate[gapIndex])
    const typical = [...gaps].sort((left, right) => left - right)[Math.floor(gaps.length / 2)]
    const even = typical >= 12 && gaps.every(gap => gap >= typical * 0.7 && gap <= typical * 1.4)
    if (!even) {
      index++
      continue
    }
    const columns = verticalLines(image, candidate[0], candidate[candidate.length - 1])
    const grid = pickColumns(columns)
    if (!grid) {
      index++
      continue
    }
    grids.push({ rows: candidate, columns: grid })
    index += bisTableRowCount + 1
  }
  return grids
}

// 세로선이 9개보다 많이 잡히면(바깥 장식선 등) 간격이 가장 고른 9개 연속 묶음을 골라요.
function pickColumns(lines: number[]) {
  let best: number[] | undefined
  let bestSpread = Infinity
  for (let start = 0; start + bisTableColumnCount < lines.length; start++) {
    const candidate = lines.slice(start, start + bisTableColumnCount + 1)
    const gaps = candidate.slice(1).map((line, gapIndex) => line - candidate[gapIndex])
    const smallest = Math.min(...gaps)
    const largest = Math.max(...gaps)
    if (smallest < 12 || largest > smallest * 1.4) continue
    const spread = largest / smallest
    if (spread < bestSpread) {
      best = candidate
      bestSpread = spread
    }
  }
  return best
}

export function cellBox(grid: TableGrid, row: number, column: number, inset = 3): CellBox {
  const left = Math.round(grid.columns[column] + inset)
  const top = Math.round(grid.rows[row] + inset)
  const right = Math.round(grid.columns[column + 1] - inset)
  const bottom = Math.round(grid.rows[row + 1] - inset)
  return { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) }
}
