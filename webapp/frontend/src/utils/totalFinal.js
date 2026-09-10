/*
 * Poner el TOTAL a mano y que el ajuste % se acomode solo.
 *
 * Pedido del dueño (2026-09-09): "que se ponga el precio a mano y que el
 * porcentaje se adapte a ese total". Hasta ahora el camino era al revés —se
 * escribe un %, se mira cómo quedó el total, se corrige el %— y cuando lo que
 * uno tiene en la cabeza es el número final, el que le va a decir al cliente,
 * acertarlo tanteando el porcentaje lleva varios intentos.
 *
 * Acá va la cuenta dada vuelta: dado el total que se quiere, cuál es el ajuste %
 * que lo produce. Este módulo no sabe nada de pantallas. Recibe `totalPara`,
 * una función que dado un % devuelve el total del presupuesto, y busca el
 * argumento. Así lo usan las dos pantallas donde el total se puede fijar —la
 * Revisión del wizard y la edición del detalle— sin duplicar el cálculo: cada
 * una arma su `totalPara` con las mismas funciones con las que después dibuja
 * los números en la tabla, y entonces el % que sale de acá produce exactamente
 * el total que se va a ver (y el que va a guardar el backend, que aplica la
 * misma fórmula en _resolver_items).
 *
 * POR QUÉ UNA BÚSQUEDA Y NO UN DESPEJE. Despejar sería
 * `pct = ((objetivo − fijo) / base − 1) × 100`, y esa fórmula miente: el precio
 * de cada renglón se redondea a pesos ENTEROS hacia arriba (aPesos), así que el
 * total no es una recta sino una escalera. El % despejado da, al aplicarlo, un
 * total parecido pero distinto del pedido. Como la escalera nunca baja —subir
 * el % no puede bajar ningún precio— se la puede recorrer por bisección, y eso
 * sí encuentra el % exacto cuando existe.
 *
 * Y justamente por ser una escalera hay totales que NO se pueden alcanzar:
 * entre un escalón y el siguiente hay un salto de tantos pesos como piezas
 * mueva ese redondeo. Cuando el objetivo cae dentro de un salto se devuelve el
 * escalón más cercano con `exacto: false`, para que la pantalla lo diga en vez
 * de mostrar callada un número distinto del que se tipeó.
 */

/*
 * Cuatro decimales de porcentaje. Con la mano de obra de un presupuesto típico
 * un paso de 0,0001% mueve el total menos de un peso, que es toda la resolución
 * que tiene sentido cuando la plata va en pesos enteros; más decimales sería
 * buscar en un pajar por debajo de la unidad más chica que el sistema maneja.
 */
const DECIMALES = 4

/*
 * Los extremos de la búsqueda. −100% deja la mano de obra de lista en cero (más
 * abajo serían precios negativos, que no significan nada) y +5000% es un techo
 * arbitrario pero enorme: si para llegar al total pedido hiciera falta más, el
 * problema no se arregla con el porcentaje.
 */
export const PCT_MIN = -100
export const PCT_MAX = 5000

/**
 * El % de ajuste que hace que el total dé el número pedido.
 *
 * @param totalPara  (pct) => total del presupuesto con ese ajuste %. Tiene que
 *                   ser no decreciente, que es lo que pasa naturalmente cuando
 *                   el % solo multiplica precios de lista.
 * @param objetivo   el total que se quiere, en pesos.
 * @returns { pct, total, objetivo, exacto, motivo }
 *          pct      — el ajuste a aplicar, o null si el % no puede mover nada.
 *          total    — el total que va a quedar de verdad al aplicar ese pct.
 *          objetivo — el total que se había pedido, ya en pesos enteros.
 *          exacto   — si `total` es el pedido.
 *          motivo   — por qué no dio exacto: 'sin-margen' (no hay mano de obra
 *                     de lista que ajustar), 'bajo' / 'alto' (queda fuera del
 *                     rango alcanzable) o 'salto' (cae entre dos escalones).
 */
export function pctParaTotal(totalPara, objetivo, opciones = {}) {
  const { min = PCT_MIN, max = PCT_MAX, decimales = DECIMALES } = opciones
  const escala = 10 ** decimales
  const kMin = Math.round(min * escala)
  const kMax = Math.round(max * escala)

  // Se trabaja en pesos enteros de punta a punta: el objetivo ya viene
  // redondeado (parsePrecioARS) y los totales se redondean acá, así "dio
  // exacto" es una comparación entre enteros y no entre flotantes.
  const totalEn = (k) => Math.round(totalPara(k / escala))
  const meta = Math.round(objetivo)

  const totalMin = totalEn(kMin)
  const totalMax = totalEn(kMax)

  // El porcentaje no mueve nada: no hay mano de obra de lista en el total, o
  // todos sus precios están puestos a mano (que el ajuste no toca, a propósito:
  // ver utils/servicios.js).
  if (totalMin === totalMax) {
    return {
      pct: null, total: totalMin, objetivo: meta, exacto: meta === totalMin, motivo: 'sin-margen',
    }
  }
  if (meta < totalMin) {
    return { pct: min, total: totalMin, objetivo: meta, exacto: false, motivo: 'bajo' }
  }
  if (meta > totalMax) {
    return { pct: max, total: totalMax, objetivo: meta, exacto: false, motivo: 'alto' }
  }

  const k = primerEscalon(totalEn, meta, kMin, kMax)
  const total = totalEn(k)

  // El objetivo cayó dentro de un salto de la escalera: se ofrece el más
  // cercano de los dos escalones que lo rodean.
  if (total !== meta) {
    const anterior = k - 1
    const totalAnterior = totalEn(anterior)
    const ganaElAnterior = Math.abs(totalAnterior - meta) < Math.abs(total - meta)
    return {
      pct: (ganaElAnterior ? anterior : k) / escala,
      total: ganaElAnterior ? totalAnterior : total,
      objetivo: meta,
      exacto: false,
      motivo: 'salto',
    }
  }

  // Dio exacto. Un escalón es un tramo de porcentajes, no un punto: todos los %
  // desde `k` hasta el final del escalón dan este mismo total. De ese tramo se
  // elige el número más redondo, porque el % también se muestra y se guarda:
  // entre 37% y 37,0042% el dueño prefiere leer 37%, y el total es idéntico.
  const finDelEscalon = Math.min(primerEscalon(totalEn, meta + 1, kMin, kMax) - 1, kMax)
  return {
    pct: masRedondo(k, finDelEscalon, escala) / escala,
    total,
    objetivo: meta,
    exacto: true,
    motivo: null,
  }
}

/**
 * Bisección: el primer punto de la grilla cuyo total llega a `meta` (o la pasa).
 * Devuelve kMax + 1 si ninguno llega, que es lo que hace falta para calcular el
 * final del último escalón.
 */
function primerEscalon(totalEn, meta, kMin, kMax) {
  if (totalEn(kMin) >= meta) return kMin
  if (totalEn(kMax) < meta) return kMax + 1
  let lo = kMin // total(lo) < meta
  let hi = kMax // total(hi) >= meta
  while (hi - lo > 1) {
    const medio = Math.floor((lo + hi) / 2)
    if (totalEn(medio) >= meta) hi = medio
    else lo = medio
  }
  return hi
}

/**
 * El número con menos decimales que hay dentro de [desde, hasta], en la grilla
 * de enteros que usa la búsqueda. Se prueba primero el porcentaje entero, después
 * un decimal, dos, tres; si el escalón es tan angosto que no entra ninguno, queda
 * el borde.
 */
function masRedondo(desde, hasta, escala) {
  for (let paso = escala; paso >= 10; paso /= 10) {
    // El primer múltiplo de `paso` que no queda por debajo de `desde`. Math.ceil
    // acierta también con porcentajes negativos (un descuento).
    const candidato = Math.ceil(desde / paso) * paso
    if (candidato <= hasta) return candidato
  }
  return desde
}

/**
 * Qué avisarle al dueño después de fijar el total a mano. Devuelve '' cuando
 * salió justo y no hay nada que explicar.
 *
 * El texto vive acá y no en cada pantalla porque las dos que fijan el total
 * tienen que decir lo mismo: es la explicación de por qué el número que quedó no
 * es el que se escribió, y eso no puede depender de en qué pantalla se estaba.
 */
export function avisoDeTotalFijado(resultado, formatear) {
  if (!resultado || resultado.exacto) return ''
  if (resultado.motivo === 'sin-margen') {
    return 'Este presupuesto no tiene mano de obra de lista para ajustar, así que el porcentaje no puede mover el total. '
      + 'Cambiá los precios renglón por renglón.'
  }
  if (resultado.motivo === 'bajo') {
    return `Ni con el ajuste al mínimo baja de ${formatear(resultado.total)}: los repuestos y los precios puestos `
      + 'a mano no los toca el porcentaje.'
  }
  if (resultado.motivo === 'alto') {
    return `Para llegar a ese número haría falta un ajuste mayor a +${PCT_MAX}%. Quedó en ${formatear(resultado.total)}.`
  }
  const diferencia = resultado.total - resultado.objetivo
  return `Lo más cerca que se puede llegar es ${formatear(resultado.total)}, ${formatear(Math.abs(diferencia))} `
    + `${diferencia > 0 ? 'más' : 'menos'} de lo que pediste: como los precios van en pesos enteros, el total `
    + 'salta de a varios y no pasa por cualquier número.'
}

/*
 * REDONDEO DEL TOTAL HACIA ARRIBA.
 *
 * Pedido del dueño (2026-09-10): un presupuesto que da $1.236.746 se le dice al
 * cliente como $1.236.800. El paso es de cien pesos y siempre para arriba —
 * nunca para abajo, porque redondear a la baja es regalar plata.
 *
 * Va acá, al lado de `pctParaTotal`, porque es la misma cuenta vista de otra
 * manera: el botón de redondear no hace nada nuevo, calcula el múltiplo de cien
 * que sigue y lo fija como total escrito a mano, con lo cual el ajuste % se
 * acomoda solo igual que si el número se hubiera tipeado. Por eso el redondeo
 * sigue valiendo cuando después se toca el porcentaje: cada vez que el total
 * deja de ser múltiplo de cien, la pantalla vuelve a fijar el escalón de arriba.
 */
export const PASO_REDONDEO = 100

/** El múltiplo de `paso` igual o mayor al total dado, en pesos enteros. */
export function redondearArriba(total, paso = PASO_REDONDEO) {
  return Math.ceil(Math.round(total) / paso) * paso
}

/** Si el total ya cae justo en un múltiplo de `paso` no hay nada que redondear. */
export function estaRedondeado(total, paso = PASO_REDONDEO) {
  return Math.round(total) % paso === 0
}
