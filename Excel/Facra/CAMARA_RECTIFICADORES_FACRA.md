# F.A.C.R.A. — Lista Orientadora de Mano de Obra
## Documentación para el sistema de presupuestos del taller

---

## ¿Qué son estos archivos?

La **F.A.C.R.A.** (Federación Argentina de Cámaras de Rectificadores Automotores) publica dos archivos Excel que funcionan **en conjunto** para armar presupuestos de mano de obra:

| Archivo | Nombre | Función |
|---|---|---|
| `nomenclador.xls` | Nomenclador de Motores | Índice de todos los motores con su número de lista asignado |
| `lista_orientadora.xls` | Lista Orientadora de Mano de Obra | Tabla de precios por servicio, cruzada por número de lista |

Última actualización del nomenclador: **Enero 2023**
Última actualización de la lista de precios: **Abril 2026**

---

## Archivo 1: Nomenclador (`nomenclador.xls`)

### Estructura

- **Total de motores**: 491
- **Columnas**:
  - `INDICE`: código identificador del motor (ej: `PEU 504 2.0`, `CAT.3306 TBO`)
  - `MOTOR`: descripción completa del motor (marca, modelo, cilindrada, cilindros, diámetro)
  - `Lista orientadora de MANO DE OBRA`: número de lista asignado (del **1** al **13**)

### Formato de la descripción del motor

```
[MARCA] [MODELO] [CILINDRADA?] [NAFTA/DIESEL/TURBO?] [Nro.CIL]* [DIÁMETRO]mm
```

Ejemplo:
```
PEUGEOT 405 TURBO DIESEL 1900cc *4CIL* 83mm
CATERPILLAR 3306 TURBO INY.DIR.P43 *6CIL* 120.6mm
FORD SIERRA/ESCORT 1.6/1.8 NAF. *4CIL* 80mm
```

### Marcas presentes y cantidad de motores

| Marca | Motores | | Marca | Motores |
|---|---|---|---|---|
| FIAT | 80 | | M.BENZ | 31 |
| CHEVROLET / G.M | 51 | | DEUTZ | 30 |
| FORD | 38 | | CATERPILLAR | 34 |
| RENAULT | 36 | | CUMMINS | 20 |
| PEUGEOT | 24 | | JOHN (DEERE) | 19 |
| PERKINS | 21 | | VW | 18 |
| HONDA | 10 | | CITROEN | 8 |
| MAXION | 8 | | INDENOR | 5 |
| KUBOTA | 5 | | IVECO | 4 |
| IKA | 4 | | SCANIA | 6 |
| LADA-ALEKO | 1 | | BEDFORD | 3 |
| BORGWARD | 1 | | DODGE | 3 |
| VOLVO | 3 | | HANOMAG | 2 |
| M.W.M | 13 | | RASTROJERO | 2 |
| SISU | 2 | | ... | ... |

> **Nota para el menú de marcas**: la marca se extrae de la **primera palabra** de la columna `MOTOR`. Hay variantes tipográficas a unificar:
> - `CATERPILAR` → `CATERPILLAR`
> - `M.W.M.` → `M.W.M`
> - `G.M` → consolidar con `CHEVROLET` (o mantener separado según preferencia)
> - `MAXION-SPRINTER` → `MAXION`

---

## Archivo 2: Lista Orientadora (`lista_orientadora.xls`)

### Estructura

- **Total de servicios**: 235
- Las primeras 6 filas son encabezado; los datos empiezan en la fila 7
- **Columnas**:
  - `ITEMS`: código numérico del servicio
  - `LISTADO DE SERVICIOS`: descripción del trabajo
  - `1` a `13`: precio en pesos para cada número de lista

### Lógica de las 13 listas

Cada número de lista representa un **rango de complejidad/tamaño** del motor:

| Lista | Motores típicos | Características |
|---|---|---|
| 1 | VW Escarabajo, Naf. pequeños | Motores chicos, pocos cilindros |
| 2 | Peugeot 404/504, VW Golf, Fiat 128 | Naf. medianos 4 cil. |
| 3 | Peugeot 405/406, Renault, Citroen | Naf/Diesel medianos 4 cil. |
| 4 | Bedford, Ford F-100, Dodge | Diesel medianos/pesados |
| 5 | Peugeot Boxer, Iveco Daily | Diesel transporte liviano |
| 6 | Caterpillar (Perkins), Perkins 6 cil. | Diesel industriales |
| 7 | Caterpillar 3064/3066 | Diesel industriales medianos |
| 8 | Caterpillar 3126/3204/3208 | Diesel industriales grandes |
| 9 | Deutz, M.W.M grandes | Diesel industriales |
| 10 | Caterpillar 3304/3306, Cummins | Diesel industriales pesados |
| 11 | Caterpillar 3404/3406, Scania | Diesel muy pesados |
| 12 | Caterpillar 3408/3412, C-15 | Diesel pesados V8/V12 |
| 13 | Caterpillar 399 | Los más grandes |

> Los precios **crecen** de Lista 1 a Lista 13. A mayor lista, mayor precio por cada servicio.

### Categorías de servicios (items)

Los servicios están organizados por rangos de código:

| Rango | Área |
|---|---|
| 10–120 | Cilindros, pistones, bielas, camisas |
| 130–250 | Cigüeñal |
| 300–450 | Árbol de levas, válvulas, guías |
| 500–650 | Culata, tapa de cilindros |
| 700–850 | Cárter, bloque, múltiples |
| 900–1100 | Árbol de levas, distribución |
| 1100–1260 | Trabajos especiales, mano de obra por hora |

### Ejemplo de fila de servicios

```
Item 10 | Rectificar y bruñir cilindros | L1: $61.011 | L2: $71.796 | L3: $80.945 | ... | L13: $545.100
Item 130 | Rectificar cigüeñal ...       | L1: $XX.XXX | ... 
```

---

## Flujo de trabajo para armar un presupuesto

```
1. El usuario busca el motor del cliente
       ↓
2. Se consulta el NOMENCLADOR por marca → modelo
       ↓
3. Se obtiene el número de LISTA asignado a ese motor (1 al 13)
       ↓
4. Se consulta la LISTA ORIENTADORA con ese número
       ↓
5. Por cada servicio a realizar, se toma el precio de la columna de esa lista
       ↓
6. Se suma el total del presupuesto
```

---

## Cómo construir el menú de marcas

Para implementar el menú desplegable **Marca → Motores**, el procedimiento es:

### Paso 1: Leer el nomenclador

```python
import pandas as pd

df = pd.read_excel("nomenclador.xls", engine="xlrd", header=None)
# Los datos de motores empiezan en la fila índice 5 (0-based)
motores = df.iloc[5:].copy()
motores.columns = ['indice', 'motor', 'lista']
```

### Paso 2: Extraer la marca de cada motor

La marca es siempre la **primera palabra** de la columna `motor`:

```python
motores['marca'] = motores['motor'].str.split().str[0]
```

### Paso 3: Unificar variantes tipográficas (opcional pero recomendado)

```python
brand_aliases = {
    'CATERPILAR': 'CATERPILLAR',   # typo en el original
    'M.W.M.':     'M.W.M',         # con/sin punto final
    'MAXION-SPRINTER': 'MAXION',
}
motores['marca'] = motores['marca'].replace(brand_aliases)
```

### Paso 4: Construir el índice de marcas

```python
# Diccionario: { "PEUGEOT": [ {indice, motor, lista}, ... ], ... }
from collections import defaultdict

menu = defaultdict(list)
for _, row in motores.iterrows():
    menu[row['marca']].append({
        'indice': row['indice'],
        'motor':  row['motor'],
        'lista':  int(row['lista'])
    })

# Ordenar marcas alfabéticamente
marcas_ordenadas = sorted(menu.keys())
```

### Paso 5: Buscar los precios para un motor seleccionado

```python
def obtener_precios(lista_num: int, df_lista) -> dict:
    """
    Dado un número de lista (1-13), devuelve todos los servicios
    con su precio correspondiente.
    """
    servicios = df_lista.iloc[6:].copy()
    servicios.columns = ['item','servicio','L1','L2','L3','L4','L5',
                         'L6','L7','L8','L9','L10','L11','L12','L13']
    col = f'L{lista_num}'
    resultado = []
    for _, row in servicios.iterrows():
        if pd.notna(row[col]) and row[col] > 0:
            resultado.append({
                'item':     row['item'],
                'servicio': row['servicio'],
                'precio':   row[col]
            })
    return resultado
```

---

## Notas importantes

- **Los precios son orientativos**: la F.A.C.R.A. los publica como referencia; el taller puede aplicar sus propios factores.
- **El nomenclador tiene fecha 2023** y la lista de precios **2026**: pueden existir motores nuevos no listados en el nomenclador.
- **Algunos precios son 0**: significa que ese servicio no aplica para esa lista/motor.
- **El índice del motor no es único**: hay motores con el mismo código `indice` pero distinta descripción (ej: dos entradas para `CAT.3066`). Usar el campo `motor` (descripción completa) como clave principal.
- Los precios están expresados en **pesos argentinos**.

---

## Resumen de estructura de datos

```
nomenclador.xls
├── Fila 0-4: encabezado (ignorar)
└── Fila 5-495: datos
    ├── Col 0: indice   (str)  → código del motor
    ├── Col 1: motor    (str)  → descripción completa
    └── Col 2: lista    (int)  → número de lista 1-13

lista_orientadora.xls
├── Fila 0-5: encabezado (ignorar)
└── Fila 6-240: datos
    ├── Col 0:  item     (int)  → código del servicio
    ├── Col 1:  servicio (str)  → descripción del trabajo
    └── Col 2-14: precios L1 a L13 (float, en pesos)
```
