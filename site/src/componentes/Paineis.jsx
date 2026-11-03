import { useEffect, useRef, useState } from 'react'
import { TAMANHOS, pecaPorSlug, reais } from '../dados/loja.js'

const BASE = import.meta.env.BASE_URL

export function PainelPeca({ aberta, slug, indice, total, fechar, trocar, aoAdicionar, abrirSacola, qtdSacola }) {
  const p = pecaPorSlug(slug)
  const [tamanho, setTamanho] = useState('M')
  const fecharBtn = useRef(null)
  const [l, c, m] = p.medidas[tamanho]
  useEffect(() => {
    if (aberta) fecharBtn.current?.focus({ preventScroll: true })
  }, [aberta])
  return (
    <aside className={`peca${aberta ? ' peca--aberta' : ''}`} role="dialog" aria-label={p.nome} aria-hidden={!aberta} inert={!aberta}>
      <div className="peca__topo">
        <span className="mono">
          {String(indice + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
        <div className="peca__setas">
          <button type="button" aria-label="Camisa anterior" onClick={() => trocar(-1)}>
            ←
          </button>
          <button type="button" aria-label="Próxima camisa" onClick={() => trocar(1)}>
            →
          </button>
        </div>
        <button ref={fecharBtn} type="button" className="peca__fechar" onClick={fechar}>
          Fechar
        </button>
      </div>
      <div className="peca__miolo" key={slug}>
        <h2>{p.nome}</h2>
        <p className="peca__preco mono">{reais(p.preco)}</p>
        <p className="peca__texto">{p.descricao}</p>
        <fieldset className="tamanhos">
          <legend>Tamanho</legend>
          {TAMANHOS.map((t) => (
            <label key={t} className={t === tamanho ? 'tamanhos__ativo' : ''}>
              <input type="radio" name="tamanho" value={t} checked={t === tamanho} onChange={() => setTamanho(t)} />
              {t}
            </label>
          ))}
        </fieldset>
        <dl className="peca__medidas mono">
          <div>
            <dt>Largura</dt>
            <dd>{l} cm</dd>
          </div>
          <div>
            <dt>Comprimento</dt>
            <dd>{c} cm</dd>
          </div>
          <div>
            <dt>Manga</dt>
            <dd>{m} cm</dd>
          </div>
          <div>
            <dt>Tecido</dt>
            <dd>{p.tecido}</dd>
          </div>
        </dl>
        <button type="button" className="botao" onClick={() => aoAdicionar(slug, tamanho)}>
          Adicionar à sacola
        </button>
        {qtdSacola > 0 && (
          <button type="button" className="peca__ver" onClick={abrirSacola}>
            Ver sacola ({qtdSacola})
          </button>
        )}
      </div>
    </aside>
  )
}

function Gaveta({ aberto, fechar, titulo, children }) {
  return (
    <>
      <div className={`veu${aberto ? ' veu--on' : ''}`} onClick={fechar} aria-hidden="true" />
      <aside className={`gaveta${aberto ? ' gaveta--aberta' : ''}`} role="dialog" aria-label={titulo} aria-hidden={!aberto} inert={!aberto}>
        <div className="gaveta__topo">
          <h2>{titulo}</h2>
          <button type="button" onClick={fechar}>
            Fechar
          </button>
        </div>
        {children}
      </aside>
    </>
  )
}

export function PainelSacola({ aberto, itens, fechar, alterar, remover, finalizar, aviso }) {
  const linhas = itens.map((it) => ({ ...it, p: pecaPorSlug(it.slug) })).filter((it) => it.p)
  const total = linhas.reduce((s, it) => s + it.p.preco * it.qtd, 0)
  return (
    <Gaveta aberto={aberto} fechar={fechar} titulo="Sacola">
      {linhas.length === 0 ? (
        <p className="gaveta__vazio">A sacola está vazia. Escolha uma camisa na arara.</p>
      ) : (
        <>
          <ul className="itens">
            {linhas.map((it) => (
              <li key={`${it.slug}-${it.tamanho}`}>
                <img src={`${BASE}camisas/${it.slug}-frente-m.webp`} alt="" width="72" height="94" loading="lazy" />
                <div>
                  <strong>{it.p.nome}</strong>
                  <span className="mono">
                    Tamanho {it.tamanho} / {reais(it.p.preco)}
                  </span>
                  <div className="itens__qtd">
                    <button type="button" aria-label="Tirar uma" onClick={() => alterar(it, -1)}>
                      −
                    </button>
                    <span className="mono">{it.qtd}</span>
                    <button type="button" aria-label="Colocar mais uma" onClick={() => alterar(it, 1)}>
                      +
                    </button>
                    <button type="button" className="itens__tirar" onClick={() => remover(it)}>
                      Remover
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="gaveta__fim">
            <p className="gaveta__total">
              <span>Subtotal</span>
              <b className="mono">{reais(total)}</b>
            </p>
            <button type="button" className="botao" onClick={() => finalizar(linhas, total)}>
              Finalizar pedido
            </button>
            {aviso && (
              <p className="gaveta__aviso" role="status">
                {aviso}
              </p>
            )}
          </div>
        </>
      )}
    </Gaveta>
  )
}

export function PainelMenu({ aberto, fechar, irArara, irTopo, fecharPeca, viajar }) {
  const ancora = (id) => (e) => {
    e.preventDefault()
    fechar()
    fecharPeca()
    const el = document.getElementById(id)
    if (el) viajar(el)
  }
  return (
    <Gaveta aberto={aberto} fechar={fechar} titulo="Menu">
      <nav className="menu" aria-label="Menu principal">
        <button type="button" onClick={irTopo}>
          Início
        </button>
        <button type="button" onClick={() => irArara(0)}>
          Arara masculina
        </button>
        <button type="button" onClick={() => irArara(1)}>
          Arara feminina
        </button>
        <a href="#como-funciona" onClick={ancora('como-funciona')}>
          Como funciona
        </a>
        <a href="#medidas" onClick={ancora('medidas')}>
          Medidas
        </a>
        <a href="#duvidas" onClick={ancora('duvidas')}>
          Dúvidas
        </a>
      </nav>
    </Gaveta>
  )
}
