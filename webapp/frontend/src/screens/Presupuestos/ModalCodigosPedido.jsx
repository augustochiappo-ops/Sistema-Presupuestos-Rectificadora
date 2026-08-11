import React from 'react'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { Icon } from '../../components/Icon'
import { StatusBadge } from '../../components/StatusBadge'
import { copiarTexto } from '../../utils/clipboard'

/*
 * Los códigos para cargar el pedido en el sistema del proveedor, de a uno.
 *
 * El flujo real es: copiar un código → salir a la otra pestaña → pegarlo →
 * volver. Copiar todos juntos no servía para eso. Por eso cada renglón tiene su
 * propio botón y queda marcado al copiarlo: al volver se ve de un vistazo por
 * dónde iba. Las marcas son de esta pasada nomás — cerrar el pop-up las borra.
 */
export function ModalCodigosPedido({ open, lineas, onClose }) {
  const [copiados, setCopiados] = React.useState([])
  const [error, setError] = React.useState('')

  // Cada vez que se abre, arranca limpio.
  React.useEffect(() => {
    if (open) { setCopiados([]); setError('') }
  }, [open])

  const marcar = (codigos) => setCopiados((actual) => [...new Set([...actual, ...codigos])])

  const copiarUno = async (linea) => {
    const ok = await copiarTexto(linea.codigo)
    if (!ok) {
      setError('No se pudo copiar. Seleccioná el código con el mouse y copialo a mano.')
      return
    }
    setError('')
    marcar([linea.codigo])
  }

  const copiarTodos = async () => {
    const ok = await copiarTexto(lineas.map((l) => l.codigo).join('\n'))
    if (!ok) {
      setError('No se pudo copiar. Seleccioná los códigos con el mouse y copialos a mano.')
      return
    }
    setError('')
    marcar(lineas.map((l) => l.codigo))
  }

  const yaCopiados = lineas.filter((l) => copiados.includes(l.codigo)).length

  return (
    <Modal open={open} title="Códigos para pedir" onClose={onClose} maxWidth={820}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-muted)' }}>
            Copiá uno, pegalo en el pedido, y volvé por el siguiente.
            {' '}<strong style={{ color: 'var(--text-strong)' }}>{yaCopiados} de {lineas.length} copiados</strong>
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {yaCopiados > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setCopiados([])}>Reiniciar marcas</Button>
            )}
            <Button variant="secondary" size="sm" iconLeft={<Icon n="copy" s={14} />} onClick={copiarTodos} disabled={!lineas.length}>
              Copiar todos
            </Button>
          </span>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'var(--status-expired-bg)', color: 'var(--status-expired-fg)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>
            {error}
          </div>
        )}

        {!lineas.length && (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-faint)' }}>
            No hay ningún código elegido para pedir.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {lineas.map((l) => {
            const copiado = copiados.includes(l.codigo)
            return (
              <div
                key={l.codigo}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px',
                  borderTop: '1px solid var(--border-subtle)',
                  opacity: copiado ? 0.55 : 1,
                }}
              >
                <span style={{ width: 160, flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', overflowWrap: 'anywhere' }}>
                  {l.categoria}
                </span>
                {/* El código es lo que se pega en el sistema del proveedor:
                    seleccionable a mano por si el portapapeles falla. */}
                <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-md)', fontWeight: 'var(--weight-bold)', color: 'var(--text-strong)', userSelect: 'all', overflowWrap: 'anywhere' }}>
                  {l.codigo}
                </span>
                <span style={{ width: 170, flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-faint)', overflowWrap: 'anywhere' }}>
                  {[l.marca, l.medida].filter(Boolean).join(' · ') || '—'}
                </span>
                {!l.hay_stock && <StatusBadge status="expired">Sin stock</StatusBadge>}
                <span style={{ width: 46, textAlign: 'right', flexShrink: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-strong)' }}>
                  ×{l.cantidad}
                </span>
                <Button
                  size="sm"
                  variant={copiado ? 'secondary' : 'primary'}
                  iconLeft={<Icon n={copiado ? 'check' : 'copy'} s={14} />}
                  onClick={() => copiarUno(l)}
                  style={{ width: 116, flexShrink: 0 }}
                >
                  {copiado ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}
