import type { FilterState } from '../types'
import { apiFetch } from './http'

/**
 * Permalinks: the view you are looking at, as ten characters someone can paste.
 *
 * The whole state could have gone in the URL fragment and skipped the server entirely.
 * It does not, for two reasons. A fragment is never sent to the server, so no crawler
 * could ever build a preview card for a link; and a full filter set encoded inline makes
 * a URL that chat clients truncate and mail clients wrap. What the visitor copies here is
 * `?v=` plus ten characters, and the state lives in `shared_views`.
 *
 * The slug is a digest of the state, not a random string, so sharing the same view twice
 * gives back the same link — see `server/app/share.py` for why, and for the rule that a
 * link carries a focused planet *or* a camera but never both.
 */

export interface CameraPoseDto {
  position: [number, number, number]
  target: [number, number, number]
}

/** What the server stores. Absent fields mean "left at the default", not "unknown". */
export interface SharedState {
  version: number
  /** Only the filters the sharer actually changed. */
  filters?: Partial<FilterState>
  /** Planet id, when one was selected. */
  focus?: string
  /** Only ever present when nothing was selected. */
  camera?: CameraPoseDto
  /** Absent means the 3D map, which is the default. */
  view?: '3d' | 'table'
  /** Present only when the time machine was open. */
  timelineYear?: number
}

/** What the client sends. The server strips defaults and decides what is worth keeping. */
export interface SharedViewInput {
  filters?: FilterState
  focus?: string
  camera?: CameraPoseDto
  view?: '3d' | 'table'
  timelineYear?: number
}

export interface ShareLink {
  slug: string
  state: SharedState
  createdAt: string
  viewCount: number
}

/** The query parameter a shared link travels in. */
export const SHARE_PARAM = 'v'

/**
 * The link to hand to a person: `<origin>/s/<slug>`.
 *
 * Not `?v=<slug>`, even though that is the URL the map itself reads. `/s/<slug>` is
 * served by the API, which means it can carry Open Graph tags describing *this* view —
 * the planet, its measurements, a rendered card. A built `index.html` cannot: it is one
 * static file for every link there will ever be, and the state lives in a database it has
 * never heard of. So the shared link goes through the API, which bounces the browser to
 * `?v=<slug>` immediately.
 *
 * The cost is that `/s/` has to reach the API. In development the Vite proxy forwards it;
 * in production the same reverse proxy that already serves `/api/v1` needs one more rule.
 * That is written down in the README next to the deploy notes, because a share link that
 * 404s is the kind of breakage nobody notices until somebody else clicks it.
 */
export function shareLinkFor(slug: string): string {
  const url = new URL(window.location.href)
  url.search = ''
  url.hash = ''
  url.pathname = `/s/${slug}`
  return url.toString()
}

/** The preview card for a link — the picture a chat client unfurls, shown before sending. */
export function shareCardFor(slug: string): string {
  return `/s/${slug}/card.png`
}

/** The slug this page was opened with, if any. */
export function slugFromLocation(): string | null {
  return new URLSearchParams(window.location.search).get(SHARE_PARAM)
}

/**
 * Mint the link for a view.
 *
 * The full filter object is sent, defaults and all, rather than diffed here first: which
 * values count as defaults is a rule, and the rule lives in one place — on the server,
 * next to the hash that depends on it. Diffing in both would be two copies of it.
 */
export async function createShare(input: SharedViewInput): Promise<ShareLink> {
  return apiFetch<ShareLink>('/v1/share', { method: 'POST', body: input })
}

export async function fetchShare(slug: string, signal?: AbortSignal): Promise<ShareLink> {
  return apiFetch<ShareLink>(`/v1/share/${encodeURIComponent(slug)}`, { signal })
}
