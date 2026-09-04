import type { ProcessedPlanet } from '../types'
import { X, Globe, Thermometer, Ruler, Weight, Telescope, Star, Orbit, Bookmark } from 'lucide-react'
import { useExplorerStore } from '../stores/explorerStore'
import { useAccountStore } from '../stores/accountStore'
import { HabitabilityGauge } from './HabitabilityGauge'
import { PlanetRevisions } from './PlanetRevisions'
import { useTranslation } from 'react-i18next'
import { translateTerm } from '../lib/astronomyDictionary'

function formatNumber(n: number | null, decimals = 1): string {
  if (n === null || n === undefined) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: decimals })
}

export function PlanetDetailCard() {
  const { t, i18n } = useTranslation()
  const planet = useExplorerStore((s) => s.selectedPlanet)
  const setSelectedPlanet = useExplorerStore((s) => s.setSelectedPlanet)
  const showComparison = useExplorerStore((s) => s.showComparison)
  const setShowComparison = useExplorerStore((s) => s.setShowComparison)
  const user = useAccountStore((s) => s.user)
  const bookmarkedIds = useAccountStore((s) => s.bookmarkedIds)
  const toggleBookmark = useAccountStore((s) => s.toggleBookmark)

  if (!planet) return null

  // The button is only meaningful with somewhere to save to, so it is hidden rather
  // than shown disabled for a signed-out visitor.
  const isBookmarked = bookmarkedIds.has(planet.id)

  const earthComparison = getEarthComparison(planet, t)

  return (
    <div className='pointer-events-auto absolute left-2 right-2 bottom-2 md:left-auto md:bottom-auto md:right-4 md:top-4 z-30 w-auto md:w-[380px] max-h-[50vh] md:max-h-[calc(100vh-8rem)] overflow-y-auto rounded-2xl border border-slate-300 dark:border-white/10 bg-slate-950/90 shadow-2xl shadow-primary/10 backdrop-blur-xl'>
      {/* Header */}
      <div className='relative border-b border-slate-300 dark:border-white/10 p-5'>
        <div className='absolute right-3 top-3 flex items-center gap-1'>
          {user && (
            <button
              onClick={() => toggleBookmark(planet.id)}
              title={t(isBookmarked ? 'account.removeBookmark' : 'account.addBookmark')}
              className={`rounded-lg p-1.5 transition-colors ${
                isBookmarked
                  ? 'text-amber-400 hover:bg-amber-500/10'
                  : 'text-slate-500 dark:text-white/40 hover:bg-slate-200 dark:hover:bg-white/10 hover:text-amber-400'
              }`}
            >
              <Bookmark className={`h-4 w-4 ${isBookmarked ? 'fill-current' : ''}`} />
            </button>
          )}
          <button
            onClick={() => setSelectedPlanet(null)}
            className='rounded-lg p-1.5 text-slate-500 dark:text-slate-400 dark:text-white/40 transition-colors hover:bg-slate-200 dark:bg-white/10 hover:text-slate-900 dark:text-white'
          >
            <X className='h-4 w-4' />
          </button>
        </div>

        <div className={user ? 'pr-16' : 'pr-8'}>
          <span className='mb-1 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary'>
            {translateTerm(planet.sizeCategory, i18n.language)}
          </span>
          <h2 className='text-xl font-bold text-slate-900 dark:text-white'>{planet.pl_name}</h2>
          <p className='mt-0.5 flex items-center gap-1.5 text-sm text-slate-600 dark:text-white/50'>
            <Star className='h-3.5 w-3.5' />
            {t('detailCard.hostStar')}: <span className='font-medium text-slate-700 dark:text-white/70'>{planet.hostname}</span>
          </p>
        </div>
      </div>

      {/* Habitability Gauge */}
      <div className='border-b border-slate-300 dark:border-white/10 p-5'>
        <HabitabilityGauge score={planet.habitabilityScore} />
      </div>

      {/* Stats Grid */}
      <div className='grid grid-cols-2 gap-px border-b border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/5'>
        <StatCell
          icon={<Ruler className='h-3.5 w-3.5 text-blue-400' />}
          label={t('detailCard.radius')}
          value={planet.pl_rade !== null ? `${formatNumber(planet.pl_rade)} R⊕` : '—'}
          sub={earthComparison.radius}
        />
        <StatCell
          icon={<Weight className='h-3.5 w-3.5 text-amber-400' />}
          label={t('detailCard.mass')}
          value={planet.pl_bmasse !== null ? `${formatNumber(planet.pl_bmasse)} M⊕` : '—'}
          sub={earthComparison.mass}
        />
        <StatCell
          icon={<Thermometer className='h-3.5 w-3.5 text-red-400' />}
          label={t('detailCard.temperature')}
          value={planet.pl_eqt !== null ? `${formatNumber(planet.pl_eqt, 0)} K` : '—'}
          sub={planet.pl_eqt !== null ? `${Math.round(planet.pl_eqt - 273)}°C` : undefined}
        />
        <StatCell
          icon={<Globe className='h-3.5 w-3.5 text-emerald-400' />}
          label={t('detailCard.distance')}
          value={`${formatNumber(planet.distanceLy, 1)} ly`}
          sub={t('detailCard.lightYears')}
        />
        <StatCell
          icon={<Orbit className='h-3.5 w-3.5 text-purple-400' />}
          label={t('detailCard.orbitPeriod')}
          value={planet.pl_orbper !== null ? `${formatNumber(planet.pl_orbper)} ${t('detailCard.days')}` : '—'}
          sub={planet.pl_orbper !== null && planet.pl_orbper > 365 ? `~${(planet.pl_orbper / 365.25).toFixed(1)} ${t('detailCard.year').toLowerCase()}s` : undefined}
        />
        <StatCell
          icon={<Telescope className='h-3.5 w-3.5 text-cyan-400' />}
          label={t('detailCard.discovery')}
          value={translateTerm(planet.discoverymethod, i18n.language)}
          sub={planet.disc_year !== null ? `${t('detailCard.year')} ${planet.disc_year}` : undefined}
        />
      </div>

      {/* Star info */}
      <div className='p-4 text-xs text-slate-600 dark:text-white/50'>
        <div className='mb-1 font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-white/30'>{t('detailCard.hostStarProperties')}</div>
        <div className='grid grid-cols-3 gap-2'>
          <div>
            <span className='block text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-white/30'>{t('detailCard.spectral')}</span>
            <span className='font-mono text-slate-700 dark:text-white/70'>{planet.st_spectype || '—'}</span>
          </div>
          <div>
            <span className='block text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-white/30'>{t('detailCard.temp')}</span>
            <span className='font-mono text-slate-700 dark:text-white/70'>{planet.st_teff ? `${planet.st_teff} K` : '—'}</span>
          </div>
          <div>
            <span className='block text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-white/30'>{t('detailCard.radius')}</span>
            <span className='font-mono text-slate-700 dark:text-white/70'>{planet.st_rad ? `${planet.st_rad} R☉` : '—'}</span>
          </div>
        </div>
        {planet.disc_telescope && (
          <div className='mt-2 border-t border-slate-200 dark:border-white/5 pt-2'>
            <span className='text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-white/30'>{t('detailCard.telescope')}: </span>
            <span className='text-slate-700 dark:text-white/60'>
              {planet.disc_telescope.includes('Multiple') ? t('detailCard.multipleTelescopes') : planet.disc_telescope}
            </span>
          </div>
        )}
      </div>

      {/* Measurement history — the part NASA's own API cannot answer, since it only
          ever serves the present. Solar System bodies are seeded by us and never
          revised, so the section would always be empty for them. */}
      {!planet.id.startsWith('sol-') && (
        <PlanetRevisions key={planet.id} planetId={planet.id} />
      )}

      {/* Earth Comparison Bar */}
      <div className='border-t border-slate-300 dark:border-white/10 bg-emerald-500/5 p-4'>
        <div className='mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-400/80'>
          {t('detailCard.comparedToEarth')}
        </div>
        <div className='space-y-2'>
          <ComparisonBar label={t('detailCard.size')} ratio={planet.pl_rade ?? 0} max={20} color='blue' />
          <ComparisonBar label={t('detailCard.mass')} ratio={Math.log10(Math.max(1, planet.pl_bmasse ?? 1))} max={4} color='amber' />
          <ComparisonBar label={t('detailCard.habitability')} ratio={planet.habitabilityScore} max={100} color='emerald' />
        </div>
      </div>

      {/* 3D Comparison Toggle */}
      <div className='border-t border-slate-300 dark:border-white/10 p-4 bg-black/20'>
        <div className='flex items-center justify-between'>
          <div className='flex items-center gap-2'>
            <Globe className='h-4 w-4 text-blue-400' />
            <div>
              <div className='text-xs font-semibold text-white/90'>{t('detailCard.sizeComparison3d')}</div>
              <div className='text-[9px] text-slate-500 dark:text-slate-400 dark:text-white/40'>{t('detailCard.summonEarthJupiter')}</div>
            </div>
          </div>
          <button
            onClick={() => setShowComparison(!showComparison)}
            className={`relative flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
              showComparison ? 'bg-blue-500' : 'bg-slate-200 dark:bg-white/10'
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                showComparison ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Exit Spectate / Return Button */}
      <div className='border-t border-slate-300 dark:border-white/10 p-3 bg-slate-100 dark:bg-white/5'>
        <button
          onClick={() => setSelectedPlanet(null)}
          className='w-full rounded-xl bg-slate-200 dark:bg-white/10 py-2 text-xs font-semibold text-slate-900 dark:text-white hover:bg-primary hover:text-slate-900 dark:text-white transition-all flex items-center justify-center gap-2 border border-slate-300 dark:border-white/10 shadow-lg'
        >
          <span>←</span> {t('controls.backToMap')}
        </button>
      </div>
    </div>
  )
}

function StatCell({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className='bg-slate-950/50 p-3'>
      <div className='mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-white/40'>
        {icon} {label}
      </div>
      <div className='font-mono text-sm font-semibold text-white/90'>{value}</div>
      {sub && <div className='mt-0.5 text-[10px] text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-white/30'>{sub}</div>}
    </div>
  )
}

function ComparisonBar({ label, ratio, max, color }: { label: string; ratio: number; max: number; color: string }) {
  const pct = Math.min(100, (ratio / max) * 100)
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    emerald: 'bg-emerald-500',
  }
  return (
    <div className='flex items-center gap-2'>
      <span className='w-16 text-[10px] text-slate-500 dark:text-slate-400 dark:text-white/40'>{label}</span>
      <div className='h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5'>
        <div
          className={`h-full rounded-full transition-all duration-700 ${colorMap[color] || 'bg-primary'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className='w-10 text-right font-mono text-[10px] text-slate-600 dark:text-white/50'>{ratio.toFixed(1)}</span>
    </div>
  )
}

function getEarthComparison(planet: ProcessedPlanet, t: (key: string) => string) {
  return {
    radius: planet.pl_rade !== null
      ? planet.pl_rade < 0.9 ? t('detailCard.comparison.smallerThanEarth') : planet.pl_rade <= 1.1 ? t('detailCard.comparison.earthSized') : `${planet.pl_rade.toFixed(1)}${t('detailCard.comparison.earthRadiiMultiple')}`
      : undefined,
    mass: planet.pl_bmasse !== null
      ? planet.pl_bmasse < 0.8 ? t('detailCard.comparison.lighterThanEarth') : planet.pl_bmasse <= 1.2 ? t('detailCard.comparison.earthMass') : `${planet.pl_bmasse.toFixed(1)}${t('detailCard.comparison.earthMassMultiple')}`
      : undefined,
  }
}
