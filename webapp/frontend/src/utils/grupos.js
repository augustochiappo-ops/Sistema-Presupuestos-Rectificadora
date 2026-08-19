/*
 * Grupos de repuestos.
 *
 * Un grupo es una categoría del proveedor (ej. "Cojinetes biela"). Se arman
 * solos: todo lo que se carga dentro de una categoría entra al mismo grupo, y
 * el nombre de la categoría es lo único que lee el cliente en el PDF.
 *
 * **Todo lo que se carga se cotiza** (2026-08-18). Antes el sistema elegía solo
 * con cuál cotizar —la opción de mayor subtotal, como tolerancia por si el día
 * de la compra faltaba la barata— y las demás quedaban de alternativa. El dueño
 * lo pidió al revés: él carga la pieza que va a usar. Por eso una misma
 * categoría puede llevar dos piezas que suman las dos (válvulas de admisión y
 * de escape son las dos "Válvulas").
 *
 * `opcional` es la única línea que no suma: el repuesto "por las dudas" (una
 * bomba de aceite por si la del motor no sirve). Queda guardado, sale en la
 * caja de opcionales del PDF con su precio, y se cobra recién si hace falta.
 */

import { formatPrecioARS, parsePrecioARS, aPesos } from './format'
import { unitarioDesdeSubtotal } from './precios'

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
 *
 * `opcional` sale de `elegida`: una opción que no cotiza es opcional. Vale para
 * las dos épocas — hoy porque el backend guarda elegida=0 justo en las
 * opcionales, y en los presupuestos viejos porque las alternativas que el
 * sistema no eligió tampoco se cobraban. Así un presupuesto emitido antes de
 * este cambio conserva exactamente el total que tenía.
 */
export function lineaDeOpcion(grupo, o, preciosDeHoy = false) {
  const enCatalogo = o.stock_actual !== null && o.stock_actual !== undefined
  // Redondeado por la misma razón que en lineaDeCatalogo: el backend guarda el
  // unitario en pesos enteros, así que la pantalla tiene que cotizar sobre ese
  // mismo número.
  const precio = aPesos(preciosDeHoy && enCatalogo ? (o.precio_actual || 0) : o.precio_unitario)
  const stock = preciosDeHoy && enCatalogo ? o.stock_actual : o.stock_al_cotizar
  return {
    key: o.repuesto_codigo || `op-${grupo.grupo_num}-${o.descripcion}`,
    repuesto_codigo: o.repuesto_codigo,
    descripcion: o.descripcion,
    categoria: grupo.categoria,
    cat_prefijo: null,
    marca: o.marca,
    medida: o.medida,
    base_codigo: o.base_codigo || null,
    grupo: grupo.categoria,
    cantidad: o.cantidad,
    precio_unitario: precio,
    precioTexto: precio ? formatPrecioARS(precio) : '',
    stock,
    opcional: !o.elegida,
    esManual: !o.repuesto_codigo,
  }
}

export function subtotalDe(linea) {
  return aPesos((Number(linea.precio_unitario) || 0) * (Number(linea.cantidad) || 0))
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

/** Las líneas de un grupo que efectivamente se cotizan (las que no son opcionales). */
export function opcionesQueCotizan(opciones) {
  return opciones.filter((o) => !o.opcional)
}

/** Subtotal de un grupo: la suma de todo lo que cotiza. */
export function subtotalDelGrupo(opciones) {
  return opcionesQueCotizan(opciones).reduce((acc, o) => acc + subtotalDe(o), 0)
}

/**
 * Familia de medidas: el mismo repuesto de la misma marca en sus distintas
 * medidas (STD, 025, 050…). El proveedor las identifica con un `base_codigo`
 * común, y el sistema las agrega juntas cuando se elige una — así que también
 * tienen que poder sacarse juntas, sin arrastrar al resto de la categoría, que
 * son otras marcas.
 *
 * Respeta el orden en que vienen las opciones (el de la pantalla que llama), y
 * cada familia queda donde apareció su primera opción. Lo que no tiene medida
 * queda como familia de uno: se dibuja como una fila suelta.
 */
export function agruparPorFamilia(opciones) {
  const familias = []
  const porBase = new Map()

  opciones.forEach((o) => {
    const base = o.base_codigo || null
    if (!base) {
      familias.push({ base: null, opciones: [o] })
      return
    }
    let familia = porBase.get(base)
    if (!familia) {
      familia = { base, opciones: [] }
      porBase.set(base, familia)
      familias.push(familia)
    }
    familia.opciones.push(o)
  })

  return familias.map((f) => ({
    ...f,
    esFamilia: f.opciones.length > 1,
    marca: f.opciones[0].marca || null,
    descripcion: f.opciones[0].descripcion || null,
    keys: f.opciones.map((o) => o.key),
    codigos: f.opciones.map((o) => o.repuesto_codigo).filter(Boolean),
  }))
}

/**
 * Las familias de un grupo, listas para dibujar, de mayor a menor precio.
 *
 * Por qué existe: ordenar las opciones sueltas por subtotal y recién después
 * agrupar por familia rompía la agrupación. Un código sin familia (una marca
 * que el proveedor trae en una sola medida) caía, según su precio, justo
 * después de las medidas de otro código, y en pantalla se leía como una medida
 * más de esa familia — el bug que reportó el dueño con los aros: "hay un código
 * que se mete en otros grupos según lo que elijo a mano". La familia es la
 * unidad que se ordena; sus medidas nunca se separan.
 */
export function familiasOrdenadas(opciones) {
  const familias = agruparPorFamilia(opciones).map((f) => ({
    ...f,
    opciones: [...f.opciones].sort((a, b) => subtotalDe(b) - subtotalDe(a)),
  }))
  const precioDe = (f) => Math.max(...f.opciones.map(subtotalDe))
  familias.sort((a, b) => precioDe(b) - precioDe(a))
  return familias
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

/** Total de repuestos del presupuesto: todo lo cargado, menos lo opcional. */
export function totalRepuestos(lineas) {
  return lineas.reduce((acc, l) => acc + (l.opcional ? 0 : subtotalDe(l)), 0)
}

/** Lo que suman los repuestos marcados como opcionales (va aparte del total). */
export function totalRepuestosOpcionales(lineas) {
  return lineas.reduce((acc, l) => acc + (l.opcional ? subtotalDe(l) : 0), 0)
}

/*
 * Editar una línea de repuesto: cantidad, precio unitario y subtotal.
 *
 * Transformaciones puras de la lista de líneas, por la misma razón que las de
 * mano de obra (utils/servicios.js): las usan el pop-up "Ver repuestos" —vía
 * useRepuestosAgrupados—, el paso de Revisión y la edición del detalle, y la
 * cuenta tiene que ser idéntica en los tres lados.
 */

export function conCantidadRepuesto(lineas, key, cantidad) {
  const cant = Number(cantidad)
  if (Number.isNaN(cant) || cant < 0) return lineas
  return lineas.map((r) => (r.key === key ? { ...r, cantidad: cant } : r))
}

/** El texto se guarda tal cual se tipea; el valor va parseado aparte. */
export function conPrecioRepuesto(lineas, key, texto) {
  return lineas.map((r) => (
    r.key === key ? { ...r, precioTexto: texto, precio_unitario: parsePrecioARS(texto) } : r
  ))
}

/**
 * Escribir el SUBTOTAL de una línea: se reparte por la cantidad y lo que queda
 * pisa el precio unitario, que es lo que se guarda. Es la misma casilla del
 * unitario vista al revés — manda el último que se escribe.
 */
export function conSubtotalRepuesto(lineas, key, texto) {
  return lineas.map((r) => {
    if (r.key !== key) return r
    const { valor } = unitarioDesdeSubtotal(texto, r.cantidad)
    return {
      ...r,
      precio_unitario: valor,
      precioTexto: valor === null ? texto : formatPrecioARS(valor),
    }
  })
}

/** Opcional: queda en el presupuesto y sale en el PDF, pero no suma al total. */
export function conOpcionalRepuesto(lineas, key, opcional) {
  return lineas.map((r) => (
    r.key === key ? { ...r, opcional: opcional === undefined ? !r.opcional : Boolean(opcional) } : r
  ))
}

/** Payload de grupos para el backend (crear y editar usan el mismo formato). */
export function gruposParaPayload(lineas) {
  const { grupos } = agruparLineas(lineas)
  return grupos.map((g) => ({
    categoria: g.categoria,
    cat_prefijo: g.cat_prefijo,
    opciones: g.opciones.map((o) => ({
      repuesto_codigo: o.repuesto_codigo,
      descripcion: o.descripcion,
      categoria: g.categoria,
      marca: o.marca,
      medida: o.medida,
      cantidad: Number(o.cantidad),
      precio_unitario: Number(o.precio_unitario),
      stock_al_cotizar: o.stock,
      opcional: Boolean(o.opcional),
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
    opcional: Boolean(r.opcional),
  }))
}
