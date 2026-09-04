import { useEffect, useMemo, useState } from 'react'
import { Sparkles, CornerDownRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useExplorerStore } from '../stores/explorerStore'
import { translateTerm } from '../lib/astronomyDictionary'
import {
  fetchSimilarPlanets,
  type FeatureName,
  type SimilarPlanet,
  type SimilarPlanets as SimilarPlanetsPayload,
} from '../services/similarityApi'

/**
 * The nearest worlds to this one in feature space.
 *
 * The map answers "what is near me"; this answers "what is like me", which is a
 * different question and not one you can eyeball. The server ranks by Euclidean distance
 * over standardised radius, mass, insolation and stellar temperature — see
 * `similarityApi` for why those four.
 *
 * The percentage is a reading of that distance, so it is drawn as a bar rather than
 * printed as a figure with decimals: it orders the list, and claiming more precision
 * than that would be a lie about what it is. The ratios beside it are the checkable
 * part — "1.6x the radius" is a comparison of two measured numbers, and a dimension
 * either planet is missing is simply left out rather than filled in.
 */

/** Short label for a ratio chip, keyed off the feature name. */
const RATIO_ORDER: FeatureName[] = ['pl_rade', 'pl_bmasse', 'insolation', 'st_teff']

function formatRatio(value: number): string {
  // Below 0.1x or above 100x the decimals stop meaning anything at chip size.
  if (value >= 100 || value < 0.1) return `${Math.round(value)}x`
  return `${value.toFixed(value < 10 ? 2 : 1)}x`
}

export function SimilarPlanets({ planetId }: { planetId: string }) {
  const { t, i18n } = useTranslation()
  const [payload, setPayload] = useState<SimilarPlanetsPayload | null>(null)
  const [failed, setFailed] = useState(false)

  // The search runs over the whole catalog, not over what is currently on screen — a
  // resemblance does not stop existing because a slider is narrowed. But flying to a
  // planet the filters have removed lands the camera on empty space, so those rows say
  // so rather than looking identical to the ones that are actually out there.
  const filteredPlanets = useExplorerStore((s) => s.filteredPlanets)
  const onScreen = useMemo(
    () => new Set(filteredPlanets.map((p) => p.id)),
    [filteredPlanets]
  )

  // Mounted with `key={planet.id}`, so selecting another planet gets fresh state rather
  // than briefly showing the previous planet's neighbours.
  useEffect(() => {
    const controller = new AbortController()

    fetchSimilarPlanets(planetId, 6, controller.signal)
      .then(setPayload)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('similar planets unavailable', error)
        setFailed(true)
      })

    return () => controller.abort()
  }, [planetId])

  // The frontend still runs with no backend at all, falling back to NASA directly. There
  // is no similarity index in that mode, so the section removes itself instead of
  // sitting there explaining an outage.
  if (failed) return null

  const flyTo = (id: string) => {
    const planet = useExplorerStore.getState().planets.find((p) => p.id === id)
    if (planet) useExplorerStore.getState().setSelectedPlanet(planet)
  }

  return (
    <div className='border-b border-slate-300 p-5 dark:border-white/10'>
      <h3 className='mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40'>
        <Sparkles className='h-3.5 w-3.5 text-fuchsia-400' />
        {t('similar.title')}
      </h3>

      {payload === null ? (
        <div className='mt-2 space-y-2'>
          <div className='h-6 animate-pulse rounded bg-white/5' />
          <div className='h-6 animate-pulse rounded bg-white/5' />
        </div>
      ) : !payload.available || payload.neighbours.length === 0 ? (
        <p className='text-[11px] leading-snug text-slate-500'>{t('similar.empty')}</p>
      ) : (
        <>
          <p className='text-[10px] leading-snug text-slate-500'>{t('similar.basis')}</p>
          <ul className='mt-2 space-y-2'>
            {payload.neighbours.map((neighbour) => (
              <NeighbourRow
                key={neighbour.id}
                neighbour={neighbour}
                onSelect={flyTo}
                hiddenByFilters={!onScreen.has(neighbour.id)}
                language={i18n.language}
                t={t}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function NeighbourRow({
  neighbour,
  onSelect,
  hiddenByFilters,
  language,
  t,
}: {
  neighbour: SimilarPlanet
  onSelect: (id: string) => void
  hiddenByFilters: boolean
  language: string
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  const ratios = RATIO_ORDER.filter((f) => neighbour.ratios[f] !== undefined)

  return (
    <li>
      <button
        onClick={() => onSelect(neighbour.id)}
        title={t(hiddenByFilters ? 'similar.hiddenByFilters' : 'similar.flyTo', {
          name: neighbour.name,
        })}
        className={`group w-full rounded-lg border border-transparent p-1.5 text-left transition-colors hover:border-fuchsia-400/30 hover:bg-fuchsia-500/5 ${
          hiddenByFilters ? 'opacity-60' : ''
        }`}
      >
        <div className='flex items-baseline justify-between gap-2'>
          <span className='flex min-w-0 items-center gap-1 text-xs font-semibold text-white/90'>
            <CornerDownRight className='h-3 w-3 shrink-0 text-fuchsia-500/60' />
            <span className='truncate'>{neighbour.name}</span>
          </span>
          <span className='shrink-0 font-mono text-[10px] text-fuchsia-300'>
            {neighbour.match}%
          </span>
        </div>

        {/* The bar carries the ordering; the number above it is the same fact in text. */}
        <div className='mt-1 h-1 overflow-hidden rounded-full bg-white/10'>
          <div
            className='h-full rounded-full bg-fuchsia-400/70 transition-all duration-500'
            style={{ width: `${neighbour.match}%` }}
          />
        </div>

        <div className='mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-white/40'>
          <span>{translateTerm(neighbour.sizeCategory, language)}</span>
          {hiddenByFilters && (
            <span className='rounded bg-amber-500/10 px-1 text-amber-500/80'>
              {t('similar.filteredOut')}
            </span>
          )}
          {neighbour.distanceLy !== null && !neighbour.isSolarSystem && (
            <span className='font-mono'>{Math.round(neighbour.distanceLy)} ly</span>
          )}
          {ratios.map((field) => (
            <span key={field} className='font-mono text-white/50'>
              {formatRatio(neighbour.ratios[field] as number)}{' '}
              <span className='text-white/30'>
                {t(`similar.fields.${field}`)}
              </span>
            </span>
          ))}
        </div>
      </button>
    </li>
  )
}
