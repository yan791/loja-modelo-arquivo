// Transforma o nome da marca em contornos para o logo cromado do 3D (site/public/logo.json).
// Assim o site não precisa carregar a fonte inteira só para desenhar uma palavra.
// node ferramentas/gerar-logo.mjs [palavra]
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import opentype from 'opentype.js'

const palavra = process.argv[2] || 'arquivo'
const arq = fileURLToPath(new URL('./node_modules/@fontsource/hanken-grotesk/files/hanken-grotesk-latin-300-normal.woff', import.meta.url))
const b = readFileSync(arq)
const fonte = opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength))
const caminho = fonte.getPath(palavra, 0, 0, 1, { kerning: true, letterSpacing: -0.012 })
const n = (v) => +v.toFixed(4)
const marca = fonte.getPath('®', caminho.getBoundingBox().x2 + 0.02, -0.22, 0.72)
const cmds = [...caminho.commands, ...marca.commands].map((c) => {
  if (c.type === 'M' || c.type === 'L') return [c.type, n(c.x), n(-c.y)]
  if (c.type === 'Q') return ['Q', n(c.x1), n(-c.y1), n(c.x), n(-c.y)]
  if (c.type === 'C') return ['C', n(c.x1), n(-c.y1), n(c.x2), n(-c.y2), n(c.x), n(-c.y)]
  return ['Z']
})
const bb = caminho.getBoundingBox()
const bm = marca.getBoundingBox()
const saida = { palavra, comandos: cmds, x0: n(bb.x1), x1: n(bm.x2), y0: n(-bb.y2), y1: n(-bb.y1) }
writeFileSync(new URL('../site/public/logo.json', import.meta.url), JSON.stringify(saida))
console.log(palavra, 'largura', n(bb.x2 - bb.x1), 'altura', n(bb.y2 - bb.y1), 'comandos', cmds.length)
