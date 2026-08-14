import React from 'react'
import { api } from '../api/client'

/*
 * Pertenencia de un repuesto al motor — el círculo del paso Repuestos.
 *
 * Es el otro eje del paso: la CANTIDAD dice "esto va en este presupuesto", el
 * TILDE dice "esta pieza sirve para este motor". Poner cantidad tilda solo;
 * tildar no pone cantidad.
 *
 * Cada tilde guarda de dónde salió, que es lo que decide si sobrevive cuando se
 * saca la cantidad:
 *
 *   previa → ya estaba en la ficha al abrir el presupuesto. No se destilda sola.
 *   manual → lo tildó el usuario con el círculo.        No se destilda sola.
 *   auto   → lo tildó una cantidad (o una medida hermana). Se va con la cantidad.
 *
 * Cuándo se escribe en el motor:
 *   - lo que el usuario toca a mano se guarda AL INSTANTE (igual que el tacho de
 *     la ficha), porque es un acto sobre el motor, no sobre el presupuesto;
 *   - lo que se tildó solo viaja con el presupuesto y lo guarda el backend al
 *     confirmarlo. Si el presupuesto nunca existe, el motor no se ensucia con
 *     lo que se estuvo probando.
 */
export function useFichaTildes({ motorId, ficha, onFicha }) {
  // codigo → 'previa' | 'manual' | 'auto'
  const [origenes, setOrigenes] = React.useState(() => new Map())
  // codigo → { categoria, cat_prefijo } — para saber a qué grupo entra al guardar.
  const datos = React.useRef(new Map())
  const [guardando, setGuardando] = React.useState(false)

  /*
   * La ficha del motor es la verdad de lo que está guardado: todo lo que está
   * en ella queda tildado ('previa'), y lo que salió de ella deja de estarlo
   * (por eso no se conserva nada que no sea 'auto' — si no, un repuesto borrado
   * seguiría mostrando el círculo prendido).
   *
   * Lo único que sobrevive fuera de la ficha son los tildes 'auto': todavía no
   * se guardaron en ningún lado, viajan con el presupuesto y recién se escriben
   * al confirmarlo.
   */
  React.useEffect(() => {
    setOrigenes((prev) => {
      const siguiente = new Map()
      ficha.forEach((g) => g.opciones.forEach((o) => {
        datos.current.set(o.codigo, { categoria: g.categoria, cat_prefijo: g.cat_prefijo })
        siguiente.set(o.codigo, prev.get(o.codigo) === 'manual' ? 'manual' : 'previa')
      }))
      prev.forEach((origen, codigo) => {
        if (origen === 'auto' && !siguiente.has(codigo)) siguiente.set(codigo, 'auto')
      })
      return siguiente
    })
  }, [ficha])

  const recordar = React.useCallback((rep) => {
    if (!rep?.codigo || !rep.categoria) return
    datos.current.set(rep.codigo, {
      categoria: rep.categoria,
      cat_prefijo: rep.cat_prefijo || null,
    })
  }, [])

  const estaTildado = React.useCallback((codigo) => origenes.has(codigo), [origenes])

  /** Tilde implícito: lo puso una cantidad o una medida hermana. No persiste. */
  const marcarAuto = React.useCallback((reps) => {
    const lista = Array.isArray(reps) ? reps : [reps]
    lista.forEach(recordar)
    setOrigenes((prev) => {
      const nuevos = lista.filter((r) => r?.codigo && !prev.has(r.codigo))
      if (!nuevos.length) return prev
      const siguiente = new Map(prev)
      nuevos.forEach((r) => siguiente.set(r.codigo, 'auto'))
      return siguiente
    })
  }, [recordar])

  /**
   * Se sacó la cantidad: el tilde se va SOLO si lo había puesto esa misma
   * cantidad. Si la pieza ya estaba en el motor de antes, o el usuario la tildó
   * a propósito, queda — que es la diferencia que pidió el dueño.
   */
  const soltarAuto = React.useCallback((codigo) => {
    setOrigenes((prev) => {
      if (prev.get(codigo) !== 'auto') return prev
      const siguiente = new Map(prev)
      siguiente.delete(codigo)
      return siguiente
    })
  }, [])

  /**
   * Click en el círculo. Marca o desmarca a mano y lo guarda en el motor en el
   * momento. Devuelve true si quedó marcado.
   */
  const alternarManual = React.useCallback(async (rep) => {
    const codigo = rep?.codigo
    if (!codigo || !motorId) return false
    recordar(rep)
    const estaba = origenes.has(codigo)
    const info = datos.current.get(codigo) || {}

    // Optimista: el círculo responde ya, el guardado va detrás.
    setOrigenes((prev) => {
      const siguiente = new Map(prev)
      if (estaba) siguiente.delete(codigo)
      else siguiente.set(codigo, 'manual')
      return siguiente
    })

    setGuardando(true)
    try {
      const nueva = await api.post(`/motores/${motorId}/ficha-repuestos/marcar`, {
        codigos: [codigo],
        categoria: info.categoria || rep.categoria,
        cat_prefijo: info.cat_prefijo ?? rep.cat_prefijo ?? null,
        marcado: !estaba,
      })
      onFicha?.(nueva)
      return !estaba
    } catch (err) {
      // Volvió a como estaba: el motor manda, no la pantalla.
      setOrigenes((prev) => {
        const siguiente = new Map(prev)
        if (estaba) siguiente.set(codigo, 'previa')
        else siguiente.delete(codigo)
        return siguiente
      })
      throw err
    } finally {
      setGuardando(false)
    }
  }, [motorId, origenes, recordar, onFicha])

  /**
   * Lo tildado que NO se está cotizando, agrupado por categoría, para que el
   * backend lo sume a la ficha al confirmar. Lo que sí tiene cantidad ya viaja
   * en `grupos_repuestos`, con su cantidad.
   */
  const tildesParaPayload = React.useCallback((lineas = []) => {
    const cotizados = new Set(lineas.map((l) => l.repuesto_codigo).filter(Boolean))
    const porCategoria = new Map()
    origenes.forEach((_origen, codigo) => {
      if (cotizados.has(codigo)) return
      const info = datos.current.get(codigo)
      if (!info?.categoria) return
      const grupo = porCategoria.get(info.categoria) || {
        categoria: info.categoria,
        cat_prefijo: info.cat_prefijo || null,
        codigos: [],
      }
      grupo.codigos.push(codigo)
      porCategoria.set(info.categoria, grupo)
    })
    return [...porCategoria.values()]
  }, [origenes])

  return {
    tildes: origenes,
    estaTildado,
    marcarAuto,
    soltarAuto,
    alternarManual,
    tildesParaPayload,
    guardandoTilde: guardando,
  }
}
