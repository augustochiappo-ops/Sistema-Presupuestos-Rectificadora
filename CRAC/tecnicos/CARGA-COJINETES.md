# Cómo se leen los catálogos de cojinetes

Este documento explica de dónde sale cada dato de `cojinetes_biela.json` y cómo
repetir el trabajo para **cojinetes de bancada**, que es la misma tabla de los
mismos PDF leyendo otra fila.

El script que hace la extracción es
[`scripts/convertir_cojinetes.py`](../../scripts/convertir_cojinetes.py). Se
corre así, y no pisa nada más que el JSON:

```bash
.venv/bin/python scripts/convertir_cojinetes.py
```

Los PDF están en [`fuentes/`](fuentes/). Sin ellos el script no corre.

---

## 1. El código del proveedor

Todo empieza acá, porque **el universo de la familia es la lista del proveedor**:
una ficha existe si el proveedor vende esa pieza. El código tiene ancho fijo, 14
caracteres, y se lee siempre igual:

```
C A B E 0 1 4 7 2 _ _ 0 2 5
└─┘ └─┘ └───────────┘ └───┘
 │   │        │         └── medida (3): STD, 025, 050, 075, 100, 10, 20, 30…
 │   │        └──────────── código del fabricante (7), alineado a la izquierda
 │   └───────────────────── marca (2)
 └───────────────────────── categoría (2)
```

| Categoría | Qué es |
|---|---|
| `CA` | Cojinetes de biela ← **lo que carga este JSON** |
| `CB` | Cojinetes de bancada ← lo que falta |
| `CF` | Cojinete axial (semiarandelas de empuje) |

| Marca | Catálogo que la cubre |
|---|---|
| `BE` | Mahle — `mahle_cojinetes_2019.pdf` y `mahle_clevite_2014.pdf` |
| `F ` | Federal Mogul — `federal_mogul_cojinetes.pdf` (ojo el espacio: la marca ocupa 2 caracteres) |
| `GL` | Glyco — hoy sólo los que aparecen dentro del catálogo de Federal Mogul |

De los 5.170 renglones de la categoría `CA` que vende el proveedor, unos 3.800
son marcas de las que **no tenemos catálogo** (Motores Japoneses 1.164, V.M.
1.156, Akuro 567, Eurasia 434, AceroMetal 256, KS 89…). Ésas quedan afuera de la
familia hasta que aparezca un catálogo que las cubra.

---

## 2. Las cinco columnas de medida

Los tres catálogos traen **las mismas cinco columnas**, con distinto nombre y —
esto es lo que hay que tener presente— **en distinto orden**:

| | Mahle 2019 y Clevite | Federal Mogul |
|---|---|---|
| 1ª | Ø standard do eixo | E · Ø estándar del eje |
| 2ª | Ø standard do alojamento | F · Ø del alojamiento |
| 3ª | Largura da bronzina | **G · Luz de aceite** |
| 4ª | Espessura da bronzina | H · Espesor máximo |
| 5ª | **Folga vertical** | **I · Ancho total** |

En el script eso es la constante `ORDEN_COLUMNAS`. En el JSON las cuatro que se
pueden buscar son `diam_munon`, `diam_alojamiento`, `ancho` y `espesor`; la luz
de aceite va a `extra.luz_aceite` y se muestra pero no se filtra (es un valor de
control, se verifica con plastigage después de armar, no se mide para elegir la
pieza).

Casi todos los valores son **rangos** (`56,520/56,535`) y por eso en el JSON son
listas de dos números. El buscador ya sabe tratarlas: una ficha entra si
cualquiera de los dos extremos cae en el rango pedido.

### El problema de las columnas vacías

Una fila puede tener columnas en blanco, y el texto del PDF **no dice cuál
falta**: llegan tres números sueltos y hay que adivinar a qué columna va cada
uno. Se resuelve de dos maneras, en este orden:

1. **Por posición.** En la mayoría de las páginas cada columna llega como un
   pedazo de texto propio, con su coordenada `x`, y ahí no hay nada que
   adivinar. Las posiciones son fijas y están en `MAHLE_COLS_MEDIDA`.
2. **Por tamaño.** Hay páginas donde el PDF manda las cinco columnas pegadas en
   un solo pedazo de texto. Ahí entra `asignar_columnas()`: prueba todas las
   combinaciones que respetan el orden del catálogo y descarta las que dan
   valores imposibles según `RANGOS` (un espesor de cojinete de biela no mide
   50 mm, ni una luz de aceite mide 20). Si queda más de una combinación
   posible, se toma la que llena las columnas de más a la izquierda y la ficha
   sale marcada en `extra.revisar`.

También se controla que el **alojamiento sea siempre mayor que el muñón**, que
es lo que descarta los repartos absurdos.

### Los números partidos

El PDF corta números por la mitad: `2,159/2,1 72` es `2,159/2,172`. Pasa siempre
en el segundo número del rango y se arregla con una regla simple, que está en
`numeros()`: **los dos números de un rango tienen la misma cantidad de
decimales**, así que si al segundo le faltan, los dígitos sueltos que vienen
atrás son los que faltan.

---

## 3. Mahle — `mahle_cojinetes_2019.pdf`

El grueso de la carga: **113 de los 145 códigos Mahle** que vende el proveedor.
Cubre autos, camiones, tractores e industriales.

**Cada hoja del PDF trae dos páginas impresas**, una al lado de la otra: la
izquierda arranca en x=0 y la derecha 595 pt más a la derecha. El script procesa
las dos por separado, con las mismas columnas. El número de página que queda en
`extra.pagina_catalogo` es el **impreso** (el que sirve para volver a mirar la
fila), sacado del pie de página, no el de la hoja del PDF.

Las once columnas, con la numeración que el propio catálogo publica en su página
de uso:

| x | # | Columna |
|---|---|---|
| 20–100 | 1 | Aplicação / Motor / Modelo |
| 100–172 | 2, 3 | Nº de cilindros · Ø del cilindro × carrera |
| 172–215 | 4 | Códigos: Metal Leve arriba, MAHLE Original en el renglón de abajo |
| 215–260 | 5 | Composición: pares/piezas + código Clevite |
| 260–310 | 5, 6 | Tipo (material) · Medidas (las bajomedidas del juego) |
| 310–580 | 7–11 | Las cinco columnas de medida |

### La letra del código dice qué pieza es

Ésta es **la tabla que hace falta para bancada**. La publica el catálogo en su
página de uso:

| Prefijo | Pieza |
|---|---|
| `B` / `SB` | **Bronzina de biela** (MAHLE Original / SPA) ← lo que se cargó |
| `BB` / `SBB` | Bronzina de biela (Metal Leve) |
| `M` / `SM` | **Bronzina central = cojinete de bancada** ← lo que falta |
| `BC` / `SBC` | Bronzina central (Metal Leve) |
| `L` / `SL` / `AE` / `SAE` | Arruela de encosto = semiarandela de empuje (categoría `CF`) |
| `H` / `SH` / `EC` / `SEC` | Bucha de eixo de comando = buje de árbol de levas |
| `G` / `SG` / `BG` / `SBG` | Bucha de biela = buje de biela (ya cargado, otra familia) |

Y el número: *"los tres primeros dígitos indican la marca, los cuatro
siguientes identifican exactamente la pieza/juego"*.

**Ojo con esto**: el filtro del script NO se hace sobre el código MAHLE sino
sobre la **columna de composición** (`BB`/`SBB` contra `BC`/`SBC`), porque el
código va sólo en el **primer renglón** de cada juego y un juego puede ocupar
varios: el semicojinete inferior (`-I`) y el superior (`-S`), o —en bancada— una
posición por cada muñón. La composición sí está en todos los renglones.

Las filas que continúan un juego no repiten el código y el catálogo **les corre
la composición hasta el margen izquierdo**, donde va la aplicación. El script lo
contempla; el que haga bancada lo va a necesitar mucho más, porque ahí la mayoría
de los juegos ocupan varias filas.

### Cuando el mismo juego aparece varias veces

Un juego aparece muchas veces en el catálogo, una por cada motor que lo usa, casi
siempre con las mismas medidas: eso no es ambigüedad. Quedan dos casos que sí:

* **Inferior y superior con espesores distintos.** El proveedor vende el juego
  completo, así que se toma el reparto de medidas **más repetido** y la ficha
  queda marcada en `extra.revisar`.
* **El mismo número con varios sufijos de material.** Cuando el proveedor lo
  aclara en su código (`F 1245CP`), se usa ése.

---

## 4. Mahle — `mahle_clevite_2014.pdf`

Cubre **exclusivamente Caterpillar y Cummins**, y es el complemento del anterior:
resuelve los 5 códigos Mahle del proveedor que son de esos motores y que el 2019
no trae. La grilla es la misma que la del 2019 (mismas columnas, mismas
posiciones) con dos diferencias:

* Una sola página impresa por hoja de PDF.
* El código MAHLE va **en el mismo renglón** de la fila, no en el de abajo.

El script usa la misma función para los dos (`leer_mahle`), con un parámetro.

### Por qué NO se usa el Clevite 2019/2020

Hay un tercer PDF de Mahle, el **Clevite 2019/2020** (47 páginas), que cubre los
mismos motores. **No se puede leer**: sus tablas de bronzinas están hechas con
fuentes que no declaran a qué carácter corresponde cada símbolo (el `ToUnicode`
del PDF sólo mapea el espacio y el guión), así que el PDF dibuja los dígitos pero
no dice qué dígitos son. Ninguna herramienta de texto los recupera; haría falta
OCR o reconocer los glifos por su forma. Como el Clevite 2014 cubre lo mismo y sí
se lee, no vale la pena.

---

## 5. Federal Mogul — `federal_mogul_cojinetes.pdf`

Resuelve **82 de los 122 códigos Federal Mogul** del proveedor, más 12 de Glyco
(ver abajo).

Este catálogo **no se lee por posición**: el margen izquierdo se corre de una
página a otra (76 pt en unas, 45 en otras) y la columna de medidas con él, así
que una `x` fija manda la mitad de las filas a la columna equivocada. Se lee por
contenido: se junta el renglón entero y se lo parte por lo que dice.

Las columnas, con las letras que usa su propia página de instrucciones:

| Letra | Columna |
|---|---|
| A | Cilindros, Ø, carrera y cilindrada |
| B | **Pieza**: `Biela`, `Bancada`, `Axial`, `Levas`, `Buje de Biela` |
| C | Número de juego y sufijo de material |
| D | Medidas (las bajomedidas) |
| E | Ø estándar del eje |
| F | Ø del alojamiento |
| G | Luz de aceite |
| H | Espesor máximo del cojinete estándar |
| I | Ancho total |

**Para bancada, acá lo que cambia es la palabra**: `Bielas?` por `Bancadas?`. Y
hay un detalle que complica: la bancada trae **una fila por posición de muñón**
(`1`, `2-4`, `3`, `5`), cada una con su número de pieza, y arriba de todas el
número del **juego** (`6446 M`), que es el que vende el proveedor. La ficha de
bancada va a tener que juntar varias filas.

### Cosas para tener en cuenta

* **El dígito adelante del número son los pares de semicojinetes**: `4-1490` son
  cuatro pares. No es parte del número: el proveedor lo tira y vende `F 1490`. A
  veces lo pone como sufijo (`F 1645-4`, `F 1750-6`).
* **El sufijo `M` es juego de bancada o de árbol de levas.** Se descarta.
* **Debajo de cada fila hay otra en pulgadas**, con los mismos valores. Se tira
  entero: el sistema trabaja en milímetros. Se la reconoce por las comillas.
* **Hay páginas donde la fila de biela no lleva etiqueta.** El catálogo la omite
  cuando es la primera del grupo. El script acepta la primera fila sin etiqueta;
  el cruce contra el proveedor (que separa `CA` de `CB`) es la red de seguridad.
* **La tabla de sufijos de material** está en la página de instrucciones y quedó
  copiada en el script (`MATERIAL_FM`): `AP` aluminio-cadmio, `AT` aluminio con
  6 % de estaño, `B` respaldo de bronce con Babbit, `CA` cobre-plomo, `CP`
  cobre-plomo con película plomo-estaño, `RA` aluminio con 20 % de estaño, `SA`
  acero con Babbit. Las variantes con una letra de más (`APA`, `CAB`, `RAA`,
  `SBI`) son el mismo material.

### Glyco vive adentro de este catálogo

Las últimas páginas, las de vehículos europeos, usan **numeración Glyco**
(`01-3841/6`, `71-3728/4`) en vez de la de Federal Mogul. Glyco es marca de
Federal-Mogul y el proveedor los lista aparte con el prefijo `GL`. Se los
distingue del número de juego porque **la cantidad de pares no pasa de 12 y no se
escribe con cero adelante**. El `/6` del final son los cilindros y el proveedor
no lo escribe.

Hoy salen 12 de los 87 códigos Glyco del proveedor. Los otros 75 esperan al
catálogo de Glyco y **no están cargados ni como ficha vacía**: cargarlos antes de
tener el catálogo sería ruido.

---

## 6. Las bajomedidas

Un cojinete de biela se pide por su **bajomedida**: cuánto se le rectificó al
muñón del cigüeñal. Los catálogos las escriben en dos sistemas y el proveedor en
un tercero:

| Fuente | Cómo la escribe |
|---|---|
| Catálogo, métrico | `STD/ 0,25/ 0,50/ 0,75` · `STD-0.25-0.50` |
| Catálogo, pulgadas | `STD-10-20-30-40` · `STD-.010-.020` |
| Proveedor | `STD` `025` `050` `10` `20` `030` |

El del proveedor es ambiguo mirándolo solo: `030` pueden ser 0,30 mm o 30
milésimas de pulgada (0,762 mm), que no es lo mismo ni parecido. **Se resuelve
con el catálogo**: se calculan las dos lecturas posibles y se elige la que cae
sobre una bajomedida que el catálogo declara para ESE juego.

La tolerancia de esa comparación es de 0,02 mm **a propósito**: 0,25 mm y
`.010"` son 0,250 y 0,254, y en el taller son la misma pieza. Lo mismo 0,50 con
`.020"` (0,508) y 0,75 con `.030"` (0,762).

Cuando el proveedor vende una medida que el catálogo no lista —pasa seguido: el
catálogo llega hasta 0,75 y el proveedor tiene también la de 1,00— se la
interpreta con el sistema que usa ese catálogo y la ficha queda marcada en
`extra.revisar`.

En el JSON, cada bajomedida es una entrada de `extra.sobremedidas` y su `valor`
es **el Ø que le queda al muñón rectificado a esa medida** (`Ø STD − bajomedida`).
Por eso el filtro "Ø muñón rectificado" de la pantalla contesta la pregunta del
taller: *el cigüeñal ya viene rectificado y el muñón mide 48,72 — ¿qué cojinete
le va?*

---

## 7. Lo que quedó pendiente

* **Cojinetes de bancada** (categoría `CB`): es el motivo de este documento.
* **Glyco**: 75 códigos esperando el catálogo de la marca.
* **27 códigos Mahle y 40 de Federal Mogul** que el proveedor vende y no están en
  ninguno de los catálogos que tenemos. Están cargados igual, con la aplicación y
  el precio del proveedor y las medidas vacías: se los encuentra buscando por
  código o por aplicación, nunca en una búsqueda por medidas, y el `?` de la
  pantalla explica por qué. Entre ellos hay un grupo grande de códigos de origen
  Cummins que Federal Mogul vende con el número del fabricante del motor
  (`3901171`, `3950661`, `3967060`…): ésos necesitan un catálogo de Cummins.
* **La tabla de materiales de Mahle.** El tipo (`P`, `SP`, `C`, `B`, `FT`) queda
  guardado en `extra.tipo_material` sin traducir: la leyenda no está en las
  páginas de cojinetes que tenemos.
* **Siete filas con errores de imprenta** en los PDF, donde el segundo valor de
  un rango es más chico que el primero (`53.025/43.045`). Están marcadas en
  `extra.revisar` una por una.
