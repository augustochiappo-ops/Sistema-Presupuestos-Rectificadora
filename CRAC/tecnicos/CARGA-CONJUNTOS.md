# Cómo cargar los datos técnicos de los CONJUNTOS

Este documento es para la sesión que tenga a mano los PDF de Mahle: el
**catálogo 2019** ("Mahle - Pistones, Camisas, Cojinetes 2019 web.pdf") y el
**Clevite 2019/2020** ("Mahle-Clevite 2020-21.pdf"), que es el que trae
Caterpillar y Cummins. Explica qué falta, de dónde sale cada dato y cómo dejarlo
cargado sin romper nada.

## Dónde estamos

`conjuntos.json` ya tiene **las 128 fichas** que trabaja el proveedor, con
código, descripción, precio y stock. Al 2026-09-04, después de la segunda
tanda, hay **110 con medidas** y **18 que no están en ninguno de los dos
catálogos** (las que siguen con `"medidas": {}` — la lista y el porqué, más
abajo en "Los 18 que el catálogo 2019 no trae").

De las 110, **67 están verificadas** (el dueño las cruzó contra el catálogo el
2026-09-04) y **43 entraron en la segunda tanda del 2026-09-04 y esperan que
las mire**. Lo dice `extra.verificado` y se ve en la columna **Verif.** de la
pantalla. Una ficha nueva entra con `verificado: false` hasta que él la mire.

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
  "carrera": null,
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
| `medidas.diam_piston` | Ø del pistón (primer valor de la celda) | el que se cruza con la descripción del proveedor |
| `extra.carrera` | **carrera** (segundo valor de la misma celda) | Ojo: NO es otro diámetro. En `K01050` la celda dice `94,40 / 100,00` → Ø 94,40 y carrera 100,00. Si la celda trae un solo valor, no hay carrera y va `null` |
| `medidas.alt_piston` | **GL** (altura total) | |
| `medidas.diam_perno` | Ø del perno | |
| `extra.alt_compresion` | **KH** | |
| `extra.prof_rebaje` | rebaje de válvulas | |
| `extra.largo_perno` / `perno_str` | perno | `perno_str` se escribe `∅45,00 × 91,00` |
| `extra.diams_dispon` / `sobremedidas` | medidas disponibles | `"STD / 0,50"` y `["STD","0,50"]` |
| `extra.codigo_aros`, `medida_aros` | C. aros y sus medidas | |
| `extra.codigo_metal_leve` | el código de arriba de la celda de aros | Es el de **Metal Leve** (la marca de Mahle en Brasil), no una tolerancia |
| `extra.codigo_conjunto` / `codigo_subconjunto` | los códigos `E#####` y `S#####` de la fila | La celda del conjunto también tiene dos líneas |
| `extra.codigo_conjunto_metal_leve` | el código de arriba de la celda del conjunto (`P####`) | Es el conjunto en numeración Metal Leve; sirve para cruzar con las páginas de referencia cruzada (136-140) |
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

## Los que todavía no tienen dibujo (al 2026-09-08)

Faltan **124 códigos, 123 números distintos** — el conjunto y el
subconjunto del mismo número comparten dibujo, y `T BEK76560` / `T BEK76560WS`
son la misma pieza con y sin orings de camisa.

Ninguno tiene foto en `CRAC/tecnicos/fuentes/pistones/`, así que **no se pueden
sacar acá**: el catálogo de Mahle no está en el repo, a diferencia del de Federal
Mogul. Hacen falta o el PDF del catálogo (lo mejor: con él las 123 salen de una
corrida, sin recortar a mano) o una tanda de fotos más.

Mientras tanto la pantalla les muestra un guión en la columna de dibujo, que es
lo correcto: no sale a pedir una imagen que no está.

### Subconjuntos (11)

| Código del proveedor | Cód. fábrica | Motor |
|---|---|---|
| `S BE 48030` | `S BE 48030` | M.BENZ COMPRESOR 94 mm |
| `S BE 48415` | `S BE 48415` | M.BENZ OM366-OM364 (2 CIL) (-0,3) 97,5mm |
| `S BE 48416` | `S BE 48416` | M.BENZ OM366-OM364 (2 CIL) (-0,6) 97,5mm |
| `S BE 48520` | `S BE 48520` | M.BENZ OM366LA E1 B/Tr54,7(2 CIL)97,5 mm |
| `S BE 48530` | `S BE 48530` | M.BENZ OM366LA (CAM.54,7) (2 CIL)97,5 mm |
| `S BE 57120` | `S BE 57120` | PERKINS 4.203 (C/POZO) 3.601 |
| `S BE 57450` | `S BE 57450` | MAXION S4T PLUS 101 mm |
| `S BE14185` | `S BE14185` | CHEVROLET CORSA 1.6 79 mm |
| `S BE21190` | `S BE21190` | CUMMINS 4B-6B CAM.54,2 (2 CIL) 102 mm |
| `S BE25127` | `S BE25127` | FIAT 147 1.3D A.C.-0.5 76 mm |
| `S BE591015` | `S BE591015` | FORD FOCUS 2.0 16V CJBA P.21 87,50 mm |

### Conjuntos (113)

| Código del proveedor | Cód. fábrica | Motor |
|---|---|---|
| `T BEK01050` | `K01050` | FIAT DUCATO 2.8TDi B/TRAP. C/CAN.94,4 mm |
| `T BEK01210` | `K01210` | IVECO CURSOR 13 24V (UN) 135 mm |
| `T BEK01410` | `K01410` | IVECO EUROTRAKKER 380 P.72 (1 CIL) 137mm |
| `T BEK10330` | `K10330` | IVECO CURSOR 8 F2BE E3 Pz.84/62(UN) 115m |
| `T BEK10530` | `K10530` | IVECO CURSOR 13 24V E5 (UN) 135 mm |
| `T BEK11440` | `K11440` | CATERPILLAR 3114-3116 (UN) 105 mm |
| `T BEK11500` | `K11500` | CATERPILLAR 3304T-06T I/IN.C/VALV.4.3/4"" |
| `T BEK11570` | `K11570` | CATERPILLAR 3304-3306 INY.DIR.P.43 4.3/4 |
| `T BEK11829` | `K11829` | CATERPILLAR 3304-3306 2 APA INY.IN4.3/4"" |
| `T BEK130030` | `K130030` | MWM 4.12TCE-6.12TCE E5 (Pz.DOBLE) 105 mm |
| `T BEK13250` | `K13250` | MWM D226 P.32 A.C. 59,80 (2 CIL) 105 mm |
| `T BEK13603` | `K13603` | MWM 229 (UN) 102 mm |
| `T BEK13800` | `K13800` | MWM 229TD P.35 PZ.52,4 102 mm |
| `T BEK13860` | `K13860` | MWM 4.12TCE-6.12TCE (UN) S/C Pz.61 105mm |
| `T BEK13885` | `K13885` | MWM 4.12TCE-6.12TCE (1 CIL) 105 mm |
| `T BEK13897` | `K13897` | MWM 4.12TCE E3 (1 CIL)(105L80A1+2)105 mm |
| `T BEK13905` | `K13905` | MWM 4.12TCE-6.12TCE E3 (1 CIL) 105 mm |
| `T BEK13910` | `K13910` | MWM 4.10-6.10 (1 CIL)(103L20A1) 103 mm |
| `T BEK13920` | `K13920` | MWM 6.10-6.10TCA (1 CIL) (103L02) 103 mm |
| `T BEK13930` | `K13930` | MWM 4.10TCA-6.10TCA (2 CIL)(103L18A1)103 |
| `T BEK13940` | `K13940` | MWM 4.10TCA-6.10TCA (1 CIL)(103L11)103mm |
| `T BEK13966` | `K13966` | MWM 4.07TCE (2 CIL) (NIS)(93L45A1) 93 mm |
| `T BEK18510` | `K18510` | RENAULT 18 1.4 Jrs 76 mm |
| `T BEK18730` | `K18730` | RENAULT 12 1.3 A/C 73 mm |
| `T BEK18750` | `K18750` | RENAULT CLIO 1.4 75,80 mm |
| `T BEK18771` | `K18771` | RENAULT 9 1600 CC 77 mm |
| `T BEK18860` | `K18860` | RENAULT TRAFIC 2.1D 86 mm |
| `T BEK211000` | `K211000` | CUMMINS ISLe 330 CV (UN) 114 mm |
| `T BEK21150` | `K21150` | CUMMINS N855C (1 CIL) 139,70 mm |
| `T BEK21160` | `K21160` | CUMMINS NT-NTA855G-NT855C (1 CIL) 139,70 |
| `T BEK21170` | `K21170` | CUMMINS NT855C-NT855P (1 CIL) 139,70 mm |
| `T BEK21180` | `K21180` | CUMMINS NT-NT855M-NTA855 (1 CIL) 139,70 |
| `T BEK21350` | `K21350` | CUMMINS N 15,0:1 (1 CIL) 139,70 mm |
| `T BEK21510` | `K21510` | CUMMINS 6CTAA (63,30) (1 CIL) C/L 114 mm |
| `T BEK21515` | `K21515` | CUMMINS 6CTAA (63,30) (1 CIL) C/C 114 mm |
| `T BEK21635` | `K21635` | CUMMINS 6CTAA (66,20) (1 CIL) C/C 114 mm |
| `T BEK21700` | `K21700` | CUMMINS 88NT (1 CIL) 139,70 mm |
| `T BEK21710` | `K21710` | CUMMINS NTA855 (1 CIL) 139,70 mm |
| `T BEK21730` | `K21730` | CUMMINS N855 (1 CIL) 139,70 mm |
| `T BEK21860` | `K21860` | CUMMINS 6CTAA (56 mm) (1 CIL) C/C 114 mm |
| `T BEK21950` | `K21950` | CUMMINS 6CTA (56,75) (1 CIL) C/C 114 mm |
| `T BEK26040` | `K26040` | FORD CARGO 4600-5600 (NEW HOL) 111,80 mm |
| `T BEK26060` | `K26060` | FORD CARGO 5600-5610 (NEW HOL) 111,80 mm |
| `T BEK26070` | `K26070` | FORD CARGO 4610-6610 (1 CIL) 111,80 mm |
| `T BEK26610` | `K26610` | NEW HOLLAND 8030 P.38 PZ.62 A/C 73 111.8 |
| `T BEK26620` | `K26620` | NEW HOLLAND 8030 (P.41)(1 CIL) 111,80 mm |
| `T BEK31150` | `K31150` | VALTRA 420-620 TURBO PZ.70 P.40 108 mm |
| `T BEK430375WS` | `K430375WS` | J.DEERE 6068HBM P.41 Pz.78 (UN) 106,5 mm |
| `T BEK430425WS` | `K430425WS` | J.DEERE 4045HBM P.35 Pz.58 106,5 mm |
| `T BEK430450WS` | `K430450WS` | J.DEERE 4045H-6068H (UN) 106,5 mm |
| `T BEK430520WS` | `K430520WS` | J.DEERE 4045T/H-6068T/H (UN) 106,5 mm |
| `T BEK430685WS` | `K430685WS` | J.DEERE 4045T/H-6068T/H (UN) 106,5 mm |
| `T BEK440045` | `K440045` | PEUGEOT TU4 1.5 8V P.18 75 mm |
| `T BEK44165` | `K44165` | PEUGEOT 504 2.0 8,8:1 (<86) 88 mm |
| `T BEK44700` | `K44700` | PEUGEOT XU7JPZ 1762 CC 83 mm |
| `T BEK48170` | `K48170` | M.BENZ OM442LA (1 CIL) 128 mm |
| `T BEK482020WS` | `K482020WS` | M.BENZ OM457LA E3 (1 CIL) 128 mm |
| `T BEK482030WS` | `K482030WS` | M.BENZ OM457LA E3/E5 (1 CIL)S/BUJE 128mm |
| `T BEK482040WS` | `K482040WS` | M.BENZ OM457LA E5 (1 CIL) C/BUJE 128 mm |
| `T BEK482080` | `K482080` | M.BENZ OM501-502-542 Pz.93 (UN) 130 mm |
| `T BEK48320` | `K48320` | M.BENZ OM924LA-OM926LA E5 (2 CIL) 106 mm |
| `T BEK48930` | `K48930` | M.BENZ OM447A-449LA ->95 (1 CIL) 128 mm |
| `T BEK48933` | `K48933` | M.BENZ OM447A-449LA ->95 (-0,3) 128 mm |
| `T BEK48940` | `K48940` | M.BENZ OM447A-449LA 95-> (1 CIL) 128 mm |
| `T BEK48943` | `K48943` | M.BENZ OM447A-449LA 95-> (-0,3) 128 mm |
| `T BEK48964` | `K48964` | M.BENZ OM457LA INY.EL. EURO2/3 128 mm |
| `T BEK48967WS` | `K48967WS` | M.BENZ OM457LA EURO V (1 CIL) 128 mm |
| `T BEK48979WS` | `K48979WS` | M.BENZ OM460LA |
| `T BEK48990` | `K48990` | M.BENZ OM457LA INY.EL.Pz.90 P.52 128 mm |
| `T BEK50135` | `K50135` | DEUTZ 913 ECOL.3R C/C Pz.54,5 124*102mm |
| `T BEK50181` | `K50181` | DEUTZ 913 ECOL.3R P.35 Pz.45 120 102 mm |
| `T BEK50240` | `K50240` | DEUTZ 1013 (TETON CHATO)(1 CIL) 108 mm |
| `T BEK51200` | `K51200` | HONDA BIZ 125 (1 CIL) CARBURADO 52,40 mm |
| `T BEK59201` | `K59201` | FORD ESCORT 1.6 CHT 77 mm |
| `T BEK70022` | `K70022` | VW KOMBI 1.3 77 mm |
| `T BEK70150` | `K70150` | VW KOMBI 1600 85,5 mm |
| `T BEK71030` | `K71030` | VOLVO NL10-310 TD102FT (1 CIL) 4.3/4"" |
| `T BEK71050` | `K71050` | VOLVO NL10-320 TD10-A (1 CIL) 4.3/4"" |
| `T BEK710510WS` | `K710510WS` | RENAULT MIDLUM 320 DXi7 P.45 (UN) 108 mm |
| `T BEK71055` | `K71055` | VOLVO DH10A (1 CIL) 4.3/4"" |
| `T BEK710710WS` | `K710710WS` | VOLVO MD13 E5-D13A E4/E5 (1 CIL) 131 mm |
| `T BEK710800WS` | `K710800WS` | VOLVO D13C 131 mm |
| `T BEK71120` | `K71120` | VOLVO D12C-D12D-NH12-FH12 (1 CIL) 131 mm |
| `T BEK71220WS` | `K71220WS` | VOLVO D7A (1 CIL) 104,77 mm |
| `T BEK71240WS` | `K71240WS` | VOLVO TD123EDC ARTIC. (1 CIL) 130,18 mm |
| `T BEK71400` | `K71400` | VOLVO NL10-280 TD100G-TD101 (1 CIL)4.3/4 |
| `T BEK71420` | `K71420` | VOLVO B58-B10M THD100E-THD 101 (1 CIL) |
| `T BEK71430WS` | `K71430WS` | VOLVO NL10-340 TD102FS ART.(1 CIL) 4.3/4 |
| `T BEK71440` | `K71440` | VOLVO TD120C (1 CIL) 130,18 mm |
| `T BEK71450` | `K71450` | VOLVO TD120A*(1 CIL) 4.3/4"" |
| `T BEK71500` | `K71500` | VOLVO NL12-400 TD122F/FS (1 CIL) 130,18m |
| `T BEK71860 WS` | `K71860 WS` | VOLVO D13A 400-440 (1 CIL) 131 mm |
| `T BEK760300` | `K760300` | SCANIA DC12 380 S5 ARTIC.(1 CIL) 127 mm |
| `T BEK76061` | `K76061` | SCANIA DSC14 P.50 Pz.75 (UN) 127 mm |
| `T BEK760730` | `K760730` | SCANIA DC13 E5 5/6 CIL. (UN) 130 mm |
| `T BEK760820` | `K760820` | SCANIA DC9 20V E5 P.58 A/C 92,04 130 mm |
| `T BEK76200` | `K76200` | SCANIA DSC9 P94 (1 CIL) 115 mm |
| `T BEK76520` | `K76520` | SCANIA 110 S/TURBO (1 CIL) 127 mm |
| `T BEK76540WS` | `K76540WS` | SCANIA DS11 (1 CIL) 127 mm |
| `T BEK76550` | `K76550` | SCANIA 112T 1§T (1 CIL) 127 mm |
| `T BEK76551` | `K76551` | SCANIA 112T 1§T (1 CIL)(A.C.-0,4) 127 mm |
| `T BEK76560` | `K76560` | SCANIA 113H (DSC11) 93/95 (UN) 127 mm |
| `T BEK76560WS` | `K76560WS` | SCANIA 113H (DSC11) 93/95 (UN) 127 mm |
| `T BEK76564` | `K76564` | SCANIA 113H (DSC11) 93/95(-0,4)(UN) 127 |
| `T BEK76570` | `K76570` | SCANIA 113 (DSC11) 95--> A/C 100 127 mm |
| `T BEK76574` | `K76574` | SCANIA 113 (DSC11) 95--> (-0,4) 127 mm |
| `T BEK76590WS` | `K76590WS` | SCANIA DC11 360CV CAM.150 (UN) 127 mm |
| `T BEK76595` | `K76595` | SCANIA DC11 EVO 5 CAM.151 (UN) 127 mm |
| `T BEK76650` | `K76650` | SCANIA DSC12 S4 360CV (1 CIL) 127 mm |
| `T BEK76655` | `K76655` | SCANIA DSC12 S4 400CV (1 CIL) 127 mm |
| `T BEK76670` | `K76670` | SCANIA DSC12 S4 420CV ARTIC.(1 CIL)127mm |
| `T BEK76675WS` | `K76675WS` | SCANIA DC12 S4 420 CV (ARTIC) 127 mm |
| `T BEK76680WS` | `K76680WS` | SCANIA DC9-DC11 CAM.151 P/EMB.(UN) 127mm |

## Cómo se entrega una tanda nueva: la tabla

**Cada tanda de códigos que se cargue se entrega como un CSV con todas las
columnas**, el que arma `scripts/tabla_conjuntos.py`. Es la tabla definitiva y
no se recorta:

```bash
python3 scripts/tabla_conjuntos.py --sin-verificar --salida /tmp/tanda.csv
```

Son 41 columnas: los códigos (proveedor, Mahle, catálogo, Metal Leve, Clevite,
original del fabricante, E, S, kit), el pistón entero, los aros con sus medidas,
la camisa con sus dimensiones, y de qué página del catálogo salió cada ficha.
Va con `;` y UTF-8 con BOM —Excel lo abre sin pelear— y con dos columnas vacías
al final para marcar mientras se verifica.

El dueño verifica con esa tabla al lado del PDF, de una sentada. Por eso no se
entrega un resumen: una tabla a la que le falta una columna lo obliga a volver
al JSON, y ahí se pierde el hilo.

## Las dudas se avisan, no se resuelven en silencio

Dos reglas que puso el dueño el 2026-09-04, y que valen para toda la carga:

1. **Si hay un ítem del que no se está seguro, se le avisa.** Por código, con el
   motivo concreto: la fila apareció en dos páginas, el Ø no cierra con la
   descripción, la celda venía cortada, el número de cilindros no se distingue.
   Él lo mira individualmente. Es mucho más barato preguntar por tres códigos
   que cargar 38 y que uno esté mal sin que nadie lo sepa.
2. **Ante la duda, mirar los códigos ya verificados y decidir con eso.** Las
   fichas verificadas son el patrón: si no se sabe si un número es KH o GL, o
   cómo se escribe una medida de aros, o si una camisa va `null`, se busca una
   ficha parecida ya verificada y se hace igual. Así cada tanda se apoya en la
   anterior en vez de volver a empezar. Lo que **no** se hace es inventar un
   número para llenar el campo: eso va `null`.

### Los cuatro casos de la primera tanda, ya resueltos

Se avisaron como dudosos, el dueño los miró el 2026-09-04 y **confirmó las
cuatro lecturas**. Quedan acá como precedente: si vuelve a aparecer algo así, se
resuelve igual y no hace falta preguntar de nuevo.

| Caso | Qué pasaba | Cómo se resolvió |
|---|---|---|
| `K13603` | Aparece en cuatro páginas (35, 49, 98, 117) con **las mismas medidas** pero distinto Nº de cilindros (D229/3, /4 y /6) | Se cargan las medidas —coinciden en las cuatro— y el Nº de cilindros se toma de la primera página. El proveedor lo vende "(UN)", un pistón para las tres |
| `K26040` | Su fila **apila tres variantes de motor** y la celda del Ø trae cuatro números: `111,76 / 111,80 / 106,70 / 111,80` | **Va la primera variante**: Ø 111,76 × carrera 111,80. Es la regla general para las filas que apilan variantes |
| `K26070` | El texto del motor arrastró dos bloques de la misma fila (`FNH 268` + `FNH 201`) | Se deja como está: los dos bloques son de esa fila, y el campo `motor` es texto libre que sirve para buscar |
| `K18510` | El kit es `K18510` pero los aros son `A18760` y la camisa `C18760` | Correcto. Es lo mismo que pasa en el Clevite: **los números no coinciden entre columnas**. Manda el Ø contra la descripción del proveedor, que acá cierra en 76 mm |

Y cinco códigos (`K13250`, `K13910`, `K13930`, `K13966`, más el ya citado
`K13603`) aparecían en varias páginas: se compararon una por una y **las medidas
son idénticas en todas**. Es el mismo motor listado en distintas secciones del
catálogo, solo cambia el texto de aplicación. No hay que elegir página.

## Los 18 que el catálogo 2019 no trae

Se buscaron los 61 códigos que faltaban de las tres formas posibles —el número
suelto, el número con el cero adelante (`K48320` → `K0480320`) y el motor por
nombre— sobre el **texto completo de las 242 páginas** del 2019 y las 66 del
Clevite. Estos 18 **no aparecen de ninguna manera**: son piezas más nuevas que
la edición 2019/2020, o renumeradas después. No se inventó nada: siguen con
`"medidas": {}`.

| Código | Motor | Qué se encontró |
|---|---|---|
| `T BEK10330` | IVECO Cursor 8 F2BE E3, 115 mm | nada; la sección Iveco (págs. 77-78) llega hasta el Cursor 13 |
| `T BEK430375WS` `T BEK430425WS` `T BEK430450WS` `T BEK430520WS` `T BEK430685WS` | J.Deere 4045/6068 PowerTech, 106,5 mm | la pág. 79 trae **una sola** fila PowerTech (`E0430380`, sin código de kit) y no alcanza para cinco variantes distintas de perno |
| `T BEK44165` `T BEK44700` | Peugeot 504 2.0 y XU7JPZ | la sección Peugeot (págs. 107-110) no los lista |
| `T BEK48170` `T BEK482080` | M.Benz OM442LA y OM501-502-542 | están `K0482020/30/40/60` pero no el `080`, y ningún OM442 |
| `T BEK50240` | Deutz 1013 | la sección Deutz llega hasta la serie 913/1013 sin este código |
| `T BEK710510WS` | Renault Midlum 320 DXi7 | nada, ni en Renault ni en Volvo |
| `T BEK71220WS` | Volvo D7A 104,77 mm | la sección Volvo (págs. 130-132) no lo trae |
| `T BEK760300` `T BEK760820` | Scania DC12 380 S5 y DC9 20V E5 | nada; sí están el DC12 420 y el DC9/DC11 |
| `T BEK710710WS` `T BEK710800WS` `T BEK71860 WS` | Volvo D13A / MD13 / D13C, 131 mm | **hay fila para esos motores, con otro código**: `K71710 WS` (MD13 Euro V / D13A Euro IV y V, 400/440/480/520cv, pág. 132) y `K0710910 WS` (D13C 460/540cv, pág. 132). No se cargaron porque los códigos no coinciden y **tres códigos del proveedor compiten por dos filas** |

Los tres últimos son los únicos que se pueden destrabar preguntando: si el dueño
confirma que `T BEK710710WS` es la fila `K71710` y `T BEK710800WS` la
`K0710910`, se cargan en un minuto.

## Dos cosas de la segunda tanda que conviene no volver a descubrir

1. **Las páginas 123 a 133 del 2019 no tienen capa de texto.** El texto está
   convertido a curvas: `pdftotext` y `pdfplumber` devuelven 90 caracteres por
   página (sólo el pie) y el extractor las salta sin avisar. Ahí viven
   **Volkswagen (págs. 123-129), Volkswagen Camiones, VOLVO (130-132),
   Westinghouse/Wabco y Yamaha (133)** — o sea toda la sección Volvo. Se leen
   rasterizando con `pypdfium2` (`pdf[n-1].render(scale=2.4)`, media hoja por
   imagen) y mirándolas. Así salieron las 11 fichas Volvo y la del Kombi 1600.
2. **En la descripción del proveedor, `P.` y `Pz.` no son lo mismo.** `P.` es el
   **Ø del perno** y cierra siempre contra el catálogo (`P.52` → ∅52,00). `Pz.`
   es el **Ø del pozo** (la cámara en la cabeza del pistón), que el catálogo no
   publica: **no sirve para verificar y no hay que forzarlo contra KH**. En
   `T BEK48990` (`Pz.90 P.52`) el 90 coincidía con KH 90,05 de casualidad y eso
   mandó a revisar tres fichas de más. Lo que sí verifica es `A/C` (altura de
   compresión, `T BEK760820` dice `A/C 92,04` y el catálogo da KH 92,04) y
   `CAM.` (la cota C de la camisa: `CAM.151` → `C=151,00`).

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
  cilindros. Se carga la primera variante y el resto queda anotado en
  `revisar.carrera`.

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
