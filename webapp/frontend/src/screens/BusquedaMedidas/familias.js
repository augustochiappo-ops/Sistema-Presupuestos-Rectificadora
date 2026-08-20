/*
 * Qué se puede filtrar y qué columnas se muestran en cada familia de repuestos.
 *
 * Es la misma definición que usa el backend (`app/tecnicos.py`, constante
 * ESPEC): cada campo de `medidas` viaja como `<campo>` + `tol_<campo>`, y los
 * de `textos` con su propio nombre. Si se agrega una medida, va en los dos
 * lados o el filtro no hace nada.
 *
 * `ejemplos` son búsquedas reales del catálogo, para que la pantalla vacía
 * muestre algo clicable en vez de una lista de campos en blanco.
 */

export const FAMILIAS = [
  {
    id: 'camisas',
    label: 'Camisas',
    medidas: [
      { campo: 'diam_int', label: 'Ø interior' },
      { campo: 'diam_ext_cil', label: 'Ø pestaña' },
      { campo: 'alt_pest', label: 'Alto de pestaña' },
      { campo: 'largo', label: 'Largo' },
      { campo: 'diam_sobremedida', label: 'Ø exterior' },
    ],
    textos: [
      { campo: 'codigo', label: 'Código', ancho: 200, icono: 'tag' },
      { campo: 'aplicacion', label: 'Motor / aplicación', ancho: 300, icono: 'search' },
    ],
    columnas: [
      { key: 'codigo', header: 'Código', width: 140, strong: true, wrap: true },
      { key: 'marca', header: 'Marca', width: 110 },
      { key: 'aplicacion', header: 'Motor / aplicación', wrap: true, minWidth: 220 },
      { key: 'diam_int', header: 'Ø int.', width: 90, align: 'right', tipo: 'mm' },
      { key: 'diam_ext_cil', header: 'Ø pest.', width: 90, align: 'right', tipo: 'mm' },
      { key: 'alt_pest', header: 'Alto pest.', width: 100, align: 'right', tipo: 'mm' },
      { key: 'largo', header: 'Largo', width: 90, align: 'right', tipo: 'mm' },
      { key: 'sobremedidas', header: 'Ø exterior', width: 170, tipo: 'sobremedidas' },
      { key: 'precio', header: 'Precio', width: 120, align: 'right', tipo: 'precio' },
      { key: 'stock', header: 'Stock', width: 90, align: 'center', tipo: 'stock' },
    ],
    ejemplos: [
      { label: 'Ø interior 102 mm', filtros: { diam_int: '102' } },
      { label: 'Alto de pestaña 4,76', filtros: { alt_pest: '4.76', tol_alt_pest: '0.1' } },
      { label: 'Motor: Perkins', filtros: { aplicacion: 'perkins' } },
    ],
  },
  {
    id: 'guias',
    label: 'Guías de válvulas',
    medidas: [
      { campo: 'diam_vastago', label: 'Ø vástago' },
      { campo: 'diam_ext', label: 'Ø exterior' },
      { campo: 'largo', label: 'Largo' },
    ],
    textos: [
      { campo: 'codigo', label: 'Código', ancho: 200, icono: 'tag' },
      { campo: 'aplicacion', label: 'Motor / aplicación', ancho: 300, icono: 'search' },
    ],
    opciones: [
      {
        campo: 'tipo',
        label: 'Tipo',
        valores: [
          { valor: '', label: 'Admisión y escape' },
          { valor: 'A', label: 'Admisión' },
          { valor: 'E', label: 'Escape' },
          { valor: 'AE', label: 'Indistinta (A/E)' },
        ],
      },
    ],
    columnas: [
      { key: 'codigo', header: 'Código', width: 150, strong: true, wrap: true },
      { key: 'marca', header: 'Marca', width: 100 },
      { key: 'aplicacion', header: 'Motor / aplicación', wrap: true, minWidth: 220 },
      { key: 'tipo', header: 'Tipo', width: 80, tipo: 'tipo' },
      { key: 'diam_vastago', header: 'Ø vást.', width: 90, align: 'right', tipo: 'mm' },
      { key: 'diam_ext', header: 'Ø ext.', width: 90, align: 'right', tipo: 'mm' },
      { key: 'largo', header: 'Largo', width: 90, align: 'right', tipo: 'mm' },
      { key: 'material', header: 'Material', width: 130 },
      { key: 'precio', header: 'Precio', width: 120, align: 'right', tipo: 'precio' },
      { key: 'stock', header: 'Stock', width: 90, align: 'center', tipo: 'stock' },
    ],
    ejemplos: [
      { label: 'Ø vástago 8 mm', filtros: { diam_vastago: '8', tol_diam_vastago: '0.1' } },
      { label: 'Ø vástago 7 y largo 36,6', filtros: { diam_vastago: '7', tol_diam_vastago: '0.1', largo: '36.6' } },
      { label: 'Motor: Golf', filtros: { aplicacion: 'golf' } },
    ],
  },
  {
    id: 'subconjuntos',
    label: 'Subconjuntos',
    medidas: [
      { campo: 'diam_piston', label: 'Ø pistón' },
      { campo: 'alt_piston', label: 'Alto total' },
      { campo: 'diam_perno', label: 'Ø perno' },
    ],
    textos: [
      { campo: 'codigo', label: 'Código', ancho: 200, icono: 'tag' },
      { campo: 'aplicacion', label: 'Motor / aplicación', ancho: 280, icono: 'search' },
      { campo: 'descripcion', label: 'Descripción', ancho: 280, icono: 'search' },
    ],
    columnas: [
      { key: 'codigo', header: 'Código', width: 130, strong: true, wrap: true },
      { key: 'marca', header: 'Marca', width: 100 },
      { key: 'descripcion', header: 'Descripción', wrap: true, minWidth: 220 },
      { key: 'nro_cil', header: 'Nº cil.', width: 80, align: 'right' },
      { key: 'diam_piston', header: 'Ø pistón', width: 100, align: 'right', tipo: 'mm' },
      { key: 'alt_piston', header: 'Alto total', width: 100, align: 'right', tipo: 'mm' },
      { key: 'perno_str', header: 'Perno', width: 150 },
      { key: 'diams_dispon', header: 'Sobremedidas', width: 150 },
      // Un subconjunto tiene un precio por sobremedida: esta columna dice de
      // cuál es el que se está mostrando.
      { key: 'medida_crac', header: 'Precio de', width: 100 },
      { key: 'codigo_aros', header: 'Cód. aros', width: 110 },
      { key: 'precio', header: 'Precio', width: 120, align: 'right', tipo: 'precio' },
      { key: 'stock', header: 'Stock', width: 90, align: 'center', tipo: 'stock' },
    ],
    ejemplos: [
      { label: 'Ø pistón 102 mm', filtros: { diam_piston: '102', tol_diam_piston: '0.1' } },
      { label: 'Ø perno 36 mm', filtros: { diam_perno: '36', tol_diam_perno: '0.1' } },
      { label: 'Motor: Palio', filtros: { aplicacion: 'palio' } },
    ],
  },
  {
    id: 'pistones',
    label: 'Pistones',
    // Los mismos tres filtros que subconjuntos: el pistón se busca igual esté
    // suelto o en conjunto, y cambiar de pestaña no tiene que cambiar la forma
    // de buscar.
    medidas: [
      { campo: 'diam_piston', label: 'Ø pistón' },
      { campo: 'alt_piston', label: 'Alto total' },
      { campo: 'diam_perno', label: 'Ø perno' },
    ],
    textos: [
      { campo: 'codigo', label: 'Código', ancho: 200, icono: 'tag' },
      { campo: 'aplicacion', label: 'Motor / aplicación', ancho: 280, icono: 'search' },
      { campo: 'descripcion', label: 'Descripción', ancho: 280, icono: 'search' },
    ],
    columnas: [
      { key: 'codigo', header: 'Código', width: 130, strong: true, wrap: true },
      { key: 'marca', header: 'Marca', width: 120 },
      // Una sola columna que envuelve, como en subconjuntos: con dos, la tabla
      // se pasa del ancho de la pantalla y las aplasta a cero. El motor y la
      // aplicación se siguen buscando por su filtro, no hace falta la columna.
      { key: 'descripcion', header: 'Descripción', wrap: true, minWidth: 200 },
      { key: 'cilindrada', header: 'Cilindrada', width: 100 },
      { key: 'nro_cil', header: 'Nº cil.', width: 80, align: 'right' },
      { key: 'diam_piston', header: 'Ø pistón', width: 100, align: 'right', tipo: 'mm' },
      { key: 'alt_piston', header: 'Alto total', width: 100, align: 'right', tipo: 'mm' },
      { key: 'perno_str', header: 'Perno', width: 140 },
      { key: 'aros', header: 'Aros', width: 150, wrap: true },
      { key: 'medidas_dispon', header: 'Sobremedidas', width: 200, wrap: true },
      // Un pistón tiene un precio por sobremedida: esta columna dice de cuál es
      // el que se está mostrando (igual que en subconjuntos).
      { key: 'medida_crac', header: 'Precio de', width: 100 },
      { key: 'precio', header: 'Precio', width: 120, align: 'right', tipo: 'precio' },
      { key: 'stock', header: 'Stock', width: 90, align: 'center', tipo: 'stock' },
    ],
    ejemplos: [
      { label: 'Ø pistón 98,42 mm', filtros: { diam_piston: '98.42', tol_diam_piston: '0.1' } },
      { label: 'Ø perno 22 mm', filtros: { diam_perno: '22', tol_diam_perno: '0.1' } },
      { label: 'Motor: Falcon', filtros: { aplicacion: 'falcon' } },
    ],
  },
]

export const TOLERANCIA_DEFECTO = '0.5'

/** Los nombres de todos los parámetros que puede mandar una familia. */
export function camposDe(familia) {
  return [
    ...(familia.medidas || []).flatMap((m) => [m.campo, `tol_${m.campo}`]),
    ...(familia.textos || []).map((t) => t.campo),
    ...(familia.opciones || []).map((o) => o.campo),
  ]
}
