class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: 'include',
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    ...options,
  })

  if (res.status === 401) {
    // La sesión venció (o nunca existió): avisamos para que la app vuelva al login.
    // El chequeo inicial de /auth/session no cuenta, ahí todavía no hay nada que cortar.
    if (path !== '/auth/session' && path !== '/auth/login') {
      window.dispatchEvent(new CustomEvent('sesion-vencida'))
    }
    throw new ApiError('No autenticado', 401)
  }

  const isJson = res.headers.get('content-type')?.includes('application/json')
  const data = isJson ? await res.json().catch(() => null) : null

  if (!res.ok) {
    throw new ApiError(data?.error || `Error ${res.status}`, res.status)
  }
  return data
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: body instanceof FormData ? body : JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  // El body es opcional: casi todos los DELETE identifican el recurso por la
  // URL, pero el de precios propios necesita mandar servicio + lista.
  del: (path, body) => request(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) }),
}

export { ApiError }
