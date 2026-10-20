import { writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

/**
 * Derives the site's icons from `logo.png` into `public/`.
 *
 * The emblem is gold line art on a transparent ground, which is the worst case for a favicon: on a
 * light browser tab the pale highlight measures 1.12:1 against the tab and is simply not there. No
 * browser recolours an icon to compensate, so the contrast has to be built in. A constant plate in
 * the application's own surface colour puts every tone of the artwork between 5.7:1 and 14.9:1, and
 * because that plate is the same value a dark tab uses, it disappears there rather than framing
 * the emblem. The plate is therefore drawn as geometry wherever the format allows, and only the
 * emblem is rasterised.
 *
 * The embeds are palette-quantised: the artwork spans a narrow range of golds, and quantising takes
 * a 256px emblem from 30KB to 11KB with no visible difference at the sizes an icon is drawn at.
 *
 * Run `node script/logo/preview.mjs` afterwards to see the result at each size and on each surface.
 */
const here = fileURLToPath(new URL(".", import.meta.url))
const source = `${here}logo.png`
const out = `${here}../../public`

/** Kept in step with the `theme-color` in index.html, which is what makes the plate disappear. */
const plate = "#11131a"
/**
 * Fraction of the icon the emblem fills, once its own margin is cropped away.
 *
 * The drawing sits inside a wide, even margin in the source, so cropping is most of the size; what
 * is left is only enough that the outermost stroke does not sit on the plate's edge.
 */
const inset = 0.95
/** Small enough that no surface draws an icon larger, and small enough to stay a few kilobytes. */
const vectorSize = 128

const quantise = { palette: true, colours: 256, compressionLevel: 9, effort: 10 }

/**
 * The drawing cropped to the ink, as a square so the emblem stays centred.
 *
 * Cropping is done here rather than in the source file so the master keeps whatever margin it was
 * drawn with. The bounds come from the alpha channel, because a transparent image has no luminance
 * to trim on and a luminance-based trim reports the whole canvas as content.
 */
const cropped = await (async () => {
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const alpha = info.channels - 1
  let minX = info.width
  let minY = info.height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * info.channels + alpha] < 8) continue
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }
  const side = Math.max(maxX - minX + 1, maxY - minY + 1)
  const left = minX + Math.floor((maxX - minX + 1 - side) / 2)
  const top = minY + Math.floor((maxY - minY + 1 - side) / 2)
  console.log(
    `logo.png: ink spans ${maxX - minX + 1}x${maxY - minY + 1} of ${info.width}x${info.height}, cropping to ${side}px`,
  )
  return { left, top, side }
})()

/** The emblem alone, scaled to sit inside the icon's margin. */
const emblem = size =>
  sharp(source)
    .extract({ left: cropped.left, top: cropped.top, width: cropped.side, height: cropped.side })
    .resize(Math.round(size * inset), Math.round(size * inset), {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png(quantise)
    .toBuffer()

/** The emblem centred on a full-size plate. The plate is the contrast, so it has to be the icon. */
const plated = async (size, { background }) => {
  const inner = Math.round(size * inset)
  const offset = Math.round((size - inner) / 2)
  const canvas = await sharp({ create: { width: size, height: size, channels: 4, background } })
    .png()
    .toBuffer()
  return sharp(canvas)
    .composite([{ input: await emblem(size), left: offset, top: offset }])
    .png(quantise)
    .toBuffer()
}

/** A solid silhouette, for the surfaces that paint a mask with their own text colour. */
const silhouette = async size => {
  const inner = Math.round(size * inset)
  const { data, info } = await sharp(source)
    .extract({ left: cropped.left, top: cropped.top, width: cropped.side, height: cropped.side })
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const ink = new Uint8Array(data.length)
  for (let index = 0; index < data.length; index += info.channels) {
    ink[index] = 0
    ink[index + 1] = 0
    ink[index + 2] = 0
    ink[index + 3] = data[index + info.channels - 1]
  }
  const mask = await sharp(ink, { raw: { width: inner, height: inner, channels: info.channels } })
    .png(quantise)
    .toBuffer()
  const offset = Math.round((size - inner) / 2)
  const canvas = await sharp({
    create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .png()
    .toBuffer()
  return sharp(canvas)
    .composite([{ input: mask, left: offset, top: offset }])
    .png()
    .toBuffer()
}

/**
 * An icon container holding PNG images, which is what a browser reading `/favicon.ico` gets.
 *
 * Each entry declares a size the embedded image must actually be: a directory entry that disagrees
 * with its own image is how a container ends up drawing a 13px icon into a 16px slot.
 */
const container = images => {
  const directory = Buffer.alloc(6)
  directory.writeUInt16LE(0, 0)
  directory.writeUInt16LE(1, 2)
  directory.writeUInt16LE(images.length, 4)
  const entries = []
  let offset = 6 + images.length * 16
  for (const { size, png } of images) {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size, 0)
    entry.writeUInt8(size, 1)
    entry.writeUInt16LE(1, 4)
    entry.writeUInt16LE(32, 6)
    entry.writeUInt32LE(png.length, 8)
    entry.writeUInt32LE(offset, 12)
    entries.push(entry)
    offset += png.length
  }
  return Buffer.concat([directory, ...entries, ...images.map(image => image.png)])
}

const embedded = await emblem(vectorSize)
const margin = ((1 - inset) / 2) * vectorSize
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vectorSize} ${vectorSize}" role="img" aria-label="Where Builds Meet">
  <title>Where Builds Meet</title>
  <rect width="${vectorSize}" height="${vectorSize}" fill="${plate}" />
  <image href="data:image/png;base64,${embedded.toString("base64")}" x="${margin}" y="${margin}" width="${
    vectorSize - margin * 2
  }" height="${vectorSize - margin * 2}" />
</svg>
`

const written = [
  [
    "favicon.ico",
    container(
      await Promise.all([16, 32, 48].map(async size => ({ size, png: await plated(size, { background: plate }) }))),
    ),
  ],
  ["favicon.svg", Buffer.from(svg)],
  // The home screen draws this one, masks it itself, and supplies no background of its own.
  ["apple-touch-icon.png", await plated(180, { background: plate })],
  ["mask-icon.png", await silhouette(256)],
]

await Promise.all(
  written.map(async ([name, bytes]) => {
    await writeFile(`${out}/${name}`, bytes)
    console.log(`public/${name}: ${(bytes.length / 1024).toFixed(1)}KB`)
  }),
)
