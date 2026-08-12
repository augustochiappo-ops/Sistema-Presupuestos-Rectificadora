import React from 'react'
import { api } from '../api/client'
import { formatPrecioARS } from '../utils/format'

/*
 * Agrupado automático de repuestos, compartido por el wizard y la edición de un
 * presupuesto: no hay botón de "crear grupo", lo que se tilda dentro de una
 * categoría del proveedor entra solo al grupo de esa categoría.
 *
 * Reglas:
 *  - Un grupo por categoría. Volver más tarde a la misma categoría reengancha
 *    el grupo que ya existe en vez de crear uno segundo.
 *  - La cantidad se hereda del grupo: si el primero se cargó ×4, lo que se
 *    agregue después arranca en 4. Después cada opción se ajusta por separado
 *    (una marca viene por blíster de 8 y otra por blíster de 4).
 *  - origen 'exacto' (menú "+" o "−") = el usuario eligió la cantidad a
 *    propósito: pasa a ser la del grupo. origen 'click' = usa la que ya tenga
 *    el grupo, o la que recuerde la ficha del motor para ese código.
 *  - Si el código tiene medida (STD/025/050…), las hermanas que el proveedor
 *    tenga de verdad se agregan solas al mismo grupo con la misma cantidad.
 */
export function useRepuestosAgrupados({
  lineas, setLineas, cantidadPorGrupo, setCantidadGrupo, cantidadRecordada,
}) {
  const porCodigo = React.useMemo(() => {
    const m = new Map()
    lineas.forEach((r) => { if (r.repuesto_codigo) m.set(r.repuesto_codigo, r) })
    return m
  }, [lineas])

  const cantidadPorCodigo = React.useMemo(() => {
    const m = new Map()
    porCodigo.forEach((r, cod) => m.set(cod, r.cantidad))
    return m
  }, [porCodigo])

  const cambiarCantidad = React.useCallback((key, cantidad) => {
    if (Number.isNaN(cantidad) || cantidad < 0) return
    setLineas((actual) => actual.map((r) => (r.key === key ? { ...r, cantidad } : r)))
  }, [setLineas])

  const cambiarPrecio = React.useCallback((key, texto) => {
    const precio = parsePrecio(texto)
    setLineas((actual) => actual.map((r) => (
      r.key === key ? { ...r, precioTexto: texto, precio_unitario: precio } : r
    )))
  }, [setLineas])

  const quitar = React.useCallback((key) => {
    setLineas((actual) => actual.filter((r) => r.key !== key))
  }, [setLineas])

  const quitarVarias = React.useCallback((keys) => {
    const fuera = new Set(keys)
    setLineas((actual) => actual.filter((r) => !fuera.has(r.key)))
  }, [setLineas])

  const agregar = React.useCallback((rep, cantidadPedida, origen = 'click') => {
    const grupo = rep.categoria || null
    const existente = porCodigo.get(rep.codigo)

    if (existente) {
      // Bajar la cantidad hasta cero es sacar el repuesto, no dejarlo en cero:
      // una línea en cero se ve igual que una borrada (no muestra el ×N) pero
      // sigue cargada, así que al volver a agregar el código el sistema lo
      // encontraba "ya puesto" y no volvía a traer sus otras medidas. Además
      // una línea en cero es inválida y apagaba "Confirmar presupuesto" sin
      // explicar por qué.
      if (!(cantidadPedida > 0)) {
        quitar(existente.key)
        return
      }
      cambiarCantidad(existente.key, cantidadPedida)
      if (origen === 'exacto' && grupo) setCantidadGrupo(grupo, cantidadPedida)
      return
    }

    const cantidad = origen === 'exacto'
      ? cantidadPedida
      : (cantidadRecordada?.get(rep.codigo) || (grupo && cantidadPorGrupo[grupo]) || cantidadPedida || 1)
    if (!(cantidad > 0)) return

    if (grupo && (origen === 'exacto' || cantidadPorGrupo[grupo] === undefined)) {
      setCantidadGrupo(grupo, cantidad)
    }

    setLineas((actual) => [...actual, lineaDeCatalogo(rep, cantidad)])

    if (rep.medida) {
      api.get(`/repuestos/medidas?codigo=${encodeURIComponent(rep.codigo)}`).then((hermanas) => {
        const otras = hermanas.filter((h) => h.codigo !== rep.codigo)
        if (!otras.length) return
        setLineas((actual) => {
          const yaEstan = new Set(actual.map((r) => r.repuesto_codigo))
          const faltantes = otras
            .filter((h) => !yaEstan.has(h.codigo))
            .map((h) => lineaDeCatalogo({
              codigo: h.codigo,
              descripcion: h.aplicacion,
              precio: h.precio,
              stock: h.stock,
              categoria: h.categoria,
              cat_prefijo: h.cat_prefijo,
              marca: h.marca,
              medida: h.medida,
              base_codigo: h.base_codigo,
            }, cantidad))
          return faltantes.length ? [...actual, ...faltantes] : actual
        })
      }).catch(() => { /* si falla, queda solo la medida elegida */ })
    }
  }, [porCodigo, cambiarCantidad, quitar, cantidadRecordada, cantidadPorGrupo, setCantidadGrupo, setLineas])

  return { cantidadPorCodigo, agregar, cambiarCantidad, cambiarPrecio, quitar, quitarVarias }
}

export function lineaDeCatalogo(rep, cantidad) {
  const unitario = rep.precio || 0
  return {
    key: rep.codigo,
    repuesto_codigo: rep.codigo,
    descripcion: rep.descripcion || rep.codigo,
    categoria: rep.categoria || null,
    cat_prefijo: rep.cat_prefijo || null,
    marca: rep.marca || null,
    medida: rep.medida || null,
    // Mismo repuesto y marca en otra medida: las cuatro comparten base_codigo.
    // Es lo que permite sacarlas juntas sin tocar el resto de la categoría.
    base_codigo: rep.base_codigo || null,
    grupo: rep.categoria || null,
    cantidad,
    precio_unitario: unitario,
    precioTexto: unitario ? formatPrecioARS(unitario) : '',
    stock: rep.stock ?? null,
    esManual: false,
  }
}

// Copia local de parsePrecioARS para no crear una dependencia circular entre
// utils/format y este hook; el formato es el mismo ($ 1.234,56).
function parsePrecio(texto) {
  if (typeof texto === 'number') return texto
  if (!texto) return null
  const limpio = String(texto).replace(/\$/g, '').trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(limpio)
  return Number.isNaN(n) ? null : n
}
