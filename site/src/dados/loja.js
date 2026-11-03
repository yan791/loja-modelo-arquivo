// Tudo que é da marca e das peças fica aqui: trocar o nome da loja ou uma camisa é mexer só neste arquivo.
export const marca = {
  nome: 'arquivo',
  whatsapp: '', // preenchido, a sacola fecha o pedido pelo WhatsApp
}

const chama = {
  slug: 'chama',
  nome: 'CHAMA BOWLING',
  preco: 229,
  descricao: 'Camisa de boliche em viscose preta, com chamas estampadas subindo da barra. Gola aberta e botões na frente.',
  tecido: 'Viscose, 110 g/m²',
  medidas: { P: [54, 70, 23], M: [57, 72, 24], G: [60, 74, 25], GG: [63, 76, 26] },
}
const acida = {
  slug: 'acida',
  nome: 'ÁCIDA RINGER',
  preco: 169,
  descricao: 'Algodão pesado com lavagem ácida em rosa e roxo. Cada camisa sai com manchas um pouco diferentes.',
  tecido: 'Algodão, 240 g/m²',
  medidas: { P: [58, 68, 24], M: [61, 70, 25], G: [64, 72, 26], GG: [67, 74, 27] },
}
const tribal = {
  slug: 'tribal',
  nome: 'TRIBAL OVERSIZED',
  preco: 179,
  descricao: 'Algodão pesado off-white com estampa tribal prateada, levemente craquelada. Gola canelada grossa.',
  tecido: 'Algodão, 260 g/m²',
  medidas: { P: [60, 69, 25], M: [63, 71, 26], G: [66, 73, 27], GG: [69, 75, 28] },
}
const jogo = {
  slug: 'jogo',
  nome: 'JOGO 2K',
  preco: 199,
  descricao: 'Tecido esportivo com brilho, faixas diagonais prateadas e gola polo branca. Sem escudo e sem patrocínio.',
  tecido: 'Poliéster, 140 g/m²',
  medidas: { P: [53, 70, 22], M: [56, 72, 23], G: [59, 74, 24], GG: [62, 76, 25] },
}
const listra = {
  slug: 'listra',
  nome: 'LISTRA LONGA',
  preco: 149,
  descricao: 'Malha canelada fina, justa no corpo, com listras creme e vinho. As mangas passam um pouco da barra.',
  tecido: 'Malha canelada, 200 g/m²',
  medidas: { P: [44, 60, 64], M: [47, 62, 66], G: [50, 64, 68], GG: [53, 66, 70] },
}

// as cinco fotos originais; só elas aparecem na tabela de medidas
export const modelos = [chama, acida, tribal, jogo, listra]

// variações de cor das mesmas fotos (ferramentas/variantes.py): mesma modelagem, mesmas medidas
export const pecas = [
  ...modelos,
  { ...chama, slug: 'chama-gelo', nome: 'CHAMA GELO', descricao: 'A mesma camisa de boliche em viscose preta, com as chamas em azul-gelo. Gola aberta e botões na frente.' },
  { ...acida, slug: 'acida-mar', nome: 'ÁCIDA MAR', descricao: 'Algodão pesado com lavagem ácida em tons de mar. Cada camisa sai com manchas um pouco diferentes.' },
  { ...tribal, slug: 'tribal-salvia', nome: 'TRIBAL SÁLVIA', descricao: 'Algodão pesado verde-sálvia com estampa tribal prateada, levemente craquelada. Gola canelada grossa.' },
  { ...jogo, slug: 'jogo-rubro', nome: 'JOGO RUBRO', descricao: 'Tecido esportivo vermelho com brilho, faixas diagonais prateadas e gola polo branca. Sem escudo e sem patrocínio.' },
  { ...listra, slug: 'listra-marinho', nome: 'LISTRA MARINHO', descricao: 'Malha canelada fina, justa no corpo, com listras creme e azul-marinho. As mangas passam um pouco da barra.' },
]

export const TAMANHOS = ['P', 'M', 'G', 'GG']
export const pecaPorSlug = (slug) => pecas.find((p) => p.slug === slug)

// ordem na arara de cada seção; inicio é a camisa que vira primeiro
export const secoes = [
  {
    id: 'masculino',
    rotulo: 'Masculino',
    titulo: ['masculino /', 'camisas'],
    inicio: 6,
    ordem: ['tribal-salvia', 'acida', 'jogo-rubro', 'listra', 'tribal', 'chama', 'acida-mar', 'listra-marinho', 'jogo', 'chama-gelo'],
  },
  {
    id: 'feminino',
    rotulo: 'Feminino',
    titulo: ['feminino /', 'camisas'],
    inicio: 3,
    ordem: ['listra', 'acida-mar', 'chama-gelo', 'tribal', 'jogo', 'listra-marinho', 'acida', 'tribal-salvia', 'chama', 'jogo-rubro'],
  },
]

export const reais = (v) => `R$ ${v.toLocaleString('pt-BR')}`
