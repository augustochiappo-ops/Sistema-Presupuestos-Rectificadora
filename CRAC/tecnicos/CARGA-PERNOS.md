# Cómo se leyó el catálogo de pernos de pistón

Este documento explica de dónde sale cada dato de `pernos.json`, la familia
número doce del buscador por medidas. La arma
`scripts/convertir_pernos_pescara.py`.

| | Pernos |
|---|---|
| Categoría del proveedor | `PE` |
| Marca del proveedor | `PE` (Pescara) |
| Catálogo | Talleres Metalúrgicos Pescara, "CATALOGO WEB 07-2018", 28 páginas |
| Archivo | `CRAC/tecnicos/fuentes/Pescara 2018web.pdf` (481 KB, va en el repo) |
| Fichas | **252**, todas con Ø exterior, largo y código del proveedor |
| Renglones de la lista de precios que cubren | 582 |

## Qué fichas entran, y por qué no son las 332 del catálogo

Los pernos son del grupo **"sólo proveedor"** (regla del dueño del 2026-09-08,
escrita en `CLAUDE.md` y en la cabecera de `ESPEC` en
`webapp/backend/app/tecnicos.py`): entra la ficha que tiene renglón en la lista
del proveedor y nada más. Un perno que no se puede pedir no le resuelve nada al
taller.

Las cuentas de la carga:

| | Códigos |
|---|---|
| En el catálogo de Pescara | 332 |
| En la lista del proveedor | 305 |
| **En los dos → tienen ficha** | **252** |
| Sólo en la lista del proveedor | 53 |
| Sólo en el catálogo | 80 |

Los **53 que el proveedor vende y el catálogo no tiene** son posteriores a esta
edición, que es de 2018: las series 3658-3680, 5595-5609, 7240-7473 y 8001-8003,
más `9998` y `9999`. El script los lista al final de cada corrida `--ver`, así se
sabe exactamente qué pedirle a Pescara cuando salga una edición nueva.

Hay además **24 renglones de fabricación especial** que no son códigos de
catálogo: traen el Ø y el largo metidos adentro del propio código
(`PEPE1190088STD` es un perno de Ø 11,90 × 88,00 hecho a pedido para un Ford T,
`PEPE19X63  STD` uno de Ø 19 × 63). No matchean el patrón de código y quedan
afuera, que es lo correcto: no tienen ficha de catálogo que leer.

## De qué tabla del catálogo sale cada dato

El catálogo tiene **dos** tablas, y esta carga usa la primera.

### La que se usó: "LISTADO DE PERNOS SEGÚN DIÁMETRO EXTERIOR" (páginas 4 a 7)

Cuatro columnas —Código, Aplicación Orientativa, Ø Ext., Largo— y **452 filas**,
una por marca de motor. De ahí salen las medidas.

    1027 ECHO      10.00 27.20
    3008 BEDFORD   34.92 91.10
    5549 CHEVROLET 17.00 53.50

Las 452 filas dan 332 códigos, y **cada código tiene un solo par (Ø, largo)** —
el script lo verifica en cada corrida y avisa si algún día un código apareciera
con dos medidas distintas, porque ahí la ficha estaría mintiendo y hay que
mirarlo a mano. Un código que figura en varias filas es un perno que sirve para
varias marcas: las marcas se juntan en `aplicacion` separadas por " / " (el
código `1027` es "ECHO / HUSQVARNA / STHIL").

El catálogo llama a esa columna **"aplicación orientativa"** y es eso: la marca
del motor, no el modelo. El modelo sale de la descripción de la lista del
proveedor, que suele ser más específica ("BEDFORD 350" contra "BEDFORD"), y va
en `descripcion`.

### La que quedó para otra tanda: las aplicaciones por vehículo (páginas 8 a 28)

Trae bastante más: el modelo y el motor de cada vehículo, la cantidad de
cilindros, el Ø del cilindro y el **"Gpo"** (A o C), que es el que dice qué
sobremedidas acepta cada perno — el pie de página lo explica: *grupo A: STD,
+1/2", +1", 005"; grupo C: STD, 1° sm, 2° sm*.

**No se leyó, a propósito.** Ahí las columnas salen del PDF pegadas y sin
separador:

    3028 38.10 93.50A4111.12830

es el código 3028, Ø 38,10, largo 93,50, grupo A, 4 cilindros, Ø de cilindro
111,12 y modelo 830 — todo junto. Partir eso con expresiones regulares es
adivinar dónde termina un número y empieza el otro, y un corte mal puesto le
cuelga a un perno el Ø de cilindro del vecino. Se hace bien leyendo las
coordenadas x de cada fragmento, como hace `convertir_cojinetes.py` con
`visitor_text`, y eso merece su propia tanda con su propia verificación.

**Cuando se haga, hay un control gratis**: los códigos, el Ø y el largo están en
las dos tablas, así que la segunda sirve para verificar la primera. Ya se cruzó a
mano un caso —el `5549` da Ø 17,00 × 53,50 en las dos— y coincide.

## Las sobremedidas se guardan con su etiqueta, sin traducir a milímetros

La página 3 del catálogo explica dos escalas, según cómo trabaje el perno:

| Deslizante en la biela | Fijo en la biela |
|---|---|
| +1/2" = 0,012 mm | 1ra sup. medida = 0,010 mm |
| +1" = 0,025 mm | 2da sup. medida = 0,015 mm |
| 005" = 0,125 mm | |

La lista del proveedor, en cambio, las etiqueta **`STD`, `003`, `005`, `010`,
`020`, `1/2`, `+1`, `1SM`, `2SM` y `3SM`**. Se ve la familia de cada una, pero
**cuál etiqueta es cuál milímetro no está escrito en ninguna de las dos
fuentes**: "005" podría ser el `005"` de la tabla de deslizantes, y "010" y "020"
no figuran en ninguna de las dos columnas.

Por eso `extra.sobremedidas` guarda **las etiquetas tal cual las escribe el
proveedor** y el filtro de la familia va por el Ø de la medida STD y por el
largo. Adivinar la equivalencia pondría un Ø falso en una ficha de perno, que es
peor que no ponerlo: la pantalla muestra las etiquetas y el taller pide la que
quiere.

**Cómo se destraba**: con el "Gpo" de la segunda tabla (arriba) se sabe de qué
escala es cada perno, y con eso más una confirmación de Pescara sobre `003`,
`010` y `020` se podría calcular el Ø de cada sobremedida y sumar el filtro
`diam_sobremedida`, como en camisas y bujes.

## Cómo se corre

```bash
python3 scripts/convertir_pernos_pescara.py --ver   # cuenta y lista los 53, sin escribir
python3 scripts/convertir_pernos_pescara.py         # escribe CRAC/tecnicos/pernos.json
```

El PDF **vive en el repo** (481 KB): es del mismo orden que
`fadecya_camisas_web.pdf` y no hace falta el release, a diferencia del de Glyco,
el Mahle brasileño y el de Persan, que pesan decenas de megas.

## Qué se ve en pantalla

Dos filtros de medida —Ø exterior y largo— y tres de texto —código, marca del
motor y motor—. Es la familia con menos filtros del buscador, y alcanza: a un
perno se le miden esas dos cosas.

La pestaña **no tiene** la casilla "Solo las que tiene el proveedor", porque las
252 fichas tienen código y la casilla no filtraría nada (ver la cabecera de
`ESPEC`).

La columna **Sobremedidas** lista las etiquetas separadas por " · " ("005 · 010 ·
STD"), con el renderer `etiquetas`, que va aparte del de camisas y bujes
justamente porque acá no hay un Ø por sobremedida que poner arriba. La columna
**Precio de** dice de cuál de ellas es el precio que se está mostrando.
