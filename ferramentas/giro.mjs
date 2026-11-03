// Fotografa o giro parado em vários pontos, para conferir quadro a quadro, e o cabide de perto.
// node ferramentas/giro.mjs [url]
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { abrir, esperar } from './navegador.mjs'

const url = process.argv[2] || 'http://127.0.0.1:5310/'
const pasta = new URL('./shots/giro/', import.meta.url)
mkdirSync(pasta, { recursive: true })
const { browser, page, erros } = await abrir({ largura: 1440, altura: 900 })
await page.goto(url + '?teste', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.fase-pronto', { timeout: 60000 })
await page.evaluate(() => {
  const r = document.querySelector('.palco')
  window.scrollTo({ top: (r.offsetHeight - innerHeight) * 0.93, behavior: 'instant' })
})
await esperar(3200)
const rolou = await page.evaluate(() => scrollY)

// escolhe a camisa i e congela o giro em t
const congelar = (i, t) => page.evaluate((i, t) => {
  const s = window.__sala
  s.proximoPasseio = 1e9
  s.selecionar(i)
  const a = s.araras[s.secao]
  const c = a.camisas[i]
  c.t = t
  c.alvo = t
}, i, t)

for (const [nome, i] of [['tribal', 4], ['chama', 5], ['jogo', 8]]) {
  await congelar(i, 0.001)
  await esperar(1500)
  const onde = await page.evaluate((i) => {
    const s = window.__sala
    const a = s.araras[s.secao]
    const c = a.camisas[i]
    const v = c.grupo.position.clone()
    v.x = a.grupo.position.x + c.x
    v.y = 1.55
    v.project(s.camera)
    return { x: ((v.x + 1) / 2) * s.w, y: ((1 - v.y) / 2) * s.h }
  }, i)
  let n = 0
  for (const t of [0.02, 0.2, 0.32, 0.42, 0.5, 0.58, 0.68, 0.82, 1]) {
    await congelar(i, t)
    await esperar(1300)
    const x = Math.max(0, Math.min(1440 - 520, onde.x - 260))
    await page.screenshot({ path: fileURLToPath(new URL(`${nome}-${n++}.jpg`, pasta)), type: 'jpeg', quality: 86, clip: { x, y: 190 + rolou, width: 520, height: 510 } })
  }
  await page.screenshot({ path: fileURLToPath(new URL(`${nome}-gancho.jpg`, pasta)), type: 'jpeg', quality: 90, clip: { x: Math.max(0, onde.x - 170), y: 195 + rolou, width: 340, height: 170 } })
}
await page.screenshot({ path: fileURLToPath(new URL('arara.jpg', pasta)), type: 'jpeg', quality: 88 })

// tela da peça: gira sozinha de leve e com o arraste
await page.evaluate(() => window.__sala.cb.abrir(2))
await esperar(3000)
await page.screenshot({ path: fileURLToPath(new URL('peca-a.jpg', pasta)), type: 'jpeg', quality: 88 })
await page.mouse.move(420, 520)
await page.mouse.down()
await page.mouse.move(420 + 70, 520, { steps: 10 })
await esperar(500)
await page.screenshot({ path: fileURLToPath(new URL('peca-b.jpg', pasta)), type: 'jpeg', quality: 88 })
await page.mouse.move(420 + 150, 520, { steps: 10 })
await esperar(500)
await page.screenshot({ path: fileURLToPath(new URL('peca-c.jpg', pasta)), type: 'jpeg', quality: 88 })
await page.mouse.move(420 - 120, 520, { steps: 16 })
await esperar(500)
await page.screenshot({ path: fileURLToPath(new URL('peca-d.jpg', pasta)), type: 'jpeg', quality: 88 })
await page.mouse.up()
console.log(erros.length ? erros.join('\n') : 'sem erros no console')
await browser.close()
