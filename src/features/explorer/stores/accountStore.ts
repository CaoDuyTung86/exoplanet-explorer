import { create } from 'zustand'
import { ApiError, apiFetch } from '../services/http'
import type { FilterState } from '../types'

export interface AccountUser {
  id: number
  email: string
  displayName: string
}

export interface Bookmark {
  planetId: string
  note: string | null
  createdAt: string
  planetName: string
  hostname: string
  habitabilityScore: number
  distanceLy: number | null
  sizeCategory: string
}

export interface SavedFilter {
  id: number
  name: string
  filters: Partial<FilterState>
  updatedAt: string
}

interface AccountState {
  user: AccountUser | null
  /** Null until the first /auth/me answers, so the UI can avoid flashing "Sign in". */
  ready: boolean
  bookmarks: Bookmark[]
  /** Membership test for the bookmark button, without scanning the list every render. */
  bookmarkedIds: Set<string>
  savedFilters: SavedFilter[]
  busy: boolean
  error: string | null

  loadSession: () => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<boolean>
  login: (email: string, password: string) => Promise<boolean>
  logout: () => Promise<void>
  toggleBookmark: (planetId: string) => Promise<void>
  saveFilterPreset: (name: string, filters: FilterState) => Promise<boolean>
  deleteFilterPreset: (id: number) => Promise<void>
  clearError: () => void
}

function messageOf(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}

export const useAccountStore = create<AccountState>((set, get) => ({
  user: null,
  ready: false,
  bookmarks: [],
  bookmarkedIds: new Set<string>(),
  savedFilters: [],
  busy: false,
  error: null,

  clearError: () => set({ error: null }),

  /**
   * Everything a signed-in visitor owns, fetched together after a login and on boot.
   * Kept private because nothing outside this store should be able to load half of it.
   */
  loadSession: async () => {
    try {
      const { user } = await apiFetch<{ user: AccountUser | null }>('/v1/auth/me')
      if (!user) {
        set({ user: null, ready: true, bookmarks: [], bookmarkedIds: new Set(), savedFilters: [] })
        return
      }

      const [bookmarks, filters] = await Promise.all([
        apiFetch<{ bookmarks: Bookmark[] }>('/v1/me/bookmarks'),
        apiFetch<{ filters: SavedFilter[] }>('/v1/me/filters'),
      ])

      set({
        user,
        ready: true,
        bookmarks: bookmarks.bookmarks,
        bookmarkedIds: new Set(bookmarks.bookmarks.map((b) => b.planetId)),
        savedFilters: filters.filters,
      })
    } catch {
      // The API being down is not a sign-in failure. The map still works anonymously,
      // so this stays silent and simply leaves the visitor signed out.
      set({ user: null, ready: true })
    }
  },

  register: async (email, password, displayName) => {
    set({ busy: true, error: null })
    try {
      await apiFetch<{ user: AccountUser }>('/v1/auth/register', {
        method: 'POST',
        body: { email, password, displayName },
      })
      await get().loadSession()
      set({ busy: false })
      return true
    } catch (error) {
      set({ busy: false, error: messageOf(error) })
      return false
    }
  },

  login: async (email, password) => {
    set({ busy: true, error: null })
    try {
      await apiFetch<{ user: AccountUser }>('/v1/auth/login', {
        method: 'POST',
        body: { email, password },
      })
      await get().loadSession()
      set({ busy: false })
      return true
    } catch (error) {
      set({ busy: false, error: messageOf(error) })
      return false
    }
  },

  logout: async () => {
    try {
      await apiFetch('/v1/auth/logout', { method: 'POST' })
    } finally {
      // Even if the request failed, the local state must not keep claiming a session.
      set({ user: null, bookmarks: [], bookmarkedIds: new Set(), savedFilters: [], error: null })
    }
  },

  toggleBookmark: async (planetId) => {
    const { user, bookmarkedIds } = get()
    if (!user) return

    const wasBookmarked = bookmarkedIds.has(planetId)
    try {
      if (wasBookmarked) {
        await apiFetch(`/v1/me/bookmarks/${encodeURIComponent(planetId)}`, { method: 'DELETE' })
      } else {
        await apiFetch('/v1/me/bookmarks', { method: 'POST', body: { planetId } })
      }
      // Re-read rather than patching locally: the list carries catalog columns the
      // client would otherwise have to reconstruct, and this is a rare click.
      const { bookmarks } = await apiFetch<{ bookmarks: Bookmark[] }>('/v1/me/bookmarks')
      set({ bookmarks, bookmarkedIds: new Set(bookmarks.map((b) => b.planetId)) })
    } catch (error) {
      set({ error: messageOf(error) })
    }
  },

  saveFilterPreset: async (name, filters) => {
    const { user } = get()
    if (!user) return false

    set({ busy: true, error: null })
    try {
      await apiFetch('/v1/me/filters', { method: 'POST', body: { name, filters } })
      const { filters: saved } = await apiFetch<{ filters: SavedFilter[] }>('/v1/me/filters')
      set({ savedFilters: saved, busy: false })
      return true
    } catch (error) {
      set({ busy: false, error: messageOf(error) })
      return false
    }
  },

  deleteFilterPreset: async (id) => {
    try {
      await apiFetch(`/v1/me/filters/${id}`, { method: 'DELETE' })
      set({ savedFilters: get().savedFilters.filter((f) => f.id !== id) })
    } catch (error) {
      set({ error: messageOf(error) })
    }
  },
}))
