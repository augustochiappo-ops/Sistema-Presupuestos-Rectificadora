# Integración CRAC → Sistema de presupuestos — decisiones

Este documento listaba lo que **todavía no estaba definido**. El 2026-07-29 el dueño del negocio resolvió los puntos 2 a 6 y la integración se implementó (rama `claude/revisar-codigo-master-vye67l`): el wizard de presupuestos tiene un paso 4 "Repuestos" en web y escritorio. Ver `CRAC.md` para el formato de datos confirmado.

---

## 1. Actualización diaria del archivo — PARCIALMENTE RESUELTO

El archivo `precio-stock.csv` llega actualizado todos los días (cambios menores, no drásticos).

**Resuelto el 2026-08-10:** cada importación guarda su fecha y hora en `app_meta.catalogo_importado_en`. Esa fecha se muestra en "Actualizar Excel" ("Última carga: …") y en la pantalla de Pedido de repuestos, porque todo lo que el sistema llama "precio de hoy" son en realidad los precios de esa carga — si pasaron días, conviene verlo antes de salir a comprar.

**Todavía a definir:**
- Mecanismo de carga: ¿se sube manualmente cada archivo nuevo, o hay una carpeta/proceso que lo detecta automáticamente? (Hoy: subida manual desde "Actualizar Excel".)
- ¿Se conserva el histórico de archivos anteriores? (Hoy: cada import reemplaza todo; solo queda la fecha de la última carga.)

## 2. Presupuesto ya emitido vs. archivo actualizado — RESUELTO ✔

Cada línea de repuesto **congela** al cotizar: `repuesto_codigo`, `precio_unitario`, `stock_al_cotizar` y la descripción (columnas nuevas de `presupuesto_items`). La comparación se dispara **al abrir el detalle del presupuesto**: el mismo GET de ítems trae `precio_actual`/`stock_actual` del catálogo vigente (lookup por código, nunca por id — los ids no sobreviven al reimport).

La advertencia se ve así: aviso por línea ("Precio de lista cambió: $X → $Y", "Ya no tiene stock", "Ya no está en la lista del catálogo") + banner general arriba de la sección Repuestos. No bloquea nada; es informativa. Nada de esto aparece en el PDF.

## 3. Repuesto sin stock al momento de presupuestar — RESUELTO ✔

Se puede agregar igual, con el aviso visible "Sin stock — sujeto a disponibilidad" en el wizard. El PDF no menciona el stock.

## 4. Búsqueda de repuestos en el presupuesto — RESUELTO ✔

El picker del paso Repuestos busca por las cuatro vías, no excluyentes: categoría, marca, código (LIKE) y texto libre contra `aplicacion`. Misma regla que la pestaña Repuestos: vacío hasta que haya un filtro, tope de 1000 resultados.

Sobre la línea combinada: se optó por una **sección "Repuestos" separada** en el presupuesto y el PDF, en lugar de fusionar mano de obra y repuesto en una sola línea.

**Actualizado el 2026-08-10** (grupos de opciones): el PDF de repuestos quedó en **una sola columna con la categoría**, sin cantidad ni precio por línea — la cantidad de una línea es la de envases de la marca que ganó, que no significa nada para el cliente. Y el paso ya no "sugiere" repuestos del historial: arranca cargado con la **ficha de repuestos del motor** (`motor_repuesto_grupos`/`motor_repuesto_opciones`), que es una asociación explícita y editable.

Un presupuesto puede ser de solo repuestos (sin mano de obra) y también de solo servicios.

## 5. Códigos que no decodifican (1.1% del archivo) — RESUELTO ✔

Se muestran igual en el picker, sin categoría/marca "linda" (solo código + aplicación + precio), como recomendaba `CRAC.md`.

## 6. Margen sobre el precio — RESUELTO ✔

El precio del CSV va tal cual al presupuesto (ya es precio final al cliente, sin margen). El precio unitario de cada línea es editable a mano en el wizard y en la edición, que cubre el caso puntual de sumar algo extra (traslado, urgencia) sin tocar el dato CRAC.
