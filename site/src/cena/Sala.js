// Sala da loja em three.js: neblina, duas araras cromadas, camisas (fotos recortadas, de perfil e de frente)
// e a câmera comandada pela rolagem. A interface (textos, preço, sacola) é DOM, feita no React; esta classe
// só cuida do 3D e avisa o React pelos callbacks.
import * as THREE from 'three'

const BASE = import.meta.env.BASE_URL
const FOV = 32
const TAN = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
const ESC = 1 / 950 // pixel da foto para unidade da cena: uma camisa de perfil tem cerca de 1 de altura
const Y_BARRA = 1.9
const L_BARRA = 5.6
const R_TUBO = 0.014
const X_ARARA = [4.6, -5.9] // masculino, feminino
const ACIMA = 24 // px da foto entre o topo do gancho e o centro da barra
const Z_PAREDE = 3.4
const DURACAO_GIRO = 1.25
const SUBIR = 0.03 // a camisa fica um pouco mais perto da barra que na foto
const R_ARAME = 0.0058
const DIST_LOGO = 4
const SOMBRA = 0.24

const limitar = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const misturar = (a, b, t) => a + (b - a) * t
const suave = (a, b, x) => {
  const t = limitar((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const entraSai = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
// aproxima sem depender da taxa de quadros
const amortecer = (atual, alvo, forca, dt) => alvo + (atual - alvo) * Math.exp(-forca * dt)

// curva contínua entre valores igualmente espaçados: a câmera nunca para e recomeça no meio do caminho
function curva(v, u) {
  const n = v.length - 1
  const s = limitar(u) * n
  const i = Math.min(n - 1, Math.floor(s))
  const t = s - i
  const p0 = v[Math.max(0, i - 1)]
  const p1 = v[i]
  const p2 = v[i + 1]
  const p3 = v[Math.min(n, i + 2)]
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t)
}

// Tudo aqui escreve a cor já pronta para a tela, sem conversões do three: o resultado é o mesmo direto na
// tela ou passando pelo desfoque.
const VERT_SALA = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
    gl_Position = p.xyww;
  }`

const FRAG_SALA = /* glsl */ `
  varying vec3 vDir;
  uniform float uParede, uLeve;
  uniform vec2 uAraras;
  uniform sampler2D tGrao;
  float ruido(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  // sombra larga e fraca que cada arara faz na parede atrás dela
  float naParede(vec2 q, float x0) {
    float d = length(vec2((q.x - x0) / 3.8, (q.y - 1.15) / 1.5));
    return 1.0 - smoothstep(0.08, 1.0, d);
  }
  void main() {
    vec3 rd = normalize(vDir);
    float tP = rd.z < -0.0001 ? (-uParede - cameraPosition.z) / rd.z : 1000.0;
    vec3 q = cameraPosition + rd * tP;
    float tC = rd.y < -0.0001 ? -cameraPosition.y / rd.y : 1000.0;
    vec3 f = cameraPosition + rd * tC;

    // parede: de longe a neblina clareia tudo; de perto a sala fica escura, como na arara da referência
    float x = q.x + 0.5;
    float lados = smoothstep(3.0, 13.0, abs(x));
    vec3 baixo = mix(vec3(0.470, 0.505, 0.535), vec3(0.620, 0.665, 0.695), uLeve);
    vec3 meio = mix(vec3(0.310, 0.350, 0.385), vec3(0.500, 0.550, 0.590), uLeve);
    vec3 teto = mix(vec3(0.145, 0.180, 0.210), vec3(0.235, 0.286, 0.329), uLeve);
    vec3 parede = mix(baixo, meio, smoothstep(0.25, 1.9, q.y));
    parede = mix(parede, mix(teto, meio, lados * 0.55), smoothstep(1.4, 4.4 + uLeve * 2.2, q.y));
    parede *= 1.0 + (texture2D(tGrao, q.xy * 0.2).r - 0.784) * 0.3;
    parede *= mix(0.82, 1.0, smoothstep(0.0, 0.9, q.y));
    parede *= 1.0 - 0.14 * (naParede(q.xy, uAraras.x) + naParede(q.xy, uAraras.y));

    // chão polido: mais escuro no encontro com a parede, mais claro perto de quem olha
    float longe = smoothstep(-uParede, -uParede + 2.8, f.z);
    vec3 chao = mix(vec3(0.520, 0.555, 0.585), vec3(0.760, 0.785, 0.800), longe);
    chao *= mix(0.84, 1.0, uLeve);
    chao *= 1.0 + (texture2D(tGrao, f.xz * 0.27).r - 0.784) * 0.28;

    // a linha onde o chão encontra a parede fica um pouco suave, como num estúdio
    vec3 c = mix(chao, parede, smoothstep(-0.09, 0.09, q.y));
    gl_FragColor = vec4(c + (ruido(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
  }`

const VERT_FOTO = /* glsl */ `
  varying vec2 vUv;
  uniform float uCurva, uTempo, uFase, uLarg;
  void main() {
    vUv = uv;
    vec3 p = position;
    // tecido: um movimento bem leve, que cresce do gancho para a barra
    float desce = smoothstep(0.12, 1.0, -p.y);
    float onda = sin(uTempo * 1.05 + uFase + p.y * 2.6);
    p.z += onda * 0.011 * desce;
    p.x += onda * 0.0035 * desce;
    // a camisa curva um pouco enquanto vira, para não parecer um cartão
    if (uLarg > 0.0) {
      float k = clamp(p.x / uLarg, -1.0, 1.0);
      p.z += uCurva * (1.0 - k * k) * uLarg;
    }
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`

const FRAG_FOTO = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D map;
  uniform float uAlfa, uLuz, uVies, uNevoa;
  uniform vec3 uCorNevoa;
  void main() {
    vec4 c = texture2D(map, vUv, uVies);
    c.rgb = mix(c.rgb * uLuz, uCorNevoa, uNevoa);
    gl_FragColor = vec4(c.rgb, c.a * uAlfa);
    if (gl_FragColor.a < 0.004) discard;
  }`

const FRAG_SOMBRA = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D map;
  uniform float uAlfa;
  void main() {
    float a = texture2D(map, vUv, 5.6).a;
    // a redução borra até a borda da imagem: some antes de chegar lá, para não aparecer um retângulo
    a *= smoothstep(0.0, 0.24, vUv.x) * smoothstep(1.0, 0.76, vUv.x) * smoothstep(0.0, 0.09, vUv.y) * smoothstep(1.0, 0.91, vUv.y);
    gl_FragColor = vec4(0.09, 0.115, 0.135, a * uAlfa);
  }`

const VERT_CROMO = /* glsl */ `
  varying vec3 vN, vP;
  varying float vL;
  void main() {
    vL = position.y;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 m = modelMatrix * vec4(position, 1.0);
    vP = m.xyz;
    gl_Position = projectionMatrix * viewMatrix * m;
  }`

// O reflexo vem de uma função da sala, sem luzes: barato e com aparência de metal polido
const FRAG_CROMO = /* glsl */ `
  varying vec3 vN, vP;
  varying float vL;
  uniform float uAlfa, uVidro, uNevoa, uEspelho, uInfla, uRevela, uTinta;
  uniform vec3 uCorNevoa;
  vec3 ambiente(vec3 r) {
    float y = r.y;
    vec3 c = mix(vec3(0.74, 0.77, 0.79), vec3(0.18, 0.22, 0.25), smoothstep(-0.38, -0.03, y));
    c = mix(c, vec3(0.56, 0.61, 0.65), smoothstep(-0.03, 0.2, y));
    c = mix(c, vec3(0.95, 0.97, 0.99), smoothstep(0.28, 0.6, y));
    c = mix(c, vec3(0.70, 0.75, 0.79), smoothstep(0.72, 0.98, y));
    return c + smoothstep(0.55, 0.92, abs(r.x)) * vec3(0.2);
  }
  void main() {
    vec3 n = normalize(vN);
    vec3 v = normalize(cameraPosition - vP);
    if (dot(n, v) < 0.0) n = -n;
    float f = 1.0 - max(dot(n, v), 0.0);
    n = normalize(n + vec3(0.0, vL * uInfla, 0.0));
    vec3 c = ambiente(reflect(-v, n));
    c = mix(c, vec3(1.0), f * f * 0.32);
    c = mix(c, c * c * 0.2, uTinta);
    c = mix(c, uCorNevoa, uNevoa);
    float a = uAlfa * mix(uVidro, 1.0, f * f * 0.9 + 0.1);
    if (uEspelho > 0.0) a *= uEspelho * smoothstep(-1.05, 0.0, vP.y);
    a *= 1.0 - smoothstep(uRevela - 0.12, uRevela + 0.12, vP.x);
    gl_FragColor = vec4(c, a);
  }`

// Camisa com volume: a malha vem de recortar.py. A foto de frente é projetada de frente e a foto de perfil é
// projetada de lado; conforme a camisa gira, cada pedaço da superfície usa a foto que o enxerga melhor.
const VERT_CAMISA = /* glsl */ `
  uniform float uAng, uTorcao, uEscX, uTempo, uFase, uVel;
  uniform vec4 uMapaF, uMapaP;
  varying vec2 vF, vP;
  varying vec3 vN, vNm;
  varying float vTh;
  void main() {
    vec3 q = position;
    vF = uMapaF.xy + q.xy * uMapaF.zw;
    vP = vec2(uMapaP.x - q.z * uMapaP.z, uMapaP.y + q.y * uMapaP.w);
    vN = normal;
    float desce = smoothstep(0.12, 1.0, -q.y);
    // a barra da camisa atrasa em relação aos ombros e passa um pouco do ponto, como tecido
    float a = uAng + uTorcao * desce * desce;
    vTh = abs(a) / 1.5708;
    q.x *= uEscX * (1.0 + uVel * 0.035 * desce);
    float c = cos(a);
    float s = sin(a);
    vec3 p = vec3(q.x * c + q.z * s, q.y, -q.x * s + q.z * c);
    vNm = vec3(normal.x * c + normal.z * s, normal.y, -normal.x * s + normal.z * c);
    float onda = sin(uTempo * 1.05 + uFase + q.y * 2.6);
    p.z += onda * 0.011 * desce;
    p.x += onda * 0.0035 * desce;
    // quando gira rápido, o tecido ondula de leve
    p.z += sin(q.x * 8.0 + uTempo * 5.5 + q.y * 3.0) * 0.016 * uVel * desce;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`

const FRAG_CAMISA = /* glsl */ `
  uniform sampler2D tF, tP;
  uniform float uAlfa, uLuz, uVies, uNevoa, uForma, uEscX;
  uniform vec3 uCorNevoa;
  varying vec2 vF, vP;
  varying vec3 vN, vNm;
  varying float vTh;
  void main() {
    vec3 n = normalize(vN);
    // a lateral da camisa usa a foto de perfil logo no começo do giro; a parte da frente continua com a foto de
    // frente até ficar quase de lado, quando ela já mal aparece
    float lateral = smoothstep(0.28, 0.78, abs(n.x));
    float limite = mix(1.1, 0.3, lateral);
    float mixP = smoothstep(limite - 0.08, limite + 0.08, vTh);
    mixP = max(mixP, smoothstep(0.05, -0.2, n.z));
    // no comecinho do giro a malha ainda está achatada e continua igual à foto de perfil
    mixP = max(mixP, 1.0 - smoothstep(0.15, 0.7, uEscX));
    vec4 f = texture2D(tF, vF, uVies);
    vec4 l = texture2D(tP, vP, uVies);
    float a = mix(f.a, l.a, mixP);
    if (a < 0.02) discard;
    vec3 c = mix(f.rgb, l.rgb, mixP);
    // luz de estúdio pela forma da camisa: é o que faz a superfície parecer curva enquanto gira
    float luz = dot(normalize(vNm), normalize(vec3(-0.38, 0.32, 0.87)));
    c *= mix(1.0, mix(0.66, 1.1, luz * 0.5 + 0.5), uForma);
    c = mix(c * uLuz, uCorNevoa, uNevoa);
    gl_FragColor = vec4(c, a * uAlfa);
  }`

const VERT_TELA = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }`

const FRAG_DESCE = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tCor;
  uniform vec2 uPasso;
  uniform float uRaio;
  void main() {
    vec2 o = uPasso * uRaio;
    vec4 s = texture2D(tCor, vUv) * 4.0;
    s += texture2D(tCor, vUv - o);
    s += texture2D(tCor, vUv + o);
    s += texture2D(tCor, vUv + vec2(o.x, -o.y));
    s += texture2D(tCor, vUv - vec2(o.x, -o.y));
    gl_FragColor = s / 8.0;
  }`

const FRAG_SOBE = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tCor;
  uniform vec2 uPasso;
  uniform float uRaio;
  void main() {
    vec2 o = uPasso * uRaio;
    vec4 s = texture2D(tCor, vUv + vec2(-o.x * 2.0, 0.0));
    s += texture2D(tCor, vUv + vec2(-o.x, o.y)) * 2.0;
    s += texture2D(tCor, vUv + vec2(0.0, o.y * 2.0));
    s += texture2D(tCor, vUv + vec2(o.x, o.y)) * 2.0;
    s += texture2D(tCor, vUv + vec2(o.x * 2.0, 0.0));
    s += texture2D(tCor, vUv + vec2(o.x, -o.y)) * 2.0;
    s += texture2D(tCor, vUv + vec2(0.0, -o.y * 2.0));
    s += texture2D(tCor, vUv + vec2(-o.x, -o.y)) * 2.0;
    gl_FragColor = s / 12.0;
  }`

const FRAG_JUNTA = /* glsl */ `
  varying vec2 vUv;
  uniform sampler2D tCena, tBorrado;
  uniform float uMistura;
  float ruido(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
  void main() {
    vec3 c = mix(texture2D(tCena, vUv).rgb, texture2D(tBorrado, vUv).rgb, uMistura);
    gl_FragColor = vec4(c + (ruido(gl_FragCoord.xy) - 0.5) / 255.0, 1.0);
  }`

// Imagem com as reduções feitas pelo navegador em alta qualidade: de longe a camisa fica nítida, sem o
// borrado da redução padrão da placa de vídeo
async function texturaFoto(url, anisotropia, aoTerminar) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  const blob = await r.blob()
  const opc = { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }
  const nivel0 = await createImageBitmap(blob, { ...opc, imageOrientation: 'flipY' })
  const niveis = [nivel0]
  let { width: l, height: a } = nivel0
  try {
    while (l > 1 || a > 1) {
      l = Math.max(1, l >> 1)
      a = Math.max(1, a >> 1)
      niveis.push(await createImageBitmap(niveis[niveis.length - 1], { ...opc, resizeWidth: l, resizeHeight: a, resizeQuality: 'high' }))
    }
  } catch {
    niveis.length = 1 // navegador sem redimensionamento: a placa de vídeo gera as reduções
  }
  const t = new THREE.Texture(nivel0)
  if (niveis.length > 1) {
    t.mipmaps = niveis
    t.generateMipmaps = false
  }
  t.flipY = false
  t.colorSpace = THREE.NoColorSpace
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.anisotropy = anisotropia
  t.needsUpdate = true
  aoTerminar()
  return t
}

function geometriaTubo() {
  const L = L_BARRA
  const Y = Y_BARRA
  const R = 0.15
  const v = (x, y) => new THREE.Vector3(x, y, 0)
  const c = new THREE.CurvePath()
  c.add(new THREE.LineCurve3(v(-L / 2, 0.3), v(-L / 2, Y - R)))
  c.add(new THREE.QuadraticBezierCurve3(v(-L / 2, Y - R), v(-L / 2, Y), v(-L / 2 + R, Y)))
  c.add(new THREE.LineCurve3(v(-L / 2 + R, Y), v(L / 2 - R, Y)))
  c.add(new THREE.QuadraticBezierCurve3(v(L / 2 - R, Y), v(L / 2, Y), v(L / 2, Y - R)))
  c.add(new THREE.LineCurve3(v(L / 2, Y - R), v(L / 2, 0.3)))
  return new THREE.TubeGeometry(c, 520, R_TUBO, 14, false)
}

// Pé em forma de gota: barriga larga perto do chão e ponta fina subindo até virar o tubo
function geometriaPe() {
  const h = 0.58
  const R = 0.1
  const pts = [new THREE.Vector2(0.0001, 0)]
  for (let i = 0; i <= 44; i++) {
    const t = i / 44
    const barriga = Math.pow(1 - t, 3.1) * Math.min(1, 0.78 + Math.sqrt(t * 2.2))
    pts.push(new THREE.Vector2(R_TUBO + (R - R_TUBO) * barriga, t * h))
  }
  return new THREE.LatheGeometry(pts, 28)
}

function geometriaCamisa(m) {
  const n = m.nx * m.ny
  const pos = new Float32Array(n * 6)
  for (let j = 0; j < m.ny; j++) {
    for (let i = 0; i < m.nx; i++) {
      const v = j * m.nx + i
      const x = m.x0 + i * m.dx
      const y = m.y0 - j * m.dy
      pos.set([x, y, m.zf[v] / 1000], v * 3)
      pos.set([x, y, m.zb[v] / 1000], (n + v) * 3)
    }
  }
  // vértices da borda encaixados no contorno da camisa: a malha termina exatamente onde a foto termina
  for (let k = 0; k < m.borda.length; k += 3) {
    const v = m.borda[k]
    const dx = (m.borda[k + 1] / 10) * ESC
    const dy = (m.borda[k + 2] / 10) * ESC
    pos[v * 3] += dx
    pos[v * 3 + 1] += dy
    pos[(n + v) * 3] += dx
    pos[(n + v) * 3 + 1] += dy
  }
  const costas = []
  const frente = []
  for (let j = 0; j < m.ny - 1; j++) {
    for (let i = 0; i < m.nx - 1; i++) {
      if (m.m[j * (m.nx - 1) + i] !== '1') continue
      const a = j * m.nx + i
      const b = a + 1
      const c = a + m.nx
      const d = c + 1
      frente.push(a, c, b, b, c, d)
      costas.push(n + a, n + b, n + c, n + b, n + d, n + c)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setIndex([...costas, ...frente])
  g.computeVertexNormals()
  return g
}

// Gancho: sobe por trás da barra, passa por cima dela e desce na frente; fica fixo e atravessado na barra, como um
// gancho giratório de verdade. O corpo do cabide gira junto com a camisa
function geometriaGancho() {
  const v = (s, y) => new THREE.Vector3(s, y, 0)
  const c = new THREE.CatmullRomCurve3([v(0, -0.082), v(0, -0.058), v(-0.006, -0.044), v(-0.023, -0.024), v(-0.0265, 0.002), v(-0.016, 0.022), v(0, 0.0285), v(0.016, 0.022), v(0.0255, 0.002), v(0.024, -0.02), v(0.015, -0.034)], false, 'catmullrom', 0.5)
  return new THREE.TubeGeometry(c, 70, R_ARAME, 9, false)
}

function geometriaCabide() {
  const v = (x, y) => new THREE.Vector3(x, y, 0)
  const c = new THREE.CatmullRomCurve3([v(0, -0.074), v(0.07, -0.118), v(0.14, -0.162), v(0.195, -0.197), v(0.205, -0.214), v(0.185, -0.224), v(0, -0.226), v(-0.185, -0.224), v(-0.205, -0.214), v(-0.195, -0.197), v(-0.14, -0.162), v(-0.07, -0.118)], true, 'catmullrom', 0.28)
  return new THREE.TubeGeometry(c, 150, R_ARAME, 8, true)
}

function texturaTitulo(l1, l2) {
  const c = document.createElement('canvas')
  c.width = 2048
  c.height = 640
  const x = c.getContext('2d')
  x.fillStyle = '#1f272d'
  x.font = '500 196px "Schibsted Grotesk Variable", sans-serif'
  x.letterSpacing = '-9px'
  x.textAlign = 'center'
  x.textBaseline = 'alphabetic'
  x.fillText(l1, 1090, 280)
  x.fillText(l2, 1024, 470)
  x.beginPath()
  x.arc(960, 60, 22, 0, Math.PI * 2)
  x.arc(1022, 60, 22, 0, Math.PI * 2)
  x.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.NoColorSpace
  t.anisotropy = 4
  return t
}

export class Sala {
  constructor(canvas, palco, cb) {
    this.canvas = canvas
    this.palco = palco
    this.cb = cb // { carregando, cena, selecao, abrir, etiqueta }
    this.araras = []
    this.secao = 0
    this.mixSecao = 0
    this.pAlvo = 0
    this.p = 0
    this.u = 0
    this.m = 0 // 0: arara, 1: peça aberta
    this.aberta = null
    this.ativa = false
    this.tempo = 0
    this.ultimoUso = -100
    this.proximoPasseio = 0
    this.mouse = new THREE.Vector2()
    this.mouseSuave = new THREE.Vector2()
    this.aspecto = 1.5
    this.carrossel = false
    this.w = 1
    this.h = 1
    this.fArara = 1.786
    this.panX = 0
    this.vivo = true
    this.rodando = false
    this.visivel = true
    this.v = new THREE.Vector3()
    this.toque = { id: null, x: 0, y: 0, moveu: false, ancora: 0 }
    this.quadro = this.quadro.bind(this)
    this.aoRolar = this.aoRolar.bind(this)

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false }))
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.75)
    r.setPixelRatio(this.dpr)
    r.outputColorSpace = THREE.LinearSRGBColorSpace
    r.toneMapping = THREE.NoToneMapping
    r.autoClear = false
    r.setClearColor('#7d8a93')

    this.cena = new THREE.Scene()
    this.cenaLogo = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 80)
    this.corNevoa = new THREE.Color(0.6, 0.645, 0.675)

    this.montarSala()
    this.montarDesfoque()
    this.ligarEventos()
  }

  montarSala() {
    this.uSala = { uParede: { value: Z_PAREDE }, uLeve: { value: 1 }, uAraras: { value: new THREE.Vector2(X_ARARA[0], X_ARARA[1]) }, tGrao: { value: null } }
    const fundo = new THREE.Mesh(
      new THREE.SphereGeometry(10, 16, 12),
      new THREE.ShaderMaterial({ vertexShader: VERT_SALA, fragmentShader: FRAG_SALA, side: THREE.BackSide, depthTest: false, depthWrite: false, uniforms: this.uSala }),
    )
    fundo.frustumCulled = false
    fundo.renderOrder = -10
    this.cena.add(fundo)

    this.geoTubo = geometriaTubo()
    this.geoPe = geometriaPe()
    this.uCromo = { uAlfa: { value: 1 }, uVidro: { value: 1 }, uNevoa: { value: 0 }, uEspelho: { value: 0 }, uInfla: { value: 0 }, uRevela: { value: 1000 }, uTinta: { value: 0 }, uCorNevoa: { value: this.corNevoa } }
    this.matCromo = new THREE.ShaderMaterial({ vertexShader: VERT_CROMO, fragmentShader: FRAG_CROMO, uniforms: this.uCromo })
    this.uEspelho = { uAlfa: { value: 1 }, uVidro: { value: 1 }, uNevoa: { value: 0 }, uEspelho: { value: 0.38 }, uInfla: { value: 0 }, uRevela: { value: 1000 }, uTinta: { value: 0 }, uCorNevoa: { value: this.corNevoa } }
    this.matEspelho = new THREE.ShaderMaterial({ vertexShader: VERT_CROMO, fragmentShader: FRAG_CROMO, uniforms: this.uEspelho, transparent: true, depthWrite: false, side: THREE.DoubleSide })

    // cabide: arame preto com o mesmo reflexo da sala
    this.uCabide = { uAlfa: { value: 1 }, uVidro: { value: 1 }, uNevoa: { value: 0 }, uEspelho: { value: 0 }, uInfla: { value: 0 }, uRevela: { value: 1000 }, uTinta: { value: 1 }, uCorNevoa: { value: this.corNevoa } }
    this.matCabide = new THREE.ShaderMaterial({ vertexShader: VERT_CROMO, fragmentShader: FRAG_CROMO, uniforms: this.uCabide })
    this.geoGancho = geometriaGancho()
    this.geoCabide = geometriaCabide()
    this.geoNo = new THREE.TorusGeometry(R_ARAME * 1.5, R_ARAME * 0.8, 8, 16)
    // sombrinha do gancho na barra: marca o ponto onde ele encosta
    this.geoApoio = new THREE.CylinderGeometry(R_TUBO * 1.06, R_TUBO * 1.06, 0.09, 16, 1, true)
    this.geoApoio.rotateZ(Math.PI / 2)
    this.matApoio = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `varying float vX; void main() { vX = position.x / 0.045; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `varying float vX; void main() { float k = 1.0 - abs(vX); gl_FragColor = vec4(0.03, 0.04, 0.05, k * k * 0.72); }`,
    })
    this.geosCamisa = {}
  }

  montarArara(x, l1, l2, ordem) {
    const g = new THREE.Group()
    g.position.x = x
    const tubo = new THREE.Mesh(this.geoTubo, this.matCromo)
    g.add(tubo)
    for (const lado of [-1, 1]) {
      const pe = new THREE.Mesh(this.geoPe, this.matCromo)
      pe.position.x = (lado * L_BARRA) / 2
      g.add(pe)
    }
    // reflexo fraco no chão: a mesma arara, de cabeça para baixo, sumindo com a distância
    const espelho = new THREE.Group()
    espelho.scale.y = -1
    espelho.add(new THREE.Mesh(this.geoTubo, this.matEspelho))
    for (const lado of [-1, 1]) {
      const pe = new THREE.Mesh(this.geoPe, this.matEspelho)
      pe.position.x = (lado * L_BARRA) / 2
      espelho.add(pe)
    }
    espelho.traverse((o) => (o.renderOrder = 1))
    g.add(espelho)
    // sombra no chão, calculada no shader: é ela que faz a arara parecer apoiada
    const uChao = { uL: { value: L_BARRA }, uX: { value: new Float32Array(ordem.length) }, uW: { value: new Float32Array(ordem.length) } }
    const chao = new THREE.Mesh(
      new THREE.PlaneGeometry(L_BARRA * 1.7, 3.2),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: uChao,
        vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */ `
          varying vec2 vP;
          uniform float uL;
          uniform float uX[${ordem.length}];
          uniform float uW[${ordem.length}];
          float pe(vec2 c) {
            vec2 d = vP - c;
            float r2 = dot(d, d);
            return 1.0 - (1.0 - exp(-r2 / 0.0075) * 0.86) * (1.0 - exp(-r2 / 0.13) * 0.44);
          }
          void main() {
            float faixa = smoothstep(uL * 0.5 + 0.25, uL * 0.5 - 0.1, abs(vP.x)) * exp(-pow((vP.y - 0.1) / 0.3, 2.0)) * 0.16;
            float a = faixa;
            for (int i = 0; i < ${ordem.length}; i++) {
              vec2 d = (vP - vec2(uX[i], 0.2)) / vec2(uW[i] + 0.14, 0.34);
              a = 1.0 - (1.0 - a) * (1.0 - exp(-dot(d, d) * 1.3) * 0.2);
            }
            a = 1.0 - (1.0 - a) * (1.0 - pe(vec2(-uL * 0.5, 0.02))) * (1.0 - pe(vec2(uL * 0.5, 0.02)));
            gl_FragColor = vec4(0.07, 0.09, 0.11, a);
          }`,
      }),
    )
    chao.rotation.x = -Math.PI / 2
    chao.position.y = 0.002
    chao.renderOrder = 0
    g.add(chao)

    const uTit = { map: { value: texturaTitulo(l1, l2) }, uAlfa: { value: 0.72 }, uLuz: { value: 1 }, uVies: { value: 0 }, uNevoa: { value: 0 }, uCorNevoa: { value: this.corNevoa }, uCurva: { value: 0 }, uTempo: { value: 0 }, uFase: { value: 0 }, uLarg: { value: 0 } }
    const titulo = new THREE.Mesh(
      new THREE.PlaneGeometry(3.1, 3.1 * (640 / 2048)),
      new THREE.ShaderMaterial({ vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`, fragmentShader: FRAG_FOTO, uniforms: uTit, transparent: true, depthWrite: false }),
    )
    titulo.position.set(0, Y_BARRA + 0.66, -1.15)
    titulo.renderOrder = 1
    g.add(titulo)

    const camisas = ordem.map((slug, i) => this.criarCamisa(slug, i, g))
    this.cena.add(g)
    return { grupo: g, camisas, sel: null, titulo, uTit, uChao }
  }

  // foto plana da camisa, sem o cabide: em repouso, de perfil, é o que aparece
  criarPlano(info, tex, fase) {
    const W = info.largura * ESC
    const A = info.altura * ESC
    const geo = new THREE.PlaneGeometry(W, A, 2, 8)
    geo.translate(W / 2 - info.haste * W, (ACIMA - info.desce + info.folga) * ESC - A / 2, 0)
    const uComum = { map: { value: tex } }
    const u = { ...uComum, uAlfa: { value: 1 }, uLuz: { value: 1 }, uVies: { value: -0.35 }, uNevoa: { value: 0 }, uCorNevoa: { value: this.corNevoa }, uCurva: { value: 0 }, uTempo: { value: 0 }, uFase: { value: fase }, uLarg: { value: 0 } }
    const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VERT_FOTO, fragmentShader: FRAG_FOTO, uniforms: u, transparent: true, depthWrite: false }))
    mesh.position.z = 0.03
    const uS = { ...uComum, uAlfa: { value: SOMBRA }, uCurva: u.uCurva, uTempo: u.uTempo, uFase: u.uFase, uLarg: u.uLarg }
    const sombra = new THREE.Mesh(geo, new THREE.ShaderMaterial({ vertexShader: VERT_FOTO, fragmentShader: FRAG_SOMBRA, uniforms: uS, transparent: true, depthWrite: false }))
    sombra.position.set(0.012, -0.055, -0.2)
    sombra.renderOrder = 2
    return { mesh, sombra, u, uS }
  }

  // a camisa de volume: as duas fotos projetadas na mesma malha
  criarVolume(inf, tex, fase) {
    const nome = inf.malha
    if (!this.geosCamisa[nome]) this.geosCamisa[nome] = geometriaCamisa(this.malhas[nome])
    const pf = inf.frente.peca
    const pp = inf.perfil.peca
    const k = this.malhas[nome].k
    const Wf = pf.largura * ESC
    const Af = pf.altura * ESC
    const xF = -pf.haste * Wf
    const topoF = (ACIMA - pf.desce + pf.folga) * ESC
    const Wp = pp.largura * ESC
    const Ap = pp.altura * ESC
    const xP = -pp.haste * Wp
    const topoP = (ACIMA - pp.desce + pp.folga) * ESC
    const alfa = ACIMA * ESC * (1 - k)
    const u = {
      tF: { value: tex.frente },
      tP: { value: tex.perfil },
      uMapaF: { value: new THREE.Vector4(-xF / Wf, 1 - topoF / Af, 1 / Wf, 1 / Af) },
      uMapaP: { value: new THREE.Vector4(-xP / Wp, 1 - (topoP - alfa) / Ap, 1 / Wp, k / Ap) },
      uAng: { value: 0 },
      uTorcao: { value: 0 },
      uEscX: { value: 1 },
      uVel: { value: 0 },
      uForma: { value: 0 },
      uTempo: { value: 0 },
      uFase: { value: fase },
      uAlfa: { value: 0 },
      uLuz: { value: 1 },
      uVies: { value: -0.35 },
      uNevoa: { value: 0 },
      uCorNevoa: { value: this.corNevoa },
    }
    const mesh = new THREE.Mesh(this.geosCamisa[nome], new THREE.ShaderMaterial({ vertexShader: VERT_CAMISA, fragmentShader: FRAG_CAMISA, uniforms: u, transparent: true, depthWrite: true }))
    mesh.frustumCulled = false
    return { mesh, u }
  }

  criarCamisa(slug, i, pai) {
    const inf = this.info[slug]
    const tex = this.texturas[slug]
    const fase = i * 1.9 + pai.position.x
    const lado = this.criarPlano(inf.perfil.peca, tex.perfil, fase)
    const sombraF = this.criarPlano(inf.frente.peca, tex.frente, fase)
    const volume = this.criarVolume(inf, tex, fase)
    const corpo = new THREE.Group()
    corpo.position.y = SUBIR
    corpo.add(lado.sombra, sombraF.sombra, lado.mesh, volume.mesh)
    const grupo = new THREE.Group()
    // cabide de verdade: o gancho fica atravessado na barra, o corpo gira com a camisa
    const gancho = new THREE.Mesh(this.geoGancho, this.matCabide)
    gancho.rotation.y = -0.82
    const corpoCabide = new THREE.Group()
    corpoCabide.position.y = SUBIR * 0.5
    corpoCabide.add(new THREE.Mesh(this.geoCabide, this.matCabide))
    const no = new THREE.Mesh(this.geoNo, this.matCabide)
    no.rotation.x = Math.PI / 2
    no.position.y = -0.08
    const apoio = new THREE.Mesh(this.geoApoio, this.matApoio)
    apoio.renderOrder = 1
    grupo.add(gancho, no, corpoCabide, corpo, apoio)
    pai.add(grupo)
    return {
      slug,
      i,
      grupo,
      corpo,
      lado,
      sombraF,
      volume,
      gancho,
      corpoCabide,
      apoio,
      lf: inf.frente.peca.larguraReal * ESC,
      ls: inf.perfil.peca.larguraReal * ESC,
      t: 0,
      alvo: 0,
      x: 0,
      xAlvo: 0,
      ang: 0,
      angV: 0,
      ponta: 0,
      pontaV: 0,
      extra: 0,
      giro: -Math.PI / 2,
      barra: -Math.PI / 2,
      barraV: 0,
      fase,
    }
  }

  montarDesfoque() {
    const f = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, stencilBuffer: false })
    const rt = () => new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, stencilBuffer: false })
    this.rtCena = f
    this.rts = [rt(), rt(), rt()]
    this.camTela = new THREE.Camera()
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2))
    const mat = (frag, u) => new THREE.ShaderMaterial({ vertexShader: VERT_TELA, fragmentShader: frag, uniforms: u, depthTest: false, depthWrite: false })
    this.matDesce = mat(FRAG_DESCE, { tCor: { value: null }, uPasso: { value: new THREE.Vector2() }, uRaio: { value: 1 } })
    this.matSobe = mat(FRAG_SOBE, { tCor: { value: null }, uPasso: { value: new THREE.Vector2() }, uRaio: { value: 1 } })
    this.matJunta = mat(FRAG_JUNTA, { tCena: { value: null }, tBorrado: { value: null }, uMistura: { value: 1 } })
    this.triangulo = new THREE.Mesh(geo, this.matDesce)
    this.triangulo.frustumCulled = false
    this.cenaTela = new THREE.Scene()
    this.cenaTela.add(this.triangulo)
  }

  async montarLogo() {
    const r = await fetch(`${BASE}logo.json`)
    const d = await r.json()
    const estica = 1.24 // letras altas, como na referência
    const caminho = new THREE.ShapePath()
    for (const c of d.comandos) {
      if (c[0] === 'M') caminho.moveTo(c[1], c[2] * estica)
      else if (c[0] === 'L') caminho.lineTo(c[1], c[2] * estica)
      else if (c[0] === 'Q') caminho.quadraticCurveTo(c[1], c[2] * estica, c[3], c[4] * estica)
      else if (c[0] === 'C') caminho.bezierCurveTo(c[1], c[2] * estica, c[3], c[4] * estica, c[5], c[6] * estica)
    }
    const geo = new THREE.ExtrudeGeometry(caminho.toShapes(true), { depth: 0.1, curveSegments: 7, bevelEnabled: true, bevelThickness: 0.022, bevelSize: 0.012, bevelSegments: 3 })
    const lx = d.x1 - d.x0
    geo.translate(-(d.x0 + d.x1) / 2, -((d.y0 + d.y1) / 2) * estica, -0.05)
    geo.computeVertexNormals()
    this.uLogo = { uAlfa: { value: 1 }, uVidro: { value: 0.72 }, uNevoa: { value: 0 }, uEspelho: { value: 0 }, uInfla: { value: 1.25 }, uRevela: { value: -1000 }, uTinta: { value: 0 }, uCorNevoa: { value: this.corNevoa } }
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT_CROMO, fragmentShader: FRAG_CROMO, uniforms: this.uLogo, transparent: true })
    const logo = new THREE.Group()
    const texto = new THREE.Mesh(geo, mat)
    logo.add(texto)
    // as duas bolinhas da marca, acima do início da palavra
    const bola = new THREE.SphereGeometry(0.085, 24, 16)
    for (const dx of [0, 0.2]) {
      const b = new THREE.Mesh(bola, mat)
      b.position.set(-lx / 2 + 0.1 + dx, 0.82, 0)
      logo.add(b)
    }
    this.logo = logo
    this.logoLarg = lx
    this.cenaLogo.add(logo)
  }

  async carregar(pecas, ordens, titulos, inicios) {
    const movel = Math.min(window.innerWidth, window.innerHeight) < 700
    const suf = movel ? '-m' : ''
    const an = Math.min(8, this.renderer.capabilities.getMaxAnisotropy())
    const [info, malhas] = await Promise.all([fetch(`${BASE}camisas/camisas.json`).then((r) => r.json()), fetch(`${BASE}camisas/malhas.json`).then((r) => r.json())])
    this.info = info
    this.malhas = malhas
    let feitos = 0
    const total = pecas.length * 2 + 1
    const avancar = () => this.cb.carregando?.(++feitos / total)
    const tarefas = {}
    for (const p of pecas) {
      tarefas[p.slug] = Promise.all([
        texturaFoto(`${BASE}camisas/${p.slug}-frente-peca${suf}.webp`, an, avancar),
        texturaFoto(`${BASE}camisas/${p.slug}-perfil-peca${suf}.webp`, an, avancar),
      ])
    }
    this.texturas = {}
    for (const p of pecas) {
      const [frente, perfil] = await tarefas[p.slug]
      this.texturas[p.slug] = { frente, perfil }
    }
    const [, , grao] = await Promise.all([
      document.fonts.load('500 196px "Schibsted Grotesk Variable"'),
      this.montarLogo(),
      fetch(`${BASE}sala/grao.webp`).then((r) => r.blob()).then((b) => createImageBitmap(b, { imageOrientation: 'flipY', colorSpaceConversion: 'none' })),
    ])
    const tg = new THREE.Texture(grao)
    tg.flipY = false
    tg.wrapS = tg.wrapT = THREE.RepeatWrapping
    tg.colorSpace = THREE.NoColorSpace
    tg.minFilter = THREE.LinearMipmapLinearFilter
    tg.anisotropy = 4
    tg.needsUpdate = true
    this.uSala.tGrao.value = tg
    avancar()
    this.araras = ordens.map((ordem, i) => ({ ...this.montarArara(X_ARARA[i], titulos[i][0], titulos[i][1], ordem), inicio: inicios[i] }))
    this.redimensionar()
    this.distribuir(0)
    this.distribuir(1)
    for (const a of this.araras) for (const c of a.camisas) c.x = c.xAlvo
    // envia tudo para a placa de vídeo agora: nada de engasgo na primeira vez que a camisa vira
    for (const s of Object.values(this.texturas)) {
      this.renderer.initTexture(s.frente)
      this.renderer.initTexture(s.perfil)
    }
    for (const a of this.araras) for (const c of a.camisas) {
      c.volume.mesh.visible = c.sombraF.sombra.visible = true
      c.lado.mesh.visible = c.lado.sombra.visible = true
    }
    this.renderer.compile(this.cena, this.camera)
    this.renderer.compile(this.cenaLogo, this.camera)
    this.renderer.setRenderTarget(this.rtCena)
    this.renderer.render(this.cena, this.camera)
    this.renderer.setRenderTarget(null)
    this.aoRolar()
    this.p = this.pAlvo
    this.t0Intro = this.tempo
    this.atualizar(0)
    this.desenhar()
    this.pronta = true
    this.rodar()
  }

  // Coloca as camisas na barra: de perfil ficam igualmente espaçadas; quando uma vira de frente, as outras
  // abrem espaço para ela
  distribuir(ia) {
    const a = this.araras[ia]
    if (!a) return
    const cs = a.camisas
    const n = cs.length
    const maior = Math.max(...cs.map((c) => c.lf))
    const media = cs.reduce((soma, c) => soma + c.ls, 0) / n
    const largTela = this.fArara * this.aspecto
    const folga = this.carrossel ? 0.06 : Math.min(0.22, Math.max(0.04, (largTela - 0.2 - maior - media * (n - 1)) / (n - 1)))
    if (a.sel == null) {
      const passo = this.carrossel ? media + 0.3 : (maior + media * (n - 1) + folga * (n - 1) - media) / (n - 1)
      cs.forEach((c, i) => (c.xAlvo = (i - (n - 1) / 2) * passo))
      return
    }
    const larg = cs.map((c) => (c.i === a.sel ? c.lf : c.ls))
    const soma = larg.reduce((t, l) => t + l, 0) + folga * (n - 1)
    let x = -soma / 2
    cs.forEach((c, i) => {
      c.xAlvo = x + larg[i] / 2
      x += larg[i] + folga
    })
  }

  selecionar(i, { avisar = true } = {}) {
    const ia = this.secao
    const a = this.araras[ia]
    if (!a || a.sel === i) return
    if (a.sel != null) a.camisas[a.sel].alvo = 0
    a.sel = i
    if (i != null) a.camisas[i].alvo = 1
    this.distribuir(ia)
    this.proximoPasseio = this.tempo + 5.2
    if (avisar) this.cb.selecao?.(i, a.camisas[i]?.slug)
  }

  definirSecao(s) {
    if (s === this.secao) return
    const antes = this.araras[this.secao]
    if (antes) {
      if (antes.sel != null) antes.camisas[antes.sel].alvo = 0
      antes.sel = null
      this.distribuir(this.secao)
    }
    this.secao = s
    if (this.ativa) this.selecionar(this.carrossel ? 0 : this.araras[s].inicio)
    else this.cb.selecao?.(null, null)
  }

  abrir(i) {
    if (i !== this.aberta) this.giroPeca = { ang: 0, vel: 0, usou: false, t0: this.tempo, pegando: false }
    this.aberta = i
    if (i != null) this.selecionar(i)
    this.canvas.style.cursor = i != null ? 'grab' : ''
  }

  // ---- movimento ----

  aoRolar() {
    const r = this.palco.getBoundingClientRect()
    const fim = r.height - window.innerHeight
    this.pAlvo = limitar(-r.top / Math.max(1, fim))
    this.visivel = r.bottom > 0 && r.top < window.innerHeight
    if (this.visivel) this.rodar()
  }

  redimensionar() {
    const c = this.canvas
    const w = c.clientWidth || 1
    const h = c.clientHeight || 1
    this.w = w
    this.h = h
    this.aspecto = w / h
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = this.aspecto
    this.camera.updateProjectionMatrix()
    const pw = Math.round(w * this.dpr)
    const ph = Math.round(h * this.dpr)
    this.rtCena.setSize(Math.round(pw * 0.72), Math.round(ph * 0.72))
    this.rts.forEach((t, i) => t.setSize(Math.max(2, pw >> (i + 2)), Math.max(2, ph >> (i + 2))))
    this.carrossel = this.aspecto < 1.2
    // desktop: a arara inteira cabe na tela; celular: uma camisa de frente e um pedaço das vizinhas
    this.fArara = this.carrossel ? Math.max(1.86, 1.14 / this.aspecto) : Math.max(2.22, 3.56 / this.aspecto)
    this.distribuir(0)
    this.distribuir(1)
    // onde o logo fica na sala: centralizado na abertura, um pouco à frente da câmera
    if (this.logoLarg) {
      const { logs, ys, hs } = this.poseEntrada()
      const d = Math.exp(logs[0]) / (2 * TAN)
      const cy = ys[0] + hs[0]
      const incl = Math.atan2(hs[0], d)
      const altura = 2 * DIST_LOGO * TAN
      const largura = altura * this.aspecto
      const ar = this.aspecto
      this.logoBase = {
        esc: (largura * (ar > 1.2 ? 0.42 : 0.8)) / this.logoLarg,
        x: 0.3,
        y: cy - Math.sin(incl) * DIST_LOGO + altura * (ar > 1.2 ? 0.014 : 0.03),
        z: d - Math.cos(incl) * DIST_LOGO,
        incl: -incl,
      }
    }
  }

  poseEntrada() {
    const a = this.aspecto
    const fim = this.fArara
    const fs = [Math.max(6.4, 3.9 / a), Math.max(6.2, (L_BARRA + 0.7) / a), Math.max(3.7, 3.4 / a), fim]
    // sobra chão na frente da arara até a câmera chegar perto; no fim a barra fica a 26,5% do topo
    const ys = [fs[0] / 2 - 1.05, fs[1] / 2 - 1.0, fs[2] / 2 - 0.4, Y_BARRA + (this.carrossel ? 0.3 : 0.265) * fim - fim / 2]
    // quanto a câmera está acima do ponto que olha: de cima, o chão aparece e a arara fica apoiada nele
    const hs = [1.25, 1.1, 0.46, 0]
    return { logs: fs.map(Math.log), ys, hs }
  }

  atualizar(dt) {
    this.tempo += dt
    this.p = amortecer(this.p, this.pAlvo, 3.4, dt)
    if (Math.abs(this.p - this.pAlvo) < 0.0002) this.p = this.pAlvo
    const p = this.p
    const u = (this.u = suave(0.035, 0.9, p))
    this.mouseSuave.x = amortecer(this.mouseSuave.x, this.mouse.x, 3.2, dt)
    this.mouseSuave.y = amortecer(this.mouseSuave.y, this.mouse.y, 3.2, dt)

    // troca de seção: anda de uma arara até a outra, abrindo o enquadramento no caminho
    const vaiSecao = this.secao
    const velSecao = 0.36
    this.mixSecao += limitar(vaiSecao - this.mixSecao, -velSecao * dt, velSecao * dt)
    const ms = entraSai(this.mixSecao)
    const arco = Math.sin(Math.PI * ms)
    const xArara = misturar(X_ARARA[0], X_ARARA[1], ms)

    // a câmera acompanha a camisa escolhida no celular
    const ativaA = this.araras[this.secao]
    let alvoPan = 0
    if (ativaA?.sel != null && (this.carrossel || this.aberta != null)) alvoPan = ativaA.camisas[ativaA.sel].xAlvo
    this.panX = amortecer(this.panX, alvoPan, 3, dt)

    const { logs, ys, hs } = this.poseEntrada()
    let logF = curva(logs, u)
    let y = curva(ys, u)
    let alturaCam = curva(hs, u)
    // abertura: a sala se monta com a câmera recuando devagar para o lugar
    this.intro = limitar((this.tempo - (this.t0Intro ?? 0)) / 4.2)
    const chegada = 1 - Math.pow(1 - this.intro, 3)
    logF += (1 - chegada) * 0.2 * (1 - suave(0, 0.2, u))
    alturaCam += (1 - chegada) * 0.5 * (1 - suave(0, 0.2, u))
    const xHeroi = 0.3
    let x = misturar(xHeroi, xArara + (this.carrossel ? this.panX : 0), suave(0, 0.42, u))
    logF += arco * 0.72 * suave(0.5, 1, u)
    y += arco * 0.2 * suave(0.5, 1, u)
    alturaCam += arco * 0.55 * suave(0.5, 1, u)

    // peça aberta: a camisa ocupa o lado esquerdo no desktop e o alto da tela no celular
    this.m = amortecer(this.m, this.aberta != null ? 1 : 0, 2.5, dt)
    if (this.m > 0.0005) {
      const estreito = this.aspecto < 1
      const fp = estreito ? Math.max(2.05, 1.05 / this.aspecto) : 1.3
      const yp = Y_BARRA + (estreito ? 0.09 : 0.075) * fp - fp / 2
      const xp = xArara + this.panX + (estreito ? 0 : (0.5 - 0.3) * fp * this.aspecto)
      const e = this.m
      logF = misturar(logF, Math.log(fp), e)
      y = misturar(y, yp, e)
      x = misturar(x, xp, e)
    }
    const F = Math.exp(logF)
    this.F = F
    const par = (1 - this.m * 0.7) * F
    x += this.mouseSuave.x * 0.022 * par
    y += this.mouseSuave.y * 0.012 * par
    const D = F / (2 * TAN)
    alturaCam *= 1 - this.m
    this.camera.position.set(x, y + alturaCam, D)
    this.camera.lookAt(x, y, 0)

    // névoa e foco
    const nevoa = 0.3 * (1 - suave(0.08, 0.5, u))
    this.uSala.uLeve.value = 1 - suave(0.12, 0.72, u)
    this.uCromo.uNevoa.value = nevoa
    this.uEspelho.uNevoa.value = nevoa
    this.desfoque = Math.max(1 - suave(0.04, 0.5, u), (1 - suave(0.25, 1, this.intro)) * (1 - suave(0, 0.2, u)))

    // ativa: a câmera chegou na arara
    const ativa = u > 0.93
    if (ativa !== this.ativa) {
      this.ativa = ativa
      if (ativa) {
        if (ativaA?.sel == null) this.selecionar(this.carrossel ? 0 : ativaA.inicio)
      } else if (this.aberta == null) {
        this.selecionar(null)
      }
    }

    if (this.quer != null && this.tempo - this.querEm > 0.12) {
      this.selecionar(this.quer)
      this.quer = null
    }

    // passeio sozinho enquanto ninguém mexe
    if (this.ativa && this.aberta == null && ativaA && this.tempo > this.proximoPasseio && this.tempo - this.ultimoUso > 8) {
      const n = ativaA.camisas.length
      this.selecionar(((ativaA.sel ?? -1) + 1) % n)
    }

    for (let ia = 0; ia < this.araras.length; ia++) {
      const a = this.araras[ia]
      const perto = Math.abs(x - X_ARARA[ia]) < F * this.aspecto * 0.5 + L_BARRA * 0.5 + 0.8
      a.grupo.visible = perto
      if (!perto) continue
      const noFoco = ia === this.secao
      a.uTit.uAlfa.value = 0.72 * suave(0.22, 0.56, u) * (1 - this.m)
      a.titulo.visible = a.uTit.uAlfa.value > 0.002
      a.titulo.position.x = this.carrossel && noFoco ? this.panX * 0.9 : 0
      a.uTit.uNevoa.value = nevoa * 0.8
      for (const c of a.camisas) this.atualizarCamisa(c, a, dt, nevoa, noFoco)
    }

    // logo: fica parado na sala, na frente da abertura. A câmera anda e passa por ele
    if (this.logo) {
      const k = 1 - suave(0.1, 0.3, u)
      this.kLogo = 1 - suave(0.05, 0.16, u)
      this.logo.visible = k > 0.003
      if (this.logo.visible) {
        const base = this.logoBase
        const entrada = suave(0.08, 0.5, this.intro)
        this.logo.scale.setScalar(base.esc * (0.97 + 0.03 * entrada))
        this.logo.position.set(base.x, base.y - (1 - entrada) * 0.07, base.z)
        const bal = this.tempo * 0.5
        this.logo.rotation.set(base.incl - this.mouseSuave.y * 0.16 + Math.sin(bal * 0.8) * 0.035, this.mouseSuave.x * 0.26 + Math.sin(bal) * 0.07, 0)
        this.uLogo.uAlfa.value = k
        // as letras aparecem da esquerda para a direita
        const larg = (this.logoLarg * base.esc) / 2 + 0.2
        this.uLogo.uRevela.value = base.x + misturar(-larg, larg, suave(0.1, 0.62, this.intro))
      }
    }

    this.avisarCena()
  }

  atualizarCamisa(c, a, dt, nevoa, noFoco) {
    // o giro passa por uma curva: começa devagar, cruza o meio mais rápido e chega devagar
    const passo = dt / (c.alvo > c.t ? DURACAO_GIRO : DURACAO_GIRO * 0.88)
    c.t += limitar(c.alvo - c.t, -passo, passo)
    const e = entraSai(c.t)
    const escolhida = noFoco && a.sel === c.i

    // além do giro principal: acompanha o mouse na arara; na tela da peça gira de leve sozinha ou com o arraste
    let alvoExtra = 0
    if (escolhida && this.aberta != null) {
      const g = this.giroPeca
      if (!g.pegando) {
        g.ang += g.vel * dt
        g.vel *= Math.exp(-2.6 * dt)
        if (!g.usou) g.ang = Math.sin((this.tempo - g.t0) * 0.62) * 0.4 * suave(0.5, 2.2, this.tempo - g.t0)
      }
      g.ang = limitar(g.ang, -1.5, 1.5)
      alvoExtra = g.ang
    } else if (escolhida && !this.carrossel && this.mouseNaArara != null) {
      alvoExtra = limitar((this.mouseNaArara - c.x) / (c.lf * 0.5), -1, 1) * 0.34
    } else if (escolhida) {
      alvoExtra = Math.sin(this.tempo * 0.6 + c.fase) * 0.09
    }
    c.extra = amortecer(c.extra, alvoExtra, 5, dt)
    const giroAntes = c.giro
    c.giro = -(Math.PI / 2) * (1 - e) + c.extra * e
    const velGiro = dt > 0 ? Math.abs(c.giro - giroAntes) / dt : 0

    // a barra da camisa segue os ombros com atraso e passa um pouco do ponto
    const puxa = -30 * (c.barra - c.giro) - 6.2 * c.barraV
    c.barraV += puxa * dt
    c.barra += c.barraV * dt
    const torcao = limitar(c.barra - c.giro, -0.7, 0.7)

    // deslocamento na barra: quem é empurrado balança um pouco
    const xAntes = c.x
    c.x = amortecer(c.x, c.xAlvo, 3.6, dt)
    const vel = dt > 0 ? (c.x - xAntes) / dt : 0
    const forca = -40 * c.ang - 3.4 * c.angV - vel * 1.5
    c.angV += forca * dt
    c.ang += c.angV * dt
    // balanço para a frente e para trás em volta da barra quando a camisa gira
    const forcaP = -26 * c.ponta - 2.6 * c.pontaV + velGiro * 0.05
    c.pontaV += forcaP * dt
    c.ponta += c.pontaV * dt
    const brisa = Math.sin(this.tempo * 0.74 + c.fase) * 0.0055

    const g = c.grupo
    g.position.set(c.x, Y_BARRA, 0)
    g.rotation.z = c.ang + brisa
    g.rotation.x = c.ponta + Math.sin(this.tempo * 0.53 + c.fase * 1.7) * 0.004

    a.uChao.uX.value[c.i] = c.x
    a.uChao.uW.value[c.i] = misturar(c.ls, c.lf, e) * 0.5

    // no início a malha está achatada no eixo da visão: é igual à foto de perfil e ganha volume ao começar a girar
    const escX = misturar(0.03, 1, suave(0, 0.26, c.t))
    c.corpoCabide.rotation.y = c.giro
    c.corpoCabide.scale.x = escX

    const v = c.volume
    const l = c.lado
    const sf = c.sombraF
    const av = suave(0, 0.035, c.t)
    const al = 1 - suave(0.015, 0.06, c.t)
    v.mesh.visible = av > 0.002
    l.mesh.visible = al > 0.002
    l.sombra.visible = c.t < 0.5
    sf.sombra.visible = c.t > 0.5
    sf.sombra.rotation.y = c.giro
    l.sombra.rotation.y = c.giro + Math.PI / 2

    // peça aberta: as outras ficam na penumbra e desfocadas
    const alvoOutra = this.aberta != null && noFoco && a.sel !== c.i ? 1 : 0
    c.dim = amortecer(c.dim ?? 0, alvoOutra, 5, dt)
    const luz = 1 - c.dim * 0.42
    const vies = -0.35 + c.dim * 2.6
    const uv = v.u
    uv.uAng.value = c.giro
    uv.uTorcao.value = torcao
    uv.uEscX.value = escX
    uv.uVel.value = limitar(velGiro / 2.4)
    uv.uForma.value = Math.max(Math.pow(Math.sin(e * Math.PI), 0.8), Math.min(1, Math.abs(c.extra) * 1.5) * e)
    uv.uTempo.value = this.tempo
    uv.uAlfa.value = av * (1 - c.dim * 0.3)
    uv.uLuz.value = luz
    uv.uVies.value = vies
    uv.uNevoa.value = nevoa
    l.u.uLuz.value = luz
    l.u.uVies.value = vies
    l.u.uAlfa.value = al * (1 - c.dim * 0.3)
    l.u.uNevoa.value = nevoa
    l.u.uTempo.value = this.tempo
    l.uS.uAlfa.value = SOMBRA * (1 - suave(0, 0.3, c.t)) * (1 - c.dim)
    sf.uS.uAlfa.value = SOMBRA * suave(0.7, 1, c.t) * (1 - c.dim)

    // ordem de desenho: a que está virando fica por cima
    const ordem = 3 + (a.sel === c.i ? 10 : 0) + e
    v.mesh.renderOrder = ordem + 0.1
    l.mesh.renderOrder = ordem
  }

  avisarCena() {
    const a = this.araras[this.secao]
    let ex = 0
    let ey = 0
    let tem = false
    if (a?.sel != null) {
      const c = a.camisas[a.sel]
      tem = true
      const pf = this.info[c.slug].frente.peca
      const baixo = (pf.desce + pf.alturaReal - ACIMA) * ESC - SUBIR
      this.v.set(a.grupo.position.x + c.x, Y_BARRA - baixo, 0.05).project(this.camera)
      ex = ((this.v.x + 1) / 2) * this.w
      ey = ((1 - this.v.y) / 2) * this.h
    }
    this.cb.cena?.({ p: this.p, u: this.u, m: this.m, ex, ey, tem, ativa: this.ativa, logo: this.kLogo ?? 1, secaoMix: this.mixSecao })
  }

  // ---- desenho ----

  passe(mat, destino, origem, raio) {
    const r = this.renderer
    mat.uniforms.tCor.value = origem.texture
    mat.uniforms.uPasso.value.set(0.5 / origem.width, 0.5 / origem.height)
    mat.uniforms.uRaio.value = raio
    this.triangulo.material = mat
    r.setRenderTarget(destino)
    r.render(this.cenaTela, this.camTela)
  }

  desenhar() {
    const r = this.renderer
    const b = this.desfoque ?? 1
    if (b > 0.004) {
      r.setRenderTarget(this.rtCena)
      r.clear()
      r.render(this.cena, this.camera)
      const raio = 0.5 + b * 1.9
      const [a1, a2, a3] = this.rts
      this.passe(this.matDesce, a1, this.rtCena, raio)
      this.passe(this.matDesce, a2, a1, raio)
      this.passe(this.matDesce, a3, a2, raio)
      this.passe(this.matSobe, a2, a3, raio)
      this.passe(this.matSobe, a1, a2, raio)
      this.matJunta.uniforms.tCena.value = this.rtCena.texture
      this.matJunta.uniforms.tBorrado.value = a1.texture
      this.matJunta.uniforms.uMistura.value = suave(0, 0.4, b)
      this.triangulo.material = this.matJunta
      r.setRenderTarget(null)
      r.clear()
      r.render(this.cenaTela, this.camTela)
    } else {
      r.setRenderTarget(null)
      r.clear()
      r.render(this.cena, this.camera)
    }
    if (this.logo?.visible) {
      r.clearDepth()
      r.render(this.cenaLogo, this.camera)
    }
  }

  rodar() {
    if (this.rodando || !this.vivo || !this.pronta) return // a rolagem pode chamar isto antes de a sala carregar
    this.rodando = true
    this.ultimo = performance.now()
    requestAnimationFrame(this.quadro)
  }

  quadro(agora) {
    if (!this.vivo) return
    if (!this.visivel || document.hidden) {
      this.rodando = false
      return
    }
    const dt = Math.min(0.05, Math.max(0, (agora - this.ultimo) / 1000))
    this.ultimo = agora
    this.atualizar(dt)
    this.desenhar()
    requestAnimationFrame(this.quadro)
  }

  // ---- ponteiro ----

  // qual camisa está sob o ponto da tela (coordenadas do canvas)
  camisaEm(px, py) {
    const a = this.araras[this.secao]
    if (!a || !this.ativa || !this.F) return null
    const o = this.camera.position
    this.v.set((px / this.w) * 2 - 1, 1 - (py / this.h) * 2, 0.5).unproject(this.camera)
    const t = o.z / (o.z - this.v.z)
    const wx = o.x + (this.v.x - o.x) * t
    const wy = o.y + (this.v.y - o.y) * t
    if (wy > Y_BARRA + 0.08 || wy < Y_BARRA - 1.12) return null
    const lx = wx - a.grupo.position.x
    this.xNaArara = lx
    let melhor = null
    let dist = Infinity
    for (const c of a.camisas) {
      // a escolhida ganha vantagem: o mouse não fica trocando de camisa perto da borda dela
      let d = Math.abs(lx - c.x)
      if (a.sel === c.i) d -= c.lf * 0.28
      if (d < dist) {
        dist = d
        melhor = c
      }
    }
    return melhor
  }

  ligarEventos() {
    const c = this.canvas
    this.ao = {
      rolar: this.aoRolar,
      tamanho: () => {
        this.redimensionar()
        this.aoRolar()
      },
      visib: () => {
        if (!document.hidden && this.visivel) this.rodar()
      },
      mover: (e) => {
        const r = c.getBoundingClientRect()
        const px = e.clientX - r.left
        const py = e.clientY - r.top
        const g = this.giroPeca
        if (this.aberta != null && g?.pegando) {
          const dx = e.clientX - g.x
          g.x = e.clientX
          g.ang += dx * 0.0085
          const agora = performance.now()
          g.vel = (dx * 0.0085) / Math.max(0.008, (agora - g.em) / 1000)
          g.em = agora
          return
        }
        if (e.pointerType === 'mouse') {
          this.mouse.set((px / r.width) * 2 - 1, -((py / r.height) * 2 - 1))
          if (this.aberta == null) {
            const q = this.camisaEm(px, py)
            this.mouseNaArara = q ? this.xNaArara : null
            if (q && !this.usou) {
              this.usou = true
              this.cb.usou?.()
            }
            c.style.cursor = q ? 'pointer' : ''
            if (q) {
              this.ultimoUso = this.tempo
              if (this.quer !== q.i) {
                this.quer = q.i
                this.querEm = this.tempo
              }
            } else {
              this.quer = null
            }
          }
          return
        }
        const t = this.toque
        if (t.id !== e.pointerId) return
        const dx = e.clientX - t.x
        if (Math.abs(dx) > 8) t.moveu = true
        if (this.carrossel && this.ativa && this.aberta == null && Math.abs(e.clientX - t.ancora) > 72) {
          const a = this.araras[this.secao]
          const n = a.camisas.length
          const ir = e.clientX < t.ancora ? 1 : -1
          this.selecionar(limitar((a.sel ?? 0) + ir, 0, n - 1))
          t.ancora = e.clientX
          this.ultimoUso = this.tempo
        }
      },
      baixar: (e) => {
        if (this.aberta != null) {
          const g = this.giroPeca
          g.pegando = true
          g.usou = true
          g.x = e.clientX
          g.vel = 0
          g.em = performance.now()
          c.style.cursor = 'grabbing'
          c.setPointerCapture?.(e.pointerId)
          return
        }
        if (e.pointerType === 'mouse') return
        this.toque = { id: e.pointerId, x: e.clientX, y: e.clientY, moveu: false, ancora: e.clientX }
      },
      subir: (e) => {
        if (this.giroPeca?.pegando) {
          this.giroPeca.pegando = false
          if (performance.now() - this.giroPeca.em > 90) this.giroPeca.vel = 0
          this.giroPeca.vel = limitar(this.giroPeca.vel, -3, 3)
          c.style.cursor = 'grab'
          return
        }
        if (e.pointerType === 'mouse' || this.toque.id !== e.pointerId) return
        const t = this.toque
        this.toque = { id: null }
        if (t.moveu || Math.abs(e.clientY - t.y) > 10 || this.aberta != null) return
        const r = c.getBoundingClientRect()
        const q = this.camisaEm(e.clientX - r.left, e.clientY - r.top)
        if (!q) return
        this.ultimoUso = this.tempo
        const a = this.araras[this.secao]
        if (a.sel === q.i) this.cb.abrir?.(q.i)
        else this.selecionar(q.i)
      },
      clicar: (e) => {
        if (e.pointerType && e.pointerType !== 'mouse') return
        const r = c.getBoundingClientRect()
        const q = this.camisaEm(e.clientX - r.left, e.clientY - r.top)
        if (q && this.aberta == null) this.cb.abrir?.(q.i)
      },
    }
    window.addEventListener('scroll', this.ao.rolar, { passive: true })
    window.addEventListener('resize', this.ao.tamanho)
    document.addEventListener('visibilitychange', this.ao.visib)
    c.addEventListener('pointermove', this.ao.mover)
    c.addEventListener('pointerdown', this.ao.baixar)
    c.addEventListener('pointerup', this.ao.subir)
    c.addEventListener('pointercancel', this.ao.subir)
    c.addEventListener('pointerleave', () => (this.mouseNaArara = null))
    c.addEventListener('click', this.ao.clicar)
    this.obs = new ResizeObserver(this.ao.tamanho)
    this.obs.observe(c)
  }

  destruir() {
    this.vivo = false
    window.removeEventListener('scroll', this.ao.rolar)
    window.removeEventListener('resize', this.ao.tamanho)
    document.removeEventListener('visibilitychange', this.ao.visib)
    this.obs.disconnect()
    this.renderer.dispose()
  }
}
