# CRAC — Guía completa para el sistema de presupuestos

> Este documento es autocontenido: no depende de ningún otro archivo del repositorio de origen. Junto con `prefijos_crac.csv` y `precio-stock.csv` (en esta misma carpeta), contiene todo lo necesario para integrar los precios de repuestos CRAC al sistema de presupuestos.

---

## 1. Qué es CRAC

CRAC es el proveedor mayorista de repuestos de motor a explosión que utiliza Repuestos Chiappo. Provee un catálogo cruzado (por código de pieza) con precios y estado de stock, actualizado diariamente.

### Regla de confidencialidad — obligatoria

**La palabra "CRAC" y cualquier referencia al proveedor NO deben aparecer nunca en ningún documento visible para el cliente** (presupuesto en pantalla, PDF, impreso, mensaje enviado). El nombre del proveedor es información confidencial del negocio frente a sus clientes.

- Se permite usar "CRAC" en: código interno (variables, nombres de función, comentarios, base de datos, paneles de administración internos).
- Se prohíbe en: cualquier texto, label, columna o campo que el cliente final pueda leer.
- **Dónde aplicar esta regla:** en la capa de renderizado/presentación del presupuesto (la que genera lo que ve el cliente), no en la capa de datos. Los datos internos pueden — y deben — trazar el origen CRAC de cada precio para auditoría; lo que no puede pasar es que ese origen llegue a la salida final.

Esta regla ya rige en el buscador público de Repuestos Chiappo y debe extenderse sin excepciones al sistema de presupuestos.

---

## 2. El archivo de precios: `precio-stock.csv`

Es el archivo que CRAC entrega, actualizado **todos los días** (aunque el contenido no suele cambiar drásticamente de un día a otro).

### Formato técnico

- Sin fila de encabezado — la primera línea ya es un dato.
- Separador: `;` (punto y coma).
- Cada campo entre comillas dobles `"…"`.
- Encoding: **ISO-8859-1 / Latin-1** (no UTF-8). Si se lee con el encoding incorrecto, los acentos y la `ñ` se corrompen.
- ~64.250 filas en la versión actual (2026-07-28).

### Columnas (en orden, sin nombres en el archivo)

| # | Campo | Tipo | Ejemplo | Descripción |
|---|---|---|---|---|
| 1 | `codigo` | string | `"A AK104052 STD"` | Código CRAC de la pieza. Ver sección 3 para cómo decodificarlo. |
| 2 | `aplicacion` | string | `"M.BENZ 190E 2.0 4 CIL 1,75-2-3,5 89 mm"` | Descripción del vehículo/motor donde aplica la pieza. Texto libre de CRAC. |
| 3 | `precio` | número | `473219,41` | **Precio final al cliente** (confirmado — no es costo de Chiappo, no requiere aplicar margen adicional salvo que el negocio decida sumar algo). Decimal con **coma**, sin separador de miles. |
| 4 | `alistado` | `"si"` \| `"no"` | `"si"` | **Estado de stock real:** `"si"` = hay stock disponible. `"no"` = no hay stock. (Confirmado por el dueño del negocio — no es un estado de "precio confirmado", es disponibilidad física.) |

### Ejemplo de línea completa

```
"A AK104052 STD";"M.BENZ 190E 2.0 4 CIL 1,75-2-3,5 89 mm";473219,41;"si"
```

### Casos especiales a manejar con cuidado

- **Precio en `0` con stock `"si"`** — ocurre en ~565 filas (de 64.250). Es una inconsistencia del propio archivo de CRAC (probablemente un precio pendiente de carga de su lado). **Nunca mostrar `$0` como precio real al cliente** — tratar como "sin precio disponible" aunque el stock diga `"si"`.
- **Precio en `0` con stock `"no"`** — es el caso esperado y frecuente (~12.249 filas): sin stock, sin precio cargado. No es anómalo.
- **Códigos que no son piezas** — el archivo incluye algunas líneas que no son repuestos con código CRAC estándar, por ejemplo `"ALQUILER"` (una línea de servicio/alquiler de equipo). Ver sección 3.4 para cómo detectarlas.

---

## 3. El sistema de prefijos CRAC

Cada código de pieza se arma así:

```
[PREFIJO DE CATEGORÍA] + [PREFIJO DE MARCA] + [RESTO: número/medida/sufijo, opaco]
```

Ejemplo: `"A AK104052 STD"`
- `A` → categoría **Aros**
- `AK` → marca **Akuro**
- `104052 STD` → identificador interno de CRAC para esa pieza puntual (número de parte + sobremedida). No tiene una estructura que valga la pena parsear más allá de esto: es opaco, se guarda y se muestra tal cual.

### 3.1 Los prefijos vienen de dos tablas separadas

Ambas están completas en `prefijos_crac.csv` (columna `tipo` = `categoria` o `marca`, columna `prefijo`, columna `nombre`, columna `activo`):

- **155 categorías** (136 de 2 caracteres, 19 de 1 caracter). Ej: `S` = Subconjuntos, `BI` = Bielas, `P` = Pistones, `C` = Camisas, `G` = Guías de válvulas.
- **141 marcas** (134 de 2 caracteres, 7 de 1 caracter: `B`, `C`, `F`, `G`, `I`, `P`, `R`). Ej: `BE` = Mahle, `CE` = Fadecya, `R` = RYC, `AK` = Akuro.

La columna `activo` (`si`/`no`) indica si esa marca/categoría sigue vigente en el negocio hoy — un prefijo `activo:no` puede seguir apareciendo en códigos históricos del archivo de precios, no descartarlo del parseo por eso.

### 3.2 Cómo decodificar un código — algoritmo validado

**No usar una regla de "posición fija" ni depender de si hay o no un espacio.** El espacio que aparece en algunos códigos (ej. `"A AK104052 STD"`) es solo un separador visual que CRAC agrega de forma inconsistente cuando el prefijo es de 1 caracter — no es parte de la lógica de decodificación y **no se puede confiar en su presencia** (se encontraron ~331 códigos donde un prefijo de 1 caracter no está seguido de espacio).

La regla correcta es **longest-match (coincidencia más larga) contra las tablas conocidas**:

1. Tomar el código, quitar comillas.
2. Buscar si los primeros 2 caracteres coinciden con algún prefijo de categoría de 2 caracteres. Si sí, ese es el prefijo de categoría.
3. Si no, probar con el primer caracter contra los prefijos de categoría de 1 caracter.
4. Si ninguno matchea → el código no sigue el formato estándar (ver 3.4).
5. Avanzar el cursor lo que se haya consumido de categoría. Si el siguiente caracter es un espacio, saltearlo (es cosmético).
6. Repetir el mismo proceso (2 caracteres primero, después 1) contra las tablas de marca.
7. Si no matchea ninguna marca → el código no sigue el formato estándar (ver 3.4).
8. Saltear un espacio cosmético si lo hay.
9. Todo lo que queda es el "resto" — número/medida/sufijo de CRAC. No se parsea más: se guarda y se muestra tal cual (puede incluir `STD`, sobremedidas como `0.5`, `R0.5`, sufijos alfabéticos como `EX`, `SE`, letras de revisión, etc. — la variedad es demasiado grande para tabular y no hace falta: solo importa como identificador, no como dato estructurado).

Pseudocódigo de referencia:

```python
def decodificar(codigo, categorias, marcas):
    s = codigo.strip()

    if s[:2] in categorias:      # set de prefijos de categoría de 2 chars
        cat, s = s[:2], s[2:]
    elif s[:1] in categorias_1:  # set de prefijos de categoría de 1 char
        cat, s = s[:1], s[1:]
        if s.startswith(" "):
            s = s[1:]
    else:
        return None  # no estándar

    if s[:2] in marcas:
        marca, resto = s[:2], s[2:]
    elif s[:1] in marcas_1:
        marca, resto = s[:1], s[1:]
        if resto.startswith(" "):
            resto = resto[1:]
    else:
        return None  # no estándar

    return {"categoria": cat, "marca": marca, "resto": resto.strip()}
```

### 3.3 Validación real sobre el archivo completo

Este algoritmo se probó contra las **64.250 filas** de `precio-stock.csv` (no contra ejemplos sueltos):

| Resultado | Cantidad | % |
|---|---|---|
| Descompuestos en prefijos válidos | 63.542 | 98.9% |
| No decodificables (formato no estándar) | 708 | 1.1% |

**Importante:** esta cifra mide que el código se pudo descomponer en un prefijo de categoría + un prefijo de marca que existen en las tablas — no que esa segmentación elegida sea siempre la semánticamente correcta. El algoritmo no tiene forma de verificar contra una "verdad de referencia"; el espacio que a veces separa categoría de marca serviría como pista, pero no está presente de forma consistente (ver 3.2), así que no se puede usar como validación. Es esperable que una fracción chica del 98.9% tenga la categoría o la marca mal asignada.

Distribución de las combinaciones de longitud encontradas (las 4 combinaciones posibles existen en datos reales — no asumir que categoría y marca siempre tienen la misma longitud):

| Categoría | Marca | Cantidad |
|---|---|---|
| 2 caracteres | 2 caracteres | 37.646 |
| 1 caracter | 2 caracteres | 21.078 |
| 1 caracter | 1 caracter | 2.852 |
| 2 caracteres | 1 caracter | 1.966 |

### 3.4 El 1.1% que no decodifica — no forzar el parseo

Ejemplos reales del archivo que **no** siguen el formato estándar:

- `"ALQUILER"` — línea de servicio (alquiler de equipo), no es una pieza con código CRAC.
- `"ABMC190.302/E1"` — la categoría `AB` (Kit Arbol y Balancin) matchea, pero lo que sigue (`MC190.302/E1`) no corresponde a ninguna marca conocida — probablemente un código de fabricante embebido directamente.
- `"AKAM 3339"` — no matchea ninguna categoría conocida al inicio.
- `"B A R386   STD"` — la categoría `B` (Bujes de Biela) matchea, pero `A R386...` no resuelve limpio contra las marcas (podría ser marca `A` + resto `R386`, pero `A` no está en la tabla de marcas — es un caso ambiguo).

**Recomendación para el sistema de presupuestos:** si un código no decodifica, no descartarlo — mostrarlo igual con su código, aplicación y precio tal cual vienen del CSV, simplemente sin la etiqueta de categoría/marca "linda". No hay que resolver esto para poder usar el archivo.

---

## 4. Resumen para quien programe la integración

1. Leer `precio-stock.csv` con encoding Latin-1, separador `;`, sin encabezado.
2. Cada fila = una pieza: código, aplicación, precio (ya es precio final al cliente), stock (si/no).
3. Para mostrar la pieza con categoría/marca legibles, aplicar el algoritmo de la sección 3.2 usando las tablas de `prefijos_crac.csv`. Si falla, mostrar el código crudo igual. **La descomposición solo alimenta la etiqueta de categoría/marca que se muestra — `precio`, `alistado`, `codigo` y `aplicacion` salen siempre tal cual vienen del CSV.** Si la segmentación elige mal la categoría o la marca, en el peor caso se muestra una etiqueta equivocada; nunca se altera el precio ni el stock.
4. Nunca mostrar la palabra "CRAC" en nada que vea el cliente.
5. Nunca mostrar `$0` como precio cuando el campo precio venga en `0`.
6. Ver `INTEGRACION-PENDIENTE.md` para las decisiones de negocio que todavía faltan definir antes de programar.
