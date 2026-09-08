# Cómo se cargaron los pistones de Federal Mogul

Este documento explica de dónde salió cada dato de las **175 fichas de Federal
Mogul** que entraron el 2026-09-08 en `pistones.json`, `subconjuntos.json` y
`conjuntos.json`, y qué habría que hacer para volver a correr la carga o
ampliarla. La fuente es el **Catálogo Federal Mogul Argentina 2010 — Pistones,
Subconjuntos y Conjuntos**, que está guardado en
`CRAC/tecnicos/fuentes/federal_mogul_pistones_2010.pdf` (91 páginas, 1,4 MB).

Es el equivalente Federal Mogul del catálogo Mahle que ya estaba cargado. Hasta
esta tanda las tres familias del pistón eran casi todas Mahle: 201 subconjuntos
y 128 conjuntos de esa marca, más 35 pistones sueltos de originales viejos que
habían salido del catálogo Persan. Ahora son **89 pistones, 284 subconjuntos y
166 conjuntos**.

## Los tres scripts, en orden

```bash
.venv/bin/pip install pdfplumber          # una sola vez
python3 scripts/leer_pistones_fm2010.py   # el PDF → /tmp/fm2010.json
python3 scripts/pistones_fm_desde_proveedor.py   # → los tres .json
python3 scripts/dibujos_pistones_fm2010.py --hoja  # → los PNG y su manifiesto
```

pdfplumber no está en `requirements.txt` a propósito: es herramienta de
conversión, como en `convertir_camisas_fadecya.py`. El backend no la necesita.

El orden importa. El segundo script lee lo que dejó el primero, y el tercero
necesita las fichas ya escritas para saber a qué código del proveedor le
corresponde cada dibujo.

## Qué trae el catálogo y cómo está armado

La página 6 del PDF explica la grilla, y es la que hay que mirar si algún día
un número no cierra. Cada página tiene bloques por motor, y cada bloque una o
más filas; cada fila es un pistón, con estas siete columnas:

| Columna | x en puntos | Qué trae |
|---|---|---|
| 1 | 78–200 | motor, nº de cilindros, combustible, cilindrada, R.C., vehículos y años |
| 2 | 200–283 | Ø nominal y carrera, y el **dibujo** del pistón |
| 3 | 283–312 | altura de compresión (A), la cámara de la cabeza (±B y BØ) y longitud total (D) |
| 4 | 312–350 | altura de cada aro, y abajo el perno: Ø "x" largo |
| 5 | 350–396 | huelgo (l) y altura de medición (h) |
| 6 | 396–418 | posición del pistón respecto al nivel del block |
| 7 | 418–520 | números de parte: **P** pistón, **SC** subconjunto, **K** conjunto |

Las páginas con datos son de la **7 a la 90**. Las primeras seis son tapa,
índice y la leyenda; la 91 es la contratapa.

De acá salen las tres medidas con las que busca el taller: el **Ø del pistón**
es el valor de la columna 2, el **alto total** es el ÚLTIMO valor de la columna
3 (la D) y el **Ø del perno** es el valor de la columna 4 que está justo arriba
de la "x".

## Las seis trampas que costaron tiempo

Todas están comentadas también en el encabezado de cada script. Van acá juntas
porque son lo que hay que saber antes de tocar nada.

**1. El texto plano miente.** `extract_text` devuelve corridas que cruzan
columnas: "Motor M20B20K - 4,8D 80,00" pega el nombre del motor de la columna 1
con el Ø de la 2, y "39,45 3,00" mezcla la altura de compresión con el primer
aro. Por eso se lee carácter por carácter con pdfplumber y cada valor cae en la
columna donde está dibujado. Es la misma trampa que ya documentaba
`leer_conjuntos_mahle.py` para el catálogo de Mahle.

**2. No todas las páginas están alineadas al mismo punto.** Las de Cummins
arrancan cuatro puntos más a la izquierda que las de Ford, y las de Peugeot
corren la columna del perno diez puntos. Los bordes de la tabla de arriba están
puestos en el MEDIO de cada hueco y no donde cae el texto de la mayoría. Puesto
el borde en 432 —donde arrancan los códigos de casi todas las páginas— un código
dibujado en 431,99 se leía como columna 6 y la fila se perdía entera: así se
perdieron todas las páginas de Peugeot en la primera corrida.

**3. La fila arranca en la columna 7, no en la línea "Motor …".** Hay filas sin
motor propio: la página 56 trae el mismo motor con dos alturas de compresión
("P18497" y abajo "P18497BC") y la segunda no repite los datos. Y al revés, las
páginas de Cummins escriben dos líneas "Motor" ("Motor C" y "Motor 300 HP") para
una sola pieza, así que usar el motor como ancla partía la fila al medio y
dejaba el pistón de un lado y el subconjunto del otro. El ancla es una corrida
de renglones seguidos de la columna 7: entre dos filas hay un salto grande —el
alto del dibujo— y dentro de una los renglones van cada 9 o 10 puntos.

**4. El catálogo mezcla la coma y el punto decimal.** La mayoría de los valores
usan coma ("2,90") pero varias páginas de Cummins escriben el mismo aro con
punto ("2.90"). Sacar el punto siempre, como si fuera separador de miles,
convertía ese aro de 2,90 mm en uno de 290 mm. Sólo es separador de miles cuando
lo siguen exactamente tres dígitos y el número no tiene coma.

**5. Hay páginas con dos títulos encimados.** La 41 dice "FORD TRANSIT - MOTOR
2.5 DIESEL" y abajo quedó "FORD ECOSPORT - DV4TD", de una versión anterior de la
página. Se queda el que se dibuja último, que es el que tapa al otro. Por eso el
título va a `extra.fabricante` y la aplicación de la ficha sale de la columna 1,
que es por fila y no tiene esta ambigüedad.

**6. Las notas al pie cruzan las columnas.** "Torque de Aprieto … Tapa de
Cilindros" y "Junta Tapa de Cilindro … espesor 1,65 mm" no son datos de la
pieza, y sin cortarlas el "1,65" del espesor entraba en la columna 3 y se
llevaba puesta la longitud total del pistón, que es su último valor.

## Cómo se cruza un código del catálogo con uno del proveedor

El número es el mismo y lo que cambia es el envoltorio:

    P39493  → "P F 39493  STD" / "P F 39493  030" / "P F 39493  040"
    SC79793 → "S F 79793  STD" / "S F 79793  065"
    K10073  → "T F K10073"

`P` es la categoría Pistones del proveedor, `S` Subconjuntos, `T` Conjuntos, y
`F` es la marca Federal Mogul (`FM` es la línea importada). El conjunto es el
único que se lleva la "K" puesta.

**La medida no siempre viene separada por un espacio.** Hay 1.822 códigos en la
lista del proveedor que la traen pegada ("S F 75297BC0.5"). Por eso el cruce no
parte el código del proveedor en dos: busca los que EMPIECEN con el número del
catálogo y comprueba que lo que sobra sea una medida válida —vacío, "STD", "030"
o "0.5"—. Partiéndolo primero se caían esas 1.822.

Los códigos también pueden llevar cola: **"/1" y "/4"** son variantes del mismo
juego (el catálogo las usa para los Perkins, que cambian según el Ø de camisa) y
**"BC" o "AC"** marcan la versión con otra altura de compresión, que la página 6
explica. La cola va en el código y el proveedor la escribe igual.

## Qué entró y qué no

El catálogo tiene **284 códigos distintos** (133 pistones, 92 subconjuntos, 59
conjuntos), repartidos en 150 filas. De esos, el proveedor vende los que dieron
**175 fichas** —54 pistones, 83 subconjuntos y 38 conjuntos— que cubren **314
renglones de la lista de precios** contando las sobremedidas. Son menos fichas
que códigos porque varios códigos del catálogo comparten el mismo código base
del proveedor.

**Los otros 109 no se cargaron**, por decisión del dueño (2026-09-07). Son en su
mayoría de la línea europea, con el formato "87-704500-00", que por acá no se
consigue: cargarlos habría llenado la pantalla de fichas sin precio que no se
pueden pedir. Si algún día el proveedor los trae, alcanza con volver a correr el
segundo script: los levanta solo.

También quedan afuera los códigos **entre paréntesis** —la página 59 dice
"(K48990)"—: son referencias a un juego que esa fila no vende. En la lista del
proveedor ese código existe pero es un conjunto de Mahle.

## Los dibujos

Acá el catálogo de Federal Mogul es mucho más amable que el de Mahle: **cada
dibujo ya viene como una imagen suelta embebida en el PDF** (JPEG, entre 76 × 161
y 102 × 161 px), una por bloque de motor, con el corte del pistón arriba y la
vista de abajo abajo. No hay que recortarlo de una captura sucia como hace
`recortar_pistones_mahle.py`, que se pasa cuatrocientas líneas separando el
pistón de las rayas de la grilla y los números de la fila.

Se encuentran recorriendo el flujo de instrucciones de la página (`q` / `Q` /
`cm` / `Do`) para saber en qué rectángulo se dibuja cada imagen, y quedándose
con las que midan entre 28 y 90 puntos de ancho y entre 38 y 110 de alto. Ese
filtro deja afuera la banda del encabezado (419 a 431 puntos de ancho) y los dos
iconitos de la página (22 × 15 y 32 × 8).

**La caja es más grande que el grueso de los dibujos** (que van de 43 × 79 a
73 × 95) por dos formas raras que también son dibujos, y que con los límites
originales —35 de ancho, 60 de alto— quedaban afuera:

* **30,8 × 61,4** (página 88): el pistón más angosto del catálogo, el VW Senda
  1.6 D de 76,5 mm. Es un dibujo entero, sólo que flaco.
* **58,1 × 45,5 más 58,1 × 42,2** (página 37): el Ford Escort 1.6 CHT es el único
  dibujo del catálogo **partido en dos imágenes**, el corte arriba y el círculo
  abajo. Las junta `apilados()`, que las pega con las coordenadas de la página
  —la separación y el corrimiento reales, escalados a pixeles— y no una encima de
  la otra, para que las dos vistas queden alineadas como las dibuja el catálogo.

Con estos límites entran **exactamente esas cuatro imágenes de más y ninguna
otra** en las 91 páginas; se midió contra el catálogo entero antes de tocarlos.

**A qué fila le toca cada dibujo: la fila busca al dibujo, no al revés.** Cada
fila se queda con el primer dibujo que arranque debajo suyo y no más de 60 puntos
abajo (`LIMITE`); los buenos están entre 11 y 35.

Se hacía al revés —"a cada dibujo le toca la última fila que empieza por encima
de él"— y esa regla lee bien sólo si el catálogo está entero. No lo está: los
bloques de la línea europea no se cargan y no quedan como fila, pero **sus
dibujos siguen estando en la página**. Ese dibujo huérfano se le colgaba a la
fila detectada de más arriba, hasta 333 puntos lejos, y así **cinco pistones
mostraron el dibujo de otro motor** (`SC21193`, `SC69986`, `SC77879`, `SC79379`
y `SC82082`) hasta que se dio vuelta el recorrido. Un dibujo sin fila es normal y
se descarta; una fila sin dibujo es una anomalía y el script la avisa.

Salieron **112 dibujos** (818 KB en total) a `webapp/frontend/public/pistones/`,
con el prefijo `FM`. El manifiesto apunta **175 códigos del proveedor**: el
pistón, el subconjunto y el conjunto de un mismo número son el mismo pistón,
dibujado una sola vez, así que los tres comparten el PNG. Con eso **Federal Mogul
no tiene ningún subconjunto ni conjunto sin dibujo.**

**El manifiesto va aparte del de Mahle.** `dibujos-pistones.js` lo reescribe
entero `recortar_pistones_mahle.py` en cada corrida: si estos códigos se
escribieran ahí, la próxima corrida de aquel script se los llevaría puestos sin
que nadie se entere. Cada script es dueño de su archivo —el de Federal Mogul es
`dibujos-pistones-fm.js`— y `pistones.jsx` busca en los dos mapas.

**Y cada script barre sólo sus PNG.** Los dos escriben en la misma carpeta, y el
de Mahle borra los archivos que ya no tienen foto de origen. Los de Federal Mogul
no tienen foto —salen de este PDF—, así que una corrida de rutina de aquel script
se llevaba puestos los 110 dibujos, en silencio. Desde el 2026-09-08 el de Mahle
saltea todo lo que empiece con `FM`. Si algún día entra una tercera marca, tiene
que elegir su prefijo y sumarlo a esa exclusión: el de Mahle es el que barre por
descarte. `tests/backend_medidas.py` verifica que todo archivo nombrado por un
manifiesto esté en la carpeta, que es lo que agarra este tipo de borrado.

Para mirar de un vistazo que ninguno salió cortado o vacío:

```bash
python3 scripts/dibujos_pistones_fm2010.py --hoja   # deja /tmp/dibujos-fm.png
```

## Cómo se verificó

**El Ø del pistón contra la descripción del proveedor.** La lista del proveedor
escribe el diámetro en la descripción ("CUMMINS 4BTE-6BTE PZ. 76.5 C/C 102 mm"),
y el catálogo lo trae en la columna 2. Cruzados los **151 códigos** donde los dos
datos existen, **coinciden los 151 dentro de 0,6 mm y no falla ninguno**. Hay
descripciones con más de una medida en milímetros ("(56 mm) 114 mm"), así que el
chequeo mira todas las del texto y no sólo la primera.

**Ningún código quedó sin leer.** Barriendo el texto plano de las 84 páginas de
datos y comparándolo con lo que sacó el extractor: 0 códigos sueltos.

**Las 150 filas tienen las tres medidas.** Y ningún valor cae fuera de rango:
un chequeo de plausibilidad (Ø de pistón entre 55 y 145 mm, perno entre 14 y 60,
altura de compresión menor que el alto total, aros entre 0,8 y 8 mm) no marca
nada. Ese chequeo es el que encontró la única fila que había quedado mal —la del
Renault K9K de la página 76, con 0,25 mm de alto— y que era la trampa nº 3 sin
terminar de resolver: la fila terminaba con un segundo "Subconjunto" y un código
europeo que no se carga, y tomarlo como fila propia cortaba la de arriba una
línea antes de tiempo. Ahora una corrida sin ningún número de parte de los que
se cargan no abre fila: se la come la de arriba.

Lo que NO reemplaza nada de esto es que una persona mire la ficha contra el PDF.
Por eso todas entraron con `extra.verificado: false` y la pantalla lo muestra en
la columna **Verif.** Cada ficha guarda en `extra.pagina` de qué página salió,
para poder abrir el PDF ahí mismo.

## Qué mirar si algo no cierra

```bash
# Una sola página, con todo lo que leyó
python3 scripts/leer_pistones_fm2010.py --pagina 41

# Cuántas fichas hay por familia y cuántas están completas
.venv/bin/python -c "
import json
for f in ['pistones','subconjuntos','conjuntos']:
    d=json.load(open('CRAC/tecnicos/%s.json'%f,encoding='utf-8'))
    fm=[x for x in d if x['marca']=='FEDERAL MOGUL']
    print(f, len(d),'fichas ·',len(fm),'FM ·',
          sum(1 for x in fm if len(x['medidas'])==3),'con las tres medidas')"
```

Volver a correr los tres scripts no pisa trabajo hecho: una ficha con
`extra.verificado: true` conserva sus medidas y sólo se le refresca lo del
proveedor (código, descripción y sobremedidas).
