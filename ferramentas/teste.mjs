// Percorre a loja no Chrome sem janela e tira fotos de cada etapa (o painel do app pausa animações quando escondido).
// node ferramentas/teste.mjs [url] [--movel] [--largura=1440 --altura=900] [--pasta=desktop]
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { abrir, esperar } from './navegador.mjs'

const args = process.argv.slice(2)
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, v] = a.slice(2).split('='); return [k, v ?? true] }))
const url = args.find((a) => !a.startsWith('--')) || 'http://127.0.0.1:5310/'
const movel = !!opt.movel
const largura = +(opt.largura || (movel ? 390 : 1440))
const altura = +(opt.altura || (movel ? 844 : 900))
const pasta = new URL(`./shots/${opt.pasta || (movel ? 'movel' : 'desktop')}/`, import.meta.url)
mkdirSync(pasta, { recursive: true })

const { browser, page, erros } = await abrir({ largura, altura, movel, escala: movel ? 2 : 1 })
const foto = async (nome) => {
  await page.screenshot({ path: fileURLToPath(new URL(`${nome}.jpg`, pasta)), type: 'jpeg', quality: 86 })
  console.log('foto', nome)
}
// leva a página até uma fração da entrada e espera a câmera chegar
const rolar = async (p, espera = 1500) => {
  await page.evaluate((p) => {
    const r = document.querySelector('.palco')
    window.scrollTo({ top: (r.offsetHeight - innerHeight) * p, behavior: 'instant' })
  }, p)
  await esperar(espera)
}

const t0 = Date.now()
await page.goto(url + '?teste', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.fase-pronto', { timeout: 60000 })
console.log(`pronto em ${((Date.now() - t0) / 1000).toFixed(1)} s`)
await esperar(700)
await foto('00-montando')
await esperar(5000)
await foto('01-abertura')
await rolar(0.14)
await foto('02-saindo')
await rolar(0.3, 2200)
await foto('03-entrada')
await rolar(0.5, 2200)
await foto('04-aproxima')
await rolar(0.7, 2200)
await foto('05-perto')
await rolar(0.93, 3600)
await foto('06-arara')

const onde = (i) => page.evaluate((i) => {
  const s = window.__sala
  const a = s.araras[s.secao]
  const c = a.camisas[i]
  const v = c.grupo.position.clone()
  v.x = a.grupo.position.x + c.x
  v.y = 1.4
  v.project(s.camera)
  return { x: ((v.x + 1) / 2) * s.w, y: ((1 - v.y) / 2) * s.h }
}, i)

if (!movel) {
  let p = await onde(0)
  await page.mouse.move(p.x, p.y, { steps: 6 })
  for (const [n, ms] of [['a', 200], ['b', 120], ['c', 120], ['d', 180], ['e', 800]]) {
    await esperar(ms)
    await foto(`07-giro-${n}`)
  }
  p = await onde(8)
  await page.mouse.move(p.x, p.y, { steps: 6 })
  await esperar(1800)
  await foto('08-outra')
  await page.mouse.click(p.x, p.y)
} else {
  // desliza para a próxima camisa
  const c = await page.$('canvas.cena')
  const cdp = await page.createCDPSession()
  const ponto = (x, y) => [{ x, y }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: ponto(300, 420) })
  for (let x = 300; x > 150; x -= 15) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: ponto(x, 420) })
    await esperar(16)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await esperar(1000)
  await foto('08-deslizou')
  const p = await page.evaluate(() => {
    const s = window.__sala
    return { sel: s.araras[s.secao].sel, x: s.w / 2, y: s.h * 0.42 }
  })
  console.log('escolhida depois de deslizar:', p.sel)
  await page.touchscreen.tap(p.x, p.y)
}
await esperar(2800)
await foto('09-peca')
await page.click('.tamanhos label:nth-of-type(3)')
await page.click('.peca .botao')
await esperar(600)
await foto('10-adicionada')
await page.click('.peca__fechar')
await esperar(2200)
await foto('11-fechou')
await page.evaluate(() => [...document.querySelectorAll('.topo__links button')].find((b) => b.textContent.includes('sacola')).click())
await esperar(700)
await foto('12-sacola')
await page.click('.gaveta--aberta .botao')
await esperar(300)
console.log('aviso:', await page.$eval('.gaveta__aviso', (e) => e.textContent))
await page.click('.gaveta--aberta .gaveta__topo button')
await esperar(500)
await page.evaluate(() => [...document.querySelectorAll('.barra__item')][2].click())
await esperar(5200)
await foto('13-feminino')

for (const [id, nome] of [['como-funciona', '14-como'], ['medidas', '15-medidas'], ['duvidas', '16-duvidas']]) {
  await page.evaluate((id) => document.getElementById(id).scrollIntoView({ behavior: 'instant' }), id)
  await esperar(1900)
  await foto(nome)
}
await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }))
await esperar(900)
await foto('17-fim')
const larguraPagina = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
console.log('sobra lateral da página:', larguraPagina)
console.log(erros.length ? erros.join('\n') : 'sem erros no console')
await browser.close()
