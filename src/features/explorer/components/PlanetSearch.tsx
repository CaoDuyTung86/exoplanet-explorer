import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search, CornerDownLeft, Star, Globe, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useExplorerStore } from '../stores/explorerStore'
import { translateTerm } from '../lib/astronomyDictionary'
import {
  MIN_QUERY_LENGTH,
  localSearch,
  normalizeQuery,
  searchPlanets,
  type SearchResult,
} from '../services/searchApi'

/**
 * Find a planet by name — the one the visitor half-remembers.
 *
 * Deliberately not the sidebar's search box. That one *filters*: it decides which
 * planets are on the map, and something left typed in it quietly hides six thousand
 * worlds. This one *finds*: it takes you to one planet and changes nothing else. Same
 * distinction the time machine draws against the filters, for the same reason.
 *
 * The ranking is the server's — see `searchApi` for the punctuation fold and the trigram
 * fallback. Two things are the client's job and are done here:
 *
 * *A result the filters have hidden is labelled.* Flying to a planet the sliders
 * excluded lands the camera on empty space; saying so beats a row that looks identical
 * to one that is actually out there.
 *
 * *A typo match is labelled too.* Below the literal band the server is guessing at what
 * was meant, and a guess presented like an exact hit is the kind of small lie that makes
 * a person distrust the whole list.
 */

/** Below this score the server matched on trigram similarity, i.e. it forgave a typo. */
const FUZZY_BELOW = 0.6

/** Long enough that a fast typist issues one request per word, short enough to feel live. */
const DEBOUNCE_MS = 150

const RESULT_LIMIT = 8

/** What the last completed request answered, and which question it answered. */
interface Answer {
  query: string
  results: SearchResult[]
  /** True when the API could not be reached and the in-memory catalog answered instead. */
  offline: boolean
}

/**
 * Splits a name around the visitor's raw query so the match can be shown.
 *
 * Only literal, case-insensitive occurrences are highlighted. The server matches through
 * a fold that erases punctuation, so for `kepler452b` there is no honest span to mark in
 * `Kepler-452 b` — and inventing one would claim a match happened where it did not.
 */
function highlight(name: string, query: string): [string, string, string] | null {
  const needle = query.trim()
  if (needle.length < MIN_QUERY_LENGTH) return null

  const at = name.toLowerCase().indexOf(needle.toLowerCase())
  if (at < 0) return null

  return [name.slice(0, at), name.slice(at, at + needle.length), name.slice(at + needle.length)]
}

/**
 * The hotkey, and nothing else.
 *
 * The palette itself is mounted only while it is open, so every reopen starts from an
 * empty box rather than last week's query — no reset logic, just a fresh component.
 */
export function PlanetSearch() {
  const open = useExplorerStore((s) => s.searchOpen)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target !== null &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)

      const store = useExplorerStore.getState()

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        store.setSearchOpen(!store.searchOpen)
        return
      }
      // `/` is the other convention, but only when the visitor is not already typing
      // somewhere — in the sidebar's filter box a slash is a slash.
      if (event.key === '/' && !typing) {
        event.preventDefault()
        store.setSearchOpen(true)
        return
      }
      // Escape lives here rather than on the input so it still closes the palette after
      // the focus has moved into the result list.
      if (event.key === 'Escape' && store.searchOpen) {
        store.setSearchOpen(false)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null
  return <SearchPalette />
}

function SearchPalette() {
  const { t, i18n } = useTranslation()
  const setOpen = useExplorerStore((s) => s.setSearchOpen)
  const filteredPlanets = useExplorerStore((s) => s.filteredPlanets)

  const [query, setQuery] = useState('')
  const [answer, setAnswer] = useState<Answer>({ query: '', results: [], offline: false })
  const [active, setActive] = useState(0)

  const listRef = useRef<HTMLUListElement>(null)

  const onScreen = useMemo(
    () => new Set(filteredPlanets.map((p) => p.id)),
    [filteredPlanets]
  )

  const tooShort = normalizeQuery(query).length < MIN_QUERY_LENGTH
  // Derived rather than stored: a request is outstanding exactly when the box holds a
  // question the last answer did not answer.
  const pending = !tooShort && answer.query !== query
  // The previous answer stays on screen while the next one is in flight, so the list
  // does not blink empty between keystrokes.
  const results = tooShort ? [] : answer.results
  const activeIndex = Math.min(active, Math.max(0, results.length - 1))

  useEffect(() => {
    const controller = new AbortController()

    const timer = window.setTimeout(() => {
      if (normalizeQuery(query).length < MIN_QUERY_LENGTH) {
        setAnswer({ query, results: [], offline: false })
        return
      }

      searchPlanets(query, RESULT_LIMIT, controller.signal)
        .then((payload) => {
          setAnswer({ query, results: payload.results, offline: false })
          setActive(0)
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return
          // The app still runs with no API at all, against NASA directly. Ranking the
          // catalog already in memory is worse — no typo tolerance, because that needs
          // the index — but it is a search, and the banner says which one this is.
          console.warn('search API unavailable, ranking locally', error)
          const local = localSearch(useExplorerStore.getState().planets, query, RESULT_LIMIT)
          setAnswer({ query, results: local, offline: true })
          setActive(0)
        })
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  // Keep the highlighted row in view when the arrow keys walk past the fold.
  useEffect(() => {
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined
    node?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const choose = useCallback(
    (result: SearchResult) => {
      const planet = useExplorerStore.getState().planets.find((p) => p.id === result.id)
      if (!planet) return

      useExplorerStore.getState().setSelectedPlanet(planet)
      // A result found while the table is open should still be flown to; the camera and
      // the detail card both live in the 3D view.
      useExplorerStore.getState().setViewMode('3d')
      setOpen(false)
    },
    [setOpen]
  )

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Escape is handled by the window listener in `PlanetSearch`, so it closes the
    // palette from the result list too.
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(results.length === 0 ? 0 : (activeIndex + 1) % results.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(
        results.length === 0 ? 0 : (activeIndex - 1 + results.length) % results.length
      )
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const result = results[activeIndex]
      if (result) choose(result)
    }
  }

  return (
    <div
      className='fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/70 px-4 pt-[12vh] backdrop-blur-sm'
      onClick={() => setOpen(false)}
    >
      <div
        className='w-full max-w-xl overflow-hidden rounded-2xl border border-cyan-400/20 bg-slate-950/95 shadow-2xl'
        onClick={(event) => event.stopPropagation()}
      >
        <div className='flex items-center gap-3 border-b border-white/10 px-4'>
          <Search className='h-4 w-4 shrink-0 text-cyan-300/70' />
          <input
            // Mounted on open, so this is the focus the visitor asked for, not a steal.
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKey}
            placeholder={t('search.placeholder')}
            className='w-full bg-transparent py-3.5 text-sm text-white placeholder:text-white/25 focus:outline-none'
            autoComplete='off'
            spellCheck={false}
          />
          {pending && (
            <span className='h-3 w-3 shrink-0 animate-spin rounded-full border border-cyan-300/30 border-t-cyan-300' />
          )}
        </div>

        {answer.offline && (
          <div className='flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-[10px] text-amber-300/90'>
            <WifiOff className='h-3 w-3 shrink-0' />
            {t('search.offline')}
          </div>
        )}

        <ul ref={listRef} className='max-h-[50vh] overflow-y-auto py-1'>
          {tooShort ? (
            <li className='px-4 py-6 text-center text-[11px] text-white/30'>
              {t('search.hint')}
            </li>
          ) : results.length === 0 ? (
            <li className='px-4 py-6 text-center text-[11px] text-white/30'>
              {pending ? t('search.searching') : t('search.empty', { query: query.trim() })}
            </li>
          ) : (
            results.map((result, index) => {
              const parts = highlight(result.name, query)
              const hidden = !onScreen.has(result.id)

              return (
                <li key={result.id}>
                  <button
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(result)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                      index === activeIndex ? 'bg-cyan-500/10' : 'hover:bg-white/5'
                    }`}
                  >
                    {result.isHabitable ? (
                      <Globe className='h-3.5 w-3.5 shrink-0 text-emerald-400' />
                    ) : (
                      <Star className='h-3.5 w-3.5 shrink-0 text-white/20' />
                    )}

                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-xs font-semibold text-white/90'>
                        {parts ? (
                          <>
                            {parts[0]}
                            <mark className='bg-cyan-400/20 text-cyan-200'>{parts[1]}</mark>
                            {parts[2]}
                          </>
                        ) : (
                          result.name
                        )}
                      </span>
                      <span className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/40'>
                        {result.matchedOn === 'host' && (
                          <span className='rounded bg-cyan-500/10 px-1 text-cyan-300/80'>
                            {t('search.viaHost', { host: result.hostname })}
                          </span>
                        )}
                        {result.score < FUZZY_BELOW && (
                          <span className='rounded bg-fuchsia-500/10 px-1 text-fuchsia-300/80'>
                            {t('search.approximate')}
                          </span>
                        )}
                        {hidden && (
                          <span className='rounded bg-amber-500/10 px-1 text-amber-500/80'>
                            {t('search.filteredOut')}
                          </span>
                        )}
                        {result.sizeCategory && (
                          <span>{translateTerm(result.sizeCategory, i18n.language)}</span>
                        )}
                        {result.distanceLy !== null && !result.isSolarSystem && (
                          <span className='font-mono'>{Math.round(result.distanceLy)} ly</span>
                        )}
                        {result.discYear !== null && (
                          <span className='font-mono'>{result.discYear}</span>
                        )}
                      </span>
                    </span>

                    {index === activeIndex && (
                      <CornerDownLeft className='h-3.5 w-3.5 shrink-0 text-cyan-300/60' />
                    )}
                  </button>
                </li>
              )
            })
          )}
        </ul>

        <div className='flex items-center justify-between border-t border-white/10 px-4 py-2 text-[10px] text-white/30'>
          <span>{t('search.keys')}</span>
          <span className='font-mono'>{t('search.close')}</span>
        </div>
      </div>
    </div>
  )
}
