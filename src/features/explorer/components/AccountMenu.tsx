import { useEffect, useRef, useState } from 'react'
import { Bookmark, LogOut, Star, Trash2, User, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountStore } from '../stores/accountStore'
import { useExplorerStore } from '../stores/explorerStore'
import { DEFAULT_FILTERS } from '../types'

/**
 * The header's account control: a sign-in form when signed out, and the visitor's saved
 * planets when signed in.
 *
 * The panel is the only place a password is typed, so the inputs stay native `type
 * ="password"` fields with autocomplete hints the browser's password manager understands.
 */
export function AccountMenu() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const containerRef = useRef<HTMLDivElement>(null)

  const user = useAccountStore((s) => s.user)
  const ready = useAccountStore((s) => s.ready)
  const busy = useAccountStore((s) => s.busy)
  const error = useAccountStore((s) => s.error)
  const bookmarks = useAccountStore((s) => s.bookmarks)
  const login = useAccountStore((s) => s.login)
  const register = useAccountStore((s) => s.register)
  const logout = useAccountStore((s) => s.logout)
  const toggleBookmark = useAccountStore((s) => s.toggleBookmark)
  const clearError = useAccountStore((s) => s.clearError)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')

  // Click-outside and Escape, so the panel behaves like every other menu on the page.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const ok =
      mode === 'login'
        ? await login(email, password)
        : await register(email, password, displayName)

    if (ok) {
      // Never leave a password sitting in React state after it has been used.
      setPassword('')
      setEmail('')
      setDisplayName('')
      setOpen(false)
    }
  }

  const openBookmark = (planetId: string) => {
    const planet = useExplorerStore.getState().planets.find((p) => p.id === planetId)
    if (!planet) return
    // A bookmarked planet can easily be outside the active filters, so clear them first
    // — otherwise the map flies to something that is not being drawn.
    useExplorerStore.getState().setFilters(DEFAULT_FILTERS)
    useExplorerStore.getState().setSelectedPlanet(planet)
    setOpen(false)
  }

  return (
    <div className='relative' ref={containerRef}>
      <button
        onClick={() => {
          setOpen(!open)
          clearError()
        }}
        title={user ? user.displayName : t('account.signIn')}
        className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium backdrop-blur-md transition-all ${
          user
            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300'
            : 'border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
        }`}
      >
        <User className='h-3.5 w-3.5' />
        <span className='hidden sm:inline'>
          {!ready ? '…' : user ? user.displayName : t('account.signIn')}
        </span>
        {user && bookmarks.length > 0 && (
          <span className='rounded-full bg-cyan-500/20 px-1.5 text-[10px] font-semibold'>
            {bookmarks.length}
          </span>
        )}
      </button>

      {open && (
        <div className='absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-950/95 shadow-2xl backdrop-blur-xl'>
          {user ? (
            <div>
              <div className='flex items-start justify-between border-b border-slate-200 dark:border-white/10 p-4'>
                <div className='min-w-0'>
                  <p className='truncate text-sm font-semibold text-slate-900 dark:text-white'>
                    {user.displayName}
                  </p>
                  <p className='truncate text-[11px] text-slate-500 dark:text-white/40'>
                    {user.email}
                  </p>
                </div>
                <button
                  onClick={() => {
                    logout()
                    setOpen(false)
                  }}
                  className='flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 transition-colors hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                >
                  <LogOut className='h-3 w-3' /> {t('account.signOut')}
                </button>
              </div>

              <div className='max-h-80 overflow-y-auto p-2'>
                <p className='px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/30'>
                  {t('account.savedPlanets')} ({bookmarks.length})
                </p>

                {bookmarks.length === 0 ? (
                  <p className='px-2 py-3 text-[11px] leading-relaxed text-slate-500 dark:text-white/40'>
                    {t('account.noBookmarks')}
                  </p>
                ) : (
                  bookmarks.map((bookmark) => (
                    <div
                      key={bookmark.planetId}
                      className='group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-white/5'
                    >
                      <button
                        onClick={() => openBookmark(bookmark.planetId)}
                        className='flex min-w-0 flex-1 items-center gap-2 text-left'
                      >
                        <Star className='h-3 w-3 shrink-0 text-amber-400' />
                        <span className='min-w-0 flex-1'>
                          <span className='block truncate text-xs text-slate-800 dark:text-white/80'>
                            {bookmark.planetName}
                          </span>
                          <span className='block truncate text-[10px] text-slate-500 dark:text-white/30'>
                            {bookmark.hostname} · {Math.round(bookmark.habitabilityScore)}
                            {t('account.habitabilitySuffix')}
                          </span>
                        </span>
                      </button>
                      <button
                        onClick={() => toggleBookmark(bookmark.planetId)}
                        title={t('account.removeBookmark')}
                        className='shrink-0 rounded p-1 text-slate-400 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100'
                      >
                        <Trash2 className='h-3 w-3' />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className='p-4'>
              <div className='mb-3 flex items-center justify-between'>
                <div className='flex gap-1'>
                  {(['login', 'register'] as const).map((value) => (
                    <button
                      key={value}
                      type='button'
                      onClick={() => {
                        setMode(value)
                        clearError()
                      }}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        mode === value
                          ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300'
                          : 'text-slate-500 hover:text-slate-800 dark:text-white/40 dark:hover:text-white'
                      }`}
                    >
                      {t(value === 'login' ? 'account.signIn' : 'account.createAccount')}
                    </button>
                  ))}
                </div>
                <button
                  type='button'
                  onClick={() => setOpen(false)}
                  className='rounded p-1 text-slate-400 hover:text-slate-700 dark:hover:text-white'
                >
                  <X className='h-3.5 w-3.5' />
                </button>
              </div>

              <p className='mb-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-white/40'>
                <Bookmark className='mt-0.5 h-3 w-3 shrink-0' />
                {t('account.pitch')}
              </p>

              {mode === 'register' && (
                <input
                  type='text'
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder={t('account.displayName')}
                  autoComplete='nickname'
                  className='mb-2 w-full rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:border-cyan-500/50 focus:outline-none'
                />
              )}

              <input
                type='email'
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('account.email')}
                autoComplete='email'
                className='mb-2 w-full rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:border-cyan-500/50 focus:outline-none'
              />

              <input
                type='password'
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t('account.password')}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className='w-full rounded-lg border border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/5 px-3 py-2 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-white/20 focus:border-cyan-500/50 focus:outline-none'
              />

              {error && (
                <p className='mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-500 dark:text-red-300'>
                  {error}
                </p>
              )}

              <button
                type='submit'
                disabled={busy}
                className='mt-3 w-full rounded-lg bg-cyan-500/20 py-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300 transition-colors hover:bg-cyan-500/30 disabled:opacity-50'
              >
                {busy
                  ? t('account.working')
                  : t(mode === 'login' ? 'account.signIn' : 'account.createAccount')}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
