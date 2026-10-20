// 연운 딜 계산기: 브라우저에서 BiS 조율표 이미지를 한국어 OCR로 읽어요.
// 표 칸을 먼저 찾아서 칸마다 한 줄씩 읽고, 표 위쪽(정음 설명이 있는 곳)은 통째로 읽어요.

import {
  bisTableColumnCount,
  bisTableRowCount,
  cellBox,
  findTableGrids,
  type CellBox,
  type RawImage,
} from "./bisTableGrid"
import type { BisImageReading } from "./bisTableImport"

export class BisTableNotFoundError extends Error {}

async function loadImage(file: File) {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("Could not read image colors.")
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  const image: RawImage = {
    width: canvas.width,
    height: canvas.height,
    pixels: context.getImageData(0, 0, canvas.width, canvas.height).data,
  }
  return { canvas, image }
}

// 칸을 잘라 두 배로 키우고 흑백으로 바꾼 뒤 대비를 늘려요. 주황·노랑 바탕에서도 글자만 남아요.
function preparedCrop(source: HTMLCanvasElement, box: CellBox, scale: number) {
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(box.width * scale))
  canvas.height = Math.max(1, Math.round(box.height * scale))
  const context = canvas.getContext("2d", { willReadFrequently: true })!
  context.imageSmoothingQuality = "high"
  context.drawImage(source, box.left, box.top, box.width, box.height, 0, 0, canvas.width, canvas.height)
  const data = context.getImageData(0, 0, canvas.width, canvas.height)
  const pixels = data.data
  let low = 255
  let high = 0
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const gray = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2]
    pixels[offset] = gray
    if (gray < low) low = gray
    if (gray > high) high = gray
  }
  const range = Math.max(1, high - low)
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const value = ((pixels[offset] - low) / range) * 255
    pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = value
  }
  context.putImageData(data, 0, 0)
  return canvas
}

const cleanCell = (text: string) => text.replace(/\s+/g, "").trim()

export async function readBisTableImage(file: File, onProgress?: (done: number, total: number) => void) {
  if (!file.type.startsWith("image/")) throw new Error("Choose a PNG, JPEG, or WebP image file.")
  const { canvas, image } = await loadImage(file)
  const grids = findTableGrids(image)
  if (!grids.length) throw new BisTableNotFoundError()
  const { createWorker, OEM, PSM } = await import("tesseract.js")
  const assetRoot = new URL(`${import.meta.env.BASE_URL}ocr`, document.baseURI).href
  const worker = await createWorker("kor", OEM.LSTM_ONLY, {
    // 한국어 학습 데이터는 .wasm 이름으로 둬요. 일부 호스팅(아티팩트 미리보기 등)은 .gz를 내주지 않아서,
    // tesseract가 붙이는 "/kor.traineddata.gz"를 쿼리로 흘려보내고 실제 파일을 받아요. 내용이 gzip이면 알아서 풀어요.
    langPath: `${assetRoot}/kor-traineddata-gz.wasm?file=`,
    workerPath: `${assetRoot}/worker.min.js`,
    corePath: `${assetRoot}/tesseract-core-lstm.wasm.js`,
  })
  const total = grids.length * (bisTableRowCount * bisTableColumnCount + 1) + 1
  let done = 0
  const step = () => onProgress?.(++done, total)
  try {
    // 표 위쪽: 정음1·정음2 같은 설명. 여러 줄이라 자동 배치로 읽어요.
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
    const headerHeight = Math.max(1, Math.round(grids[0].rows[0]))
    const header = await worker.recognize(
      preparedCrop(canvas, { left: 0, top: 0, width: image.width, height: headerHeight }, 1),
    )
    step()
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE })
    // 작업자는 요청을 차례로 처리하니, 칸마다 요청을 한꺼번에 넣고 결과를 모아요.
    const read = (box: CellBox, scale: number) =>
      worker.recognize(preparedCrop(canvas, box, scale)).then(result => {
        step()
        return cleanCell(result.data.text)
      })
    const tables: BisImageReading["tables"] = await Promise.all(
      grids.map(async grid => {
        const rowHeight = grid.rows[1] - grid.rows[0]
        const labelTop = Math.max(0, Math.round(grid.rows[0] - rowHeight * 1.4))
        const label = read(
          {
            left: Math.round(grid.columns[0]),
            top: labelTop,
            width: Math.max(1, Math.round((grid.columns[grid.columns.length - 1] - grid.columns[0]) / 2)),
            height: Math.max(1, Math.round(grid.rows[0] - labelTop - 2)),
          },
          2,
        )
        const cells = Promise.all(
          Array.from({ length: bisTableRowCount }, (_, row) =>
            Promise.all(
              Array.from({ length: bisTableColumnCount }, (_, column) => read(cellBox(grid, row, column, 4), 2)),
            ),
          ),
        )
        return { label: await label, cells: await cells }
      }),
    )
    return { tables, headerText: header.data.text } satisfies BisImageReading
  } finally {
    await worker.terminate()
  }
}
