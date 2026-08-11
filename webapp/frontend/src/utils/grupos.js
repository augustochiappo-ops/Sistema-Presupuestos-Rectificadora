/*
 * Grupos de opciones de repuesto.
 *
 * Un grupo es una necesidad del motor (ej. "Cojinetes biela") que se puede
 * cubrir con varias piezas intercambiables: distintas marcas y distintas
 * medidas. Se cotiza la de mayor SUBTOTAL — la tolerancia del taller: si el día
 * de la compra la barata no está, el presupuesto ya cubre la cara. Es por
 * subtotal y no por precio de lista porque cada marca viene en un envase
 * distinto: un juego de 8 a $1.000 sale menos que 4 blísters de 2 a $400.
 *
 * Los grupos se arman solos: todo lo que se tilda dentro de una categoría del
 * proveedor entra al mismo grupo. La clave del grupo es el nombre de la
 * categoría (que además es lo único que lee el cliente en el PDF).
 */

import { formatPrecioARS } from './format'

export const SIN_GRUPO = null

/*
 * Una opción congelada que devuelve el backend (get_grupos_presupuesto), en la
 * forma de "línea" que usan el hook de agrupado, el pop-up de repuestos y el
 * wizard.
 *
 * preciosDeHoy: al duplicar un presupuesto la copia arranca con el precio y el
 * stock VIGENTES del catálogo, no con los congelados del original — es un
 * presupuesto nuevo. Un código que ya no está en el catálogo conserva el precio
 * cotizado (misma regla que la revalidación del backend: stock es NOT NULL en
 * el catálogo, así que stock_actual nulo solo puede ser "la fila ya no existe").
 */
export function lineaDeOpcion(grupo, o, preciosDeHoy = false) {
  const enCatalogo = o.stock_actual !== null && o.stock_actual !== undefined
  const precio = preciosDeHoy && enCatalogo ? (o.precio_actual || 0) : o.precio_unitario
  const stock = preciosDeHoy && enCatalogo ? o.stock_actual : o.stock_al_cotizar
  return {
    key: o.repuesto_codigo || `op-${grupo.grupo_num}-${o.descripcion}`,
    repuesto_codigo: o.repuesto_codigo,
    descripcion: o.descripcion,
    categoria: grupo.categoria,
    cat_prefijo: null,
    marca: o.marca,
    medida: o.medida,
    grupo: grupo.categoria,
    cantidad: o.cantidad,
    precio_unitario: precio,
    precioTexto: precio ? formatPrecioARS(precio) : '',
    stock,
    esManual: !o.repuesto_codigo,
  }
}

/** Elección manual por categoría: { [categoria]: repuesto_codigo }. */
export function elegidaAManoInicial(grupos) {
  return Object.fromEntries(
    grupos
      .filter((g) => g.opciones.some((o) => o.elegida_a_mano))
      .map((g) => [g.categoria, g.opciones.find((o) => o.elegida_a_mano).repuesto_codigo]),
  )
}

export function subtotalDe(linea) {
  return (Number(linea.precio_unitario) || 0) * (Number(linea.cantidad) || 0)
}

/** Líneas de un presupuesto agrupadas por categoría, en orden de aparición. */
export function agruparLineas(lineas) {
  const grupos = []
  const porClave = new Map()
  const sueltas = []

  lineas.forEach((linea) => {
    if (!linea.grupo) {
      sueltas.push(linea)
      return
    }
    let grupo = porClave.get(linea.grupo)
    if (!grupo) {
      grupo = { categoria: linea.grupo, cat_prefijo: linea.cat_prefijo || null, opciones: [] }
      porClave.set(linea.grupo, grupo)
      grupos.push(grupo)
    }
    grupo.opciones.push(linea)
  })

  return { grupos, sueltas }
}

/**
 * La opción con la que se cotiza el grupo: la de mayor subtotal, salvo que el
 * usuario haya pisado la elección a mano. Una opción sin precio nunca gana
 * (el catálogo tiene miles con precio 0), pero queda igual para el pedido.
 */
export function opcionElegida(opciones, codigoAMano) {
  if (!opciones.length) return null
  if (codigoAMano) {
    const aMano = opciones.find((o) => o.repuesto_codigo === codigoAMano)
    if (aMano) return aMano
  }
  const conPrecio = opciones.filter((o) => subtotalDe(o) > 0)
  const candidatas = conPrecio.length ? conPrecio : opciones
  return candidatas.reduce((mejor, o) => (subtotalDe(o) > subtotalDe(mejor) ? o : mejor), candidatas[0])
}

/** Lo que quedaría de margen si se consigue la más barata con stock. */
export function ahorroDelGrupo(opciones, elegida) {
  const conStock = opciones.filter((o) => o.stock !== 0 && subtotalDe(o) > 0)
  if (!conStock.length || !elegida) return 0
  const masBarata = conStock.reduce((min, o) => (subtotalDe(o) < subtotalDe(min) ? o : min), conStock[0])
  return Math.max(0, subtotalDe(elegida) - subtotalDe(masBarata))
}

/**
 * Marca las opciones cuyo subtotal quedó muy por debajo del resto del grupo.
 * Es el error típico de los envases: la marca que viene por blíster de 4 en un
 * motor de 16 válvulas necesita cantidad 4, y si quedó en 1 su subtotal se ve
 * cuatro veces más chico que el de las demás. No bloquea nada, solo avisa.
 */
export function codigosConCantidadSospechosa(opciones) {
  const subtotales = opciones.map(subtotalDe).filter((s) => s > 0)
  if (subtotales.length < 2) return new Set()
  const ordenados = [...subtotales].sort((a, b) => a - b)
  const mitad = Math.floor(ordenados.length / 2)
  const mediana = ordenados.length % 2
    ? ordenados[mitad]
    : (ordenados[mitad - 1] + ordenados[mitad]) / 2
  const piso = mediana / 2
  return new Set(
    opciones
      .filter((o) => subtotalDe(o) > 0 && subtotalDe(o) < piso)
      .map((o) => o.repuesto_codigo || o.key),
  )
}

/** Total del presupuesto: solo la elegida de cada grupo, más las líneas sueltas. */
export function totalRepuestos(lineas, elegidaAManoPorGrupo = {}) {
  const { grupos, sueltas } = agruparLineas(lineas)
  const deGrupos = grupos.reduce((acc, g) => {
    const elegida = opcionElegida(g.opciones, elegidaAManoPorGrupo[g.categoria])
    return acc + (elegida ? subtotalDe(elegida) : 0)
  }, 0)
  return deGrupos + sueltas.reduce((acc, l) => acc + subtotalDe(l), 0)
}

/** Payload de grupos para el backend (crear y editar usan el mismo formato). */
export function gruposParaPayload(lineas, elegidaAManoPorGrupo = {}) {
  const { grupos } = agruparLineas(lineas)
  return grupos.map((g) => ({
    categoria: g.categoria,
    cat_prefijo: g.cat_prefijo,
    elegida_a_mano: elegidaAManoPorGrupo[g.categoria] || null,
    opciones: g.opciones.map((o) => ({
      repuesto_codigo: o.repuesto_codigo,
      descripcion: o.descripcion,
      categoria: g.categoria,
      marca: o.marca,
      medida: o.medida,
      cantidad: Number(o.cantidad),
      precio_unitario: Number(o.precio_unitario),
      stock_al_cotizar: o.stock,
    })),
  }))
}

/** Líneas sueltas (repuestos fuera de catálogo sin categoría) como ítems normales. */
export function itemsSueltosParaPayload(lineas) {
  const { sueltas } = agruparLineas(lineas)
  return sueltas.map((r) => ({
    tipo: 'repuesto',
    repuesto_codigo: r.repuesto_codigo,
    descripcion: r.descripcion,
    categoria: r.categoria,
    cantidad: Number(r.cantidad),
    precio_unitario: Number(r.precio_unitario),
    stock_al_cotizar: r.stock,
  }))
}
