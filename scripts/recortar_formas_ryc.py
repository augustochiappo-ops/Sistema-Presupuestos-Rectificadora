#!/usr/bin/env python3
"""
Recorta los dibujos de forma de guía del catálogo RYC, uno por archivo, para
que la pantalla los pueda mostrar al lado del código.

    python3 scripts/recortar_formas_ryc.py

Se corre A MANO, solo si cambia la lámina de formas del catálogo (nunca pasó).
La salida (webapp/frontend/public/formas/*.png) se commitea.

QUÉ ES LA LÁMINA. La última página del catálogo RYC trae, en una sola imagen,
las nueve formas de cuerpo (A, B, C, E, F, G, L, M, P) y cuatro figuras con los
detalles numerados del 1 al 8. Por eso una forma se escribe "A-1-6": cuerpo A
con los detalles 1 y 6. La imagen entera está en
CRAC/tecnicos/fuentes/ryc_formas.png (sacada del PDF del catálogo, que no vive
en el repo), y de ahí salen los recortes.

CÓMO QUEDAN LIMPIOS. El escaneo tiene fondo gris y ruido de JPEG. Cada pixel se
convierte en negro con transparencia proporcional a lo oscuro que era: el fondo
desaparece del todo y las líneas conservan su antialias, así el dibujo se ve
nítido tanto en una fila blanca como en una beige, y a 34 px de alto en la
tabla o a 150 px en la lámina.

LAS CAJAS ESTÁN A MANO Y ESO ESTÁ BIEN. Se midieron una vez sobre la imagen
(ver `_verificar`, que avisa si alguna caja quedó cortando tinta). Detectarlas
solo por huecos de blanco separaría los números de su dibujo: el "1" y el "2"
son dos etiquetas de la MISMA figura, y el "4" cuelga por fuera del contorno.
"""
import os
import sys

import numpy as np
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LAMINA = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes", "ryc_formas.png")
SALIDA = os.path.join(RAIZ, "webapp", "frontend", "public", "formas")

# nombre → (y0, y1, x0, x1) sobre la lámina de 1399×572.
CAJAS = {
    # Fila de arriba: las siete primeras formas de cuerpo.
    "A": (36, 205, 41, 114),
    "B": (36, 204, 223, 333),
    "C": (34, 204, 425, 535),
    "E": (35, 204, 644, 718),
    "F": (35, 204, 846, 919),
    "G": (34, 206, 1030, 1140),
    "L": (35, 204, 1247, 1356),
    # Fila de abajo: las otras dos formas y las cuatro figuras de detalles.
    "M": (275, 487, 20, 136),
    "P": (316, 488, 288, 362),
    "detalle-1-2": (312, 491, 504, 659),
    "detalle-3-6": (272, 542, 722, 927),
    "detalle-7": (314, 520, 1023, 1112),
    "detalle-8": (312, 521, 1259, 1346),
}

MARGEN = 5          # px de aire alrededor del dibujo
TINTA = 170         # más oscuro que esto es línea segura (para el chequeo)
CLARO, OSCURO = 215.0, 120.0   # rampa de transparencia


def _verificar(gris: np.ndarray) -> list[str]:
    """
    Avisa si a alguna caja le quedó tinta AFUERA, o sea si está cortando el
    dibujo. Es lo único que puede salir mal cuando se retoca una caja a mano, y
    en el recorte chico no se ve. Se mira el anillo de `MARGEN` px de alrededor:
    las cajas son ajustadas, así que la tinta toca los bordes de adentro a
    propósito — lo que no puede haber es tinta pegada por fuera.
    """
    alto, ancho = gris.shape
    problemas = []
    for nombre, (y0, y1, x0, x1) in CAJAS.items():
        ay0, ay1 = max(0, y0 - MARGEN), min(alto, y1 + 1 + MARGEN)
        ax0, ax1 = max(0, x0 - MARGEN), min(ancho, x1 + 1 + MARGEN)
        anillo = (gris[ay0:ay1, ax0:ax1] < TINTA).copy()
        anillo[y0 - ay0 : y1 + 1 - ay0, x0 - ax0 : x1 + 1 - ax0] = False
        if anillo.any():
            problemas.append(f"{nombre}: quedó tinta afuera de la caja, la está cortando")
    return problemas


def main():
    if not os.path.exists(LAMINA):
        raise SystemExit(f"Falta la lámina: {LAMINA}")

    gris = np.asarray(Image.open(LAMINA).convert("L")).astype(np.float32)
    for problema in _verificar(gris):
        print(f"  ⚠ {problema}")

    os.makedirs(SALIDA, exist_ok=True)
    alto, ancho = gris.shape
    for nombre, (y0, y1, x0, x1) in CAJAS.items():
        recorte = gris[
            max(0, y0 - MARGEN) : min(alto, y1 + 1 + MARGEN),
            max(0, x0 - MARGEN) : min(ancho, x1 + 1 + MARGEN),
        ]
        alfa = np.clip((CLARO - recorte) / (CLARO - OSCURO), 0, 1)
        rgba = np.zeros((*recorte.shape, 4), dtype=np.uint8)
        rgba[..., 3] = (alfa * 255).astype(np.uint8)   # negro, con el alfa del trazo
        Image.fromarray(rgba, "RGBA").save(os.path.join(SALIDA, f"{nombre}.png"))

    total = sum(os.path.getsize(os.path.join(SALIDA, f"{n}.png")) for n in CAJAS)
    print(f"✓ {len(CAJAS)} dibujos → {os.path.relpath(SALIDA, RAIZ)} ({total // 1024} KB en total)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
