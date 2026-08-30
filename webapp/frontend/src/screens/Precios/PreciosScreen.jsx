import React from 'react'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { SearchInput } from '../../components/SearchInput'
import { ErrorBanner } from '../../components/ErrorBanner'
import { Icon } from '../../components/Icon'
import { coincideBusqueda } from '../../utils/texto'
import { ListaManoObra } from './ListaManoObra'
import { MisPrecios } from './MisPrecios'
import { AjusteGeneral } from './AjusteGeneral'
import { SelectorLista } from './SelectorLista'

/*
 * Editar Precios — la tarifa de mano de obra del taller.
 *
 * Qué resuelve
 * ------------
 * La lista de la Cámara es un punto de partida, no lo que cobra el taller. El
 * dueño ya venía corrigiendo precios renglón por renglón dentro de cada
 * presupuesto, pero esa corrección moría ahí y al presupuesto siguiente había
 * que volver a escribirla. Acá esas correcciones se quedan.
 *
 * Por eso esta pantalla no es solo un formulario de carga: es también **el
 * lugar donde se ve lo que se viene guardando desde el wizard**. De ahí los dos
 * apartados. Sin el segundo, guardar un precio al pasar sería sembrar cambios
 * invisibles que dentro de seis meses nadie puede auditar.
 *
 * Dos reglas que la pantalla dice con todas las letras, porque son las que
 * hacen que esto sea seguro de usar:
 *   · los presupuestos ya emitidos no cambian nunca (los precios quedan
 *     congelados al cotizar), así que tocar acá no reescribe historia ni PDFs;
 *   · nada se guarda solo.
 */

const APARTADOS = [
  { id: 'lista', label: 'Lista de mano de obra' },
  { id: 'mios', label: 'Mis precios' },
]

export default function PreciosScreen() {
  const [apartado, setApartado] = React.useState('lista')
  const [listas, setListas] = React.useState([])
  const [listaNum, setListaNum] = React.useState(null)
  const [datos, setDatos] = React.useState(null)
  const [mios, setMios] = React.useState([])
  const [busqueda, setBusqueda] = React.useState('')
  const [error, setError] = React.useState('')
  const [cargando, setCargando] = React.useState(false)

  // Las trece listas con cuántos motores usa cada una. Arranca en la que más
  // motores tiene: es la que el taller va a querer tarifar primero, y evita el
  // paso muerto de elegir una lista antes de ver nada.
  React.useEffect(() => {
    api.get('/precios/listas')
      .then((data) => {
        setListas(data)
        const masUsada = [...data].sort((a, b) => b.motores - a.motores)[0]
        setListaNum((actual) => actual ?? (masUsada ? masUsada.lista_num : 1))
      })
      .catch((e) => setError(e.message))
  }, [])

  const recargar = React.useCallback(() => {
    if (!listaNum) return
    setCargando(true)
    Promise.all([
      api.get(`/precios/mano-obra?lista=${listaNum}`),
      api.get('/precios/mios'),
      api.get('/precios/listas'),
    ])
      .then(([lista, propios, todasLasListas]) => {
        setDatos(lista)
        setMios(propios)
        setListas(todasLasListas)
        setError('')
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false))
  }, [listaNum])

  React.useEffect(() => { recargar() }, [recargar])

  const desfasados = mios.filter((m) => m.desfasado)

  // Mismo buscador que el resto del sistema (utils/texto.js): sin acentos ni
  // mayúsculas y por palabras sueltas en cualquier orden, así "bruñir cilindros"
  // y "cilindros bruñir" traen lo mismo.
  const serviciosFiltrados = React.useMemo(
    () => (datos?.servicios || []).filter(
      (s) => coincideBusqueda([s.descripcion, String(s.item_num ?? '')], busqueda),
    ),
    [datos, busqueda],
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        title="Editar Precios"
        subtitle="Lo que cobra el taller por cada trabajo de mano de obra, por encima de la lista de la Cámara."
      />

      {error && <ErrorBanner message={error} onClose={() => setError('')} />}

      {/* Aviso de lo que hay que repasar cuando llega lista nueva de la Cámara.
          Va arriba de todo y en las dos solapas: es lo único de esta pantalla
          que pide una decisión del dueño en vez de esperarla. */}
      {desfasados.length > 0 && (
        <button
          onClick={() => setApartado('mios')}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
            padding: '12px 16px', cursor: 'pointer', width: '100%',
            background: 'var(--status-aviso-bg)', color: 'var(--status-aviso-fg)',
            border: 'none', borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          }}
        >
          <Icon n="alert-triangle" s={16} />
          <span style={{ flex: 1 }}>
            {desfasados.length === 1
              ? 'Un precio tuyo quedó fijado contra una lista de la Cámara que ya cambió.'
              : `${desfasados.length} precios tuyos quedaron fijados contra listas de la Cámara que ya cambiaron.`}
            {' '}Convendría repasarlos.
          </span>
          <span style={{ display: 'flex', opacity: .7 }}><Icon n="chevron-right" s={16} /></span>
        </button>
      )}

      {/* Solapas. Dos apartados y no dos pantallas porque son la misma decisión
          mirada de dos maneras: la lista completa para tarifar, y lo tarifado
          para repasarlo. */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border-default)' }}>
        {APARTADOS.map((a) => {
          const activo = apartado === a.id
          return (
            <button
              key={a.id}
              onClick={() => setApartado(a.id)}
              style={{
                border: 'none', background: 'transparent', cursor: 'pointer',
                padding: '10px 14px', marginBottom: -1,
                borderBottom: `2px solid ${activo ? 'var(--text-strong)' : 'transparent'}`,
                fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                fontWeight: activo ? 600 : 500,
                color: activo ? 'var(--text-strong)' : 'var(--text-muted)',
              }}
            >
              {a.label}
              {a.id === 'mios' && mios.length > 0 && (
                <span style={{ color: 'var(--text-faint)', fontWeight: 500 }}> ({mios.length})</span>
              )}
            </button>
          )
        })}
      </div>

      {apartado === 'lista' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SelectorLista listas={listas} valor={listaNum} onChange={setListaNum} />

          <AjusteGeneral
            pct={datos?.ajuste_general_pct ?? 0}
            onGuardado={recargar}
            onError={setError}
          />

          <SearchInput
            width={380}
            icon={<Icon n="search" s={16} />}
            placeholder="Buscar un trabajo…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />

          <ListaManoObra
            servicios={serviciosFiltrados}
            listaNum={listaNum}
            ajusteGeneralPct={datos?.ajuste_general_pct ?? 0}
            cargando={cargando}
            hayBusqueda={Boolean(busqueda.trim())}
            onCambio={recargar}
            onError={setError}
          />
        </div>
      )}

      {apartado === 'mios' && (
        <MisPrecios
          filas={mios}
          onCambio={recargar}
          onError={setError}
          onIrALista={(n) => { setListaNum(n); setApartado('lista') }}
        />
      )}
    </div>
  )
}
