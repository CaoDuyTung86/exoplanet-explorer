import { useEffect, useState } from 'react'
import { ArrowRight, GitCommitVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  fetchPlanetHistory,
  type PlanetHistory,
  type RevisionValue,
} from '../services/timelineApi'

/**
 * How this planet's numbers were revised, run by run.
 *
 * This is the half of the time machine NASA's own API cannot serve. Their TAP service
 * returns the present and only the present: when a radius is refined from 2.1 to 1.8
 * Earth radii the old figure is simply gone. Our ingest diffs every run against the
 * stored row and keeps whatever it replaced, so the revisions are ours to show.
 *
 * A young database has nothing here yet, and that is the honest state of things rather
 * than an error — the section says so instead of rendering an empty box.
 */

/** Units for the fields the server is willing to report a revision on. */
const UNITS: Record<string, string> = {
  pl_rade: ' R⊕',
  pl_bmasse: ' M⊕',
  pl_eqt: ' K',
  pl_orbper: ' d',
  pl_orbsmax: ' AU',
  sy_dist: ' pc',
  st_teff: ' K',
  st_rad: ' R☉',
}

function formatValue(value: RevisionValue, field: string): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'number') {
    // Discovery year and habitability score are counts, not measurements.
    const decimals = field === 'disc_year' || field === 'habitability_score' ? 0 : 3
    return value.toLocaleString('en-US', { maximumFractionDigits: decimals }) + (UNITS[field] ?? '')
  }
  return value
}

export function PlanetRevisions({ planetId }: { planetId: string }) {
  const { t, i18n } = useTranslation()
  const [history, setHistory] = useState<PlanetHistory | null>(null)
  const [failed, setFailed] = useState(false)

  // Mounted with `key={planet.id}`, so selecting another planet gives this component
  // fresh state rather than briefly showing the previous planet's revisions.
  useEffect(() => {
    const controller = new AbortController()

    fetchPlanetHistory(planetId, controller.signal)
      .then(setHistory)
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        console.warn('planet history unavailable', error)
        setFailed(true)
      })

    return () => controller.abort()
  }, [planetId])

  if (failed) return null

  const dateFormat = new Intl.DateTimeFormat(i18n.language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className='border-b border-slate-300 p-5 dark:border-white/10'>
      <h3 className='mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40'>
        <GitCommitVertical className='h-3.5 w-3.5 text-cyan-400' />
        {t('revisions.title')}
      </h3>

      {history === null ? (
        <div className='h-8 animate-pulse rounded bg-white/5' />
      ) : history.revisions.length === 0 ? (
        <p className='text-[11px] leading-snug text-slate-500'>{t('revisions.empty')}</p>
      ) : (
        <ol className='mt-2 space-y-2.5'>
          {history.revisions.map((revision) => (
            <li
              // One history row per planet per run, but nothing in the schema enforces
              // that, so the timestamp joins the key rather than trusting it.
              key={`${revision.runId}-${revision.changedAt}`}
              className='border-l border-cyan-400/30 pl-3 text-[11px]'
            >
              <div className='mb-1 font-mono text-[10px] text-slate-500'>
                {dateFormat.format(new Date(revision.changedAt))}
              </div>
              {revision.changes.map((change) => (
                <div key={change.field} className='flex items-center gap-1.5 text-slate-400'>
                  <span className='w-20 shrink-0 truncate text-slate-500'>
                    {t(`revisions.fields.${change.field}`, { defaultValue: change.field })}
                  </span>
                  <span className='font-mono line-through decoration-slate-600'>
                    {formatValue(change.from, change.field)}
                  </span>
                  <ArrowRight className='h-3 w-3 shrink-0 text-cyan-500/60' />
                  <span className='font-mono font-semibold text-cyan-300'>
                    {formatValue(change.to, change.field)}
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
