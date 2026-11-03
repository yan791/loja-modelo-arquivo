// Linha do tempo do botão "Entrar na loja": quanto a página e a câmera andam a cada meio segundo.
// node ferramentas/depurar.mjs [url]
import { abrir, esperar } from './navegador.mjs'

const url = process.argv[2] || 'http://127.0.0.1:5311/'
const { browser, page, erros } = await abrir({})
await page.goto(url + '?teste', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.fase-pronto', { timeout: 60000 })
const ler = () => page.evaluate(() => {
  const s = window.__sala
  return `y ${Math.round(scrollY)}  p ${s.p.toFixed(3)}  u ${s.u.toFixed(3)}  ativa ${s.ativa}`
})
await esperar(4500)
console.log('antes:', await ler())
await page.click('.heroi__entrar')
for (let i = 1; i <= 18; i++) {
  await esperar(500)
  console.log(`${(i * 0.5).toFixed(1)} s:`, await ler())
}
console.log(erros.length ? erros.join('\n') : 'sem erros no console')
await browser.close()
