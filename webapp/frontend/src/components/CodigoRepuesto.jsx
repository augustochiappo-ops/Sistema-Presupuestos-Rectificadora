/*
 * Código del proveedor (ej. "A AK459050 STD").
 *
 * Se lee para copiarlo o para tipearlo en el sistema del proveedor, así que va
 * en monoespaciada y con un fondo suave que lo separa del texto de alrededor:
 * en la tipografía del resto de la app el 0 y la O son casi iguales, y las
 * medidas de una misma familia no quedan alineadas una debajo de la otra.
 */
export function CodigoRepuesto({ children, size = 13, style }) {
  return (
    <span
      style={{
        display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: size,
        fontWeight: 600, letterSpacing: '.03em', color: 'var(--text-strong)',
        background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)',
        borderRadius: 6, padding: '2px 7px', lineHeight: 1.35, whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  )
}
