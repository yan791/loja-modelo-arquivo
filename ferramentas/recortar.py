# Recorta as camisas e prepara para a arara do site.
#
# Lê as imagens de material/camisas (a mesma camisa de frente e de perfil, num cabide, sobre cinza liso). Para cada uma:
#   1. fundo: ajusta o gradiente leve do cinza e tira tudo que está ligado à borda, mais os vãos fechados
#      (triângulo do cabide). Por cor, para não perder a haste fina do gancho
#   2. separa as vistas pelo vão vazio no meio da imagem
#   3. bordas: estima a cor verdadeira dos pixels semitransparentes e espalha para fora do recorte, para a
#      filtragem da GPU não puxar o cinza do fundo
#   4. folga transparente em volta (a sombra borrada precisa de espaço) e grava site/public/camisas/<slug>-<vista>.webp
#      e <slug>-<vista>-m.webp (celular)
#   5. camisas.json: tamanho, onde fica a haste do gancho e onde termina o gancho em cada vista
#
# python -P ferramentas/recortar.py
import json
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage as ndi

raiz = Path(__file__).resolve().parent.parent
entrada = raiz / 'material' / 'camisas'
saida = raiz / 'site' / 'public' / 'camisas'
saida.mkdir(parents=True, exist_ok=True)

# parte do nome do arquivo -> slug em src/dados/loja.js
ARQUIVOS = {'Chamas': 'chama', 'rosa e roxa': 'acida', 'Tribal': 'tribal', 'Polo': 'jogo', 'Listrada': 'listra'}
FOLGA = 48  # px transparentes em volta, na escala original
LIMIAR = 16  # distância de cor até o fundo
ESC = 1 / 950  # pixel da foto para unidade da cena (igual a Sala.js)
ACIMA = 24  # px entre o topo do gancho e o centro da barra (igual a Sala.js)
RAIO_CABIDE = {'frente': 11, 'perfil': 19}
malhas = {}


def fundo_ajustado(arr):
    # o fundo tem um gradiente leve: polinômio de grau 2 nos pixels de borda
    h, w, _ = arr.shape
    yy, xx = np.mgrid[0:h, 0:w]
    x, y = xx / w - 0.5, yy / h - 0.5
    m = 12
    borda = np.zeros((h, w), bool)
    borda[:m] = borda[-m:] = True
    borda[:, :m] = borda[:, -m:] = True
    base = np.median(arr[borda], axis=0)
    usar = borda & (np.abs(arr - base).sum(axis=2) < 40)
    A = lambda a, b: np.stack([np.ones_like(a), a, b, a * a, b * b, a * b], axis=-1)
    fundo = np.zeros_like(arr)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A(x[usar], y[usar]), arr[..., c][usar], rcond=None)
        fundo[..., c] = A(x, y) @ coef
    return fundo


def alfa_por_fundo(arr, fundo):
    dist = np.sqrt(((arr - fundo) ** 2).sum(axis=2))
    perto = dist < LIMIAR
    rot, n = ndi.label(perto)
    ids_borda = set(np.unique(np.r_[rot[0], rot[-1], rot[:, 0], rot[:, -1]])) - {0}
    eh_fundo = np.isin(rot, list(ids_borda))
    tam = ndi.sum(perto, rot, range(1, n + 1))
    medias = ndi.mean(dist, rot, range(1, n + 1))
    # vãos fechados grandes e bem iguais ao fundo; manchas parecidas dentro da estampa são pequenas ou menos parecidas
    vaos = [i + 1 for i, (t, d) in enumerate(zip(tam, medias)) if i + 1 not in ids_borda and t > 120 and d < 9]
    eh_fundo |= np.isin(rot, vaos)
    # só o que sobrou ligado à maior peça: pontinhos soltos no fundo saem
    return np.clip(1 - ndi.gaussian_filter(eh_fundo.astype(np.float32), 0.7), 0, 1)


def limpar_borda(rgb, alfa):
    from pymatting import estimate_foreground_ml

    cor = estimate_foreground_ml(rgb.astype(np.float64) / 255, alfa.astype(np.float64)).astype(np.float32)
    cheio = Image.fromarray((np.clip(cor, 0, 1) * 255).astype(np.uint8))
    cheio = cheio.filter(ImageFilter.UnsharpMask(radius=1.2, percent=45, threshold=2))
    dentro = alfa > 0.5
    mascara = Image.fromarray(dentro.astype(np.uint8) * 255)
    borrado = np.asarray(cheio).astype(np.float32)
    for raio in (2, 6, 16, 40):
        bn = np.asarray(cheio.filter(ImageFilter.GaussianBlur(raio))).astype(np.float32)
        mn = np.asarray(mascara.filter(ImageFilter.GaussianBlur(raio))).astype(np.float32)[..., None] / 255
        media = np.where(mn > 0.02, bn / np.maximum(mn, 1e-3), 0)
        # espalha a cor de dentro para fora, do raio pequeno para o grande
        fora = (~dentro)[..., None] & (mn > 0.02)
        borrado = np.where(fora, np.clip(media, 0, 255), borrado)
        dentro = dentro | (mn[..., 0] > 0.02)
    original = alfa > 0.5
    return np.where(original[..., None], np.asarray(cheio).astype(np.float32), borrado).astype(np.uint8)


def medir_gancho(solido, topo):
    # haste do gancho: mediana do centro nas linhas onde ele é só um fio, antes dos ombros do cabide
    larguras = solido.sum(axis=1)
    centros = []
    for y in range(topo + 2, min(topo + 200, solido.shape[0])):
        xs = np.where(solido[y])[0]
        if len(xs) and xs.max() - xs.min() < 26:
            centros.append((xs.max() + xs.min()) / 2)
    haste = float(np.median(centros)) if centros else float(np.where(solido[topo + 4])[0].mean())
    # corpo: primeira linha bem mais larga que o cabide
    limite = 0.5 * np.percentile(larguras[larguras > 0], 90)
    corpo = int(np.argmax(larguras > limite))
    return haste, corpo


def sem_cabide(alfa, raio):
    # abertura morfológica: tudo mais fino que o raio (gancho, arame, bloco do cabide) some; a camisa fica.
    # Só vale no alto da peça: mais abaixo a imagem continua igual, sem arredondar punhos e barra
    solido = alfa > 0.5
    miolo = ndi.distance_transform_edt(solido) > raio
    aberto = ndi.distance_transform_edt(~miolo) <= raio + 0.5
    rot, n = ndi.label(aberto)
    aberto = rot == (np.argmax(ndi.sum(aberto, rot, range(1, n + 1))) + 1)
    linhas = np.where(aberto.any(axis=1))[0]
    limite = linhas.min() + 70
    volta = ndi.distance_transform_edt(~aberto) <= 2.5
    m = np.clip(ndi.gaussian_filter(volta.astype(np.float32), 0.7) * 1.15, 0, 1)
    m[limite:] = (ndi.distance_transform_edt(~aberto) <= raio * 1.6)[limite:]
    return alfa * m


def malha(frente, perfil):
    # Volume da camisa: cada linha da foto de frente vira uma fatia, com a profundidade tirada da foto de perfil.
    # A borda da peça fecha arredondada e o miolo fica achatado, como uma camisa vazia num cabide
    af, hf, df = frente
    ap, hp, dp = perfil
    sf = af > 0.5
    sp = ap > 0.5
    H, W = sf.shape
    k = (dp + ap.shape[0]) / (df + H)  # a barra da frente coincide com a barra do perfil
    z_f = np.zeros(H)
    z_b = np.zeros(H)
    for r in range(H):
        rs = int(np.clip(round((df + r) * k - dp), 0, ap.shape[0] - 1))
        xs = np.where(sp[rs])[0]
        while not len(xs) and rs < ap.shape[0] - 1:
            rs += 1
            xs = np.where(sp[rs])[0]
        z_f[r] = (hp - xs.min()) * ESC
        z_b[r] = (hp - xs.max()) * ESC
    z_f = np.maximum(ndi.gaussian_filter1d(z_f, 12), 0.02)
    z_b = np.minimum(ndi.gaussian_filter1d(z_b, 12), -0.02)
    d = np.zeros(sf.shape, np.float32)
    for r in range(H):
        xs = np.where(sf[r])[0]
        if not len(xs):
            continue
        for run in np.split(xs, np.where(np.diff(xs) > 1)[0] + 1):
            d[r, run] = np.minimum(run - run[0], run[-1] - run) + 0.5
    S = np.sqrt(1 - (1 - np.clip(d / 118, 0, 1)) ** 2.3)
    S = S / np.maximum(S.max(axis=1, keepdims=True), 0.2)
    S = ndi.gaussian_filter1d(S, 7, axis=0) * (d > 0)
    # ombros inclinados: fecha a borda pela distância real até a silhueta, para não formar degraus na malha.
    # A barra fica de fora (as linhas de baixo são repetidas antes de medir), porque ali a camisa é aberta
    prolongado = np.vstack([sf, np.repeat(sf[-1:], 80, axis=0)])
    d2 = ndi.distance_transform_edt(prolongado)[:H]
    S = np.minimum(S, np.sqrt(1 - (1 - np.clip(d2 / 40, 0, 1)) ** 2))
    NX, NY, MARGEM = 58, 80, 6
    gx = np.linspace(-MARGEM, W - 1 + MARGEM, NX)
    gy = np.linspace(-MARGEM, H - 1 + MARGEM, NY)
    # vértices fora da camisa são puxados para o ponto mais próximo do contorno
    contorno = af > 0.15
    dist_fora, (iy, ix) = ndi.distance_transform_edt(~contorno, return_indices=True)
    passo = max(gx[1] - gx[0], gy[1] - gy[0])
    borda = dist_fora <= passo * 1.5
    deslocados = []
    zf, zb = [], []
    celulas = []
    for j, y in enumerate(gy):
        r = int(np.clip(round(y), 0, H - 1))
        zc = (z_f[r] + z_b[r]) / 2
        for i, x in enumerate(gx):
            c = int(np.clip(round(x), 0, W - 1))
            s = float(S[r, c]) if (-1 < x < W and -1 < y < H) else 0.0
            if not contorno[r, c] and dist_fora[r, c] <= passo * 1.5:
                # gy cresce para baixo; na cena o y cresce para cima
                deslocados += [j * NX + i, round((ix[r, c] - x) * 10), round((y - iy[r, c]) * 10)]
                s = 0.0
            zf.append(round((zc + (z_f[r] - zc) * s) * 1000))
            zb.append(round((zc - (zc - z_b[r]) * s) * 1000))
    for j in range(NY - 1):
        r0, r1 = int(np.clip(gy[j], 0, H - 1)), int(np.clip(gy[j + 1], 0, H - 1))
        for i in range(NX - 1):
            c0, c1 = int(np.clip(gx[i], 0, W - 1)), int(np.clip(gx[i + 1], 0, W - 1))
            celulas.append('1' if borda[r0:r1 + 1, c0:c1 + 1].any() else '0')
    return {
        'nx': NX,
        'ny': NY,
        'x0': round((gx[0] - hf) * ESC, 5),
        'dx': round((gx[1] - gx[0]) * ESC, 5),
        'y0': round((ACIMA - (df + gy[0])) * ESC, 5),
        'dy': round((gy[1] - gy[0]) * ESC, 5),
        'k': round(k, 5),
        'zf': zf,
        'zb': zb,
        'borda': deslocados,
        'm': ''.join(celulas),
    }


def gravar(rgba, slug, vista):
    h, w, _ = rgba.shape
    tela = np.zeros((h + FOLGA * 2, w + FOLGA * 2, 4), np.uint8)
    # a cor da borda continua pela folga, só o alfa é zero
    borda = np.pad(rgba[..., :3], ((FOLGA, FOLGA), (FOLGA, FOLGA), (0, 0)), mode='edge')
    tela[..., :3] = borda
    tela[FOLGA:-FOLGA, FOLGA:-FOLGA, 3] = rgba[..., 3]
    img = Image.fromarray(tela, 'RGBA')
    bytes_ = {}
    for sufixo, escala in (('', 1), ('-m', 0.62)):
        i = img if escala == 1 else img.resize((round(img.width * escala), round(img.height * escala)), Image.LANCZOS)
        arq = saida / f'{slug}-{vista}{sufixo}.webp'
        i.save(arq, quality=90, method=6, exact=True, alpha_quality=95)
        bytes_[sufixo or 'g'] = arq.stat().st_size
    return img.size, bytes_


info = {}
for caminho in sorted(entrada.glob('*.png')):
    slug = next((s for k, s in ARQUIVOS.items() if k in caminho.name), None)
    if not slug:
        print('ignorado:', caminho.name)
        continue
    arr = np.asarray(Image.open(caminho).convert('RGB')).astype(np.float32)
    alfa = alfa_por_fundo(arr, fundo_ajustado(arr))
    solido = alfa > 0.5
    # tira ilhas pequenas (ruído do fundo), mantendo o gancho, que é ligado ao corpo
    rot, n = ndi.label(solido, structure=np.ones((3, 3)))
    if n > 2:
        tam = ndi.sum(solido, rot, range(1, n + 1))
        solto = np.isin(rot, [i + 1 for i, t in enumerate(tam) if t < 400])
        alfa = np.where(solto, 0, alfa)
        solido = alfa > 0.5
    rgb = limpar_borda(arr, alfa)
    vazias, nv = ndi.label(~solido.any(axis=0))
    vaos = [np.where(vazias == i)[0] for i in range(1, nv + 1)]
    vaos = [v for v in vaos if v[0] > 0 and v[-1] < arr.shape[1] - 1]
    corte = int(np.median(max(vaos, key=len)))
    reg = {}
    recortes = {}
    total = 0
    for vista, (x0, x1) in {'frente': (0, corte), 'perfil': (corte, arr.shape[1])}.items():
        s = solido[:, x0:x1]
        ys, xs = np.where(s)
        topo, base, esq, dir_ = ys.min(), ys.max(), xs.min(), xs.max()
        haste, corpo = medir_gancho(s, topo)
        cx0, cx1 = x0 + esq, x0 + dir_ + 1
        rgba = np.dstack([rgb[topo:base + 1, cx0:cx1], (alfa[topo:base + 1, cx0:cx1] * 255).astype(np.uint8)])
        (l, a), bytes_ = gravar(rgba, slug, vista)
        total += bytes_['g']
        reg[vista] = {
            'largura': l,
            'altura': a,
            'folga': FOLGA,
            'haste': round((haste - esq + FOLGA) / l, 4),  # fração da largura
            'corpo': round((corpo - topo) / (base - topo), 4),  # fração da altura sem folga
            'alturaReal': int(base - topo + 1),
            'larguraReal': int(dir_ - esq + 1),
        }
        if vista == 'frente':
            # onde desenhar as linhas de medida: corpo da camisa sem as mangas, em fração da imagem gravada
            c = s[topo:base + 1, esq:dir_ + 1]
            y_peito = int(c.shape[0] * 0.62)
            xs_linha = np.where(c[y_peito])[0]
            meio = int(haste - esq)
            trechos = np.split(xs_linha, np.where(np.diff(xs_linha) > 1)[0] + 1)
            corpo_x = min(trechos, key=lambda t: 0 if t[0] <= meio <= t[-1] else abs(t[0] - meio))
            y_gola = int(corpo)
            ys_fim = np.where(c[:, min(meio + 40, c.shape[1] - 1)])[0]
            reg[vista]['medida'] = {
                'esq': round((int(corpo_x[0]) + FOLGA) / l, 4),
                'dir': round((int(corpo_x[-1]) + FOLGA) / l, 4),
                'y': round((y_peito + FOLGA) / a, 4),
                'gola': round((y_gola + FOLGA) / a, 4),
                'barra': round((int(ys_fim.max()) + FOLGA) / a, 4),
            }
        # a mesma camisa sem o cabide da foto: na cena 3D o cabide é um objeto de verdade
        a_peca = sem_cabide(alfa[:, x0:x1], RAIO_CABIDE[vista])
        sp = a_peca > 0.5
        ys2, xs2 = np.where(sp)
        t2, b2, e2, d2 = ys2.min(), ys2.max(), xs2.min(), xs2.max()
        recorte_alfa = a_peca[t2:b2 + 1, e2:d2 + 1]
        rgba2 = np.dstack([rgb[t2:b2 + 1, x0 + e2:x0 + d2 + 1], (recorte_alfa * 255).astype(np.uint8)])
        (l2, a2), _ = gravar(rgba2, slug, f'{vista}-peca')
        reg[vista]['peca'] = {
            'largura': l2,
            'altura': a2,
            'folga': FOLGA,
            'haste': round((haste - e2 + FOLGA) / l2, 4),
            'desce': int(t2 - topo),  # px do topo do gancho até o topo da camisa
            'alturaReal': int(b2 - t2 + 1),
            'larguraReal': int(d2 - e2 + 1),
        }
        recortes[vista] = (recorte_alfa, haste - e2, int(t2 - topo))
    info[slug] = reg
    reg['malha'] = slug
    malhas[slug] = malha(recortes['frente'], recortes['perfil'])
    print(f"{slug}: frente {reg['frente']['larguraReal']}x{reg['frente']['alturaReal']}, perfil {reg['perfil']['larguraReal']}x{reg['perfil']['alturaReal']}, {total // 1024} KB")
(saida / 'camisas.json').write_text(json.dumps(info, indent=1), encoding='utf-8')
(saida / 'malhas.json').write_text(json.dumps(malhas, separators=(',', ':')), encoding='utf-8')
