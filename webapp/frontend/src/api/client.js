class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

/* ── Caché y prioridad (2026-10-05) ─────────────────────────────────────────
   Cambiar de pestaña tardaba porque cada pantalla, al abrirse, le volvía a
   pedir todo al servidor, y en PythonAnywhere cada pedido son 0,2 a 0,5 s y
   van de a uno. Ahora:

   * Las pantallas piden sus datos de entrada con `api.get(path, { alActualizar })`.
     Si ya están en el caché (porque se precargaron o porque se entró antes) se
     muestran al instante, y por atrás se vuelven a pedir: si el servidor trae
     algo distinto, `alActualizar` lo pone en pantalla.
   * La cola de precarga (precarga.js) va trayendo, de a un pedido, los datos
     de las otras pestañas. Sólo avanza cuando no hay ningún pedido "de la
     pantalla" en curso: si se abre una pestaña que todavía no se precargó, lo
     suyo sale primero y la cola sigue después.
   * Cualquier POST / PUT / DELETE marca todo el caché como "sucio": lo sucio no
     se muestra nunca (la pantalla espera la respuesta nueva, como antes), así
     que después de guardar algo nadie ve el dato viejo. La cola lo vuelve a
     traer en cuanto la pantalla queda quieta. */

const cache = new Map()      // path → { data, ts, sucio }
const enCurso = new Map()    // path → promesa del GET que ya salió
let generacion = 0           // sube con cada escritura: lo pedido antes no vale
let activos = 0              // pedidos de la pantalla en curso (no cuentan los de la cola)
const esperandoQuietud = new Set()

// Un dato recién traído no se vuelve a pedir enseguida: si la cola lo trajo
// hace un momento, entrar a la pestaña no dispara un segundo pedido igual.
const FRESCO_MS = 15000

function avisarSiQuieto() {
  if (activos > 0) return
  for (const fn of [...esperandoQuietud]) fn()
}

export const estaQuieto = () => activos === 0

/** Promesa que se cumple cuando no queda ningún pedido de pantalla en curso. */
export function cuandoQuieto() {
  if (activos === 0) return Promise.resolve()
  return new Promise((resolve) => {
    const fn = () => { esperandoQuietud.delete(fn); resolve() }
    esperandoQuietud.add(fn)
  })
}

async function request(path, options = {}) {
  const { fondo, ...fetchOptions } = options
  if (!fondo) activos++
  try {
    const res = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: fetchOptions.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      ...fetchOptions,
    })

    if (res.status === 401) {
      // La sesión venció (o nunca existió): avisamos para que la app vuelva al login.
      // El chequeo inicial de /auth/session no cuenta, ahí todavía no hay nada que cortar.
      if (path !== '/auth/session' && path !== '/auth/login') {
        olvidarTodo()
        window.dispatchEvent(new CustomEvent('sesion-vencida'))
      }
      // El mensaje es el del servidor: en un login fallido dice "Usuario o
      // contraseña incorrectos", que es lo que hay que mostrar.
      const cuerpo = await res.json().catch(() => null)
      throw new ApiError(cuerpo?.error || 'No autenticado', 401)
    }

    const isJson = res.headers.get('content-type')?.includes('application/json')
    const data = isJson ? await res.json().catch(() => null) : null

    if (!res.ok) {
      throw new ApiError(data?.error || `Error ${res.status}`, res.status)
    }
    return data
  } finally {
    if (!fondo) {
      activos--
      // Se avisa en la vuelta siguiente: si la pantalla encadena otro pedido
      // con lo que acaba de llegar, la cola no se le mete en el medio.
      setTimeout(avisarSiQuieto, 0)
    }
  }
}

/** GET de red, compartiendo el pedido si el mismo path ya salió (después de la última escritura).
    Sólo se guarda en el caché lo que se pidió para eso (`guardar`): las búsquedas
    sueltas no tienen por qué ir llenando la memoria. */
function traer(path, { fondo = false, guardar = false } = {}) {
  const previo = enCurso.get(path)
  if (previo && previo.gen === generacion) {
    // Si la pantalla se suma a un pedido que había largado la cola, ahora
    // es de la pantalla: la cola no avanza hasta que llegue.
    if (!fondo) {
      activos++
      previo.promesa.finally(() => { activos--; setTimeout(avisarSiQuieto, 0) }).catch(() => {})
    }
    return previo.promesa
  }
  const gen = generacion
  const promesa = request(path, { fondo })
    .then((data) => {
      // Se guarda una copia: si una pantalla ordena o toca en el lugar lo que
      // recibió, el caché no se entera.
      if (gen === generacion && (guardar || cache.has(path))) {
        cache.set(path, { data: structuredClone(data), ts: Date.now(), sucio: false })
      }
      return data
    })
    .finally(() => { if (enCurso.get(path)?.promesa === promesa) enCurso.delete(path) })
  enCurso.set(path, { promesa, gen })
  return promesa
}

function getConCache(path, alActualizar) {
  const entrada = cache.get(path)
  if (!entrada || entrada.sucio) return traer(path, { guardar: true })
  // Hay dato limpio: se muestra ya. Si no es de recién, se revisa por atrás.
  if (Date.now() - entrada.ts > FRESCO_MS) {
    const gen = generacion
    const antes = JSON.stringify(entrada.data)
    traer(path, { guardar: true })
      .then((data) => {
        if (gen === generacion && JSON.stringify(data) !== antes) alActualizar(data)
      })
      .catch(() => {})
  }
  return Promise.resolve(structuredClone(entrada.data))
}

/** Lo que pide la cola de precarga: no frena a la pantalla, y no repite lo fresco. */
export function precargar(path) {
  const entrada = cache.get(path)
  if (entrada && !entrada.sucio && Date.now() - entrada.ts < FRESCO_MS * 8) return Promise.resolve(entrada.data)
  return traer(path, { fondo: true, guardar: true })
}

/** El dato que hay en el caché para un path (limpio), o undefined. */
export function enCache(path) {
  const entrada = cache.get(path)
  return entrada && !entrada.sucio ? structuredClone(entrada.data) : undefined
}

/** Después de una escritura: nada de lo guardado se vuelve a mostrar sin pedirlo de nuevo. */
function ensuciarTodo() {
  generacion++
  enCurso.clear()
  for (const entrada of cache.values()) entrada.sucio = true
  window.dispatchEvent(new CustomEvent('datos-cambiaron'))
}

/** Al salir, al vencer la sesión o al entrar con otra cuenta. */
export function olvidarTodo() {
  generacion++
  enCurso.clear()
  cache.clear()
}

async function escribir(path, options) {
  // Antes y después: lo que se pida mientras la escritura viaja tampoco vale.
  if (!path.startsWith('/auth/')) ensuciarTodo()
  try {
    return await request(path, options)
  } finally {
    // También si falló: no se sabe qué alcanzó a cambiar del otro lado.
    if (path.startsWith('/auth/')) olvidarTodo()
    else ensuciarTodo()
  }
}

export const api = {
  // Con `alActualizar` el GET usa el caché (ver arriba): devuelve al instante
  // lo que haya y, si el servidor trae algo distinto, se lo pasa a alActualizar.
  // Sin eso es un GET de siempre (sólo comparte el pedido si ya hay uno igual).
  get: (path, { alActualizar } = {}) => (alActualizar ? getConCache(path, alActualizar) : traer(path)),
  post: (path, body) => escribir(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (path, body) => escribir(path, { method: 'PUT', body: JSON.stringify(body) }),
  // El body es opcional: casi todos los DELETE identifican el recurso por la
  // URL, pero el de precios propios necesita mandar servicio + lista.
  del: (path, body) => escribir(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
}

export { ApiError }
