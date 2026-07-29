import { PageHeader } from '../../components/PageHeader'

export default function PreciosPlaceholder() {
  return (
    <div>
      <PageHeader title="Editar Precios" />
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', height: 360,
        fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-faint)',
      }}>
        Este módulo estará disponible en una próxima versión.
      </div>
    </div>
  )
}
