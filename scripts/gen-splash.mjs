/**
 * Gera splash screens para iOS PWA
 * Logo AVOS (white) centralizado em fundo navy #0C2240
 * Execute: node scripts/gen-splash.mjs
 */
import sharp from 'sharp'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

// Todos os tamanhos necessários para iOS (portrait, pixels reais)
const devices = [
  { name: 'iphone-se',              w: 750,  h: 1334 },
  { name: 'iphone-13-mini',         w: 1080, h: 2340 },
  { name: 'iphone-14',              w: 1179, h: 2556 },
  { name: 'iphone-14-plus',         w: 1290, h: 2796 },
  { name: 'iphone-14-pro',          w: 1179, h: 2556 },
  { name: 'iphone-14-pro-max',      w: 1290, h: 2868 },
  { name: 'iphone-15',              w: 1179, h: 2556 },
  { name: 'iphone-15-plus',         w: 1290, h: 2796 },
  { name: 'iphone-15-pro',          w: 1179, h: 2556 },
  { name: 'iphone-15-pro-max',      w: 1290, h: 2868 },
  { name: 'iphone-16',              w: 1179, h: 2556 },
  { name: 'iphone-16-plus',         w: 1290, h: 2796 },
  { name: 'iphone-16-pro',          w: 1206, h: 2622 },
  { name: 'iphone-16-pro-max',      w: 1320, h: 2868 },
  { name: 'ipad-pro-11',            w: 1668, h: 2388 },
  { name: 'ipad-pro-12',            w: 2048, h: 2732 },
]

// Logo AVOS em SVG — centralizado sem fundo (transparente)
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <polygon points="256,107 304,107 432,405 384,405 256,165" fill="white"/>
  <polygon points="208,107 256,107 256,165 222,256 173,256" fill="white"/>
  <polygon points="173,256 323,256 310,293 160,293" fill="white"/>
  <polygon points="147,314 101,405 149,405 196,314" fill="white"/>
</svg>`

const BG = { r: 12, g: 34, b: 64, alpha: 1 } // #0C2240

for (const device of devices) {
  const { name, w, h } = device

  // Logo ocupa ~25% da menor dimensão, centralizado
  const logoSize = Math.round(Math.min(w, h) * 0.25)
  const logoLeft = Math.round((w - logoSize) / 2)
  const logoTop  = Math.round((h - logoSize) / 2)

  const logoBuffer = await sharp(Buffer.from(logoSvg))
    .resize(logoSize, logoSize)
    .png()
    .toBuffer()

  const outPath = join(root, 'public', 'splash', `${name}.png`)

  await sharp({
    create: { width: w, height: h, channels: 4, background: BG },
  })
    .composite([{ input: logoBuffer, left: logoLeft, top: logoTop }])
    .png({ compressionLevel: 9 })
    .toFile(outPath)

  console.log(`✓ ${name}.png  (${w}×${h})`)
}

console.log('\nDone — splash screens in public/splash/')
