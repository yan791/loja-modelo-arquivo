// Gera a imagem de prévia de link (1200x630, WhatsApp e redes) a partir da arara com uma camisa de frente.
// node ferramentas/og.mjs [url] [saida.jpg]
import { fileURLToPath } from 'node:url'
import { abrir, esperar } from './navegador.mjs'

const url = process.argv[2] || 'http://127.0.0.1:5311/'
const saida = process.argv[3] || fileURLToPath(new URL('../site/public/og.jpg', import.meta.url))
const { browser, page, erros } = await abrir({ largura: 1200, altura: 630 })
await page.goto(url + '?teste', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.fase-pronto', { timeout: 60000 })
await page.evaluate(() => {
  const r = document.querySelector('.palco')
  window.scrollTo({ top: (r.offsetHeight - innerHeight) * 0.93, behavior: 'instant' })
  document.querySelector('.dica').style.visibility = 'hidden'
})
await esperar(4200)
await page.screenshot({ path: saida, type: 'jpeg', quality: 88 })
console.log('ok', saida, erros.join('\n') || 'sem erros')
await browser.close()
