# Integración CRAC → Sistema de presupuestos — decisiones pendientes

Este documento lista lo que **todavía no está definido** y debe resolverse (con el dueño del negocio) antes o durante la implementación. No son suposiciones — son preguntas abiertas a propósito. Ver `CRAC.md` para todo lo que sí está confirmado (formato de datos, precios, prefijos).

---

## 1. Actualización diaria del archivo

El archivo `precio-stock.csv` llega actualizado todos los días (cambios menores, no drásticos).

**A definir:**
- Mecanismo de carga: ¿se sube manualmente cada archivo nuevo, o hay una carpeta/proceso que lo detecta automáticamente?
- ¿Se conserva el histórico de archivos anteriores, o cada carga reemplaza a la anterior sin dejar rastro?

## 2. Presupuesto ya emitido vs. archivo actualizado

Confirmado por el negocio: **si el precio o el stock de un repuesto cambia después de que el presupuesto ya se generó, el sistema debe advertir en el panel.**

**A definir:**
- ¿Cómo se dispara la comparación? (¿al abrir el presupuesto guardado, al cargar el archivo nuevo, con un chequeo periódico?)
- ¿Qué guarda cada línea de presupuesto: el precio congelado al momento de creación, o siempre referencia el precio vivo del archivo más reciente? (Necesario para poder detectar el cambio y mostrar la advertencia — si no se guarda el precio original, no hay con qué comparar.)
- ¿Cómo se ve la advertencia? (¿ícono en la línea, alerta general del presupuesto, bloqueo hasta que se revise?)
- Misma lógica para stock: si una pieza pasa de `alistado: si` a `alistado: no` (o viceversa) después de presupuestada, ¿qué debe pasar?

## 3. Repuesto sin stock al momento de presupuestar

**A definir:**
- Si `alistado = "no"` cuando se arma el presupuesto, ¿se puede agregar igual (con aviso de "sin stock, sujeto a disponibilidad"), o el sistema debe bloquear esa pieza?

## 4. Búsqueda de repuestos en el presupuesto

**A definir:**
- ¿Cómo busca el usuario una pieza CRAC dentro del picker del presupuesto? Opciones no excluyentes: por código exacto, por texto libre contra el campo `aplicacion` (vehículo/motor), por categoría + marca decodificadas.
- ¿Se combina mano de obra + repuesto en la misma línea del presupuesto, o son dos líneas separadas que se muestran agrupadas? (El negocio confirmó que **se combinan** — falta definir cómo se ve esa línea combinada en la UI y en el PDF final.)

## 5. Códigos que no decodifican (1.1% del archivo)

Ver `CRAC.md` sección 3.4 para el detalle y ejemplos.

**A definir:**
- ¿Esas piezas se excluyen del picker de búsqueda, o se muestran igual sin categoría/marca "linda" (solo código + aplicación + precio)?

## 6. Margen sobre el precio

Confirmado por el negocio: **el precio del CSV ya es el precio final al cliente** (no es costo interno). Por lo tanto, en principio **no hace falta aplicar margen adicional** sobre el valor del repuesto dentro del presupuesto.

**A confirmar igual:** si en algún caso puntual el negocio quiere sumar algo extra sobre ese precio (traslado, urgencia, etc.), definir dónde vive ese ajuste — no debería ser parte del dato CRAC en sí.
