import { useEffect, useRef, useState } from 'react'
import { TAMANHOS, modelos, pecaPorSlug } from '../dados/loja.js'

const BASE = import.meta.env.BASE_URL

// as seções entram uma vez, quando chegam na tela
function useSurgir() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const o = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          el.classList.add('in')
          o.disconnect()
        }
      },
      { threshold: 0.14 },
    )
    o.observe(el)
    return () => o.disconnect()
  }, [])
  return ref
}

const PASSOS = [
  { titulo: 'Sai', texto: 'Cinco camisas novas na arara, às 19h.', slug: 'jogo' },
  { titulo: 'Fica', texto: 'Tiragem curta, com a quantidade de cada tamanho à vista.', slug: 'tribal' },
  { titulo: 'Volta', texto: 'Acabou, a peça volta para o arquivo. Pode ser reeditada um dia, ou não.', slug: 'chama' },
]

function ComoFunciona() {
  const ref = useSurgir()
  return (
    <section id="como-funciona" className="como" ref={ref}>
      <h2 className="como__titulo">Toda quinta, um drop.</h2>
      <div className="como__barra" aria-hidden="true" />
      <ol className="como__passos">
        {PASSOS.map((p, i) => (
          <li key={p.titulo} style={{ '--i': i }}>
            <div className="pendurada" aria-hidden="true">
              <img className="pendurada__perfil" src={`${BASE}camisas/${p.slug}-perfil-m.webp`} alt="" loading="lazy" />
              <img className="pendurada__frente" src={`${BASE}camisas/${p.slug}-frente-m.webp`} alt="" loading="lazy" />
            </div>
            <h3>{p.titulo}</h3>
            <p>{p.texto}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Medidas() {
  const ref = useSurgir()
  const [slug, setSlug] = useState('tribal')
  const [tamanho, setTamanho] = useState('M')
  const [info, setInfo] = useState(null)
  useEffect(() => {
    let vivo = true
    fetch(`${BASE}camisas/camisas.json`)
      .then((r) => r.json())
      .then((d) => vivo && setInfo(d))
    return () => {
      vivo = false
    }
  }, [])
  const p = pecaPorSlug(slug)
  const [l, c, m] = p.medidas[tamanho]
  const f = info?.[slug]?.frente
  const med = f?.medida
  const xLinha = med ? med.dir * 100 - 7 : 0
  return (
    <section id="medidas" className="medidas" ref={ref}>
      <div className="medidas__foto" style={f ? { aspectRatio: `${f.largura} / ${f.altura}` } : undefined}>
        <img key={slug} src={`${BASE}camisas/${slug}-frente.webp`} alt={`${p.nome}, de frente, com as medidas marcadas`} loading="lazy" />
        {med && (
          <>
            <svg key={`${slug}-${tamanho}`} viewBox={`0 0 ${f.largura} ${f.altura}`} aria-hidden="true">
              <line className="traco traco--fundo" x1={med.esq * f.largura} y1={med.y * f.altura} x2={med.dir * f.largura} y2={med.y * f.altura} pathLength="1" />
              <line className="traco" x1={med.esq * f.largura} y1={med.y * f.altura} x2={med.dir * f.largura} y2={med.y * f.altura} pathLength="1" />
              <line className="traco traco--fundo traco--2" x1={(xLinha / 100) * f.largura} y1={med.gola * f.altura} x2={(xLinha / 100) * f.largura} y2={med.barra * f.altura} pathLength="1" />
              <line className="traco traco--2" x1={(xLinha / 100) * f.largura} y1={med.gola * f.altura} x2={(xLinha / 100) * f.largura} y2={med.barra * f.altura} pathLength="1" />
            </svg>
            <span className="medidas__chip mono" style={{ left: `${(med.esq + med.dir) * 50}%`, top: `${med.y * 100}%` }}>
              {l} cm
            </span>
            <span className="medidas__chip mono" style={{ left: `${xLinha}%`, top: `${((med.gola + med.barra) / 2) * 100}%` }}>
              {c} cm
            </span>
          </>
        )}
      </div>
      <div className="medidas__texto">
        <h2>A medida que importa é a da camisa.</h2>
        <p>Coloque uma camisa sua numa mesa e meça igual. Se a sua tem 58 cm de largura e essa tem 62, você já sabe como vai ficar.</p>
        <div className="seletor" role="radiogroup" aria-label="Camisa">
          {modelos.map((x) => (
            <button key={x.slug} type="button" role="radio" aria-checked={x.slug === slug} className={x.slug === slug ? 'seletor__ativo' : ''} onClick={() => setSlug(x.slug)}>
              {x.nome}
            </button>
          ))}
        </div>
        <div className="seletor seletor--tam" role="radiogroup" aria-label="Tamanho">
          {TAMANHOS.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={t === tamanho} className={t === tamanho ? 'seletor__ativo' : ''} onClick={() => setTamanho(t)}>
              {t}
            </button>
          ))}
        </div>
        <dl className="medidas__numeros">
          <div>
            <dt>Largura</dt>
            <dd className="mono">{l} cm</dd>
          </div>
          <div>
            <dt>Comprimento</dt>
            <dd className="mono">{c} cm</dd>
          </div>
          <div>
            <dt>Manga</dt>
            <dd className="mono">{m} cm</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

const DUVIDAS = [
  ['E se não servir?', 'Você tem 7 dias depois de receber para devolver, como manda a lei. A primeira troca de tamanho é por nossa conta.'],
  ['O tecido é grosso mesmo?', 'A gramatura de cada camisa está na página dela. A gola é canelada e costurada duas vezes, para não abrir depois de lavar.'],
  ['Quanto tempo leva?', 'Você vê o prazo e o frete antes de pagar. O pedido sai em até 2 dias úteis.'],
  ['A cor é a da foto?', 'As fotos são feitas com a mesma luz. A lavagem ácida muda de uma peça para outra, e isso está avisado na página dela.'],
]

function Duvidas() {
  const ref = useSurgir()
  return (
    <section id="duvidas" className="duvidas" ref={ref}>
      <h2>Dúvidas</h2>
      <dl>
        {DUVIDAS.map(([q, r], i) => (
          <div key={q} style={{ '--i': i }}>
            <dt>{q}</dt>
            <dd>{r}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function Secoes({ aoVoltar }) {
  const fim = useSurgir()
  return (
    <main id="conteudo" tabIndex={-1} className="secoes">
      <div className="ambiente" aria-hidden="true" />
      <ComoFunciona />
      <Medidas />
      <Duvidas />
      <section className="fim" ref={fim}>
        <h2>A arara continua lá.</h2>
        <button type="button" className="botao" onClick={aoVoltar}>
          Voltar para a arara
        </button>
      </section>
      <footer className="rodape">
        <p>arquivo® é uma marca fictícia. Esta é uma loja modelo, feita para demonstração, e nenhuma compra é cobrada.</p>
      </footer>
    </main>
  )
}
