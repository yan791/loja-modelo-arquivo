# Cria variações de cor a partir dos recortes (rode depois de recortar.py). A arara da referência tem 10 peças e
# temos 5 fotos: mudar a cor dá 5 peças novas sem gerar imagem nenhuma. Gancho, cabide e partes sem cor não mudam.
# python -P ferramentas/variantes.py
import json
from pathlib import Path
import numpy as np
from PIL import Image

saida = Path(__file__).resolve().parent.parent / 'site' / 'public' / 'camisas'


def rampa(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def girar(graus, min_sat, sat=1.0, luz=1.0):
    def f(rgba):
        rgb = Image.fromarray(rgba[..., :3], 'RGB')
        hsv = np.asarray(rgb.convert('HSV')).astype(np.float32)
        s = hsv[..., 1] / 255
        h2 = hsv.copy()
        h2[..., 0] = (hsv[..., 0] + graus / 360 * 256) % 256
        h2[..., 1] = np.clip(hsv[..., 1] * sat, 0, 255)
        h2[..., 2] = np.clip(hsv[..., 2] * luz, 0, 255)
        novo = np.asarray(Image.fromarray(h2.astype(np.uint8), 'HSV').convert('RGB')).astype(np.float32)
        m = rampa(min_sat - 0.07, min_sat + 0.07, s)[..., None]
        return (rgba[..., :3] * (1 - m) + novo * m).astype(np.uint8)
    return f


def tingir(r, g, b):
    def f(rgba):
        return np.clip(rgba[..., :3] * np.array([r, g, b]), 0, 255).astype(np.uint8)
    return f


VARIANTES = {
    'chama-gelo': ('chama', girar(192, 0.28)),
    'acida-mar': ('acida', girar(-158, 0.16, sat=0.92, luz=1.08)),
    'tribal-salvia': ('tribal', tingir(0.70, 0.79, 0.68)),
    'jogo-rubro': ('jogo', girar(132, 0.36, sat=0.92)),
    'listra-marinho': ('listra', girar(-128, 0.4)),
}

info = json.loads((saida / 'camisas.json').read_text(encoding='utf-8'))
for nome, (base, op) in VARIANTES.items():
    for vista in ('frente', 'perfil'):
        for suf in ('', '-m', '-peca', '-peca-m'):
            img = np.asarray(Image.open(saida / f'{base}-{vista}{suf}.webp').convert('RGBA'))
            rgb = op(img)
            Image.fromarray(np.dstack([rgb, img[..., 3]]), 'RGBA').save(saida / f'{nome}-{vista}{suf}.webp', quality=90, method=6, exact=True, alpha_quality=95)
    info[nome] = info[base]
    print(nome, 'ok')
(saida / 'camisas.json').write_text(json.dumps(info, indent=1), encoding='utf-8')
