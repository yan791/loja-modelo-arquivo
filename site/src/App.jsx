import { useCallback, useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'
import 'lenis/dist/lenis.css'
import { Sala } from './cena/Sala.js'
import { marca, pecas, secoes, pecaPorSlug, reais } from './dados/loja.js'
import { Secoes } from './componentes/Secoes.jsx'
import { PainelPeca, PainelSacola, PainelMenu } from './componentes/Paineis.jsx'

const CHAVE_SACOLA = 'arquivo-sacola'
const lerSacola = () => {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE_SACOLA))
    return Array.isArray(s) ? s : []
  } catch {
    return []
  }
}
const slugDoHash = () => {
  const s = decodeURIComponent(location.hash.replace(/^#\/?/, ''))
  return pecaPorSlug(s) ? s : null
}
const suave = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const curvaRolagem = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const PONTO_ARARA = 0.93 // onde a câmera já chegou na arara, em fração da rolagem da entrada
const toque = typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches

export default function App() {
  const canvas = useRef(null)
  const palco = useRef(null)
  const fixo = useRef(null)
  const heroi = useRef(null)
  const etiqueta = useRef(null)
  const sala = useRef(null)
  const lenis = useRef(null)
  const cacheCena = useRef({})
  const secaoRef = useRef(0)
  const abertaRef = useRef(null)
  const inicial = useRef(slugDoHash())

  const [fase, setFase] = useState('carregando')
  const [progresso, setProgresso] = useState(0)
  const [secao, setSecao] = useState(0)
  const [sel, setSel] = useState(null)
  const [aberta, setAberta] = useState(null) // slug da peça aberta
  const [mostrada, setMostrada] = useState(pecas[0].slug) // o painel continua com a última enquanto some
  const [naEntrada, setNaEntrada] = useState(true) // ainda na abertura, antes de chegar na arara
  const [nasSecoes, setNasSecoes] = useState(false)
  const [painel, setPainel] = useState(null) // sacola | menu
  const [sacola, setSacola] = useState(lerSacola)
  const [recado, setRecado] = useState(null)
  const [aviso, setAviso] = useState('')
  const [usouMouse, setUsouMouse] = useState(false)

  const ordem = secoes[secao].ordem

  const aoCena = useCallback(({ u, m, ex, ey, tem, logo }) => {
    const el = fixo.current
    const h = heroi.current
    const et = etiqueta.current
    if (!el) return
    const c = cacheCena.current
    const barra = suave(0.3, 0.5, u)
    const arara = suave(0.92, 0.985, u) * (1 - m)
    const escrever = (nome, v) => {
      if (Math.abs((c[nome] ?? -1) - v) > 0.003) {
        c[nome] = v
        el.style.setProperty(`--${nome}`, v.toFixed(3))
      }
    }
    escrever('k-heroi', logo)
    escrever('k-barra', barra * (1 - m))
    escrever('k-arara', arara)
    const escondeHeroi = logo < 0.01
    if (c.escondeHeroi !== escondeHeroi) {
      c.escondeHeroi = escondeHeroi
      h.style.visibility = escondeHeroi ? 'hidden' : 'visible'
    }
    if (tem) {
      const y = Math.min(ey + 6, el.clientHeight - 88)
      const x = Math.round(ex)
      const yy = Math.round(y)
      if (c.ex !== x || c.ey !== yy) {
        c.ex = x
        c.ey = yy
        et.style.transform = `translate3d(${x}px, ${yy}px, 0) translateX(-50%)`
      }
    }
    const entrada = u < 0.34
    if (c.entrada !== entrada) {
      c.entrada = entrada
      setNaEntrada(entrada)
    }
  }, [])

  // a viagem demora conforme a distância: a entrada completa leva alguns segundos, nunca um salto
  const viajar = useCallback((destino, imediato = false) => {
    const l = lenis.current
    const alvo = typeof destino === 'number' ? destino : destino.getBoundingClientRect().top + window.scrollY
    if (imediato || !l) {
      window.scrollTo({ top: alvo, behavior: 'instant' })
      return
    }
    const telas = Math.abs(alvo - window.scrollY) / window.innerHeight
    l.scrollTo(alvo, { duration: Math.min(7, 0.9 + telas * 1.3), easing: curvaRolagem, force: true })
  }, [])
  const irParaArara = useCallback(
    (imediato = false) => {
      const r = palco.current.getBoundingClientRect()
      const fim = r.height - window.innerHeight
      viajar(window.scrollY + r.top + fim * PONTO_ARARA, imediato === true)
    },
    [viajar],
  )
  const irParaTopo = useCallback(() => viajar(0), [viajar])

  const abrirSlug = useCallback((slug, { historico = true } = {}) => {
    const s = sala.current
    if (slug) {
      setMostrada(slug)
      const i = secoes[secaoRef.current].ordem.indexOf(slug)
      s?.abrir(i)
    } else {
      s?.abrir(null)
    }
    abertaRef.current = slug
    setAberta(slug)
    if (historico) history.pushState(null, '', slug ? `#/${slug}` : location.pathname + location.search)
  }, [])

  const trocarSecao = useCallback(
    (i) => {
      secaoRef.current = i
      setSecao(i)
      sala.current?.definirSecao(i)
      irParaArara()
    },
    [irParaArara],
  )

  // rolagem suave própria: a do navegador fica instantânea quando o Windows está com as animações desligadas
  useEffect(() => {
    const l = new Lenis({ respectReducedMotion: false, lerp: 0.07, wheelMultiplier: 0.85, smoothWheel: true, syncTouch: false, prevent: (n) => !!n.closest?.('.peca, .gaveta') })
    lenis.current = l
    let id
    const f = (t) => {
      l.raf(t)
      id = requestAnimationFrame(f)
    }
    id = requestAnimationFrame(f)
    return () => {
      cancelAnimationFrame(id)
      l.destroy()
      lenis.current = null
    }
  }, [])

  // cena 3D: criada uma vez
  useEffect(() => {
    let vivo = true
    let s
    try {
      s = new Sala(canvas.current, palco.current, {
        carregando: (p) => vivo && setProgresso(p),
        cena: aoCena,
        selecao: (_, slug) => vivo && setSel(slug),
        abrir: (i) => abrirSlug(secoes[secaoRef.current].ordem[i]),
        usou: () => vivo && setUsouMouse(true),
      })
    } catch (e) {
      console.error(e)
      setFase('erro')
      return
    }
    sala.current = s
    if (import.meta.env.DEV || location.search.includes('teste')) window.__sala = s
    s.carregar(pecas, secoes.map((x) => x.ordem), secoes.map((x) => x.titulo), secoes.map((x) => x.inicio))
      .then(() => {
        if (!vivo) return
        setFase('pronto')
        if (inicial.current) {
          irParaArara(true)
          abrirSlug(inicial.current, { historico: false })
        }
      })
      .catch((e) => {
        console.error(e)
        if (vivo) setFase('erro')
      })
    return () => {
      vivo = false
      s.destruir()
      sala.current = null
    }
  }, [aoCena, abrirSlug, irParaArara])

  // peça aberta ou gaveta aberta: a página fica parada até fechar; só o painel rola
  useEffect(() => {
    if (aberta == null && painel == null) return
    lenis.current?.stop()
    const parar = (e) => {
      if (!e.target.closest?.('.peca, .gaveta')) e.preventDefault()
    }
    window.addEventListener('wheel', parar, { passive: false })
    window.addEventListener('touchmove', parar, { passive: false })
    return () => {
      lenis.current?.start()
      window.removeEventListener('wheel', parar)
      window.removeEventListener('touchmove', parar)
    }
  }, [aberta, painel])

  useEffect(() => {
    const f = () => abrirSlug(slugDoHash(), { historico: false })
    window.addEventListener('popstate', f)
    return () => window.removeEventListener('popstate', f)
  }, [abrirSlug])

  useEffect(() => {
    const f = () => {
      const r = palco.current?.getBoundingClientRect()
      const m = document.getElementById('medidas')?.getBoundingClientRect()
      // a seção de medidas é escura: ali o topo volta a ser claro
      if (r) setNasSecoes(r.bottom < 60 && !(m && m.top < 40 && m.bottom > 40))
    }
    f()
    window.addEventListener('scroll', f, { passive: true })
    return () => window.removeEventListener('scroll', f)
  }, [])

  useEffect(() => {
    const f = (e) => {
      if (e.key === 'Escape') {
        if (painel) setPainel(null)
        else if (abertaRef.current) abrirSlug(null)
        return
      }
      if (!abertaRef.current || painel) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const o = secoes[secaoRef.current].ordem
        const i = o.indexOf(abertaRef.current)
        abrirSlug(o[(i + (e.key === 'ArrowRight' ? 1 : o.length - 1)) % o.length])
      }
    }
    document.addEventListener('keydown', f)
    return () => document.removeEventListener('keydown', f)
  }, [painel, abrirSlug])

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE_SACOLA, JSON.stringify(sacola))
    } catch {
      /* navegação privada: a sacola vale só nesta visita */
    }
  }, [sacola])

  useEffect(() => {
    if (!recado) return
    const t = setTimeout(() => setRecado(null), 3600)
    return () => clearTimeout(t)
  }, [recado])

  const adicionar = (slug, tamanho) => {
    setSacola((s) => {
      const j = s.findIndex((x) => x.slug === slug && x.tamanho === tamanho)
      if (j < 0) return [...s, { slug, tamanho, qtd: 1 }]
      return s.map((x, k) => (k === j ? { ...x, qtd: x.qtd + 1 } : x))
    })
    setRecado({ nome: pecaPorSlug(slug).nome, tamanho, chave: Date.now() })
  }
  const alterar = (it, d) => setSacola((s) => s.map((x) => (x.slug === it.slug && x.tamanho === it.tamanho ? { ...x, qtd: Math.max(1, x.qtd + d) } : x)))
  const remover = (it) => setSacola((s) => s.filter((x) => !(x.slug === it.slug && x.tamanho === it.tamanho)))
  const finalizar = (linhas, total) => {
    if (!marca.whatsapp) {
      setAviso('Loja modelo: nenhum pagamento é feito. Numa loja real, aqui entram frete, Pix e cartão.')
      return
    }
    const texto = ['Olá! Quero fazer este pedido:', ...linhas.map((it) => `${it.p.nome}, tamanho ${it.tamanho}, ${it.qtd}x`), `Subtotal: ${reais(total)}`].join('\n')
    window.open(`https://wa.me/${marca.whatsapp}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }
  const fecharPainel = useCallback(() => {
    setPainel(null)
    setAviso('')
  }, [])

  const qtd = sacola.reduce((s, x) => s + x.qtd, 0)
  const pecaSel = sel ? pecaPorSlug(sel) : null
  const aba = naEntrada ? 'loja' : secoes[secao].id

  return (
    <div className={`app fase-${fase}${aberta ? ' com-peca' : ''}`}>
      <a className="pular" href="#conteudo">
        Pular para o conteúdo
      </a>

      <header className={`topo${nasSecoes ? ' topo--escuro' : ''}`}>
        <button type="button" className={`topo__marca${naEntrada ? ' topo__marca--oculta' : ''}`} onClick={irParaTopo} aria-label="arquivo, voltar para o início">
          {marca.nome}
          <sup>®</sup>
        </button>
        <nav className="topo__links" aria-label="Atalhos">
          {!naEntrada && !nasSecoes && !aberta && (
            <button type="button" onClick={irParaTopo}>
              <span aria-hidden="true">←</span> voltar
            </button>
          )}
          <button type="button" onClick={() => setPainel('menu')}>
            menu
          </button>
          <button type="button" onClick={() => setPainel('sacola')}>
            //sacola{qtd > 0 ? ` (${qtd})` : ''}
          </button>
        </nav>
      </header>

      <section ref={palco} className="palco" aria-label="Loja em 3D">
        <div ref={fixo} className="palco__fixo">
          <canvas ref={canvas} className="cena" aria-hidden="true" />

          <div ref={heroi} className="heroi">
            <h1 className="heroi__titulo">
              <span className="invisivel">arquivo. </span>Marca de
              <br />
              arquivo Y2K
            </h1>
            <p className="heroi__escada">
              <span>Curadoria</span>
              <span>Drops</span>
              <span>Semanais</span>
            </p>
            <p className="heroi__etiquetas">
              <span>Tiragem curta</span>
              <span>Reedição</span>
              <span>2k27</span>
            </p>
            <button type="button" className="heroi__entrar" onClick={() => irParaArara()}>
              Entrar na loja
            </button>
            <p className="heroi__base">loja modelo, marca fictícia</p>
          </div>

          <div ref={etiqueta} className="etiqueta" aria-hidden="true">
            {pecaSel && (
              <>
                <b>{pecaSel.nome}</b>
                <i>{reais(pecaSel.preco)}</i>
              </>
            )}
          </div>

          <p className={`dica${usouMouse ? ' dica--fora' : ''}`}>{toque ? 'Deslize para trocar de camisa. Toque para ver os detalhes.' : 'Passe o mouse para virar a camisa. Clique para ver os detalhes.'}</p>

          <p className="dica-giro">{toque ? 'Deslize na camisa para girar' : 'Arraste a camisa para girar'}</p>

          <nav className="barra" aria-label="Seções da loja">
            <button type="button" className={`barra__item${aba === 'loja' ? ' barra__item--ativo' : ''}`} onClick={irParaTopo} aria-current={aba === 'loja' ? 'true' : undefined}>
              Loja
            </button>
            {secoes.map((s, i) => (
              <button key={s.id} type="button" className={`barra__item${aba === s.id ? ' barra__item--ativo' : ''}`} onClick={() => trocarSecao(i)} aria-current={aba === s.id ? 'true' : undefined}>
                {s.rotulo}
              </button>
            ))}
          </nav>

          {/* para teclado e leitor de tela: a arara também funciona como lista */}
          <div className="invisivel" role="list" aria-label="Camisas da arara">
            {ordem.map((slug, i) => {
              const p = pecaPorSlug(slug)
              return (
                <div role="listitem" key={slug}>
                  <button type="button" onFocus={() => sala.current?.ativa && sala.current.selecionar(i)} onClick={() => { irParaArara(true); abrirSlug(slug) }}>
                    {p.nome}, {reais(p.preco)}
                  </button>
                </div>
              )
            })}
          </div>

          <div className="carregando" aria-hidden={fase === 'pronto'}>
            <span className="carregando__marca">
              {marca.nome}
              <sup>®</sup>
            </span>
            <div className="carregando__barra">
              <i style={{ transform: `scaleX(${progresso})` }} />
            </div>
            <p>{fase === 'erro' ? 'Não foi possível abrir a sala 3D neste navegador.' : `Montando a sala, ${Math.round(progresso * 100)}%`}</p>
          </div>
        </div>
      </section>

      <Secoes aoVoltar={() => irParaArara()} />

      <PainelPeca
        aberta={aberta != null}
        slug={mostrada}
        indice={ordem.indexOf(mostrada)}
        total={ordem.length}
        fechar={() => abrirSlug(null)}
        trocar={(d) => abrirSlug(ordem[(ordem.indexOf(mostrada) + d + ordem.length) % ordem.length])}
        aoAdicionar={adicionar}
        qtdSacola={qtd}
        abrirSacola={() => setPainel('sacola')}
      />
      <PainelSacola aberto={painel === 'sacola'} itens={sacola} fechar={fecharPainel} alterar={alterar} remover={remover} finalizar={finalizar} aviso={aviso} />
      <PainelMenu
        aberto={painel === 'menu'}
        fechar={fecharPainel}
        irArara={(i) => {
          fecharPainel()
          abrirSlug(null)
          trocarSecao(i)
        }}
        irTopo={() => {
          fecharPainel()
          abrirSlug(null)
          irParaTopo()
        }}
        fecharPeca={() => abrirSlug(null)}
        viajar={viajar}
      />

      {recado && (
        <div className="recado" key={recado.chave} role="status">
          <strong>
            {recado.nome}, tamanho {recado.tamanho}
          </strong>
          <button type="button" onClick={() => setPainel('sacola')}>
            Ver sacola
          </button>
        </div>
      )}
    </div>
  )
}
