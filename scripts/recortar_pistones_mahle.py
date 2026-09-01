#!/usr/bin/env python3
"""
Recorta los dibujos de pistón del catálogo Mahle, uno por pistón, para que la
búsqueda por medidas pueda mostrarlos al lado del subconjunto y del conjunto.

    python3 scripts/recortar_pistones_mahle.py            # recorta y avisa
    python3 scripts/recortar_pistones_mahle.py --hoja     # + lámina de control

Se corre A MANO, cada vez que caen fotos nuevas en la carpeta de fuentes. La
salida (webapp/frontend/public/pistones/*.png y el manifiesto .js) se commitea.

DE DÓNDE SALEN LAS FUENTES. Del PDF del catálogo Mahle, recortadas a ojo: un
rectángulo alrededor del pistón que se lleva puesto lo que haya cerca — números
de la fila, rayas de la grilla, la barra negra de un encabezado, a veces medio
dibujo del pistón de al lado. El nombre del archivo trae el código ("S14275",
"S0010110", "E14040", a veces sin la letra, a veces numeradas por delante
cuando son dos recortes del mismo código), y de ahí sale contra qué ficha se
cruza: lo que manda es el NÚMERO, porque el conjunto y el subconjunto que lo
comparten son el mismo pistón y se dibujan una sola vez.

QUÉ HACE ESTE SCRIPT. Encontrar, dentro de ese rectángulo sucio, las DOS VISTAS
del pistón —el corte de arriba y el círculo de abajo, siempre una sobre la otra
y del mismo ancho— y tirar todo lo demás. En orden:

  1. Borra las rayas de la tabla: cualquier corrida de tinta seguida que cruce
     casi toda la imagen. Sin esto el marco de la grilla queda pegado al dibujo
     en una sola mancha y no hay nada que separar.
  2. Etiqueta lo que queda en pedazos conectados y descarta los que son pura
     recta (corchetes de cota, restos de grilla): un corchete es 100 % recta,
     una circunferencia o un corte rayado casi nada.
  3. Arranca del CÍRCULO más grande de la fila —la vista de abajo del pistón,
     lo único redondo que hay— y le suma los pedazos que estén alineados con
     él, midan lo mismo de ancho y no estén más lejos que un Ø de pistón. Un
     número suelto no pasa ninguna de las tres. Ver `_arranque`: ahí está por
     qué no gana la camisa de la fila, que tiene bastante más tinta.
  4. Lleva el trazo a negro pleno estirando el contraste de esa imagen: hay
     páginas del catálogo dibujadas en gris clarito y así todas se ven igual de
     firmes en pantalla.
  5. Rellena hasta la MISMA PROPORCIÓN para todos (`LADOS`), que es lo que hace
     que se vean todos del mismo tamaño: la pantalla los pide con una altura
     fija y el ancho sale solo.

NO SE REESCALA EL DIBUJO. El relleno es transparente y el recorte queda en su
resolución original — estirar un dibujo de línea para que todos midan lo mismo
en pixeles no agrega nitidez, la saca. Lo que iguala el tamaño en pantalla es
la proporción, no la cantidad de pixeles.

SI UN CÓDIGO TIENE DOS FOTOS gana la que tenga el dibujo más grande. Pasa con
las que se extrajeron dos veces (un .jpg del PDF y un .png recortado a mano).
"""
import argparse
import json
import math
import os
import re
import sys

import numpy as np
from PIL import Image

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FUENTES = os.path.join(RAIZ, "CRAC", "tecnicos", "fuentes", "pistones")
# Las dos familias que salen del catálogo de Mahle. Un conjunto ("E BE14040") y
# el subconjunto de su mismo número ("S BE14040") son EL MISMO PISTÓN dibujado
# una sola vez en el catálogo: el conjunto es el juego del motor entero y el
# subconjunto es esa misma pieza de a una. Por eso las fotos se cruzan contra
# los dos JSON y el dibujo se guarda UNA VEZ, con los dos códigos apuntándole.
FICHAS = {
    "subconjuntos": os.path.join(RAIZ, "CRAC", "tecnicos", "subconjuntos.json"),
    "conjuntos": os.path.join(RAIZ, "CRAC", "tecnicos", "conjuntos.json"),
}
SALIDA = os.path.join(RAIZ, "webapp", "frontend", "public", "pistones")
MANIFIESTO = os.path.join(
    RAIZ, "webapp", "frontend", "src", "screens", "BusquedaMedidas", "dibujos-pistones.js")

TINTA = 235.0        # más claro que esto es papel (alto a propósito: hay
                     # dibujos del catálogo en gris muy clarito)
COLOR = 40           # diferencia entre canales a partir de la cual el pixel
                     # está pintado de color y no es tinta del dibujo
MARGEN = 5           # px de aire alrededor del dibujo
# La proporción del cuadro final (ancho : alto), la típica del dibujo — el
# corte y el círculo, uno sobre el otro. Va como PAR DE ENTEROS y no como
# 0,65 a propósito: los dos lados del PNG salen de multiplicar este par, así
# que todos los archivos tienen exactamente la misma proporción y a una altura
# fija miden todos lo mismo AL PIXEL. Con un decimal, el redondeo a pixel
# entero deja a unos un pixel más anchos que a otros.
LADOS = (13, 20)
AIRE = 0.06          # margen extra del cuadro, en partes del lado más largo


# ─────────────────────────────────────────────────────────────────────────────
# Encontrar el dibujo
# ─────────────────────────────────────────────────────────────────────────────

class Pedazo:
    """Un trozo de tinta conectado, con su caja."""

    def __init__(self, y0, y1, x0, x1, tinta):
        self.y0, self.y1, self.x0, self.x1, self.tinta = y0, y1, x0, x1, tinta

    @property
    def alto(self):
        return self.y1 - self.y0 + 1

    @property
    def ancho(self):
        return self.x1 - self.x0 + 1

    @property
    def area(self):
        return self.alto * self.ancho

    def unir(self, otro):
        return Pedazo(min(self.y0, otro.y0), max(self.y1, otro.y1),
                      min(self.x0, otro.x0), max(self.x1, otro.x1),
                      self.tinta + otro.tinta)


def _a_gris(path):
    """
    La imagen en gris, con lo transparente tomado como papel blanco y lo que
    está PINTADO DE COLOR tomado como papel también.

    El catálogo resalta en celeste la celda del código de subconjunto, y en
    varias fotos de esta tanda ese rectángulo lleno entra entero al recorte. Un
    bloque macizo tiene más tinta que cualquier dibujo de línea, así que si se
    lo deja se convierte en el pedazo más grande de la imagen y se lleva puesto
    el recorte. El dibujo es siempre gris neutro (R = G = B), así que alcanza
    con tirar lo que tenga color: se van con él la celda celeste y los textos
    en naranja de la tabla.
    """
    im = Image.open(path).convert("RGBA")
    fondo = Image.new("RGB", im.size, "white")
    fondo.paste(im, mask=im.split()[3])
    rgb = np.asarray(fondo).astype(np.int16)
    color = (rgb.max(2) - rgb.min(2)) > COLOR
    gris = np.asarray(fondo.convert("L")).astype(np.float32)
    gris[color] = 255.0
    return gris, _celda_resaltada(color)


def _celda_resaltada(color):
    """
    La caja de la celda celeste, o None si la foto no la trae. Es el bloque de
    color más grande y macizo: el texto naranja de la tabla no llega ni al
    tamaño ni al relleno.

    Sirve de referencia de DÓNDE EMPIEZA LA FILA que se está recortando. Ver
    `encontrar_dibujo`.
    """
    _, pedazos = _pedazos(color)
    llenos = [p for p in pedazos.values()
              if p.area >= 600 and p.tinta / p.area >= 0.6]
    return max(llenos, key=lambda p: p.area) if llenos else None


def _corridas(fila):
    """Los tramos seguidos de tinta de una fila, como pares (desde, hasta)."""
    xs = np.flatnonzero(fila)
    if not len(xs):
        return []
    cortes = list(np.flatnonzero(np.diff(xs) > 1))
    tramos, inicio = [], 0
    for fin in cortes + [len(xs) - 1]:
        tramos.append((int(xs[inicio]), int(xs[fin])))
        inicio = fin + 1
    return tramos


def _sacar_reglas(tinta, minimo=0.85):
    """
    Borra las rayas de la tabla: toda corrida seguida que cruce casi toda la
    imagen, a lo ancho o a lo alto. El contorno de un pistón nunca llega a ese
    largo, porque el recorte trae aire alrededor.
    """
    for eje in (0, 1):
        m = tinta if eje == 0 else tinta.T
        tope = int(minimo * m.shape[1])
        for i in range(m.shape[0]):
            if m[i].sum() < tope:
                continue
            for desde, hasta in _corridas(m[i]):
                if hasta - desde + 1 >= tope:
                    m[i, desde:hasta + 1] = False
    return tinta


def _pedazos(tinta):
    """Etiquetado 8-conexo por corridas (union-find), sin depender de scipy."""
    alto, ancho = tinta.shape
    padre = {}

    def raiz_de(x):
        while padre[x] != x:
            padre[x] = padre[padre[x]]
            x = padre[x]
        return x

    def unir(a, b):
        ra, rb = raiz_de(a), raiz_de(b)
        if ra != rb:
            padre[max(ra, rb)] = min(ra, rb)

    etiquetas = np.zeros((alto, ancho), dtype=np.int32)
    siguiente = 1
    for y in range(alto):
        if not tinta[y].any():
            continue
        for x0, x1 in _corridas(tinta[y]):
            vecinas = set()
            if y:
                arriba = etiquetas[y - 1, max(0, x0 - 1):x1 + 2]
                vecinas = {int(v) for v in np.unique(arriba) if v}
            if vecinas:
                etiqueta = min(vecinas)
                for v in vecinas:
                    unir(etiqueta, v)
            else:
                etiqueta = siguiente
                padre[siguiente] = siguiente
                siguiente += 1
            etiquetas[y, x0:x1 + 1] = etiqueta

    if siguiente == 1:
        return etiquetas, {}
    canon = np.zeros(siguiente, dtype=np.int32)
    for e in range(1, siguiente):
        canon[e] = raiz_de(e)
    etiquetas = canon[etiquetas]

    cajas = {}
    for e in np.unique(etiquetas):
        if not e:
            continue
        ys, xs = np.nonzero(etiquetas == e)
        cajas[int(e)] = Pedazo(int(ys.min()), int(ys.max()), int(xs.min()), int(xs.max()), int(len(ys)))
    return etiquetas, cajas


def _es_raya(p, alto, ancho):
    """Una raya o una barra de la grilla: fina y casi tan larga como la imagen."""
    return ((p.alto <= 6 and p.ancho >= 0.75 * ancho)
            or (p.ancho <= 6 and p.alto >= 0.75 * alto)
            or (p.ancho >= 0.9 * ancho and p.alto <= 0.15 * alto)
            or (p.alto >= 0.9 * alto and p.ancho <= 0.15 * ancho))


def _parte_recta(mascara):
    """
    Qué parte de la tinta de un pedazo está sobre rectas largas. Un corchete de
    cota o un resto de grilla es casi todo recta; una circunferencia o un corte
    rayado, casi nada (sus corridas son de dos o tres pixeles).
    """
    total = int(mascara.sum())
    if not total:
        return 1.0
    recta = 0
    for eje in (0, 1):
        m = mascara if eje == 0 else mascara.T
        tope = max(8, int(0.7 * m.shape[1]))
        for i in range(m.shape[0]):
            if m[i].sum() < tope:
                continue
            for desde, hasta in _corridas(m[i]):
                if hasta - desde + 1 >= tope:
                    recta += hasta - desde + 1
    return recta / total


def _arranque(cajas, etiquetas, resaltado):
    """
    Con qué pedazo empieza el grupo. Tiene que ser una de las dos vistas del
    pistón: de ahí para adelante el grupo crece por alineación, y arrancar mal
    es recortar otra cosa.

    Se elige el CÍRCULO más grande —la vista de abajo del pistón— porque es lo
    único de la fila que es redondo. Antes se arrancaba del pedazo con más
    tinta, y alcanzaba mientras las fotos venían recortadas cerca del pistón;
    las de la fila entera del catálogo traen cosas con más tinta que el pistón,
    y la que más engaña es la camisa de la columna "C": un rectángulo rayado,
    el doble de alto que el pistón. Redonda no es.

    Dos salvedades, las dos aprendidas de esta tanda:

    - **Los iconitos del encabezado** (el pistón en perspectiva de la columna
      "KH", el bloque de motor, los aros) también son redondos, y en las fotos
      que se llevaron puesto el encabezado de la página son más grandes que el
      dibujo de la fila, que a veces sale chiquito. Por eso no se miran los
      pedazos que quedan enteros ARRIBA de la celda resaltada: esa celda es el
      código que se está recortando, o sea que marca dónde empieza la fila, y
      el dibujo siempre cae debajo de la primera línea de texto de su fila.
    - **Los redondelitos de adentro del dibujo** (el agujero del perno, las
      marcas del centro) son círculos perfectos y chicos. Se saltean los que
      caen dentro de la caja de otro candidato más grande: son un detalle de
      esa vista, no la vista.
    """
    forma = {e: etiquetas[p.y0:p.y1 + 1, p.x0:p.x1 + 1] == e for e, p in cajas.items()}
    debajo = {e: p for e, p in cajas.items()
              if resaltado is None or p.y1 > resaltado.y0}
    grandes = [e for e, p in debajo.items()
               if p.alto >= 25 and p.ancho >= 25 and not _es_rectangulo(forma[e])]

    def adentro_de_otro(e):
        p = cajas[e]
        return any(o != e and cajas[o].area > p.area
                   and cajas[o].y0 <= p.y0 and cajas[o].y1 >= p.y1
                   and cajas[o].x0 <= p.x0 and cajas[o].x1 >= p.x1
                   for o in grandes)

    redondos = [e for e in grandes
                if 0.75 <= cajas[e].ancho / cajas[e].alto <= 1.35
                and not adentro_de_otro(e)]
    if redondos:
        return max(redondos, key=lambda e: cajas[e].area)
    if grandes:
        return max(grandes, key=lambda e: cajas[e].area)
    return max(debajo or cajas, key=lambda e: cajas[e].tinta)


def _es_rectangulo(mascara):
    """
    Si el pedazo tiene los lados rectos: casi todas sus filas miden lo mismo de
    ancho. Así es la camisa de la columna "C", que es un tubo —ancho parejo de
    una tapa a la otra— y así es una vista de corte sola.

    El pistón no. Entre el corte y el círculo el ancho sube y baja, y arriba y
    abajo del círculo ninguna fila llega a medir lo que la del medio. Medido
    sobre las fotos de esta tanda, las camisas dan de 0,67 para arriba y los
    dibujos de pistón, de 0,46 para abajo.
    """
    anchos = np.zeros(mascara.shape[0])
    for y in range(mascara.shape[0]):
        xs = np.flatnonzero(mascara[y])
        if len(xs):
            anchos[y] = xs[-1] - xs[0] + 1
    return bool((anchos >= 0.9 * anchos.max()).mean() >= 0.6)


def encontrar_dibujo(path):
    """
    Devuelve (gris, máscara del dibujo, caja) o None si no se encontró tinta.
    La máscara deja afuera todo lo que no sea el pistón: números, cotas y
    rayas desaparecen aunque hayan quedado dentro de la caja.
    """
    gris, resaltado = _a_gris(path)
    alto, ancho = gris.shape
    etiquetas, cajas = _pedazos(_sacar_reglas(gris < TINTA))
    cajas = {e: p for e, p in cajas.items() if p.tinta > 4 and not _es_raya(p, alto, ancho)}
    # Un pedazo con poca tinta para su tamaño y hecho de rectas es grilla, no
    # dibujo. La densidad sola no alcanza: una circunferencia fina también es
    # hueca, pero no es recta.
    cajas = {e: p for e, p in cajas.items()
             if p.tinta / p.area >= 0.12
             or _parte_recta(etiquetas[p.y0:p.y1 + 1, p.x0:p.x1 + 1] == e) < 0.5}
    if not cajas:
        return None

    ancla_id = _arranque(cajas, etiquetas, resaltado)
    ancla = cajas[ancla_id]
    grupo, caja = {ancla_id}, ancla

    sumo = True
    while sumo:
        sumo = False
        for e, p in cajas.items():
            if e in grupo:
                continue
            if p.alto <= 6 or p.ancho <= 6:
                continue                                    # una rayita suelta
            if p.tinta < 0.10 * ancla.tinta and p.alto < 0.35 * ancla.alto:
                continue                                    # una miga
            if not 0.5 <= p.ancho / ancla.ancho <= 2.5:
                continue        # las dos vistas miden lo mismo de ancho (el Ø
                                # del pistón); un número que quedó cerca, no
            solape = min(p.x1, caja.x1) - max(p.x0, caja.x0)
            if solape < 0.4 * min(p.ancho, caja.ancho):
                continue                                    # no está alineado
            hueco = max(caja.y0 - p.y1, p.y0 - caja.y1, 0)
            if hueco > 0.9 * caja.ancho:
                continue        # las dos vistas nunca están separadas por más
                                # de un Ø; el pistón de la fila de al lado sí
            grupo.add(e)
            caja = caja.unir(p)
            sumo = True

    # Los detalles chicos que caen adentro (el perno, las marcas del centro).
    for e, p in cajas.items():
        if e not in grupo and p.y0 >= caja.y0 and p.y1 <= caja.y1 and p.x0 >= caja.x0 and p.x1 <= caja.x1:
            grupo.add(e)

    return gris, np.isin(etiquetas, sorted(grupo)), caja


# ─────────────────────────────────────────────────────────────────────────────
# Dejarlo listo para la pantalla
# ─────────────────────────────────────────────────────────────────────────────

def recortar(gris, mascara, caja):
    """
    El dibujo solo, negro sobre transparente. El contraste se estira contra los
    valores de ESTA imagen: hay dibujos casi negros y otros en gris clarito, y
    en la tabla los dos tienen que verse igual de firmes.
    """
    alto, ancho = gris.shape
    y0, y1 = max(0, caja.y0 - MARGEN), min(alto, caja.y1 + 1 + MARGEN)
    x0, x1 = max(0, caja.x0 - MARGEN), min(ancho, caja.x1 + 1 + MARGEN)
    g, m = gris[y0:y1, x0:x1], mascara[y0:y1, x0:x1]

    trazo = g[m]
    oscuro = float(np.percentile(trazo, 15)) if trazo.size else 60.0
    claro = max(min(245.0, float(np.percentile(g, 98))), oscuro + 30.0)
    alfa = np.clip((claro - g) / (claro - oscuro), 0, 1) * m

    rgba = np.zeros((*g.shape, 4), dtype=np.uint8)
    rgba[..., 3] = (alfa * 255).astype(np.uint8)    # negro, con el alfa del trazo
    return Image.fromarray(rgba, "RGBA")


def encuadrar(im):
    """
    Rellena con transparente hasta la proporción de `LADOS`, sin tocar el
    dibujo. Todos los archivos quedan con la misma proporción exacta, así que
    pedidos con una altura fija se ven todos del mismo tamaño y ninguno empuja
    el alto de la fila.
    """
    ancho, alto = im.size
    aire = 1 + 2 * AIRE
    lado_ancho, lado_alto = LADOS
    # El cuadro es el múltiplo más chico del par que entra el dibujo con su
    # aire: así los dos lados quedan siempre en la misma proporción exacta.
    veces = math.ceil(max(ancho * aire / lado_ancho, alto * aire / lado_alto))
    lienzo = Image.new("RGBA", (veces * lado_ancho, veces * lado_alto), (0, 0, 0, 0))
    lienzo.paste(im, ((lienzo.size[0] - ancho) // 2, (lienzo.size[1] - alto) // 2))
    return lienzo


# ─────────────────────────────────────────────────────────────────────────────
# Cruzar cada foto con su código
# ─────────────────────────────────────────────────────────────────────────────

def clave(codigo):
    """
    El código sin espacios, que es como se llama el archivo y como lo busca la
    pantalla. El catálogo escribe el mismo código de dos maneras ("S BE14040" y
    "S BE 14040"): sin espacios las dos caen en la misma clave, que es lo que
    se quiere.
    """
    return re.sub(r"\s+", "", codigo)


def _numero_del_nombre(nombre):
    """
    El número de código que trae el nombre del archivo: los dígitos que van
    pegados a la "S" del subconjunto o a la "E" del conjunto ("S48301",
    "1_S48950", "E14040" → 48950, 14040). Si no hay ninguna de las dos, el
    primer número del nombre, que es como se llamaban las fotos de la primera
    tanda ("14040.png").

    La letra manda porque las fotos vienen a veces numeradas por delante, cuando
    son dos recortes del mismo código ("1_S0591230", "2_S0591230"). Con el
    primer número a secas esas dos se leerían como el código 1 y el 2 — hoy no
    existen y el script las saltearía avisando, pero un "3_" el día que exista
    una ficha con ese número le pondría al pistón el dibujo de otro.
    """
    return re.search(r"[SsEe]\s*_?(\d+)", nombre) or re.search(r"(\d+)", nombre)


def codigos_por_numero():
    """
    {número → {familia: [códigos]}} de los dos catálogos de Mahle.

    El mismo número cae en las dos familias cuando el catálogo publica el
    pistón suelto y el juego del motor, que es lo normal: son la misma foto.
    """
    por_numero = {}
    for familia, path in FICHAS.items():
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            fichas = json.load(f)
        for ficha in fichas:
            m = re.search(r"(\d+)", ficha["codigo"])
            if m:
                por_numero.setdefault(int(m.group(1)), {}).setdefault(familia, []).append(
                    ficha["codigo"])
    return por_numero


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--hoja", action="store_true",
                        help="además, arma una lámina con todos los recortes para mirarlos de una")
    args = parser.parse_args()

    if not os.path.isdir(FUENTES):
        raise SystemExit(f"Falta la carpeta de fuentes: {FUENTES}")

    por_numero = codigos_por_numero()
    elegidos, avisos = {}, []

    for nombre in sorted(os.listdir(FUENTES)):
        if not nombre.lower().endswith((".png", ".jpg", ".jpeg")):
            continue
        m = _numero_del_nombre(nombre)
        if not m:
            avisos.append(f"{nombre}: el nombre no tiene número de código, se saltea")
            continue
        por_familia = por_numero.get(int(m.group(1)))
        if not por_familia:
            avisos.append(f"{nombre}: el código {m.group(1)} no está en los catálogos, se saltea")
            continue
        # Que el número caiga en las dos familias es lo normal (el pistón suelto
        # y el juego del motor). Que caiga en dos códigos DE LA MISMA familia,
        # no: ahí no se sabe cuál es y se saltea, como siempre.
        ambigua = {f: cs for f, cs in por_familia.items() if len({clave(c) for c in cs}) > 1}
        if ambigua:
            avisos.append(f"{nombre}: el número {m.group(1)} cae en {ambigua}, se saltea")
            continue

        hallazgo = encontrar_dibujo(os.path.join(FUENTES, nombre))
        if hallazgo is None:
            avisos.append(f"{nombre}: no se encontró dibujo adentro")
            continue
        dibujo = recortar(*hallazgo)
        # El archivo se llama como el SUBCONJUNTO cuando existe: es el código con
        # el que se venían nombrando los 181 dibujos que ya están, y así ninguno
        # cambia de nombre al sumar los conjuntos. El conjunto del mismo número
        # apunta a ese mismo archivo — el dibujo no se guarda dos veces.
        claves = sorted({clave(c) for cs in por_familia.values() for c in cs})
        archivo = clave(por_familia.get("subconjuntos", [claves[0]])[0])
        anterior = elegidos.get(archivo)
        # Dos fotos del mismo código: gana la que traiga el dibujo más grande,
        # que es la que se va a ver mejor ampliada.
        if anterior and anterior[1].size[0] * anterior[1].size[1] >= dibujo.size[0] * dibujo.size[1]:
            continue
        elegidos[archivo] = (nombre, dibujo, claves)

    if not elegidos:
        raise SystemExit("No salió ningún dibujo: revisá la carpeta de fuentes")

    os.makedirs(SALIDA, exist_ok=True)
    viejos = {f for f in os.listdir(SALIDA) if f.endswith(".png")}
    for archivo, (_, dibujo, _claves) in sorted(elegidos.items()):
        encuadrar(dibujo).save(os.path.join(SALIDA, f"{archivo}.png"))
        viejos.discard(f"{archivo}.png")
    for sobrante in sorted(viejos):
        # Un dibujo que ya no tiene fuente: si se queda, el manifiesto no lo
        # nombra y el archivo queda de adorno en el build.
        os.remove(os.path.join(SALIDA, sobrante))
        avisos.append(f"{sobrante}: ya no tiene foto de origen, se borró")

    # {código sin espacios → archivo de /pistones/}. Es un mapa y no una lista
    # porque el conjunto y el subconjunto del mismo número comparten el dibujo:
    # los dos códigos apuntan al mismo PNG, guardado una sola vez.
    manifiesto = {}
    for archivo, (_, _dibujo, claves) in elegidos.items():
        for c in claves:
            manifiesto[c] = archivo

    with open(MANIFIESTO, "w", encoding="utf-8") as f:
        f.write("/* Generado por scripts/recortar_pistones_mahle.py — no editar a mano.\n"
                " *\n"
                " * Qué dibujo le toca a cada código de subconjunto o conjunto: la clave es\n"
                " * el código sin espacios y el valor, el archivo de /pistones/. El conjunto\n"
                " * y el subconjunto del mismo número son el mismo pistón, así que apuntan\n"
                " * los dos al mismo PNG.\n"
                " *\n"
                " * El mapa se arma acá y no se sale a probar si el PNG existe: pedir una\n"
                " * imagen que no está deja un cuadrito roto en la tabla y un 404 en la\n"
                " * consola por cada fila. */\n")
        f.write("export const DIBUJOS = {\n")
        for codigo in sorted(manifiesto):
            f.write(f"  '{codigo}': '{manifiesto[codigo]}',\n")
        f.write("}\n")

    total = sum(os.path.getsize(os.path.join(SALIDA, f"{c}.png")) for c in elegidos)
    print(f"✓ {len(elegidos)} dibujos → {os.path.relpath(SALIDA, RAIZ)} ({total // 1024} KB en total)")
    for aviso in avisos:
        print(f"  ⚠ {aviso}")

    if args.hoja:
        hoja = _lamina(elegidos)
        print(f"  lámina de control → {hoja}")
    return 0


def _lamina(elegidos, celda=200, columnas=8):
    """
    Todos los recortes en una sola imagen, para mirarlos de una pasada. Es la
    única manera de saber si a alguno se le coló un número o le faltó una
    vista: el recorte anda o no anda a ojo, no hay número que lo diga.
    """
    from PIL import ImageDraw

    items = sorted(elegidos.items())
    filas = (len(items) + columnas - 1) // columnas
    hoja = Image.new("RGB", (columnas * celda, filas * (celda + 16)), "white")
    lapiz = ImageDraw.Draw(hoja)
    for i, (codigo, (nombre, dibujo, _claves)) in enumerate(items):
        fondo = Image.new("RGB", dibujo.size, "white")
        fondo.paste(dibujo, mask=dibujo.split()[3])
        fondo.thumbnail((celda - 8, celda - 8))
        x, y = (i % columnas) * celda, (i // columnas) * (celda + 16)
        hoja.paste(fondo, (x + (celda - fondo.size[0]) // 2, y + (celda - fondo.size[1]) // 2))
        lapiz.rectangle([x, y, x + celda - 1, y + celda + 14], outline="#cccccc")
        lapiz.text((x + 4, y + celda + 2), f"{codigo}  ({nombre})"[:34], fill="black")
    destino = os.path.join("/tmp", "pistones-recortados.png")
    hoja.save(destino)
    return destino


if __name__ == "__main__":
    sys.exit(main())
