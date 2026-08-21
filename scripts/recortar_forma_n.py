#!/usr/bin/env python3
"""
Recorta el dibujo de la forma "N" de guía, la que le faltaba a la lámina.

    python3 scripts/recortar_forma_n.py

Se corre A MANO, como `recortar_formas_ryc.py`. La salida
(webapp/frontend/public/formas/N.png) se commitea.

POR QUÉ ESTE SCRIPT APARTE. Las nueve formas de cuerpo (A, B, C, E, F, G, L, M,
P) salen de la lámina del catálogo RYC. La "N" es de Indy y de Nubo y en esa
lámina no está: siete guías del catálogo la usaban y se mostraban sin dibujo.
La referencia del catálogo NUBO 2025 (pestaña "REF" del Excel, guardada en
CRAC/tecnicos/fuentes/nubo_formas.jpg) sí la trae, así que la N sale de ahí y
solo la N — las otras nueve se quedan como están, que es lo que pidió el dueño.

EL ESTILO SE EMPAREJA. La lámina de Nubo está dibujada con sombreado, en gris, y
las nueve de RYC son línea pura. Puesto tal cual al lado de las otras, el
sombreado canta. Lo que se guarda es el CONTORNO: el dibujo tiene la línea casi
negra y el relleno en grises claros, así que alcanza con cortar la rampa de
transparencia bien abajo (`CLARO`) para quedarse con el contorno y la letra y
tirar el sombreado. Queda una N de línea, igual que las otras nueve.
"""
import os
import sys

import numpy as np
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAMINA = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes", "nubo_formas.jpg")
SALIDA = os.path.join(RAIZ, "webapp", "frontend", "public", "formas", "N.png")

# La caja de la N sobre la lámina de 996×694: fila de abajo, tercera figura.
# Medida a mano una vez, como las de la lámina de RYC (ver ese script).
CAJA = (458, 608, 330, 380)     # (y0, y1, x0, x1)
MARGEN = 5
CLARO, OSCURO = 120.0, 40.0     # rampa de transparencia: solo el contorno


def main():
    if not os.path.exists(LAMINA):
        raise SystemExit(f"Falta la lámina: {LAMINA}")

    gris = np.asarray(Image.open(LAMINA).convert("L")).astype(np.float32)
    y0, y1, x0, x1 = CAJA
    recorte = gris[y0 - MARGEN:y1 + 1 + MARGEN, x0 - MARGEN:x1 + 1 + MARGEN]

    alfa = np.clip((CLARO - recorte) / (CLARO - OSCURO), 0, 1)
    if alfa.max() < 0.9:
        raise SystemExit("La caja no agarró contorno: revisá CAJA contra la lámina")

    rgba = np.zeros((*recorte.shape, 4), dtype=np.uint8)
    rgba[..., 3] = (alfa * 255).astype(np.uint8)    # negro, con el alfa del trazo
    os.makedirs(os.path.dirname(SALIDA), exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(SALIDA)

    print(f"✓ forma N → {os.path.relpath(SALIDA, RAIZ)} "
          f"({os.path.getsize(SALIDA)} bytes, {rgba.shape[1]}×{rgba.shape[0]} px)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
