function App() {
  const [screen, setScreen] = React.useState('dashboard');
  const views = {
    dashboard: <Dashboard />,
    motores: <MotoresScreen />,
    excel: <ExcelScreen />,
    presupuestos: <PresupuestosScreen />,
    precios: <EmptyScreen title="Editar Precios" />,
    clientes: <ClientesScreen />,
  };
  React.useEffect(() => { refreshIcons(); }, [screen]);
  return (
    <div style={{ minHeight:'100vh', background:'var(--bg-app)', padding:24, boxSizing:'border-box', fontFamily:'var(--font-body)' }}>
      <div style={{ maxWidth:1360, margin:'0 auto', background:'var(--surface-shell)', borderRadius:'var(--radius-2xl)', boxShadow:'var(--shadow-lg)', display:'flex', overflow:'hidden', minHeight:'calc(100vh - 48px)' }}>
        <Sidebar current={screen} onNav={setScreen} />
        <main style={{ flex:1, padding:'28px 30px', overflow:'auto' }}>
          {views[screen]}
        </main>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
refreshIcons();
