/*
 * Mano de obra de un presupuesto en armado.
 *
 * La selección del wizard (`seleccion`) es:
 *   cantidades  { [servicioId]: cantidad }   — servicios de la lista de la Cámara
 *   customItems [ { id, descripcion_custom, precio_aplicado, precioTexto, cantidad } ]
 *   precios     { [servicioId]: { valor, texto } } — precio pisado a mano
 *   opcionales  Set/array de ids (servicioId o id del ítem manual) marcados
 *               como OPCIONALES: siguen en el presupuesto y salen en el PDF en
 *               su propia caja, pero no suman al total
 *
 * `precios` existe porque el precio de lista es un punto de partida, no una
 * verdad: el taller puede cambiar el unitario de un renglón mientras arma el
 * presupuesto. Un precio pisado NO recibe el ajuste % de mano de obra — ya es un
 * número elegido a mano, ajustarlo de nuevo sería doble ajuste (es la misma
 * regla que el backend aplica a los ítems manuales, ver _resolver_items).
 *
 * Este módulo es la única fuente de verdad del cálculo: lo usan el paso
 * Servicios (lista y previsualización), el paso de Revisión y el payload que se
 * manda al backend.
 */

import { formatPrecioARS, parsePrecioARS, aPesos } from './format'
import { unitarioDesdeSubtotal } from './precios'

/** Precio de lista con el ajuste % aplicado. El redondeo por unidad tiene que
 *  ser igual al del backend (_resolver_items) para que los totales coincidan:
 *  pesos enteros hacia arriba en los dos lados. */
export function precioAjustado(precio, ajustePct) {
  const factor = 1 + (Number(ajustePct) || 0) / 100
  return aPesos((precio || 0) * factor)
}

/** Lo que vale hoy un servicio de la lista: el precio pisado a mano si lo hay,
 *  y si no el de la Cámara con el ajuste. Puede ser null si lo tipeado no se
 *  entiende como número (el paso lo marca en rojo y no deja avanzar). */
export function precioEfectivo(servicio, seleccion, ajustePct) {
  const pisado = seleccion.precios?.[servicio.id]
  return pisado ? pisado.valor : precioAjustado(servicio.precio, ajustePct)
}

export function estaPisado(servicioId, seleccion) {
  return Boolean(seleccion.precios?.[servicioId])
}

/**
 * Las líneas de mano de obra que van en el presupuesto: primero los servicios de
 * la Cámara con cantidad, después los ítems manuales. `subtotal` es null cuando
 * el unitario no es válido, para que el total no mienta.
 */
/** ¿Esta línea está marcada como opcional? La clave es la misma que usa la
 *  lista de líneas: el servicio_id para la lista de la Cámara, el id del ítem
 *  para los manuales. */
export function esOpcional(clave, seleccion) {
  // Comparado como texto: la clave de un servicio de la Cámara es un número y
  // la de un ítem manual una cadena, y el arrastre solo puede mover texto.
  return (seleccion.opcionales || []).some((c) => String(c) === String(clave))
}

export function lineasServicios(servicios, seleccion, ajustePct) {
  const cantidades = seleccion.cantidades || {}
  const customItems = seleccion.customItems || []

  const deLista = servicios
    .filter((s) => (cantidades[s.id] || 0) > 0)
    .map((s) => {
      const pisado = seleccion.precios?.[s.id]
      const precioUnitario = precioEfectivo(s, seleccion, ajustePct)
      const cantidad = cantidades[s.id]
      return {
        id: s.id,
        servicioId: s.id,
        itemNum: s.item_num,
        descripcion: s.descripcion,
        cantidad,
        precioUnitario,
        // Lo que valdría sin pisarlo: la tarifa vigente del taller (la lista de
        // la Cámara, o el precio propio si lo hay) con el ajuste del
        // presupuesto. Es contra esto que se compara un precio editado, y es lo
        // que muestra el resumen de Revisión al ofrecer guardarlo como tarifa.
        precioLista: precioAjustado(s.precio, ajustePct),
        // ¿El precio vigente ya es uno fijado por el taller? Distinto de
        // `pisado`, que es "lo cambié en ESTE presupuesto".
        esPropio: Boolean(s.es_propio),
        precioFacra: s.precio_facra,
        subtotal: precioUnitario === null ? null : precioUnitario * cantidad,
        // El texto del recuadro editable: lo tipeado si lo pisaron, y si no el
        // precio de lista ya formateado.
        precioTexto: pisado ? pisado.texto : formatPrecioARS(precioUnitario),
        pisado: Boolean(pisado),
        opcional: esOpcional(s.id, seleccion),
        esManual: false,
      }
    })

  const manuales = customItems
    .filter((c) => (c.cantidad || 0) > 0)
    .map((c) => ({
      id: c.id,
      servicioId: null,
      itemNum: null,
      descripcion: c.descripcion_custom,
      cantidad: c.cantidad,
      precioUnitario: c.precio_aplicado,
      subtotal: c.precio_aplicado === null || c.precio_aplicado === undefined
        ? null
        : c.precio_aplicado * c.cantidad,
      precioTexto: c.precioTexto ?? formatPrecioARS(c.precio_aplicado),
      // Un ítem manual no tiene precio de lista: su precio SIEMPRE es a mano.
      pisado: false,
      opcional: esOpcional(c.id, seleccion),
      esManual: true,
    }))

  return [...deLista, ...manuales]
}

/** Total de mano de obra: lo que se cobra, o sea sin las líneas opcionales. */
export function totalLineas(lineas) {
  return lineas.reduce((acc, l) => acc + (l.opcional ? 0 : l.subtotal || 0), 0)
}

/** Lo que suman las líneas opcionales, que va informado aparte del total. */
export function totalLineasOpcionales(lineas) {
  return lineas.reduce((acc, l) => acc + (l.opcional ? l.subtotal || 0 : 0), 0)
}

/** Hay algún unitario que no se entiende: no se puede avanzar ni confirmar. */
export function hayPreciosInvalidos(lineas) {
  return lineas.some((l) => l.precioUnitario === null
    || l.precioUnitario === undefined
    || Number.isNaN(l.precioUnitario))
}

/*
 * Editar una línea de mano de obra: cantidad, precio unitario y subtotal.
 *
 * Son transformaciones puras de la selección (`seleccion` → selección nueva)
 * porque las usan DOS pantallas: el paso Servicios, donde se arma la lista, y
 * el paso de Revisión, donde se repasa antes de emitir. La cuenta tiene que ser
 * la misma en los dos lados, así que vive una sola vez acá.
 *
 * `fila` es una línea de lineasServicios: trae `esManual`, `servicioId`, `id` y
 * la cantidad, que es todo lo que hace falta para saber dónde escribir.
 */

/**
 * Cantidad de una línea. Bajarla a 0 saca el ítem del presupuesto: también se
 * borran su precio pisado y su marca de opcional, para que nada que ya no se ve
 * vuelva solo si el servicio se agrega de nuevo más tarde.
 */
export function conCantidadServicio(seleccion, fila, cantidad) {
  const cant = Number(cantidad)
  if (Number.isNaN(cant) || cant < 0) return seleccion
  const sinOpcional = (clave) => (seleccion.opcionales || []).filter((c) => String(c) !== String(clave))

  if (fila.esManual) {
    if (cant > 0) {
      return {
        ...seleccion,
        customItems: (seleccion.customItems || []).map((c) => (
          c.id === fila.id ? { ...c, cantidad: cant } : c
        )),
      }
    }
    return {
      ...seleccion,
      customItems: (seleccion.customItems || []).filter((c) => c.id !== fila.id),
      opcionales: sinOpcional(fila.id),
    }
  }

  const cantidades = { ...(seleccion.cantidades || {}) }
  const precios = { ...(seleccion.precios || {}) }
  // Tipear la cantidad a mano no tagea familia: el par adaptativo del paso
  // Servicios solo mira lo elegido desde el botón "+".
  const grupos = { ...(seleccion.grupos || {}) }
  delete grupos[fila.servicioId]

  if (cant > 0) {
    cantidades[fila.servicioId] = cant
    return { ...seleccion, cantidades, grupos, precios, opcionales: seleccion.opcionales || [] }
  }
  delete cantidades[fila.servicioId]
  delete precios[fila.servicioId]
  return {
    ...seleccion, cantidades, grupos, precios, opcionales: sinOpcional(fila.servicioId),
  }
}

/**
 * Precio unitario tipeado a mano. Se guarda el texto tal cual se escribe (para
 * no pelearle al cursor) y el valor parseado aparte; un texto que no se
 * entiende deja el valor en null y la pantalla lo marca en rojo.
 *
 * Vaciar el recuadro de un servicio de la Cámara devuelve el precio de lista:
 * es la misma salida que el botón ↺, escribiendo.
 */
export function conPrecioServicio(seleccion, fila, texto) {
  if (fila.esManual) {
    return {
      ...seleccion,
      customItems: (seleccion.customItems || []).map((c) => (
        c.id === fila.id ? { ...c, precio_aplicado: parsePrecioARS(texto), precioTexto: texto } : c
      )),
    }
  }
  if (!texto.trim()) return sinPrecioPisado(seleccion, fila)
  return {
    ...seleccion,
    precios: { ...(seleccion.precios || {}), [fila.servicioId]: { valor: parsePrecioARS(texto), texto } },
  }
}

/**
 * Subtotal tipeado a mano: es la casilla del unitario vista al revés. Se
 * reparte lo escrito entre la cantidad y lo que queda es el unitario, que es lo
 * que se guarda. Con cantidad 0 no se puede repartir, así que el valor queda
 * inválido (recuadro rojo) en vez de inventar un número.
 */
export function conSubtotalServicio(seleccion, fila, texto) {
  const { valor } = unitarioDesdeSubtotal(texto, fila.cantidad)
  if (fila.esManual) {
    return {
      ...seleccion,
      customItems: (seleccion.customItems || []).map((c) => (
        c.id === fila.id
          ? { ...c, precio_aplicado: valor, precioTexto: valor === null ? texto : formatPrecioARS(valor) }
          : c
      )),
    }
  }
  if (!texto.trim()) return sinPrecioPisado(seleccion, fila)
  return {
    ...seleccion,
    precios: {
      ...(seleccion.precios || {}),
      [fila.servicioId]: { valor, texto: valor === null ? texto : formatPrecioARS(valor) },
    },
  }
}

/** Vuelve al precio de la lista de la Cámara (con el ajuste %). Es el botón ↺. */
export function sinPrecioPisado(seleccion, fila) {
  const precios = { ...(seleccion.precios || {}) }
  delete precios[fila.servicioId]
  return { ...seleccion, precios }
}

/**
 * Ítems de mano de obra para el POST de creación. Un servicio de la Cámara viaja
 * con su `servicio_id` y el backend le pone el precio de lista; solo cuando el
 * precio se pisó a mano se manda `precio_unitario` y el backend respeta ese.
 */
export function itemsServiciosParaPayload(seleccion) {
  const cantidades = seleccion.cantidades || {}
  const precios = seleccion.precios || {}
  const customItems = seleccion.customItems || []

  const deLista = Object.entries(cantidades)
    .filter(([, cantidad]) => cantidad > 0)
    .map(([id, cantidad]) => {
      const item = { servicio_id: Number(id), cantidad }
      const pisado = precios[id]
      if (pisado && pisado.valor !== null && pisado.valor !== undefined) {
        item.precio_unitario = pisado.valor
      }
      if (esOpcional(Number(id), seleccion)) item.opcional = true
      return item
    })

  const manuales = customItems
    .filter((c) => (c.cantidad || 0) > 0)
    .map((c) => ({
      servicio_id: null,
      descripcion_custom: c.descripcion_custom,
      precio_aplicado: c.precio_aplicado,
      cantidad: c.cantidad,
      opcional: esOpcional(c.id, seleccion),
    }))

  return [...deLista, ...manuales]
}
