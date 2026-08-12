import React from 'react'
import { api } from '../../api/client'
import { PageHeader } from '../../components/PageHeader'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import BackupPanel from './BackupPanel'
import { useUndo } from '../../context/UndoContext'

function Eyebrow({ children }) {
  return (
    <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
      {children}
    </div>
  )
}

function CardImport({ icon, title, desc, endpoint, disabled, accept = '.xls', extension = '.xls' }) {
  const inputRef = React.useRef(null)
  const [estado, setEstado] = React.useState(null) // { ok: bool, mensaje: string } | null
  const [cargando, setCargando] = React.useState(false)

  const onFile = async (e) => {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setCargando(true)
    setEstado(null)
    try {
      const form = new FormData()
      form.append('archivo', archivo)
      const data = await api.post(endpoint, form)
      setEstado({ ok: true, mensaje: data.mensaje })
    } catch (err) {
      setEstado({ ok: false, mensaje: err.message })
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{
      background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)',
      padding: '22px 24px', opacity: disabled ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon n={icon} s={20} />
        </div>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-strong)' }}>{title}</h3>
      </div>
      <p style={{ margin: '0 0 16px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>{desc}</p>

      <input ref={inputRef} type="file" accept={accept} onChange={onFile} style={{ display: 'none' }} />
      <Button
        variant={disabled ? 'secondary' : 'primary'}
        disabled={disabled || cargando}
        iconLeft={<Icon n="file-up" s={16} />}
        onClick={() => inputRef.current?.click()}
      >
        {disabled ? 'No disponible aún' : cargando ? 'Importando…' : `Cargar archivo ${extension}`}
      </Button>

      {estado && (
        <div style={{
          marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
          color: estado.ok ? 'var(--status-active-fg)' : 'var(--status-expired-fg)',
        }}>
          {estado.ok ? '✓' : '✗'} {estado.mensaje}
        </div>
      )}
    </div>
  )
}

// El sistema muestra "precio de hoy" en la ficha de repuestos y en el pedido,
// pero en realidad son los de la última carga del CSV. Si pasaron días conviene
// verlo antes de salir a comprar con esos números.
function FechaCatalogo() {
  const [info, setInfo] = React.useState(null)

  React.useEffect(() => {
    api.get('/repuestos/catalogo-info').then(setInfo).catch(() => {})
  }, [])

  if (!info) return null
  return (
    <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginTop: -8 }}>
      {info.importado_en
        ? <>Última carga: <strong>{formatFechaHora(info.importado_en)}</strong> · {info.total.toLocaleString('es-AR')} repuestos en la lista.</>
        : 'Todavía no se cargó ninguna lista de precios del proveedor.'}
    </div>
  )
}

function formatFechaHora(iso) {
  const [fecha, hora] = iso.split('T')
  const [y, m, d] = fecha.split('-')
  return `${d}/${m}/${y}${hora ? ` a las ${hora.slice(0, 5)}` : ''}`
}

/*
 * Borrado de los datos de prueba: presupuestos y clientes, para arrancar limpio
 * la primera vez que se usa en serio. No toca motores, mano de obra, catálogo
 * del proveedor, favoritos ni las fichas de repuestos de los motores.
 */
function BorrarDatosPrueba() {
  const [confirmando, setConfirmando] = React.useState(false)
  const [borrando, setBorrando] = React.useState(false)
  const [resultado, setResultado] = React.useState(null)
  const [error, setError] = React.useState('')
  const { borrarConDeshacer } = useUndo()

  /* El borrado no sale en el momento: queda unos segundos con el cartel de
     "Deshacer" abajo a la izquierda, como cualquier otro borrado del sistema.
     Es el más destructivo de todos, así que es donde más sirve. */
  const borrar = () => {
    setConfirmando(false)
    setError('')
    setResultado(null)
    borrarConDeshacer({
      mensaje: 'Se van a borrar todos los presupuestos y clientes.',
      ejecutar: async () => {
        setBorrando(true)
        try {
          setResultado(await api.post('/mantenimiento/borrar-datos-prueba', { confirmar: 'BORRAR' }))
        } finally {
          setBorrando(false)
        }
      },
      onError: (err) => setError(err.message || 'No se pudieron borrar los datos'),
    })
  }

  return (
    <div style={{ background: 'var(--surface-card)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-xl)', padding: '22px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon n="trash" s={20} />
        </div>
        <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-strong)' }}>
          Borrar datos de prueba
        </h3>
      </div>
      <p style={{ margin: '0 0 16px', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>
        Borra <strong>todos los presupuestos y clientes</strong>, con sus PDFs. Se mantienen los motores, la mano de
        obra, la lista del proveedor, los favoritos y las fichas de repuestos de los motores.
        Generá antes una copia de seguridad acá arriba: una vez que se apaga el cartel de "Deshacer", no hay vuelta atrás.
      </p>

      <Button variant="danger" disabled={borrando} onClick={() => setConfirmando(true)}>
        Borrar presupuestos y clientes
      </Button>

      {error && (
        <div style={{ marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--status-expired-fg)' }}>
          ✗ {error}
        </div>
      )}
      {resultado && (
        <div style={{ marginTop: 12, fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--status-active-fg)' }}>
          ✓ Se borraron {resultado.presupuestos} presupuesto{resultado.presupuestos === 1 ? '' : 's'},{' '}
          {resultado.clientes} cliente{resultado.clientes === 1 ? '' : 's'} y {resultado.pdfs_borrados} PDF
          {resultado.pdfs_borrados === 1 ? '' : 's'}.
        </div>
      )}

      <ConfirmDialog
        open={confirmando}
        title="¿Borrar todos los presupuestos y clientes?"
        message="Se borran todos los presupuestos con sus PDFs y todos los clientes. Los motores, la mano de obra, la lista del proveedor y las fichas de repuestos quedan intactos. Vas a tener unos segundos para deshacerlo."
        confirmLabel={borrando ? 'Borrando…' : 'Sí, borrar todo'}
        danger
        onCancel={() => setConfirmando(false)}
        onConfirm={borrar}
      />
    </div>
  )
}

export default function ExcelScreen() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader title="Actualizar Excel" subtitle="Importá los archivos de FACRA para mantener motores y precios al día." />

      <Eyebrow>FACRA</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <CardImport
          icon="file-text"
          title="Nomenclador de Motores"
          desc="Lista de todos los motores con su número de lista asignado (1–13)."
          endpoint="/excel/nomenclador"
        />
        <CardImport
          icon="dollar-sign"
          title="Lista Orientadora de Mano de Obra"
          desc="Precios vigentes por servicio, clasificados por número de lista."
          endpoint="/excel/lista-orientadora"
        />
      </div>

      <Eyebrow>CRAC</Eyebrow>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <CardImport
          icon="tag"
          title="Lista de Prefijos CRAC"
          desc="Categorías y marcas del proveedor de repuestos. Cargala primero: sin esto, los repuestos igual se guardan pero sin categoría ni marca legibles."
          endpoint="/repuestos/importar-prefijos"
          accept=".csv"
          extension=".csv"
        />
        <CardImport
          icon="package"
          title="Lista de Precios y Stock CRAC"
          desc="Precios y disponibilidad de repuestos del proveedor. Se actualiza a diario: cada carga reemplaza por completo la lista anterior."
          endpoint="/repuestos/importar-precio-stock"
          accept=".csv"
          extension=".csv"
        />
      </div>
      <FechaCatalogo />

      <Eyebrow>Copia de seguridad</Eyebrow>
      <BackupPanel />

      <Eyebrow>Mantenimiento</Eyebrow>
      <BorrarDatosPrueba />
    </div>
  )
}
