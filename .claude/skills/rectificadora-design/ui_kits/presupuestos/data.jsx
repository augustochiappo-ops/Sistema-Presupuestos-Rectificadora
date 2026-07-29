// Shared helpers for the Presupuestos UI kit
const NS = window.RectificadoraDesignSystem_cc48ac;
const Icon = ({ n, s = 20 }) => <i data-lucide={n} style={{ width: s, height: s, display: 'inline-flex' }}></i>;
function refreshIcons() { setTimeout(() => window.lucide && window.lucide.createIcons(), 20); }

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const CHART = [6,8,3,5,7,6.4,4,5,3,6,4,5].map((a,i)=>({label:MESES[i],a,b:a*0.55+1}));

const PRESUPUESTOS = [
  { code:'0006', fecha:'04/06/2026', cliente:'Cliente 2', motor:'CHEVROLET MERIVA 1.8 8V -SIENA NAF.INY.*4CIL* 80.50mm', total:'$ 494.677,19', estado:'pending' },
  { code:'0005', fecha:'04/06/2026', cliente:'Cliente 2', motor:'BEDFORD 350 DIESEL *4CIL* 106.3mm', total:'$ 35.492,35', estado:'active' },
  { code:'0004', fecha:'04/06/2026', cliente:'Cliente 2', motor:'BEDFORD 300 DIESEL *4CIL* 98.4mm', total:'$ 289.737,30', estado:'active' },
  { code:'0003', fecha:'29/05/2026', cliente:'Cliente 2', motor:'BORGWARD VM HR492 *4CIL* 92mm', total:'$ 540.619,22', estado:'expired' },
  { code:'0002', fecha:'29/05/2026', cliente:'Cliente 2', motor:'BEDFORD 350 DIESEL *4CIL* 106.3mm', total:'$ 99.917,03', estado:'pending' },
  { code:'0001', fecha:'29/05/2026', cliente:'Prueba', motor:'BEDFORD 200 DIESEL *4CIL* 98.4mm', total:'$ 381.846,86', estado:'active' },
];

const APROBACIONES = [
  { icon:'wrench', title:'Caterpillar 3406', meta:'Jun 10 03:20 · $494.677', estado:'pending' },
  { icon:'wrench', title:'Bedford 350', meta:'Jun 12 04:30 · $35.492', estado:'pending' },
  { icon:'wrench', title:'Borgward VM', meta:'Jun 14 05:40 · $540.619', estado:'pending' },
];

Object.assign(window, { NS, Icon, refreshIcons, MESES, CHART, PRESUPUESTOS, APROBACIONES });
