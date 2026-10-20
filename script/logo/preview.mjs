import { execFile } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import sharp from "sharp"

/**
 * Draws the generated icons the way a browser would, so a change to `logo.png` can be looked at
 * rather than assumed: the vector icon at each size a surface actually draws it, on a light tab and
 * a dark one, alongside the raster icon the home screen uses and the silhouette a pinned tab paints.
 *
 * The plate is the whole point of the icon, so seeing it on both surfaces is the check that matters
 * — on a light tab it has to carry the emblem, and on a dark one it has to disappear.
 */
const run = promisify(execFile)
const here = fileURLToPath(new URL(".", import.meta.url))
const publicDir = `${here}../../public`

const surfaces = [
  { name: "on a light tab", background: { r: 241, g: 243, b: 244, alpha: 1 }, ink: "#333" },
  { name: "on a dark tab", background: { r: 32, g: 33, b: 36, alpha: 1 }, ink: "#ddd" },
]
const sizes = [16, 32, 48, 180]
const cell = 180
const gap = 16
const caption = 26

const workspace = await mkdtemp(`${tmpdir()}/icon-preview-`)
try {
  // The vector icon is rendered by an external renderer rather than by the library, so that what is
  // checked is the file a browser would parse, not a re-encode of it.
  const rendered = await Promise.all(
    sizes.map(async size => {
      const file = `${workspace}/vector-${size}.png`
      await run("rsvg-convert", ["-w", String(size), "-h", String(size), `${publicDir}/favicon.svg`, "-o", file])
      return file
    }),
  )

  const band = caption + gap + cell + gap
  const width = sizes.length * (cell + gap) + gap
  const height = surfaces.length * band + band
  const layers = []
  const labels = []

  /** One captioned band: a name above it, and the given icons drawn at their own size within it. */
  const bandWith = async (top, name, ink, background, files) => {
    layers.push({
      input: { create: { width, height: cell + gap, channels: 4, background } },
      left: 0,
      top: top + caption,
    })
    labels.push(label(gap, top + 16, name, ink))
    const drawn = await Promise.all(
      files.map(async file => {
        const meta = await sharp(file).metadata()
        return {
          width: meta.width,
          png: await sharp(file).resize(meta.width, meta.width, { kernel: "lanczos3" }).png().toBuffer(),
        }
      }),
    )
    let left = gap
    for (const image of drawn) {
      layers.push({ input: image.png, left, top: top + caption + gap })
      left += cell + gap
    }
  }

  await Promise.all(
    surfaces.map((surface, index) =>
      bandWith(index * band, `favicon.svg, ${surface.name}`, surface.ink, surface.background, rendered),
    ),
  )

  const last = surfaces.length * band
  await bandWith(
    last,
    "apple-touch-icon.png, then mask-icon.png as a pinned tab paints it",
    "#333",
    { r: 241, g: 243, b: 244, alpha: 1 },
    [`${publicDir}/apple-touch-icon.png`, `${publicDir}/mask-icon.png`],
  )

  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels.join("")}</svg>`
  const canvas = await sharp({
    create: { width, height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  })
    .png()
    .toBuffer()
  // Written outside the workspace so the printed path survives the cleanup below, which removes
  // only the intermediates.
  const output = process.argv[2] ?? `${tmpdir()}/icon-preview.png`
  await sharp(canvas)
    .composite([...layers, { input: Buffer.from(sheet), left: 0, top: 0 }])
    .png()
    .toFile(output)
  console.log(output)
} finally {
  await rm(workspace, { recursive: true, force: true })
}

function label(x, y, text, fill) {
  return `<text x="${x}" y="${y}" font-family="monospace" font-size="15" fill="${fill}">${text}</text>`
}
