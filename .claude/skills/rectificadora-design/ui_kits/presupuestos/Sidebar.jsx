function Sidebar({ current, onNav }) {
  const { NavItem, Avatar } = NS;
  const items = [
    { id:'dashboard', label:'Dashboard', icon:'layout-dashboard' },
    { id:'motores', label:'Listado de Motores', icon:'wrench' },
    { id:'excel', label:'Actualizar Excel', icon:'folder' },
    { id:'presupuestos', label:'Presupuestos', icon:'file-text' },
    { id:'precios', label:'Editar Precios', icon:'dollar-sign' },
    { id:'clientes', label:'Clientes', icon:'users' },
  ];
  refreshIcons();
  return (
    <aside style={{ width:248, flexShrink:0, padding:'28px 20px', display:'flex', flexDirection:'column', gap:28, borderRight:'1px solid var(--border-subtle)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'0 8px' }}>
        <div style={{ width:40, height:40, borderRadius:'var(--radius-md)', background:'var(--brand-ink)', display:'flex', alignItems:'center', justifyContent:'center', color:'#fff' }}><Icon n="wrench" s={22} /></div>
        <span style={{ fontFamily:'var(--font-display)', fontWeight:700, fontSize:19, color:'var(--text-strong)' }}>Rectifi</span>
      </div>
      <nav style={{ display:'flex', flexDirection:'column', gap:6, flex:1 }}>
        {items.map(it => (
          <NavItem key={it.id} icon={<Icon n={it.icon} />} active={current===it.id} onClick={()=>onNav(it.id)}>{it.label}</NavItem>
        ))}
      </nav>
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 8px', borderTop:'1px solid var(--border-subtle)' }}>
        <Avatar name="Taller Central" size={40} badge={12} />
        <div>
          <div style={{ fontFamily:'var(--font-body)', fontWeight:600, fontSize:14, color:'var(--text-strong)' }}>Taller Central</div>
          <div style={{ fontFamily:'var(--font-body)', fontSize:12, color:'var(--text-muted)' }}>rectificadora@mail.com</div>
        </div>
      </div>
    </aside>
  );
}
window.Sidebar = Sidebar;
