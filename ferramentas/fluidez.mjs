// Mede quanto tempo cada quadro leva na viagem pela loja: entrada com a roda do mouse, botão, troca de camisa e tela da peça.
// node ferramentas/fluidez.mjs [url] [--movel]
import { abrir, esperar } from './navegador.mjs'

const args = process.argv.slice(2)
const url = args.find((a) => !a.startsWith('--')) || 'http://127.0.0.1:5311/'
const movel = args.includes('--movel')
const { browser, page, erros } = await abrir(movel ? { largura: 390, altura: 844, movel: true, escala: 2 } : { largura: 1440, altura: 900 })
await page.goto(url + '?teste', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.fase-pronto', { timeout: 60000 })

const iniciar = () => page.evaluate(() => {
  window.__q = []
  let a = performance.now()
  const f = (t) => {
    window.__q.push(t - a)
    a = t
    window.__id = requestAnimationFrame(f)
  }
  window.__id = requestAnimationFrame(f)
})
const parar = async (nome) => {
  const q = await page.evaluate(() => {
    cancelAnimationFrame(window.__id)
    return window.__q.slice(1)
  })
  const o = [...q].sort((x, y) => x - y)
  const pct = (v) => o[Math.floor(o.length * v)]?.toFixed(1)
  console.log(`${nome.padEnd(22)} ${String(q.length).padStart(4)} quadros  mediana ${pct(0.5)} ms  p95 ${pct(0.95)} ms  pior ${o[o.length - 1]?.toFixed(1)} ms  acima de 25 ms: ${q.filter((v) => v > 25).length}`)
}

await iniciar()
await esperar(4500)
await parar('abertura montando')

if (!movel) {
  await page.mouse.move(720, 450)
  await iniciar()
  for (let i = 0; i < 34; i++) {
    await page.mouse.wheel({ deltaY: 120 })
    await esperar(140)
  }
  await esperar(1500)
  await parar('entrada na roda')
  console.log('progresso:', await page.evaluate(() => +window.__sala.p.toFixed(3)))

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await esperar(1800)
  await iniciar()
  const t0 = Date.now()
  await page.click('.heroi__entrar')
  await page.waitForFunction(() => window.__sala.ativa, { timeout: 15000 })
  console.log(`botão até a arara: ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  await esperar(1500)
  await parar('entrada no botão')

  await iniciar()
  for (const x of [200, 420, 640, 860, 1080, 1300, 700]) {
    await page.mouse.move(x, 450, { steps: 12 })
    await esperar(1100)
  }
  await parar('trocando de camisa')

  await iniciar()
  await page.mouse.click(700, 450)
  await esperar(2200)
  await page.keyboard.press('Escape')
  await esperar(2200)
  await parar('abre e fecha a peça')
} else {
  await iniciar()
  await page.evaluate(async () => {
    const fim = document.querySelector('.palco').offsetHeight - innerHeight
    for (let y = 0; y <= fim * 0.93; y += 14) {
      window.scrollTo({ top: y, behavior: 'instant' })
      await new Promise(requestAnimationFrame)
    }
  })
  await esperar(1500)
  await parar('entrada no celular')
}
console.log(erros.length ? erros.join('\n') : 'sem erros no console')
await browser.close()
