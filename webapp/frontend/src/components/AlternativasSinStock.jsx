import React from 'react'
import { api } from '../api/client'
import { Icon } from './Icon'
import { StatusBadge } from './StatusBadge'
import { CodigoRepuesto } from './CodigoRepuesto'
import { formatPrecioARS } from '../utils/format'

/*
 * "Se quedó sin stock" + las marcas que podrían reemplazarlo.
 *
 * Solo sugiere: no cambia ni una línea del presupuesto por su cuenta. Fue un
 * pedido explícito del dueño — el sistema avisa y recomienda, la decisión de
 * cambiar una marca por otra es del taller.
 *
 * Cómo encuentra los reemplazos: el proveedor usa la MISMA DESCRIPCIÓN para la
 * misma pieza en todas las marcas, así que descripción + medida identifican al
 * repuesto y todo lo que las comparta es intercambiable (ver CRAC/CRAC.md). Las
 * que ya están en la ficha del motor salen primero: ésas ya las validó el taller.
 */
export function AlternativasSinStock({ codigo, motorId, onElegir, texto = 'Sin stock' }) {
  const [abierto, setAbierto] = React.useState(false)
  const [opciones, setOpciones] = React.useState(null)
  const [cargando, setCargando] = React.useState(false)

  const abrir = () => {
    const siguiente = !abierto
    setAbierto(siguiente)
    if (!siguiente || opciones !== null || cargando) return
    setCargando(true)
    const params = new URLSearchParams({ codigo })
    if (motorId) params.set('motor_id', String(motorId))
    api.get(`/repuestos/alternativas?${params.toString()}`)
      .then(setOpciones)
      .catch(() => setOpciones([]))
      .finally(() => setCargando(false))
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <StatusBadge status="expired" title="El proveedor no lo tiene hoy">{texto}</StatusBadge>
        <button
          onClick={abrir}
          aria-expanded={abierto}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer', padding: 0,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--text-muted)',
          }}
        >
          <Icon n={abierto ? 'chevron-down' : 'chevron-right'} s={13} />
          Marcas que sirven
        </button>
      </span>

      {abierto && (
        <span style={{
          display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px',
          background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)',
          fontFamily: 'var(--font-body)', fontSize: 12,
        }}>
          {cargando && <span style={{ color: 'var(--text-faint)' }}>Buscando…</span>}
          {!cargando && opciones !== null && opciones.length === 0 && (
            <span style={{ color: 'var(--text-faint)' }}>
              No hay otra marca con stock para esta misma pieza y medida.
            </span>
          )}
          {(opciones || []).map((o) => (
            <span key={o.codigo} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <CodigoRepuesto size={11}>{o.codigo}</CodigoRepuesto>
              <span style={{ color: 'var(--text-strong)', fontWeight: 'var(--weight-bold)' }}>
                {o.marca || 'Sin marca'}
              </span>
              {o.medida && <StatusBadge status="pending">{o.medida}</StatusBadge>}
              {o.en_ficha && <StatusBadge status="active">Ya está en este motor</StatusBadge>}
              <span style={{ color: 'var(--text-muted)' }}>
                {o.precio ? formatPrecioARS(o.precio) : '—'}
              </span>
              {onElegir && (
                <button
                  onClick={() => onElegir(o)}
                  style={{
                    marginLeft: 'auto', border: '1px solid var(--border-default)',
                    background: 'var(--surface-card)', borderRadius: 8, cursor: 'pointer',
                    padding: '3px 10px', fontFamily: 'var(--font-body)', fontSize: 12,
                    fontWeight: 600, color: 'var(--text-strong)',
                  }}
                >
                  Agregar
                </button>
              )}
            </span>
          ))}
        </span>
      )}
    </span>
  )
}
