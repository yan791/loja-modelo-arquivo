// Mede quanto o site leva para ficar pronto numa visita nova e quanto ele baixa.
// node ferramentas/carga.mjs [url] [--movel]
import { abrir } from './navegador.mjs'

const args = process.argv.slice(2)
const url = args.find((a) => !a.startsWith('--')) || 'https://yan791.github.io/loja-modelo-arquivo/'
const movel = args.includes('--movel')
for (let i = 0; i < 3; i++) {
  const { browser, page } = await abrir(movel ? { largura: 390, altura: 844, movel: true, escala: 2 } : {})
  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.fase-pronto', { timeout: 60000 })
  const pronto = (Date.now() - t0) / 1000
  const r = await page.evaluate(() => {
    const e = performance.getEntriesByType('resource')
    const soma = e.reduce((s, x) => s + (x.transferSize || 0), 0)
    const redeFim = Math.max(...e.map((x) => x.responseEnd))
    return { arquivos: e.length, kb: Math.round(soma / 1024), redeFim: +(redeFim / 1000).toFixed(1), html: +(performance.getEntriesByType('navigation')[0].responseEnd / 1000).toFixed(2) }
  })
  console.log(`visita ${i + 1}: pronto em ${pronto.toFixed(1)} s, rede terminou em ${r.redeFim} s, ${r.arquivos} arquivos, ${r.kb} KB`)
  await browser.close()
}
