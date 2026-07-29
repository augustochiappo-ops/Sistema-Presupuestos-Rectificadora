function Dashboard() {
  const { StatCard, BarChart, ListItem, StatusBadge, Button, Select, DataTable } = NS;
  const [filterOpen, setFilterOpen] = React.useState(false);
  refreshIcons();
  const stats = [
    { icon:'users', value:'2', label:'Clientes' },
    { icon:'wrench', value:'491', label:'Motores' },
    { icon:'file-text', value:'6', label:'Presupuestos', active:true, corner:<Icon n="arrow-up-right" s={16} /> },
    { icon:'dollar-sign', value:'$1.8M', label:'Facturado' },
    { icon:'clock', value:'2', label:'Pendientes' },
    { icon:'alert-triangle', value:'1', label:'Vencidos' },
  ];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:22 }}>
      <div style={{ display:'flex', gap:18, alignItems:'flex-start' }}>
        <div style={{ flexShrink:0, maxWidth:200 }}>
          <div style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:22, color:'var(--text-strong)' }}>Resumen</div>
          <p style={{ fontFamily:'var(--font-body)', fontSize:13, color:'var(--text-muted)', marginTop:8 }}>Tu actividad de presupuestos del período.</p>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:14, flex:1 }}>
          {stats.map((s,i)=><StatCard key={i} icon={<Icon n={s.icon} />} value={s.value} label={s.label} active={s.active} corner={s.corner} />)}
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:18 }}>
        <div style={{ background:'var(--surface-card)', border:'1px solid var(--border-default)', borderRadius:'var(--radius-xl)', padding:'22px 24px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
            <h3 style={{ margin:0, fontFamily:'var(--font-display)', fontWeight:700, fontSize:19, color:'var(--text-strong)' }}>Presupuestos por mes</h3>
            <div style={{ display:'flex', gap:16, fontFamily:'var(--font-body)', fontSize:12, color:'var(--text-muted)' }}>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}><i style={{width:8,height:8,borderRadius:99,background:'var(--chart-bar)'}}></i>Emitidos</span>
              <span style={{ display:'flex', alignItems:'center', gap:6 }}><i style={{width:8,height:8,borderRadius:99,background:'var(--chart-bar-alt)'}}></i>Aprobados</span>
            </div>
          </div>
          <BarChart data={CHART} height={210} />
        </div>
        <div style={{ background:'var(--surface-card)', border:'1px solid var(--border-default)', borderRadius:'var(--radius-xl)', padding:'20px 22px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <h3 style={{ margin:0, fontFamily:'var(--font-display)', fontWeight:700, fontSize:19, color:'var(--text-strong)' }}>Por aprobar</h3>
            <Icon n="more-horizontal" s={18} />
          </div>
          {APROBACIONES.map((a,i)=>(
            <ListItem key={i} leading={<Icon n={a.icon} />} title={a.title} meta={a.meta} trailing={<StatusBadge status={a.estado} />} />
          ))}
        </div>
      </div>

      <div style={{ background:'var(--surface-card)', border:'1px solid var(--border-default)', borderRadius:'var(--radius-xl)', padding:'22px 24px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ margin:0, fontFamily:'var(--font-display)', fontWeight:700, fontSize:19, color:'var(--text-strong)' }}>Gestionar presupuestos</h3>
          <div style={{ display:'flex', gap:10 }}>
            <Select label="Estado" open={filterOpen} onClick={()=>setFilterOpen(o=>!o)} />
            <Button variant="primary" iconRight={<Icon n="download" s={16} />}>Exportar</Button>
          </div>
        </div>
        <DataTable
          columns={[
            { key:'code', header:'Nº', strong:true, width:70 },
            { key:'fecha', header:'Fecha', width:110 },
            { key:'cliente', header:'Cliente', width:130 },
            { key:'motor', header:'Motor' },
            { key:'total', header:'Total', align:'right' },
            { key:'estado', header:'Estado', render:v=><StatusBadge status={v} /> },
          ]}
          rows={PRESUPUESTOS}
          style={{ border:'none', borderRadius:0 }}
        />
      </div>
    </div>
  );
}
window.Dashboard = Dashboard;
