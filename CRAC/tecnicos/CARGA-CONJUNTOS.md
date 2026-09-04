# Cómo cargar los datos técnicos de los CONJUNTOS

Este documento es para la sesión que tenga a mano los PDF de Mahle: el
**catálogo 2019** ("Mahle - Pistones, Camisas, Cojinetes 2019 web.pdf") y el
**Clevite 2019/2020** ("Mahle-Clevite 2020-21.pdf"), que es el que trae
Caterpillar y Cummins. Explica qué falta, de dónde sale cada dato y cómo dejarlo
cargado sin romper nada.

## Dónde estamos

`conjuntos.json` ya tiene **las 128 fichas** que trabaja el proveedor, con
código, descripción, precio y stock. Al 2026-09-04 hay **67 con medidas** y
**61 esperando el catálogo** (las que tienen `"medidas": {}`).

De las 67, **15 están verificadas** (salieron de un subconjunto ya corroborado,
lo dice `extra.ficha_de`) y **52 están pendientes de verificación**: se leyeron
del PDF con el extractor y pasan los controles automáticos, pero nadie las
cruzó a mano contra el catálogo. Lo dice `extra.verificado` y se ve en la
columna **Verif.** de la pantalla.

Ver qué falta y en qué orden:

```bash
python3 scripts/leer_conjuntos_mahle.py --listar
```

Ver cuáles faltan:

```bash
python3 -c "
import json
f=[x for x in json.load(open('CRAC/tecnicos/conjuntos.json',encoding='utf-8')) if not x['medidas']]
print(len(f),'sin medidas')
[print(' ',x['codigo'],'·',x['descripcion']) for x in f]"
```

## Los códigos, que es lo que más confunde

    T BEK21540
    │  │ └── código de KIT del catálogo Mahle: K21540
    │  └──── marca BE = Mahle
    └─────── categoría T = "Conjuntos" del proveedor

El **número** (21540) es la llave: en el catálogo, el conjunto `K21540`, el
subconjunto `S21540` y la camisa `C21540` son **la misma fila** — el mismo
pistón, un juego completo de motor en un caso y una pieza suelta en el otro. Así
que para llenar la ficha de un conjunto se busca en el PDF **la fila de su
número**, exactamente como se hace con los subconjuntos.

**El sufijo `WS`** (22 códigos) quiere decir que el juego **viene con los orings
de camisa**: son todos motores de camisa húmeda, y la diferencia de precio
contra el mismo código sin sufijo es justo lo que sale el juego de orings de ese
motor. No hace falta cargarlo a mano — lo pone
`scripts/conjuntos_desde_proveedor.py` en `extra.oring` y la tabla lo muestra en
su columna.

Ojo con la "E": el catálogo Mahle también nombra conjuntos con `E#####`, pero el
proveedor **no usa esa letra** (para él la E es "Conjuntos de Embrague"). Lo que
figura en la lista es `T BEK…` y nada más.

### Caterpillar y Cummins van en OTRO catálogo, y ahí la llave es otra

Lo de arriba vale para el **Mahle 2019**. Los motores **Caterpillar y Cummins no
están ahí**: están en el **Mahle Clevite 2019/2020** ("Mahle-Clevite 2020-21.pdf"),
que es el catálogo que cubre esas dos marcas. Ahí las páginas del PDF coinciden
con las impresas y no hay que convertir nada.

Y **en el Clevite el número NO es la llave**: cada columna de la fila lleva su
propio código. Una fila real de la página 24:

    aros A21510 · conjunto E21450 · subconjunto S21450 · camisa C21510 · kit K21450

Cinco números distintos en la misma fila. Así que para un `T BEK…` hay que buscar
el código **en la columna del kit** (la última, "Códigos MAHLE Clevite EO"), no el
número suelto. Buscar "21510" en esa página trae los aros y la camisa de una fila
que **no es** la del kit K21510.

Dos consecuencias que ya mordieron:

- **`T BEK211000` es `K0211000` en el catálogo**, con un cero adelante. El
  `codigo_fab` que arma el script dice `K211000` y no matchea: hay que buscar las
  dos formas.
- **`K21510` y `K21515` son el mismo pistón** (los dos llevan `S21500`) con dos
  camisas distintas: `C21510` con `L=237,12` y `C21900` con `L=234,12`. Eso es lo
  que el proveedor distingue con **`C/L` y `C/C`** al final de la descripción:
  **camisa larga** y **camisa corta** (confirmado por el dueño el 2026-09-04).
  O sea que dos conjuntos con el mismo pistón y distinta camisa son dos fichas
  distintas, no un duplicado a limpiar.

La regla del Ø sigue valiendo igual, y hay una verificación mejor cuando se puede:
si la fila trae un `S#####` que ya tenemos cargado como subconjunto, **el pistón
tiene que coincidir en todo** (KH, GL, rebaje, perno, juego, aros). Lo único que
puede cambiar es la camisa — que es justo lo que el conjunto agrega. Se cruzaron
así las cuatro fichas `S21500`, `S21630`, `S21850` y `S21940`, y dieron exactas.

**Regla de verificación obligatoria** (viene de la skill `datos-mahle-016`,
caso documentado S BE70870): antes de copiar los datos de una fila, confirmar
que **el Ø del catálogo coincide con el Ø que dice la descripción del
proveedor** — está al final, "… 114 mm". Si no coinciden, es otra fila.

## El formato de la ficha

Los campos `codigo`, `codigo_fab`, `marca`, `descripcion` y `codigos_crac` **no
se tocan a mano**: los pone `scripts/conjuntos_desde_proveedor.py` desde la
lista del proveedor. Lo que se carga del catálogo es `aplicacion`, `medidas` y
`extra`, con esta forma exacta (ejemplo real, `T BEK21540`):

```json
{
 "codigo": "T BEK21540",
 "codigo_fab": "K21540",
 "marca": "MAHLE",
 "aplicacion": "VW 19-320 TITAN CONSTELLATION / CARGO 4532 E",
 "descripcion": "CUMMINS 6CTE ISCE CAM.81mm P.14,25 114mm",
 "medidas": { "diam_piston": 114, "alt_piston": 115.6, "diam_perno": 45 },
 "extra": {
  "fabricante": "CUMMINS",
  "motor": "MOTOR ISC-E",
  "nro_cil": 6,
  "diam_cilindro": "114,00",
  "alt_compresion": 79,
  "prof_rebaje": 14.45,
  "diams_dispon": "STD",
  "largo_perno": 91,
  "perno_str": "∅45,00 × 91,00",
  "juego_montaje": 0.13,
  "codigo_aros": "A21550",
  "medida_aros": "1-3,5T / 1-3T / 1-4",
  "tipo_camisa": null,
  "dim_camisa": "A=124,47 / B=114,02 / C=130,95 / L=234,12",
  "codigo_camisa": "C21900",
  "sobremedidas": ["STD"]
 },
 "codigos_crac": [{ "codigo": "T BEK21540", "medida": null }]
}
```

Qué es cada cosa, en los términos del catálogo:

| Campo | En el catálogo | Nota |
|---|---|---|
| `medidas.diam_piston` | Ø del pistón | el que se cruza con la descripción del proveedor |
| `medidas.alt_piston` | **GL** (altura total) | |
| `medidas.diam_perno` | Ø del perno | |
| `extra.alt_compresion` | **KH** | |
| `extra.prof_rebaje` | rebaje de válvulas | |
| `extra.largo_perno` / `perno_str` | perno | `perno_str` se escribe `∅45,00 × 91,00` |
| `extra.diams_dispon` / `sobremedidas` | medidas disponibles | `"STD / 0,50"` y `["STD","0,50"]` |
| `extra.codigo_aros`, `medida_aros` | C. aros y sus medidas | |
| `extra.codigo_camisa`, `dim_camisa`, `tipo_camisa` | C. camisa y dimensiones | `null` si la fila no la trae |
| `aplicacion` | los vehículos de la fila | texto libre, puede venir en dos renglones |

**Un dato que no está no se inventa**: va `null` (o se omite la clave). Si se
leyó pero quedó en duda, se carga el número y se agrega
`"revisar": {"alt_piston": "el PDF trae la fila corrida"}` — la pantalla lo
muestra con un "?" y el motivo en el tooltip.

## Los dibujos

El dibujo del pistón se comparte con el subconjunto del mismo número, así que
**los 15 que ya tenían ficha ya tienen dibujo**. Para los demás:

1. Recortar del PDF la fila con el pistón (skill `foto-mahle-006`: se rasteriza
   la página con `pdftoppm -jpeg -r 300`, se ubica la columna de dibujos y se
   recorta la fila). Que se vean **las dos vistas**: el corte y el círculo.
2. Guardar el recorte en `CRAC/tecnicos/fuentes/pistones/` con el número en el
   nombre: `E21540.png`, `S21540.png` o `21540.png` — las tres formas se leen.
   No hace falta limpiarlo: puede traer números, rayas de la grilla y hasta
   medio pistón del vecino.
3. Correr el recorte, que limpia y arma el manifiesto:
   `python3 scripts/recortar_pistones_mahle.py --hoja` (tarda ~4 minutos; la
   lámina de control sale en `/tmp/pistones-recortados.png` y conviene mirarla).
4. **Control**: `git status webapp/frontend/public/pistones/` tiene que mostrar
   solo los PNG nuevos. Si aparece uno viejo modificado, algo se rompió.

## El extractor: `scripts/leer_conjuntos_mahle.py`

Leer estas tablas a ojo del texto plano no funciona —`pdftotext -layout`
intercala los valores de las celdas apiladas con los de las columnas vecinas—,
así que el trabajo pesado lo hace un script que va por **coordenadas**
(`pdfplumber`; hace falta `pip install pdfplumber`, y `pypdfium2` si además se
quiere rasterizar una página para mirarla).

```bash
# qué conjuntos esperan el catálogo, en orden
python3 scripts/leer_conjuntos_mahle.py --listar

# leer las filas de los primeros 50
python3 scripts/leer_conjuntos_mahle.py     --pdf-2019    "…/Mahle-Pistones, Camisas, Cojinetes 2019 web.pdf"     --pdf-clevite "…/Mahle-Clevite 2020-21.pdf"     --desde 1 --hasta 50 --salida /tmp/filas.json
```

Deja un JSON con la fila cruda de cada código, celda por celda. **No escribe
`conjuntos.json`**: armar la ficha y mirarla contra el PDF sigue siendo trabajo
de la sesión.

### Los controles que hay que correr sobre lo leído

Ninguno reemplaza mirar la página, pero los tres juntos atajan lo que más se
rompe:

1. **El Ø del catálogo contra el de la descripción del proveedor** (va al final,
   "… 114 mm"). Ojo con los que vienen en pulgadas: `4.3/4"` son 120,65 mm.
2. **GL > KH.** Si no se cumple, casi siempre se leyó como altura total el
   segundo rebaje de un pistón con dos fresados (ver abajo).
3. **El Ø del perno contra el del pistón.** Un perno de más de la mitad del
   diámetro del pistón es una columna corrida.

### Lo que hay que mirar a ojo igual

- **Pistones con dos fresados.** El catálogo escribe `73,91 -6,68 -` y sigue
  `14,22` en el renglón de abajo, justo donde suele ir GL. Van como texto:
  `"6,68 / 14,22"`.
- **Variantes dentro de una misma fila.** `K48930` y `K48933` comparten fila:
  el segundo es la variante "STD c/ KH−0,30" y tiene **su propio KH y su propio
  GL** (89,65 / 139,70 contra 89,95 / 140,00). La descripción del proveedor lo
  canta: dice `(-0,3)`. El extractor no las separa solo.
- **Filas que apilan varios motores.** En la página 58 un solo juego
  (`E26040`/`K26040`) cubre el OHV 3201, el 4256 y el 4269, y repite el Nº de
  cilindros. El `diam_cilindro` queda con todos los valores de la celda.

## El circuito completo, en orden

```bash
# 1. Refrescar lo del proveedor y traer lo que se pueda del subconjunto gemelo
python3 scripts/conjuntos_desde_proveedor.py --desde-subconjuntos

# 2. Cargar a mano las medidas leídas del PDF en CRAC/tecnicos/conjuntos.json
#    (solo aplicacion / medidas / extra)

# 3. Dibujos, si se recortó alguno
python3 scripts/recortar_pistones_mahle.py

# 4. Verificar
DATA_DIR=/tmp/rect-test .venv/bin/python tests/backend_medidas.py
export APP_PASSWORD="…" && tests/preparar.sh && node tests/ui_medidas.mjs

# 5. Frontend y deploy (ver CLAUDE.md)
cd webapp/frontend && npm run build
```

`tests/backend_medidas.py` verifica el total de conjuntos: si se agrega o se
saca alguno, hay que actualizar ese número (y el de `tests/README.md`).

## Reglas del repo que valen también acá

- **Se trabaja en `master` y se pushea directo**, sin ramas ni PRs, aunque el
  entorno de la sesión pida lo contrario (ver CLAUDE.md).
- El deploy lo dispara Claude con el `DEPLOY_SECRET` que pasa el dueño en cada
  sesión; producción no se actualiza sola.
- El nombre del proveedor puede aparecer en los datos pero **nunca en pantalla**.
