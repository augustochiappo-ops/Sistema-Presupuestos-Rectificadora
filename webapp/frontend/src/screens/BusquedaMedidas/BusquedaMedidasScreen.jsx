import React from 'react'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { DataTable } from '../../components/DataTable'
import { SearchInput } from '../../components/SearchInput'
import { StatusBadge } from '../../components/StatusBadge'
import { Icon } from '../../components/Icon'
import { formatPrecioARS } from '../../utils/format'
import { CampoMedida } from './CampoMedida'
import { CeldaForma, FiltroFormas, ModalFormas, describirForma } from './formas'
import { CeldaDibujo, ModalDibujo } from './pistones'
import { FAMILIAS, camposDe } from './familias'

const ESPERA_MS = 280

const TIPO_GUIA = { A: 'Admisión', E: 'Escape', AE: 'A/E' }

function formatMm(valor, decimales = 0) {
  if (valor === null || valor === undefined || valor === '') return '—'
  // Una medida puede traer dos valores: el Ø exterior STD de un buje viene con
  // su banda de tolerancia y un buje escalonado tiene dos anchos.
  if (Array.isArray(valor)) return valor.map((v) => formatMm(v, decimales)).join(' / ')
  const n = Number(valor)
  if (Number.isNaN(n)) return String(valor)
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: 2 })
}

/*
 * La ficha viene con las medidas y los datos sueltos en dos objetos anidados
 * (`medidas` y `extra`). Se aplanan acá y no en el backend porque el que los
 * separa es el catálogo de origen: cada familia tiene los suyos, y la tabla
 * quiere una fila plana.
 */
function aFila(ficha, i) {
  return { id: `${ficha.codigo}-${i}`, ...ficha, ...(ficha.medidas || {}), ...(ficha.extra || {}) }
}

/*
 * Cómo se escribe una medida de sobremedida en pantalla. El catálogo usa dos
 * sistemas y hay que respetarlos: las de pulgadas son ".030" de toda la vida y
 * las métricas se piden en milímetros ("+0,50 mm"). Confundir una con otra es
 * pedir la camisa equivocada, así que la unidad va siempre escrita.
 */
function formatEtiqueta(label) {
  const mm = /^([+-])(\d+(?:[.,]\d+)?)\s*MM$/i.exec(String(label || '').trim())
  if (!mm) return label || ''
  return `${mm[1]}${Number(mm[2].replace(',', '.')).toLocaleString('es-AR', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} mm`
}

/*
 * Las sobremedidas van con la etiqueta A LA VISTA, arriba del Ø exterior, y no
 * escondida en el tooltip: el número solo no dice si esa camisa es la STD, la
 * de 30 o la de medio milímetro, que es justamente lo que hay que pedir.
 */
function celdaSobremedidas(fila) {
  const lista = Array.isArray(fila.sobremedidas) ? fila.sobremedidas : []
  if (!lista.length) return '—'
  const matcheadas = new Set((fila.sobremedidas_match || []).map((s) => s.label))
  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '6px 12px' }}>
      {lista.map((s, i) => {
        const resaltada = matcheadas.has(s.label)
        return (
          <span
            key={`${s.label}-${i}`}
            style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.2 }}
          >
            <span
              style={{
                fontSize: 'var(--text-xs)',
                color: resaltada ? 'var(--text-body)' : 'var(--text-faint)',
                fontWeight: resaltada ? 'var(--weight-semibold)' : 'var(--weight-regular)',
                whiteSpace: 'nowrap',
              }}
            >
              {formatEtiqueta(s.label)}
            </span>
            <span
              style={{
                color: resaltada ? 'var(--text-strong)' : 'var(--text-body)',
                fontWeight: resaltada ? 'var(--weight-semibold)' : 'var(--weight-regular)',
              }}
            >
              {s.texto || formatMm(s.valor)}
            </span>
          </span>
        )
      })}
    </span>
  )
}

/*
 * El motor o la aplicación, con las aclaraciones que el catálogo escribe al
 * costado de la fila ("con parallamas", "block nuevo", "anillo de goma"). Son
 * las que deciden si esa camisa entra en ese motor, así que van en la tabla y
 * no perdidas en el catálogo.
 */
function celdaAplicacion(fila, key) {
  const texto = fila[key]
  const notas = Array.isArray(fila.notas) ? fila.notas : []
  if (!texto && !notas.length) return '—'
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
      <span>{texto || '—'}</span>
      {notas.map((n) => (
        <span key={n} style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{n}</span>
      ))}
    </span>
  )
}

/*
 * Una medida que el catálogo trae mal cargada no se borra ni se corrige a ojo:
 * se muestra con un "?" al lado y el motivo en el tooltip. Es la diferencia
 * entre "no lo sabemos" y "esto dice el catálogo, pero no le creas del todo".
 */
function conReparo(contenido, motivo) {
  return (
    <span title={motivo} style={{ cursor: 'help', whiteSpace: 'nowrap' }}>
      {contenido}
      <span
        style={{
          marginLeft: 4, padding: '0 5px', borderRadius: 'var(--radius-pill)',
          background: 'var(--surface-sunken)', color: 'var(--text-muted)',
          fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)',
        }}
      >
        ?
      </span>
    </span>
  )
}

function celda(col, fila, acciones) {
  const valor = fila[col.key]

  // Un dato que la ficha no trae y un dato que quedó en duda no son lo mismo:
  // el catálogo de pistones sale de leer tablas de un PDF y algunas filas
  // salieron corridas de columna. Esas van con "?" (y el motivo en el tooltip)
  // para que nadie tome por bueno un Ø que en realidad no se leyó.
  const motivo = fila.revisar?.[col.key]
  if (motivo && (valor === null || valor === undefined || valor === '')) {
    return <span title={motivo} style={{ color: 'var(--text-faint)' }}>?</span>
  }
  // El otro caso: el catálogo SÍ trae el número pero está mal cargado (un alto
  // de pestaña de 4,00 que debería ser 4,76, un Ø de pestaña menor que el
  // interior). Se muestra el número con un "?" al lado y el motivo al apoyar
  // el mouse — borrarlo sería esconder lo único que dice el catálogo.
  if (motivo) return conReparo(contenidoCelda(col, fila, acciones), motivo)

  return contenidoCelda(col, fila, acciones)
}

function contenidoCelda(col, fila, acciones) {
  const valor = fila[col.key]

  switch (col.tipo) {
    case 'mm':
      return formatMm(valor, col.decimales)
    case 'precio':
      // Sin código del proveedor no hay precio que mostrar, y poner "—" haría
      // pensar que la pieza no se consigue: lo que pasa es que no la tenemos
      // cruzada con la lista.
      return valor == null
        ? <span style={{ color: 'var(--text-faint)' }}>Consultar</span>
        : formatPrecioARS(valor)
    case 'stock':
      if (!fila.codigo_crac) return <span style={{ color: 'var(--text-faint)' }}>—</span>
      return <StatusBadge status={valor ? 'active' : 'expired'}>{valor ? 'Sí' : 'No'}</StatusBadge>
    case 'tipo':
      return TIPO_GUIA[valor] || valor || '—'
    case 'sobremedidas':
      return celdaSobremedidas(fila)
    // De qué sobremedida es el precio que se está mostrando.
    case 'medida':
      return valor ? formatEtiqueta(valor) : '—'
    case 'aplicacion':
      return celdaAplicacion(fila, col.key)
    case 'forma':
      return <CeldaForma forma={valor} onVerLamina={acciones.verLamina} />
    case 'dibujo':
      return <CeldaDibujo fila={fila} onVer={() => acciones.verDibujo(fila)} />
    default:
      return valor === null || valor === undefined || valor === '' ? '—' : valor
  }
}

/*
 * Cómo se lee un filtro de medida en el resumen de arriba de la tabla. Con
 * signo la tolerancia es de un solo lado, así que la etiqueta lo dice con
 * palabras: "40 mm o más" en vez de un "± +" que no significa nada.
 */
function etiquetaMedida(valor, tolerancia) {
  const texto = (tolerancia ?? '').toString().trim()
  const signo = texto.startsWith('+') ? '+' : texto.startsWith('-') ? '-' : ''
  const magnitud = (signo ? texto.slice(1) : texto).trim()
  if (!signo) return `${valor} ± ${magnitud || '0,5'} mm`
  if (!magnitud) return `${valor} mm o ${signo === '+' ? 'más' : 'menos'}`
  const desde = Number(valor.replace(',', '.'))
  const salto = Number(magnitud.replace(',', '.'))
  if (Number.isNaN(desde) || Number.isNaN(salto)) return `${valor} ${signo}${magnitud} mm`
  const [a, b] = signo === '+' ? [desde, desde + salto] : [desde - salto, desde]
  return `${formatMm(a)} a ${formatMm(b)} mm`
}

function comparar(a, b, key) {
  const primero = (v) => (Array.isArray(v) ? v[0] : v)
  const va = primero(a[key])
  const vb = primero(b[key])
  const vacio = (v) => v === null || v === undefined || v === ''
  // Lo que no tiene dato va siempre al final, ordene como ordene: una fila sin
  // largo cargado no es "la más corta".
  if (vacio(va) && vacio(vb)) return 0
  if (vacio(va)) return 1
  if (vacio(vb)) return -1
  if (typeof va === 'number' && typeof vb === 'number') return va - vb
  return String(va).localeCompare(String(vb), 'es-AR', { numeric: true })
}

export default function BusquedaMedidasScreen() {
  const [familias, setFamilias] = React.useState([])
  const [familiaId, setFamiliaId] = React.useState(FAMILIAS[0].id)
  // Los filtros se guardan por familia: cambiar de pestaña para mirar otra cosa
  // no puede borrar lo que se venía escribiendo.
  const [filtrosPorFamilia, setFiltrosPorFamilia] = React.useState({})
  const [resultado, setResultado] = React.useState({ total: 0, capped: false, resultados: [] })
  const [cargando, setCargando] = React.useState(false)
  const [orden, setOrden] = React.useState(null)
  const [lamina, setLamina] = React.useState(false)
  // El subconjunto cuyo dibujo se está mirando en grande, o null.
  const [dibujo, setDibujo] = React.useState(null)

  React.useEffect(() => {
    api.get('/tecnicos/familias').then(setFamilias).catch(() => setFamilias([]))
  }, [])

  // Solo se muestran las familias que el backend dice tener cargadas, en el
  // orden de FAMILIAS (el del catálogo, no el que devuelva la API).
  const visibles = React.useMemo(() => {
    const cargadas = new Map(familias.map((f) => [f.id, f]))
    // `filtroProveedor` lo decide el backend (ESPEC), que es el que aplica el
    // filtro: acá no se duplica la lista de familias que lo tienen.
    return FAMILIAS.filter((f) => cargadas.has(f.id)).map((f) => ({
      ...f,
      total: cargadas.get(f.id).total,
      filtroProveedor: !!cargadas.get(f.id).filtro_proveedor,
    }))
  }, [familias])

  const familia = visibles.find((f) => f.id === familiaId) || visibles[0] || FAMILIAS[0]
  // Memoizado: sin esto el `|| {}` devuelve un objeto nuevo en cada render y
  // arrastra a los tres useMemo de abajo, que dejan de memoizar nada.
  const filtros = React.useMemo(
    () => filtrosPorFamilia[familia.id] || {},
    [filtrosPorFamilia, familia.id],
  )

  // Filtro aparte de los de medida: no busca nada, decide sobre qué catálogo se
  // busca. Viene tildado — lo normal es querer lo que se puede pedir hoy.
  const soloProveedor = familia.filtroProveedor && filtros.solo_crac !== '0'

  const setFiltro = (campo, valor) => {
    setFiltrosPorFamilia((prev) => ({ ...prev, [familia.id]: { ...(prev[familia.id] || {}), [campo]: valor } }))
  }
  const limpiar = () => setFiltrosPorFamilia((prev) => ({ ...prev, [familia.id]: {} }))
  const aplicarEjemplo = (ejemplo) => setFiltrosPorFamilia((prev) => ({ ...prev, [familia.id]: { ...ejemplo.filtros } }))

  // Una tolerancia sola no es una búsqueda: sin su valor no filtra nada.
  const query = React.useMemo(() => {
    const params = new URLSearchParams({ familia: familia.id })
    for (const campo of camposDe(familia)) {
      const valor = (filtros[campo] ?? '').toString().trim()
      if (!valor) continue
      if (campo.startsWith('tol_') && !(filtros[campo.slice(4)] ?? '').toString().trim()) continue
      params.set(campo, valor)
    }
    if (familia.filtroProveedor && filtros.solo_crac === '0') params.set('solo_crac', '0')
    return params
  }, [familia, filtros])

  const hayFiltro = React.useMemo(
    () => camposDe(familia).some((c) => !c.startsWith('tol_') && (filtros[c] ?? '').toString().trim()),
    [familia, filtros],
  )

  React.useEffect(() => {
    setOrden(null)
  }, [familia.id])

  // Contador de búsquedas: si una respuesta vieja llega después de una nueva
  // (pasa al escribir rápido), se descarta en vez de pisar la tabla con
  // resultados que ya no son los del filtro que está en pantalla.
  const ultimaBusqueda = React.useRef(0)

  React.useEffect(() => {
    if (!hayFiltro) {
      setResultado({ total: 0, capped: false, resultados: [] })
      return undefined
    }
    const t = setTimeout(() => {
      const mia = ++ultimaBusqueda.current
      setCargando(true)
      api.get(`/tecnicos/buscar?${query.toString()}`)
        .then((datos) => { if (mia === ultimaBusqueda.current) setResultado(datos) })
        .catch(() => { if (mia === ultimaBusqueda.current) setResultado({ total: 0, capped: false, resultados: [] }) })
        .finally(() => { if (mia === ultimaBusqueda.current) setCargando(false) })
    }, ESPERA_MS)
    return () => clearTimeout(t)
  }, [query, hayFiltro])

  const filas = React.useMemo(() => {
    const base = resultado.resultados.map(aFila)
    if (!orden) return base
    return [...base].sort((a, b) => comparar(a, b, orden.key) * orden.dir)
  }, [resultado, orden])

  const alternarOrden = (key) => {
    setOrden((prev) => (prev && prev.key === key ? { key, dir: prev.dir * -1 } : { key, dir: 1 }))
  }

  const columnas = React.useMemo(
    () => familia.columnas.map((col) => ({
      ...col,
      header: (
        // El span ocupa el encabezado entero (`width: 100%`) para que se pueda
        // hacer clic en cualquier parte de la celda y no solo justo encima de
        // las letras, que es lo que pasaba antes.
        <span
          onClick={() => alternarOrden(col.key)}
          style={{
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
            width: '100%', userSelect: 'none',
            justifyContent: col.align === 'right' ? 'flex-end' : col.align === 'center' ? 'center' : 'flex-start',
          }}
          title="Ordenar por esta columna"
        >
          {col.header}
          {orden?.key === col.key && <Icon n={orden.dir === 1 ? 'arrow-up' : 'arrow-down'} s={13} />}
        </span>
      ),
      render: (_, fila) => celda(col, fila, { verLamina: () => setLamina(true), verDibujo: setDibujo }),
    })),
    [familia, orden],
  )

  const etiquetas = React.useMemo(() => {
    const puestas = []
    for (const m of familia.medidas || []) {
      const valor = (filtros[m.campo] ?? '').toString().trim()
      if (!valor) continue
      puestas.push(`${m.label}: ${etiquetaMedida(valor, filtros[`tol_${m.campo}`])}`)
    }
    for (const t of familia.textos || []) {
      const valor = (filtros[t.campo] ?? '').toString().trim()
      if (valor) puestas.push(`${t.label}: “${valor}”`)
    }
    if (familia.formas) {
      const valor = (filtros[familia.formas.campo] ?? '').toString().trim()
      if (valor) puestas.push(`${familia.formas.label}: ${describirForma(valor)}`)
    }
    for (const o of familia.opciones || []) {
      const valor = (filtros[o.campo] ?? '').toString().trim()
      const elegida = (o.valores || []).find((v) => v.valor === valor)
      if (valor && elegida) puestas.push(`${o.label}: ${elegida.label}`)
    }
    return puestas
  }, [familia, filtros])

  let mensajeVacio = 'Escribí una medida o un motor para buscar.'
  if (hayFiltro) mensajeVacio = cargando ? 'Buscando…' : 'Ninguna pieza coincide con esas medidas.'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        title="Búsqueda por medidas"
        subtitle="Encontrá una pieza por sus medidas cuando no sabés el código. El precio y el stock son los de la última lista del proveedor."
      />

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {visibles.map((f) => {
          const activa = f.id === familia.id
          return (
            <button
              key={f.id}
              onClick={() => setFamiliaId(f.id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8, height: 40, padding: '0 18px',
                borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-semibold)',
                background: activa ? 'var(--surface-inverse)' : 'var(--surface-card)',
                color: activa ? 'var(--text-on-inverse)' : 'var(--text-body)',
                border: `1px solid ${activa ? 'var(--surface-inverse)' : 'var(--border-default)'}`,
                boxShadow: activa ? 'var(--shadow-pill)' : 'var(--shadow-xs)',
              }}
            >
              {f.label}
              <span style={{ fontSize: 'var(--text-xs)', opacity: 0.65 }}>{f.total}</span>
            </button>
          )
        })}
      </div>

      <div
        style={{
          display: 'flex', flexDirection: 'column', gap: 16,
          border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)',
          background: 'var(--surface-card)', padding: 18,
        }}
      >
        {/* Ancho fijo y que envuelvan: un casillero de medida estirado a media
            pantalla para escribir "104,5" se ve raro y se lee peor. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          {(familia.medidas || []).map((m) => (
            <CampoMedida
              key={m.campo}
              ancho={250}
              label={m.label}
              valor={filtros[m.campo] ?? ''}
              tolerancia={filtros[`tol_${m.campo}`] ?? ''}
              onValor={(v) => setFiltro(m.campo, v)}
              onTolerancia={(v) => setFiltro(`tol_${m.campo}`, v)}
            />
          ))}
        </div>

        {/* El botón del signo no se explica solo la primera vez, y es el que
            evita tener que adivinar la tolerancia cuando lo que se busca es
            "de acá para arriba". */}
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', color: 'var(--text-faint)' }}>
          El botón entre los dos casilleros cambia cómo se busca la medida:
          <strong> ±</strong> hacia los dos lados, <strong>+</strong> ese valor o más,
          <strong> −</strong> ese valor o menos.
        </div>

        {familia.formas && (
          <FiltroFormas
            valores={familia.formas.valores}
            valor={filtros[familia.formas.campo] ?? ''}
            onCambiar={(v) => setFiltro(familia.formas.campo, v)}
            onVerLamina={() => setLamina(true)}
          />
        )}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {(familia.textos || []).map((t) => (
            <SearchInput
              key={t.campo}
              width={t.ancho}
              icon={<Icon n={t.icono || 'search'} s={16} />}
              placeholder={`${t.label}…`}
              value={filtros[t.campo] ?? ''}
              onChange={(e) => setFiltro(t.campo, e.target.value)}
            />
          ))}
          {(familia.opciones || []).map((o) => (
            <select
              key={o.campo}
              value={filtros[o.campo] ?? ''}
              onChange={(e) => setFiltro(o.campo, e.target.value)}
              aria-label={o.label}
              style={{
                height: 44, padding: '0 14px', borderRadius: 'var(--radius-pill)',
                border: '1px solid var(--border-default)', background: 'var(--surface-card)',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-strong)',
              }}
            >
              {(o.valores || []).map((v) => (
                <option key={v.valor} value={v.valor}>{v.label}</option>
              ))}
            </select>
          ))}
          {familia.filtroProveedor && (
          <label
            title="Destildalo para buscar en todo el catálogo, incluso las piezas que hoy no están en la lista del proveedor."
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px',
              borderRadius: 'var(--radius-pill)', border: '1px solid var(--border-default)',
              background: soloProveedor ? 'var(--surface-sunken)' : 'var(--surface-card)',
              cursor: 'pointer', userSelect: 'none',
              fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
              color: 'var(--text-body)',
            }}
          >
            <input
              type="checkbox"
              checked={soloProveedor}
              onChange={(e) => setFiltro('solo_crac', e.target.checked ? '' : '0')}
              style={{ width: 16, height: 16, accentColor: 'var(--surface-inverse)', cursor: 'pointer' }}
            />
            Solo las que tiene el proveedor
          </label>
          )}
          {hayFiltro && (
            <button
              onClick={limpiar}
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer', padding: '0 4px',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)',
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {etiquetas.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {etiquetas.map((e) => (
              <span
                key={e}
                style={{
                  padding: '5px 12px', borderRadius: 'var(--radius-pill)',
                  background: 'var(--surface-sunken)', color: 'var(--text-body)',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
                }}
              >
                {e}
              </span>
            ))}
          </div>
        )}
      </div>

      {!hayFiltro && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Probá con:
          </span>
          {(familia.ejemplos || []).map((ej) => (
            <button
              key={ej.label}
              onClick={() => aplicarEjemplo(ej)}
              style={{
                height: 34, padding: '0 14px', borderRadius: 'var(--radius-pill)', cursor: 'pointer',
                border: '1px dashed var(--border-strong)', background: 'transparent',
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-body)',
              }}
            >
              {ej.label}
            </button>
          ))}
        </div>
      )}

      {hayFiltro && (
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
          {cargando
            ? 'Buscando…'
            : `${resultado.total} ${resultado.total === 1 ? 'pieza encontrada' : 'piezas encontradas'}`}
          {resultado.capped && ' — se muestran las primeras 100, afiná los filtros para ver el resto'}
          {!cargando && soloProveedor && resultado.sin_proveedor > 0 && (
            <>
              {' — '}
              <button
                onClick={() => setFiltro('solo_crac', '0')}
                style={{
                  border: 'none', background: 'transparent', padding: 0, cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                  color: 'var(--text-body)', textDecoration: 'underline',
                }}
              >
                hay {resultado.sin_proveedor} más en el catálogo que el proveedor no tiene
              </button>
            </>
          )}
        </div>
      )}

      <DataTable
        columns={columnas}
        rows={filas}
        reorderKey={`medidas-${familia.id}`}
        emptyMessage={mensajeVacio}
        striped
        style={{ minWidth: 0 }}
      />

      <ModalFormas open={lamina} onClose={() => setLamina(false)} />
      <ModalDibujo fila={dibujo} onClose={() => setDibujo(null)} />
    </div>
  )
}
