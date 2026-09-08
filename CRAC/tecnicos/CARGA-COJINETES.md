# Cómo se leen los catálogos de cojinetes

Este documento explica de dónde sale cada dato de `cojinetes_biela.json`,
`cojinetes_bancada.json` y `cojinetes_axiales.json`. Son la misma tabla de los
mismos PDF leyendo otra fila, y por eso las arma **un solo script**: lo que
cambia entre una familia y las otras está todo junto arriba de todo, en las
constantes `PIEZAS` y `CAMPOS`.

La tercera —los **cojinetes axiales**, que no son cojinetes sino las
semiarandelas de empuje— se mide distinto que las otras dos: está explicado en
la sección 8.

| | Biela | Bancada | Axial |
|---|---|---|---|
| Categoría del proveedor | `CA` | `CB` | `CF` |
| Marcas que entran hoy | Mahle, Federal Mogul, Glyco | Mahle, Federal Mogul, Glyco | Mahle, Federal Mogul, Glyco |
| Fichas | 354 (282 con medidas) | 345 (256 con medidas) | 120 (96 con espesor, 65 con los dos Ø) |
| Cómo la marca Mahle | composición `BB`/`SBB` | composición `BC`/`SBC` | composición `AE`/`SAE`/`L`/`SL` |
| Cómo la marca Federal Mogul | etiqueta `Bielas` | etiqueta `Bancadas` | etiqueta `Axial` |
| Cómo la marca Glyco | `BE/PL` | `MB/HL` | `TW/A` |

**Axial es la familia nueva del 2026-09-07**, con las tres marcas desde el
primer día: 51 códigos de Mahle (38 con medidas), 42 de Federal Mogul (todos
con espesor, 3 con los dos diámetros) y 27 de Glyco (24 con medidas).

**Bancada entró primero sólo con Glyco y el mismo día se le sumaron Mahle y
Federal Mogul** (2026-09-07): los lectores de las dos ya sabían leerla, así que
alcanzó con agregar las marcas en `PIEZAS` y volver a correr. Quedó en **345
fichas**: 136 de Mahle (110 con medidas), 134 de Federal Mogul (78 con medidas)
y 75 de Glyco (68 con medidas).

El script que hace la extracción es
[`scripts/convertir_cojinetes.py`](../../scripts/convertir_cojinetes.py). Se
corre así, y no pisa nada más que los JSON de las familias que rehace:

```bash
.venv/bin/python scripts/convertir_cojinetes.py            # las tres familias
.venv/bin/python scripts/convertir_cojinetes.py axial      # una sola
```

Cada familia lee los cuatro catálogos de nuevo y son unos minutos, así que
cuando se toca una sola conviene nombrarla: las otras dos quedan como estaban.

Los PDF están en [`fuentes/`](fuentes/). Sin ellos el script no corre.

**El de Glyco es la excepción: no está en el repo.** Pesa 30 MB —más que todo
lo demás junto— y el repo entero se copia a PythonAnywhere en cada deploy, así
que vive en el release `catalogos` de GitHub. Se baja una vez y queda:

```bash
curl -sSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/octet-stream" \
  -o CRAC/tecnicos/fuentes/glyco_cojinetes_2023.pdf \
  "$(curl -sS -H "Authorization: Bearer $GITHUB_TOKEN" \
      https://api.github.com/repos/augustochiappo-ops/Sistema-Presupuestos-Rectificadora/releases/tags/catalogos \
      | jq -r '.assets[] | select(.name|startswith("FM.-.Glyco")) | .url')"
```

El asset se elige **por nombre y no por posición**: en ese release vive también
el catálogo Mahle 2019 de 242 páginas, que usan los pistones.

Si el archivo no está, el script avisa y sigue: los códigos Glyco quedan sin
medidas, pero Mahle y Federal Mogul se cargan igual.

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
| `CA` | Cojinetes de biela |
| `CB` | Cojinetes de bancada |
| `CF` | Cojinete axial (semiarandelas de empuje) ← lo que falta |

| Marca | Catálogo que la cubre |
|---|---|
| `BE` | Mahle — `mahle_cojinetes_2019.pdf` y `mahle_clevite_2014.pdf` |
| `F ` | Federal Mogul — `federal_mogul_cojinetes.pdf` (ojo el espacio: la marca ocupa 2 caracteres) |
| `GL` | Glyco — `glyco_cojinetes_2023.pdf`, y los viejos que sólo están dentro del catálogo de Federal Mogul |

De los 5.170 renglones de la categoría `CA` que vende el proveedor, unos 3.800
son marcas de las que **no tenemos catálogo** (Motores Japoneses 1.164, V.M.
1.156, Akuro 567, Eurasia 434, AceroMetal 256, KS 89…). Ésas quedan afuera de la
familia hasta que aparezca un catálogo que las cubra.

---

## 2. Las cinco columnas de medida

Los cuatro catálogos traen **las mismas cinco columnas**, con distinto nombre y —
esto es lo que hay que tener presente— **en distinto orden**:

| | Mahle 2019, Clevite y Glyco | Federal Mogul |
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

Es lo que separa una familia de la otra en este catálogo. La publica el propio
catálogo en su página de uso:

| Prefijo | Pieza |
|---|---|
| `B` / `SB` | **Bronzina de biela** (MAHLE Original / SPA) |
| `BB` / `SBB` | Bronzina de biela (Metal Leve) |
| `M` / `SM` | **Bronzina central = cojinete de bancada** |
| `BC` / `SBC` | Bronzina central (Metal Leve) |
| `L` / `SL` / `AE` / `SAE` | Arruela de encosto = semiarandela de empuje (categoría `CF`) ← lo que falta |
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

Resuelve **83 de los 122 códigos Federal Mogul** del proveedor, más 12 de Glyco
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

De acá salen 12 de los 87 códigos Glyco del proveedor. Desde que está el
catálogo de Glyco (sección 6) esas doce filas **ya no se usan**: `elegir_fila()`
se queda con las del catálogo propio cuando las hay. Puestas una al lado de la
otra, los Ø, el ancho y el espesor coinciden en los doce; lo que cambia es que
las de Federal Mogul traen erratas que las de Glyco no tienen (`51.995/51.965`,
`48.917/48.987`, `48.984/50.000`, con el segundo valor incoherente con el
primero) y alguna luz de aceite corrida en la última cifra.

Este catálogo sigue haciendo falta igual: es el único que trae los ocho códigos
Glyco viejos que la edición 2023-2025 ya no lista.

---

## 6. Glyco — `glyco_cojinetes_2023.pdf`

El más prolijo de los cuatro, y el que resolvió Glyco de una: **83 de los 87
códigos** del proveedor. 1.252 páginas, texto legible, y —a diferencia de los
otros tres— **cada fila dice de qué pieza es**, así que sirve igual para biela y
para bancada sin cambiarle una línea al lector.

```
BE/PL 4 01-4116/4 STD 0.25 0.50 1015RA 37.998/38.008 41.128/41.140 19.000 1.549 0.022/0.069 AL-LF
└───┘ │ └───────┘ └────────────┘ └────┘ └───────────────────────────────────────────────────┘ └───┘
  │   │     │            │         │      Ø eje · Ø alojamiento · ancho · espesor · luz        material
  │   │     │            │         └───── referencia del componente
  │   │     │            └─────────────── bajomedidas del juego
  │   │     └──────────────────────────── código Glyco del JUEGO (es el que vende el proveedor)
  │   └────────────────────────────────── composición: pares o piezas
  └────────────────────────────────────── tipo de cojinete
```

El tipo sale de la propia página de uso del catálogo (`HOW TO USE`, páginas
VI-XXI), que además numera las once columnas: **`BE/PL` es biela** (*Pleuellager*)
y **`MB/HL` es bancada** (*Hauptlager*); `TW/A` son las semiarandelas de empuje
(categoría `CF` del proveedor) y `SE/PB`, `CB/NWB`, `CS/NWL` y `BU` son bujes.

Las cinco columnas de medida vienen **en el orden de Mahle** (Ø eje, Ø
alojamiento, ancho, espesor, luz), no en el de Federal Mogul. Está en
`ORDEN_COLUMNAS["glyco"]`, aparte de la de Mahle aunque hoy coincidan: son
catálogos distintos y nada garantiza que sigan coincidiendo.

### Las tres cosas que costaron

1. **Tres decimales es lo que separa una medida de una bajomedida.** El catálogo
   escribe las medidas con tres (`19.000`, `1.549`) y las bajomedidas con dos
   (`0.25`, `0.50`). Sin esa diferencia, el `STD 0.25 0.50` del final de una fila
   se lee como si fueran las dos últimas columnas de medida, y encima tapa el
   caso de abajo.
2. **Las filas largas vienen cortadas en tres renglones.** Cuando la lista de
   bajomedidas no entra en la celda, el PDF parte la fila y las medidas llegan
   recién en el último renglón:
   ```
   BE/PL 4 01-4174/4 STD 0.25 0.50
   0.75
   GS9763SA 58.725/58.744 62.433/62.446 25.070 1.830 0.029/0.086 AL-LF
   ```
   El lector guarda lo leído y le pega el renglón de abajo. Son 325 filas: sin
   esto se perdían ocho códigos del proveedor.
3. **La cabecera del panel se mira antes que nada.** Empieza con un número
   (`8 Ĭ 75.00`, que es el Ø del cilindro) y si no se la saca primero, la toma la
   rama de las continuaciones y el Ø del cilindro entra como si fuera el Ø de un
   muñón. Deja fichas con un muñón de 125 mm y suena a dato bueno.

Y una regla que no es del PDF sino del cruce: **un juego de bancada ocupa varias
filas**, una por posición de muñón, y sólo la primera trae el código. El lector
lo arrastra hacia abajo, igual que hace el de Mahle con la composición.

### La aplicación

Los renglones de arriba de la tabla describen el motor: la cabecera del panel
trae el Ø del cilindro —sin la carrera, así que no se guarda: el JSON tiene
`diam_x_carrera` y poner ahí un número solo sería mentir—, después vienen los
códigos de motor, que se reconocen por `4cyl. 903cc`, y por último los modelos
de vehículo, que se reconocen por **el período de fabricación** (`03/85–10/95`).

Esa fecha es lo único que separa un modelo del resto de los renglones sueltos de
la página: llamadas al pie, leyendas en cinco idiomas y el nombre del fabricante
del pie, que si no se colaba al final de cada aplicación (`Autobianchi … Y10 1.0
… AUTOBIANCHI`). Cuando el panel no trae fechas, la aplicación queda con el
fabricante solo; la descripción del proveedor sigue estando en `descripcion`.

### Los códigos, que el proveedor recorta de cuatro maneras

Su campo tiene siete caracteres y el código no siempre entra. No hay una regla:
se generan todas las variantes (`claves_glyco()`) y gana la que exista en la
lista.

| Catálogo | Proveedor | Qué perdió |
|---|---|---|
| `H982/5` | `H982/5` | nada, entra entero |
| `01-3040/4` | `3040/4` | el prefijo de dos dígitos |
| `01-3841/6` | `01-3841` | los pares |
| `71-3850A` | `713850A` | el guión |
| `71-2834` | `2834/1` | ganó la composición de la columna de al lado |

Un mismo juego puede quedar bajo dos códigos del proveedor (`3572/4` y
`71-3572`) y está bien: los vende como dos artículos.

---

## 7. Las bajomedidas

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

## 8. La semiarandela de empuje (cojinetes axiales)

La tercera familia, y **la única que no es un cojinete**: no abraza un muñón,
apoya contra el costado del cigüeñal y le fija el juego axial. Sale de las
mismas tablas de los mismos cuatro catálogos, así que la lee el mismo script,
pero se mide distinto y sus medidas del proveedor significan otra cosa.

| | Cojinete (biela y bancada) | Semiarandela (axial) |
|---|---|---|
| Categoría del proveedor | `CA` / `CB` | `CF` |
| Cómo la marca Mahle | composición `BB`/`SBB`, `BC`/`SBC` | composición `AE`/`SAE`/`L`/`SL` |
| Cómo la marca Federal Mogul | etiqueta `Bielas` / `Bancadas` | etiqueta `Axial` |
| Cómo la marca Glyco | `BE/PL` · `MB/HL` | `TW/A` |
| Qué se mide | Ø muñón · Ø alojamiento · ancho · espesor | **Ø interior · Ø exterior · espesor** |
| Las medidas del juego | BAJOmedidas del muñón | **SOBREmedidas de espesor** |

**Las columnas son las mismas, con otro significado.** La columna del Ø del eje
trae el **Ø interior** de la arandela y la del alojamiento, el **Ø exterior**;
la del espesor sigue siendo el espesor. Por eso la extracción usa siempre los
nombres del cojinete y recién la ficha les pone el nombre que corresponde: es la
constante `CAMPOS` del script.

**Suman en vez de restar.** Cuando la cara de empuje del cigüeñal se rectifica,
lo que hace falta es una arandela **más gruesa**. Así que el `valor` de cada
entrada de `extra.sobremedidas` es `espesor + sobremedida`, y la etiqueta va con
`+` (`+0,127 mm`, `+.005"`). En la pantalla, el filtro "Espesor con sobremedida"
contesta la pregunta del taller: *rectifiqué la cara de empuje y necesito
0,25 mm más — ¿cuánto tiene que medir la arandela?*

**Y las sobremedidas son mucho más chicas.** Un cojinete baja de a 0,25 mm; una
arandela sube de a 0,127. Eso obliga a dos cosas:

1. **El corte entre pulgadas y milímetros no puede ser el tamaño.** En el
   cojinete alcanza con mirar si algún valor llega a 0,2 mm; acá 0,127 y 0,19
   son milímetros y `.005` son pulgadas, y los dos son más chicos que eso. Se
   corta por **el cero adelante**, que es como los escriben los catálogos:
   Mahle pone `0,127` y Federal Mogul, `STD-5-10`.
2. **El proveedor las escribe en milésimas de milímetro.** `127` es 0,127 mm,
   no 1,27. Por eso `leer_medida_axial` prueba tres lecturas del sufijo
   (centésimas, milésimas y milésimas de pulgada) contra lo que declara el
   catálogo para ese juego, en vez de las dos del cojinete.

**Dónde empieza la primera columna de medida.** El script corta la lista de
medidas del juego por tamaño (constante `CORTE`): en el cojinete, en 14 mm —
ningún muñón baja de ahí—; en la arandela, en **1,2 mm**, que queda por debajo
del espesor más fino (1,5) y por encima de la sobremedida más grande (0,5). Sin
ese corte propio se perdían las filas de Federal Mogul que traen **sólo el
espesor**, que son la mayoría: de los 95 renglones `Axial` del catálogo, 26
traen los dos diámetros y 57 traen nada más que el espesor.

**La letra del código Mahle.** El proveedor la tira, igual que la `B` de biela y
la `M` de bancada: el catálogo dice `L57006` y él vende `57006`. Está en
`clave_mahle`.

---

## 9. Lo que quedó pendiente

* **89 códigos de bancada sin medidas.** 83 no están en ninguno de los
  catálogos que tenemos —7 de Glyco (`72-3314`, `72-3448`, `H705/7`, `H931/5`,
  `H938/7`, `H1098/5`, `H1225/5`), 26 de Mahle y 50 de Federal Mogul— y otros 6
  sí tienen ficha pero con la fila de medidas vacía (`CBF 4532`, `CBF 4923`,
  `CBF 6408`, `CBF 6667`, `CBF 6828` y `CBBE11195`). Entran igual, con la
  aplicación y el precio del proveedor, y nunca aparecen en una búsqueda por
  medidas.
* **4 códigos Glyco de biela** que ni la edición 2023-2025 ni el catálogo de Federal Mogul
  traen (`71-2404`, `71-3447`, `71-3951`, `713850A`): referencias viejas que
  Glyco discontinuó y el proveedor todavía vende. Están cargadas igual, con la
  aplicación y el precio, y las medidas vacías.
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
