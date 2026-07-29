// Secondary screens for the kit (Motores, Presupuestos, Clientes, Excel, Precios)
function PageTitle({ title, subtitle, actions }) {
  const { PageHeader } = NS;
  return <PageHeader title={title} subtitle={subtitle} actions={actions} />;
}

function MotoresScreen() {
  const { DataTable, SearchInput, PageHeader } = NS;
  const marcas = ['Todos','BEDFORD','BORGWARD','CATERPILLAR','CHERY','CHEVROLET','CHRYSLER','CUMMINS','DEUTZ','DODGE','FIAT','FORD'];
  const [sel, setSel] = React.useState('Todos');
  refreshIcons();
  const rows = [
    { code:'BED200', motor:'BEDFORD 200 DIESEL *4CIL* 98.4mm', marca:'BEDFORD', tipo:'DIESEL', cil:'4', diam:'98.4 mm', lista:'4' },
    { code:'BED350', motor:'BEDFORD 350 DIESEL *4CIL* 106.3mm', marca:'BEDFORD', tipo:'DIESEL', cil:'4', diam:'106.3 mm', lista:'4' },
    { code:'CAT.3406', motor:'CATERPILLAR 3406 TURBO DIESEL *6CIL* 137.2mm', marca:'CATERPILLAR', tipo:'TURBO DIESEL', cil:'6', diam:'137.2 mm', lista:'11' },
    { code:'CAT.C-15', motor:'CATERPILLAR C-15 DIESEL *6CIL* 145mm', marca:'CATERPILLAR', tipo:'DIESEL', cil:'6', diam:'145.0 mm', lista:'12' },
    { code:'BORGVM', motor:'BORGWARD VM HR492 *4CIL* 92mm', marca:'BORGWARD', tipo:'—', cil:'4', diam:'92.0 mm', lista:'4' },
  ];
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <PageHeader title="Listado de Motores" subtitle="491 motores · todas las marcas"
        actions={<SearchInput width={320} icon={<Icon n="search" s={16} />} placeholder="Buscar por marca, modelo o código…" />} />
      <div style={{ display:'grid', gridTemplateColumns:'180px 1fr', gap:18, alignItems:'start' }}>
        <div style={{ background:'var(--surface-card)', border:'1px solid var(--border-default)', borderRadius:'var(--radius-xl)', padding:'14px 10px' }}>
          <div style={{ fontFamily:'var(--font-body)', fontSize:11, fontWeight:600, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--text-faint)', padding:'6px 12px' }}>Marcas</div>
          {marcas.map(m=>(
            <button key={m} onClick={()=>setSel(m)} style={{ display:'block', width:'100%', textAlign:'left', border:'none', cursor:'pointer', padding:'10px 12px', borderRadius:'var(--radius-md)', fontFamily:'var(--font-body)', fontSize:14, fontWeight: sel===m?600:500, background: sel===m?'var(--surface-inverse)':'transparent', color: sel===m?'#fff':'var(--text-body)' }}>{m}</button>
          ))}
        </div>
        <DataTable
          columns={[
            { key:'code', header:'Código', strong:true, width:120 },
            { key:'motor', header:'Motor' },
            { key:'marca', header:'Marca' },
            { key:'tipo', header:'Tipo' },
            { key:'cil', header:'Cil.', align:'center', width:60 },
            { key:'diam', header:'Diámetro', align:'right', width:110 },
            { key:'lista', header:'Lista', align:'center', width:70 },
          ]}
          rows={rows}
        />
      </div>
    </div>
  );
}

function PresupuestosScreen() {
  const { DataTable, PageHeader, Button, StatusBadge } = NS;
  refreshIcons();
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <PageHeader title="Presupuestos" subtitle="6 presupuestos · 2 clientes"
        actions={<Button variant="success" iconLeft={<Icon n="plus" s={16} />}>Nuevo Presupuesto</Button>} />
      <DataTable
        columns={[
          { key:'code', header:'Nº', strong:true, width:70 },
          { key:'fecha', header:'Fecha', width:120 },
          { key:'cliente', header:'Cliente', width:140 },
          { key:'motor', header:'Motor' },
          { key:'total', header:'Total', align:'right' },
          { key:'estado', header:'Estado', render:v=><StatusBadge status={v} /> },
        ]}
        rows={PRESUPUESTOS}
      />
    </div>
  );
}

function ClientesScreen() {
  const { DataTable, PageHeader, Button, Avatar } = NS;
  refreshIcons();
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <PageHeader title="Clientes" subtitle="2 clientes"
        actions={<Button variant="success" iconLeft={<Icon n="plus" s={16} />}>Nuevo Cliente</Button>} />
      <DataTable
        columns={[
          { key:'nombre', header:'Nombre', strong:true, render:(v)=>(<span style={{display:'flex',alignItems:'center',gap:12}}><Avatar name={v} size={34} />{v}</span>) },
          { key:'presu', header:'Presupuestos', align:'center' },
          { key:'ultimo', header:'Último presupuesto', align:'right' },
        ]}
        rows={[
          { nombre:'Cliente 2', presu:'5', ultimo:'04/06/2026' },
          { nombre:'Prueba', presu:'1', ultimo:'29/05/2026' },
        ]}
      />
    </div>
  );
}

function ExcelScreen() {
  const { PageHeader, Button } = NS;
  refreshIcons();
  const Card = ({ icon, title, desc, cta, disabled }) => (
    <div style={{ background:'var(--surface-card)', border:'1px solid var(--border-default)', borderRadius:'var(--radius-xl)', padding:'22px 24px', opacity: disabled?0.6:1 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
        <div style={{ width:40, height:40, borderRadius:'var(--radius-md)', background:'var(--surface-sunken)', display:'flex', alignItems:'center', justifyContent:'center' }}><Icon n={icon} s={20} /></div>
        <h3 style={{ margin:0, fontFamily:'var(--font-display)', fontWeight:700, fontSize:18, color:'var(--text-strong)' }}>{title}</h3>
      </div>
      <p style={{ margin:'0 0 16px', fontFamily:'var(--font-body)', fontSize:13, color:'var(--text-muted)' }}>{desc}</p>
      <Button variant={disabled?'secondary':'primary'} disabled={disabled} iconLeft={<Icon n="folder" s={16} />}>{cta}</Button>
    </div>
  );
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <PageHeader title="Actualizar Excel" subtitle="Importá los archivos de FACRA para mantener motores y precios al día." />
      <div style={{ fontFamily:'var(--font-body)', fontSize:11, fontWeight:600, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--text-faint)' }}>FACRA</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Card icon="file-text" title="Nomenclador de Motores" desc="Lista de todos los motores con su número de lista asignado (1–13)." cta="Cargar nomenclador.xls" />
        <Card icon="dollar-sign" title="Lista Orientadora de Mano de Obra" desc="Precios vigentes por servicio, clasificados por número de lista." cta="Cargar lista_orientadora.xls" />
      </div>
      <div style={{ fontFamily:'var(--font-body)', fontSize:11, fontWeight:600, letterSpacing:'.14em', textTransform:'uppercase', color:'var(--text-faint)' }}>CRAC — Próximamente</div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Card icon="package" title="Lista de Precios CRAC" desc="Precios de repuestos del proveedor CRAC. Se habilitará en una próxima versión." cta="Cargar precios_crac.xls" disabled />
        <Card icon="tag" title="Lista de Prefijos CRAC" desc="Codificación y prefijos de partes CRAC. Se habilitará en una próxima versión." cta="Cargar prefijos_crac.xls" disabled />
      </div>
    </div>
  );
}

function EmptyScreen({ title }) {
  const { PageHeader } = NS;
  refreshIcons();
  return (
    <div>
      <PageHeader title={title} />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:360, fontFamily:'var(--font-body)', fontSize:14, color:'var(--text-faint)' }}>Este módulo estará disponible en una próxima versión.</div>
    </div>
  );
}

Object.assign(window, { MotoresScreen, PresupuestosScreen, ClientesScreen, ExcelScreen, EmptyScreen });
