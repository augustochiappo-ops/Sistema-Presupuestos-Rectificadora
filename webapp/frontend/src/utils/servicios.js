/*
 * Mano de obra de un presupuesto en armado.
 *
 * La selección del wizard (`seleccion`) es:
 *   cantidades  { [servicioId]: cantidad }   — servicios de la lista de la Cámara
 *   customItems [ { id, descripcion_custom, precio_aplicado, precioTexto, cantidad } ]
 *   precios     { [servicioId]: { valor, texto } } — precio pisado a mano
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

import { formatPrecioARS } from './format'

/** Precio de lista con el ajuste % aplicado. El redondeo por unidad tiene que
 *  ser igual al del backend (_resolver_items) para que los totales coincidan. */
export function precioAjustado(precio, ajustePct) {
  const factor = 1 + (Number(ajustePct) || 0) / 100
  return Math.round((precio || 0) * factor * 100) / 100
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
        subtotal: precioUnitario === null ? null : precioUnitario * cantidad,
        // El texto del recuadro editable: lo tipeado si lo pisaron, y si no el
        // precio de lista ya formateado.
        precioTexto: pisado ? pisado.texto : formatPrecioARS(precioUnitario),
        pisado: Boolean(pisado),
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
      esManual: true,
    }))

  return [...deLista, ...manuales]
}

export function totalLineas(lineas) {
  return lineas.reduce((acc, l) => acc + (l.subtotal || 0), 0)
}

/** Hay algún unitario que no se entiende: no se puede avanzar ni confirmar. */
export function hayPreciosInvalidos(lineas) {
  return lineas.some((l) => l.precioUnitario === null
    || l.precioUnitario === undefined
    || Number.isNaN(l.precioUnitario))
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
      return item
    })

  const manuales = customItems
    .filter((c) => (c.cantidad || 0) > 0)
    .map((c) => ({
      servicio_id: null,
      descripcion_custom: c.descripcion_custom,
      precio_aplicado: c.precio_aplicado,
      cantidad: c.cantidad,
    }))

  return [...deLista, ...manuales]
}
