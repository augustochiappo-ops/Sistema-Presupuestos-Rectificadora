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
      // Los anchos son ajustados a propósito: con la columna de sobremedidas
      // sumada, la tabla tiene que entrar en pantalla sin empujar el precio y
      // el stock fuera del borde derecho.
      { key: 'codigo', header: 'Código', width: 110, strong: true, wrap: true },
      { key: 'marca', header: 'Marca', width: 105 },
      { key: 'aplicacion', header: 'Motor / aplicación', wrap: true, minWidth: 170, tipo: 'aplicacion' },
      // Seca o húmeda: no son la misma pieza ni se montan igual, y ahora que el
      // catálogo trae las dos hay que poder distinguirlas de un vistazo.
      { key: 'tipo_camisa', header: 'Tipo', width: 75 },
      { key: 'diam_int', header: 'Ø int.', width: 80, align: 'right', tipo: 'mm' },
      { key: 'diam_ext_cil', header: 'Ø pest.', width: 85, align: 'right', tipo: 'mm' },
      // Con dos decimales siempre: en esta columna la diferencia entre 4,00 y
      // 4,76 es la que decide si la camisa entra, y un "4" pelado la disimula.
      { key: 'alt_pest', header: 'Alto pest.', width: 95, align: 'right', tipo: 'mm', decimales: 2 },
      { key: 'largo', header: 'Largo', width: 75, align: 'right', tipo: 'mm' },
      // Cada sobremedida con su etiqueta arriba del Ø: sin la etiqueta a la
      // vista, cinco números seguidos no dicen cuál pedir.
      { key: 'sobremedidas', header: 'Sobremedidas y Ø ext.', minWidth: 200, tipo: 'sobremedidas' },
      // Una camisa tiene un precio por sobremedida: esta columna dice de cuál
      // es el que se está mostrando (igual que en subconjuntos y bujes).
      { key: 'medida_crac', header: 'Precio de', width: 85, tipo: 'medida' },
      { key: 'precio', header: 'Precio', width: 105, align: 'right', tipo: 'precio' },
      { key: 'stock', header: 'Stock', width: 70, align: 'center', tipo: 'stock' },
    ],
    ejemplos: [
      { label: 'Ø interior 98,42 mm', filtros: { diam_int: '98.42' } },
      { label: 'Alto de pestaña 4,76', filtros: { alt_pest: '4.76', tol_alt_pest: '0.1' } },
      { label: 'Motor: Perkins', filtros: { aplicacion: 'perkins' } },
    ],
  },
  {
    id: 'valvulas',
    label: 'Válvulas',
    // Las cuatro medidas con las que se identifica una válvula, en el orden en
    // que las lee el catálogo: la cabeza (lo primero que se mide), el vástago,
    // el largo y el ángulo del asiento.
    //
    // El Ø de vástago va dos veces y no es un error: el de arriba es el de la
    // medida STD y el de abajo busca contra TODAS las sobremedidas de la
    // válvula (mismo mecanismo que el "Ø exterior" de camisas). El segundo es
    // el que sirve cuando lo que se midió es un vástago ya rectificado.
    medidas: [
      { campo: 'diam_cabeza', label: 'Ø cabeza' },
      { campo: 'diam_vastago', label: 'Ø vástago (STD)' },
      { campo: 'largo', label: 'Largo total' },
      { campo: 'angulo', label: 'Ángulo', unidad: 'º' },
      { campo: 'diam_sobremedida', label: 'Ø vástago c/ sobremedida' },
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
      { key: 'codigo', header: 'Código', width: 125, strong: true, wrap: true },
      // El número del catálogo al lado del que se pide: es con el que se busca
      // la válvula en el PDF de la marca, y también se puede escribir en el
      // filtro "Código".
      { key: 'codigo_fab', header: 'Nº catálogo', width: 115 },
      { key: 'marca', header: 'Marca', width: 80 },
      { key: 'aplicacion', header: 'Motor / aplicación', wrap: true, minWidth: 200, tipo: 'aplicacion' },
      { key: 'tipo', header: 'Tipo', width: 90, tipo: 'tipo' },
      { key: 'diam_cabeza', header: 'Ø cabeza', width: 95, align: 'right', tipo: 'mm' },
      // Tres decimales: el catálogo de 3B publica el vástago así (7,912 la STD
      // y 7,988 la de tres milésimas) y redondeado a dos las dos se leen casi
      // igual, que es justo lo que hay que distinguir para pedir bien.
      { key: 'diam_vastago', header: 'Ø vást.', width: 95, align: 'right', tipo: 'mm', decimales: 3 },
      { key: 'largo', header: 'Largo', width: 85, align: 'right', tipo: 'mm' },
      { key: 'angulo', header: 'Ángulo', width: 85, align: 'right', tipo: 'grados' },
      // Cada sobremedida con su Ø de vástago: es lo que se pide cuando la guía
      // se rectifica en vez de cambiarse, y sin la etiqueta a la vista los
      // números no dicen cuál.
      { key: 'sobremedidas', header: 'Sobremedidas y Ø vást.', minWidth: 190, tipo: 'sobremedidas', decimales: 3 },
      // Bimetálica, estelitada, vástago cromado: lo publica Mahle y decide si
      // una válvula aguanta el motor. En las de 3B va un guión.
      { key: 'material', header: 'Material', width: 105 },
      // Qué válvula de la otra marca reemplaza a ésta. Es lo que permite
      // entrar con un número que no es del catálogo que uno tiene a mano.
      { key: 'equivalencias', header: 'Equivalencias', minWidth: 150, wrap: true },
      // Una válvula tiene un precio por sobremedida: esta columna dice de cuál
      // es el que se está mostrando (igual que en camisas y subconjuntos).
      { key: 'medida_crac', header: 'Precio de', width: 105, tipo: 'medida' },
      { key: 'precio', header: 'Precio', width: 105, align: 'right', tipo: 'precio' },
      { key: 'stock', header: 'Stock', width: 75, align: 'center', tipo: 'stock' },
    ],
    ejemplos: [
      { label: 'Ø cabeza 35 mm', filtros: { diam_cabeza: '35', tol_diam_cabeza: '0.5' } },
      { label: 'Ø vástago 8 y largo 121', filtros: { diam_vastago: '8', tol_diam_vastago: '0.1', largo: '121', tol_largo: '1' } },
      { label: 'Motor: Corsa', filtros: { aplicacion: 'corsa' } },
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
    // No están en el catálogo todas las letras dibujadas: se lista lo que
    // existe en las fichas. La "N" es de Indy y de Nubo y no está en la lámina
    // de RYC — su dibujo sale de la referencia de Nubo (ver formas.jsx).
    formas: {
      campo: 'forma',
      label: 'Forma del cuerpo',
      valores: ['A', 'B', 'C', 'E', 'F', 'G', 'M', 'N', 'P'],
    },
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
      // La forma del catálogo (F, A-1, P-3-6…): dice si la guía es recta, con
      // pestaña, escalonada. Es lo primero que se mira para saber si una guía
      // reemplaza a otra, y va con su dibujo porque la letra sola no se
      // acuerda nadie.
      { key: 'forma', header: 'Forma', width: 130, tipo: 'forma' },
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
    id: 'asientos',
    label: 'Asientos de válvulas',
    // Las cuatro medidas que pidió el dueño, en el orden en que las lee el
    // catálogo. El ángulo va con su unidad: el casillero de tolerancia dice
    // "mm" en las demás familias y acá son grados.
    medidas: [
      { campo: 'diam_ext', label: 'Ø exterior' },
      { campo: 'diam_int', label: 'Ø interior' },
      { campo: 'altura', label: 'Altura' },
      { campo: 'angulo', label: 'Ángulo', unidad: 'º' },
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
      { key: 'codigo', header: 'Código', width: 125, strong: true, wrap: true },
      // Indy, Nubo o RYC: los tres catálogos van en la misma lista y la marca
      // es lo que dice de cuál salió la ficha.
      { key: 'marca', header: 'Marca', width: 85 },
      { key: 'aplicacion', header: 'Motor / aplicación', wrap: true, minWidth: 210 },
      { key: 'tipo', header: 'Tipo', width: 95, tipo: 'tipo' },
      { key: 'diam_ext', header: 'Ø ext.', width: 90, align: 'right', tipo: 'mm' },
      { key: 'diam_int', header: 'Ø int.', width: 90, align: 'right', tipo: 'mm' },
      { key: 'altura', header: 'Altura', width: 85, align: 'right', tipo: 'mm' },
      { key: 'angulo', header: 'Ángulo', width: 85, align: 'right', tipo: 'grados' },
      // La cantidad por juego la publica un solo catálogo (Indy). En los otros
      // dos va un guión: es un dato que no tenemos, no un cero.
      { key: 'cant_juego', header: 'Cant. por juego', width: 125, align: 'right' },
      { key: 'medida_crac', header: 'Precio de', width: 90, tipo: 'medida' },
      { key: 'precio', header: 'Precio', width: 110, align: 'right', tipo: 'precio' },
      { key: 'stock', header: 'Stock', width: 80, align: 'center', tipo: 'stock' },
    ],
    ejemplos: [
      { label: 'Ø exterior 45 mm', filtros: { diam_ext: '45', tol_diam_ext: '0.5' } },
      { label: 'Ø exterior 35 y ángulo 45º', filtros: { diam_ext: '35', tol_diam_ext: '0.5', angulo: '45' } },
      { label: 'Motor: Corsa', filtros: { aplicacion: 'corsa' } },
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
      // El dibujo del pistón, al lado del código: la cámara de la cabeza y la
      // forma de la falda se reconocen de un vistazo y las medidas no. Los que
      // todavía no se recortaron del catálogo van con un guión.
      { key: 'dibujo', header: 'Dibujo', width: 80, tipo: 'dibujo' },
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
    id: 'conjuntos',
    label: 'Conjuntos',
    // El juego completo del motor. Es el mismo pistón que el subconjunto —en el
    // catálogo de Mahle van en la misma fila, "E BE14040" y "S BE14040"—, así
    // que se busca con los mismos tres filtros y se muestra con las mismas
    // columnas: cambiar de pestaña no cambia la forma de buscar.
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
      // Los dos códigos a la vista, y por qué: el de la izquierda es el que se
      // pide (el de la lista del proveedor) y el de al lado es el del catálogo
      // de Mahle, que es con el que se busca el motor en el PDF. Los dos se
      // pueden escribir en el filtro "Código".
      // Los anchos son ajustados a propósito: con el precio y el stock a la
      // derecha, la tabla tiene que entrar en pantalla sin dejarlos afuera del
      // borde — que es justamente lo que se viene a mirar de un conjunto.
      // 150 y no menos: el código más largo del proveedor es "T BEK482020WS" y
      // partido en dos renglones no se lee de un vistazo.
      { key: 'codigo', header: 'Código', width: 150, strong: true, wrap: true },
      { key: 'codigo_fab', header: 'Cód. Mahle', width: 110 },
      // El dibujo del pistón sale del mismo recorte del catálogo que el del
      // subconjunto del mismo número: es el mismo pistón dibujado una sola vez.
      { key: 'dibujo', header: 'Dibujo', width: 70, tipo: 'dibujo' },
      { key: 'descripcion', header: 'Descripción', wrap: true, minWidth: 130 },
      { key: 'nro_cil', header: 'Nº cil.', width: 70, align: 'right' },
      { key: 'diam_piston', header: 'Ø pistón', width: 95, align: 'right', tipo: 'mm' },
      { key: 'alt_piston', header: 'Alto total', width: 95, align: 'right', tipo: 'mm' },
      { key: 'perno_str', header: 'Perno', width: 125 },
      { key: 'diams_dispon', header: 'Sobremedidas', width: 125 },
      { key: 'codigo_aros', header: 'Cód. aros', width: 95 },
      // Si el juego trae los orings de camisa: son los códigos que terminan en
      // "WS" y son 22, todos de motores de camisa húmeda. Cambia el precio y
      // cambia lo que hay que pedir aparte, así que va en la tabla y no
      // escondido en el código.
      { key: 'oring', header: 'Oring', width: 70, align: 'center', tipo: 'si_no' },
      // Si una persona ya cruzó la ficha contra el catálogo. Las medidas de la
      // mayoría se leyeron del PDF con un extractor: pasan las verificaciones
      // automáticas (el Ø contra la descripción del proveedor, GL > KH, el
      // perno coherente) pero eso no es lo mismo que haberlas mirado. Va a la
      // vista y no escondido en el dato, porque quien cotiza tiene derecho a
      // saber de dónde sale el número que está por usar.
      { key: 'verificado', header: 'Verif.', width: 75, align: 'center', tipo: 'si_no' },
      // Sin columna "Precio de" y sin "Marca", al revés que en subconjuntos: el
      // conjunto tiene UN código con UN precio (no se pide por sobremedida) y
      // son todos Mahle, así que una columna con el mismo texto 128 veces solo
      // le saca ancho a la descripción.
      { key: 'precio', header: 'Precio', width: 110, align: 'right', tipo: 'precio' },
      { key: 'stock', header: 'Stock', width: 80, align: 'center', tipo: 'stock' },
    ],
    ejemplos: [
      { label: 'Ø pistón 114 mm', filtros: { diam_piston: '114', tol_diam_piston: '0.1' } },
      { label: 'Motor: Cummins', filtros: { descripcion: 'cummins' } },
      { label: 'Motor: Scania', filtros: { descripcion: 'scania' } },
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
  {
    id: 'bujes_biela',
    label: 'Bujes de biela',
    // El Ø exterior no está acá sino con las sobremedidas: un buje tiene el
    // STD y hasta siete medidas más, y se busca contra todas a la vez (mismo
    // mecanismo que el "Ø exterior" de camisas).
    medidas: [
      { campo: 'diam_perno', label: 'Ø perno' },
      { campo: 'diam_sobremedida', label: 'Ø exterior' },
      { campo: 'ancho', label: 'Ancho' },
      { campo: 'diam_int', label: 'Ø int. semiterminado' },
    ],
    textos: [
      { campo: 'codigo', label: 'Código', ancho: 200, icono: 'tag' },
      { campo: 'aplicacion', label: 'Motor / aplicación', ancho: 300, icono: 'search' },
    ],
    columnas: [
      { key: 'codigo', header: 'Código', width: 100, strong: true },
      // 150 y no menos: la marca más larga del catálogo es "MERCEDES BENZ" y
      // cortada en "MERCEDES …" no se distingue de "MERCEDES ..." de nada.
      { key: 'marca', header: 'Marca', width: 150 },
      { key: 'descripcion', header: 'Motor / aplicación', wrap: true, minWidth: 160 },
      { key: 'diam_perno', header: 'Ø perno', width: 90, align: 'right', tipo: 'mm' },
      { key: 'diam_int', header: 'Ø int. semi', width: 100, align: 'right', tipo: 'mm' },
      { key: 'ancho', header: 'Ancho', width: 95, align: 'right', tipo: 'mm' },
      { key: 'sobremedidas', header: 'Ø exterior y sobremedidas', minWidth: 230, tipo: 'sobremedidas' },
      // Un buje tiene un precio por sobremedida: esta columna dice de cuál es
      // el que se está mostrando (igual que en subconjuntos y pistones).
      { key: 'medida_crac', header: 'Precio de', width: 90 },
      { key: 'precio', header: 'Precio', width: 110, align: 'right', tipo: 'precio' },
      { key: 'stock', header: 'Stock', width: 85, align: 'center', tipo: 'stock' },
    ],
    ejemplos: [
      { label: 'Ø perno 25 mm', filtros: { diam_perno: '25', tol_diam_perno: '0.1' } },
      { label: 'Ø exterior 28 o más', filtros: { diam_sobremedida: '28', tol_diam_sobremedida: '+' } },
      { label: 'Motor: Corsa', filtros: { aplicacion: 'corsa' } },
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
    ...(familia.formas ? [familia.formas.campo] : []),
  ]
}
