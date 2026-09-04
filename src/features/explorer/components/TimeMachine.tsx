import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { History, Pause, Play, SkipBack, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useExplorerStore, knownCountByYear } from '../stores/explorerStore'
import { fetchTimeline, type Timeline } from '../services/timelineApi'
import { translateTerm } from '../lib/astronomyDictionary'

/**
 * The time machine — replays the sky filling up from the first confirmed exoplanet to
 * today.
 *
 * The scrubbed year drives `PlanetCloud` through the store rather than through this
 * component's props, so playback never re-renders the 3D tree: the store slices a
 * pre-sorted prefix and the instanced mesh rewrites its matrices.
 *
 * Playback advances off `requestAnimationFrame` with a wall-clock accumulator, not a
 * `setInterval`. A background tab throttles both, but an accumulator resumes at the year
 * the elapsed time says it should be at instead of crawling through a backlog of ticks.
 */

/** Years per second. Slow enough to read the early years, fast enough to finish. */
const SPEEDS = [1, 2.5, 6] as const

export function TimeMachine() {
  const { t, i18n } = useTranslation()

  const enabled = useExplorerStore((s) => s.timelineEnabled)
  const setEnabled = useExplorerStore((s) => s.setTimelineEnabled)
  const year = useExplorerStore((s) => s.timelineYear)
  const setYear = useExplorerStore((s) => s.setTimelineYear)
  const playing = useExplorerStore((s) => s.timelinePlaying)
  const setPlaying = useExplorerStore((s) => s.setTimelinePlaying)
  const speed = useExplorerStore((s) => s.timelineSpeed)
  const setSpeed = useExplorerStore((s) => s.setTimelineSpeed)
  const range = useExplorerStore((s) => s.timelineRange)
  const setRange = useExplorerStore((s) => s.setTimelineRange)
  const timelineOrder = useExplorerStore((s) => s.timelineOrder)
  const setSelectedPlanet = useExplorerStore((s) => s.setSelectedPlanet)

  const [timeline, setTimeline] = useState<Timeline | null>(null)
  const [failed, setFailed] = useState(false)

  // The catalog's real year span comes from the server, so the scrubber cannot run past
  // the data or stop short of it.
  useEffect(() => {
    const controller = new AbortController()
    fetchTimeline(controller.signal)
      .then((data) => {
        setTimeline(data)
        if (data.minYear !== null && data.maxYear !== null) {
          setRange({ minYear: data.minYear, maxYear: data.maxYear })
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // The map is the feature; a missing timeline hides this panel and nothing else.
        console.warn('timeline unavailable', error)
        setFailed(true)
      })
    return () => controller.abort()
  }, [setRange])

  const byYear = useMemo(() => {
    const map = new Map<number, Timeline['years'][number]>()
    timeline?.years.forEach((entry) => map.set(entry.year, entry))
    return map
  }, [timeline])

  // Playback clock.
  useEffect(() => {
    if (!enabled || !playing) return

    let frame = 0
    let last = performance.now()
    let accumulated = 0

    const tick = (now: number) => {
      const elapsed = (now - last) / 1000
      last = now
      accumulated += elapsed * speed

      if (accumulated >= 1) {
        const steps = Math.floor(accumulated)
        accumulated -= steps
        const state = useExplorerStore.getState()
        const next = state.timelineYear + steps

        if (next >= state.timelineRange.maxYear) {
          state.setTimelineYear(state.timelineRange.maxYear)
          state.setTimelinePlaying(false)
          return
        }
        state.setTimelineYear(next)
      }
      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [enabled, playing, speed])

  // Space toggles playback, arrows step a year. Ignored while the visitor is typing in
  // the search box, which is the one place a space is a space.
  useEffect(() => {
    if (!enabled) return

    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      if (event.code === 'Space') {
        event.preventDefault()
        setPlaying(!useExplorerStore.getState().timelinePlaying)
      } else if (event.code === 'ArrowLeft') {
        setPlaying(false)
        setYear(useExplorerStore.getState().timelineYear - 1)
      } else if (event.code === 'ArrowRight') {
        setPlaying(false)
        setYear(useExplorerStore.getState().timelineYear + 1)
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled, setPlaying, setYear])

  const openNotable = useCallback(
    (planetId: string) => {
      const planet = timelineOrder.find((p) => p.id === planetId)
      if (planet) setSelectedPlanet(planet)
    },
    [timelineOrder, setSelectedPlanet]
  )

  if (failed) return null

  if (!enabled) {
    return (
      <div className='pointer-events-none absolute bottom-6 right-4 z-20'>
        <button
          onClick={() => setEnabled(true)}
          className='pointer-events-auto flex items-center gap-2 rounded-full border border-cyan-400/30 bg-slate-950/80 px-4 py-2 text-xs font-semibold text-cyan-200 shadow-xl backdrop-blur-md transition-all hover:border-cyan-300/60 hover:bg-cyan-500/10'
        >
          <History className='h-3.5 w-3.5' />
          {t('timeMachine.open')}
        </button>
      </div>
    )
  }

  const entry = byYear.get(year)
  // The catalog is what the mesh actually draws, so the count is read from it rather
  // than from the server's aggregate — the two differ whenever a filter is on.
  const visible = knownCountByYear(timelineOrder, year, range.maxYear)
  const span = Math.max(1, range.maxYear - range.minYear)
  const progress = ((year - range.minYear) / span) * 100

  return (
    <div className='pointer-events-auto absolute bottom-4 left-1/2 z-30 w-[min(46rem,calc(100%-2rem))] -translate-x-1/2 rounded-2xl border border-cyan-400/20 bg-slate-950/85 p-4 shadow-2xl shadow-cyan-500/10 backdrop-blur-xl'>
      <div className='mb-3 flex items-start justify-between gap-4'>
        <div className='flex items-baseline gap-3'>
          <span className='font-mono text-3xl font-bold tabular-nums text-cyan-300'>
            {year}
          </span>
          <div className='text-[11px] leading-tight text-slate-400'>
            <div>
              <span className='font-semibold text-slate-200'>
                {visible.toLocaleString()}
              </span>{' '}
              {t('timeMachine.known')}
            </div>
            {entry && entry.count > 0 && (
              <div className='text-cyan-400/80'>
                +{entry.count.toLocaleString()} {t('timeMachine.thisYear')}
                {entry.topMethod && (
                  <span className='text-slate-500'>
                    {' · '}
                    {translateTerm(entry.topMethod, i18n.language)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={() => setEnabled(false)}
          title={t('timeMachine.close')}
          className='rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-white'
        >
          <X className='h-4 w-4' />
        </button>
      </div>

      {/* Scrubber. The bar behind it is the same year axis, drawn as a histogram of
          discoveries so the 2014 and 2016 Kepler releases are visible as spikes. */}
      <div className='relative mb-2 h-10'>
        <YearHistogram timeline={timeline} year={year} range={range} />
        <div
          className='pointer-events-none absolute bottom-0 top-0 w-px bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.9)]'
          style={{ left: `${progress}%` }}
        />
      </div>

      <input
        type='range'
        min={range.minYear}
        max={range.maxYear}
        step={1}
        value={year}
        onChange={(event) => {
          setPlaying(false)
          setYear(Number(event.target.value))
        }}
        aria-label={t('timeMachine.scrub')}
        className='w-full cursor-pointer accent-cyan-400'
      />

      <div className='mt-3 flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-1.5'>
          <button
            onClick={() => {
              setPlaying(false)
              setYear(range.minYear)
            }}
            title={t('timeMachine.restart')}
            className='rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white'
          >
            <SkipBack className='h-4 w-4' />
          </button>
          <button
            onClick={() => setPlaying(!playing)}
            className='flex items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-200 transition-colors hover:bg-cyan-500/25'
          >
            {playing ? <Pause className='h-3.5 w-3.5' /> : <Play className='h-3.5 w-3.5' />}
            {t(playing ? 'timeMachine.pause' : 'timeMachine.play')}
          </button>

          <div className='ml-1 flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5'>
            {SPEEDS.map((option) => (
              <button
                key={option}
                onClick={() => setSpeed(option)}
                className={`rounded-md px-2 py-1 font-mono text-[11px] transition-colors ${
                  speed === option
                    ? 'bg-cyan-500/25 text-cyan-200'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {option}×
              </button>
            ))}
          </div>
        </div>

        {entry?.notable && (
          <button
            onClick={() => openNotable(entry.notable!.id)}
            className='max-w-[16rem] truncate rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-left text-[11px] text-slate-300 transition-colors hover:border-cyan-400/40 hover:text-white'
            title={entry.notable.name}
          >
            <span className='text-slate-500'>{t('timeMachine.notable')}: </span>
            {entry.notable.name}
          </button>
        )}
      </div>

      <p className='mt-2 text-[10px] leading-snug text-slate-500'>
        {t('timeMachine.hint')}
      </p>
    </div>
  )
}

/**
 * Discoveries per year as a bar chart behind the scrubber.
 *
 * Bar heights use a square root rather than a linear scale: 2014 alone contributed more
 * than the first fifteen years combined, and on a linear axis every year before Kepler
 * would be an invisible sliver.
 */
function YearHistogram({
  timeline,
  year,
  range,
}: {
  timeline: Timeline | null
  year: number
  range: { minYear: number; maxYear: number }
}) {
  const bars = useMemo(() => {
    if (!timeline) return []
    const peak = Math.max(1, ...timeline.years.map((y) => y.count))
    return timeline.years.map((entry) => ({
      year: entry.year,
      height: Math.sqrt(entry.count / peak) * 100,
    }))
  }, [timeline])

  const setYear = useExplorerStore((s) => s.setTimelineYear)
  const setPlaying = useExplorerStore((s) => s.setTimelinePlaying)
  const containerRef = useRef<HTMLDivElement>(null)

  if (bars.length === 0) {
    return <div className='h-full rounded-lg bg-white/5' />
  }

  return (
    <div
      ref={containerRef}
      className='flex h-full items-end gap-px overflow-hidden rounded-lg bg-white/5 px-0.5'
      onClick={(event) => {
        const box = containerRef.current?.getBoundingClientRect()
        if (!box) return
        const ratio = (event.clientX - box.left) / box.width
        setPlaying(false)
        setYear(range.minYear + ratio * (range.maxYear - range.minYear))
      }}
    >
      {bars.map((bar) => (
        <div
          key={bar.year}
          className={`flex-1 rounded-sm transition-colors ${
            bar.year <= year ? 'bg-cyan-400/70' : 'bg-white/10'
          }`}
          style={{ height: `${Math.max(2, bar.height)}%` }}
        />
      ))}
    </div>
  )
}
