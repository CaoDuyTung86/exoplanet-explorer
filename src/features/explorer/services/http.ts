/**
 * Where our API lives, and the one fetch wrapper the authenticated endpoints share.
 *
 * The catalog endpoints are anonymous and cacheable, so they use plain `fetch`. Anything
 * behind a login has to send the session cookie, which cross-origin requests do not do
 * unless asked — hence `credentials: 'include'` in one place rather than at ten call
 * sites where one of them would eventually be forgotten.
 */

export function apiBase(): string {
  // Falls back to a same-origin /api prefix, which the Vite dev server proxies.
  return (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '/api'
}

/** The WebSocket origin for the same API, http(s) swapped for ws(s). */
export function wsUrl(path: string): string {
  const base = apiBase()

  if (/^https?:/i.test(base)) {
    return base.replace(/^http/i, 'ws') + path
  }

  // A relative base means same-origin through the dev proxy.
  const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${window.location.host}${base}${path}`
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

/**
 * Calls an endpoint that may require a session and returns the parsed JSON body.
 *
 * FastAPI reports problems as `{"detail": "..."}`, and those strings are written to be
 * shown to a person, so they are surfaced rather than replaced with a generic message.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, {
    method: options.method ?? 'GET',
    // Without this the session cookie is not sent, and every /me endpoint 401s.
    credentials: 'include',
    headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal,
  })

  if (!response.ok) {
    let detail = `Request failed with ${response.status}`
    try {
      const payload = (await response.json()) as { detail?: unknown }
      if (typeof payload.detail === 'string') detail = payload.detail
    } catch {
      // A non-JSON error body (a proxy's HTML 502 page, say) leaves the default message.
    }
    throw new ApiError(detail, response.status)
  }

  return (await response.json()) as T
}
