import { useMemo, useState, useEffect, useRef } from 'react'
import { useExplorerStore } from '../stores/explorerStore'
import { useTranslation } from 'react-i18next'
import { translateTerm } from '../lib/astronomyDictionary'

/**
 * StatsPanel — Glassmorphism mini-dashboard with:
 * - Animated count-up numbers
 * - Discovery timeline sparkline
 * - Size distribution donut chart
 * - Nearest habitable planet highlight
 * 
 * Only React DOM (no Canvas/Three.js) — zero 3D performance impact.
 */

function useCountUp(target: number, duration = 1500) {
  const [value, setValue] = useState(0)
  const prevTarget = useRef(0)
  
  useEffect(() => {
    if (target === prevTarget.current) return
    prevTarget.current = target
    
    const start = performance.now()
    const startValue = 0
    
    function tick() {
      const elapsed = performance.now() - start
      const progress = Math.min(elapsed / duration, 1)
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(startValue + (target - startValue) * eased))
      if (progress < 1) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, [target, duration])
  
  return value
}

// Sparkline component — pure SVG, no library
function Sparkline({ data, color = '#06b6d4' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const width = 200
  const height = 40
  
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - (v / max) * (height - 4) - 2
    return `${x},${y}`
  }).join(' ')

  // Create fill area (polygon from line to bottom)
  const fillPoints = points + ` ${width},${height} 0,${height}`

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-10">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={fillPoints} fill="url(#sparkFill)" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// Mini donut chart — pure SVG
function DonutChart({ segments }: { segments: { label: string; value: number; color: string }[] }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  if (total === 0) return null
  
  const radius = 30
  const circumference = 2 * Math.PI * radius
  const preparedSegments = segments.map((seg, i) => {
    const pct = seg.value / total
    const dashLength = pct * circumference
    const offsetBefore = segments.slice(0, i).reduce((sum, s) => sum + s.value / total, 0)
    const dashOffset = -offsetBefore * circumference
    return { ...seg, dashLength, dashOffset }
  })

  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 80 80" className="h-16 w-16 flex-shrink-0">
        {preparedSegments.map((seg, i) => (
          <circle
            key={i}
            cx="40" cy="40" r={radius}
            fill="none"
            stroke={seg.color}
            strokeWidth="8"
            strokeDasharray={`${seg.dashLength} ${circumference - seg.dashLength}`}
            strokeDashoffset={seg.dashOffset}
            className="transition-all duration-700"
          />
        ))}
      </svg>
      <div className="flex flex-col gap-0.5 text-[9px]">
        {segments.filter(s => s.value > 0).slice(0, 5).map((seg, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-white/50">{seg.label}</span>
            <span className="font-mono text-white/70">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StatsPanel() {
  const { t, i18n } = useTranslation()
  const filteredPlanets = useExplorerStore((s) => s.filteredPlanets)
  const selectedPlanet = useExplorerStore((s) => s.selectedPlanet)

  // Animated counts - MUST be called unconditionally before any early returns!
  const totalCount = useCountUp(filteredPlanets.length)
  const habitableCount = useCountUp(filteredPlanets.filter(p => p.isHabitable).length)

  // Discovery timeline data (year → count)
  const timelineData = useMemo(() => {
    const yearCounts = new Map<number, number>()
    filteredPlanets.forEach(p => {
      if (p.disc_year && !p.id.startsWith('sol-')) {
        yearCounts.set(p.disc_year, (yearCounts.get(p.disc_year) || 0) + 1)
      }
    })
    
    const years = Array.from(yearCounts.keys()).sort()
    if (years.length < 2) return []
    
    const minYear = years[0]
    const maxYear = years[years.length - 1]
    const data: number[] = []
    for (let y = minYear; y <= maxYear; y++) {
      data.push(yearCounts.get(y) || 0)
    }
    return data
  }, [filteredPlanets])

  // Size distribution
  const sizeDistribution = useMemo(() => {
    const counts: Record<string, number> = {}
    filteredPlanets.forEach(p => {
      if (!p.id.startsWith('sol-')) {
        counts[p.sizeCategory] = (counts[p.sizeCategory] || 0) + 1
      }
    })

    const colorMap: Record<string, string> = {
      'sub-Earth': '#94a3b8',
      'Earth-like': '#34d399',
      'super-Earth': '#fbbf24',
      'mini-Neptune': '#60a5fa',
      'Neptune-like': '#818cf8',
      'gas-giant': '#f97316',
    }

    return Object.entries(counts)
      .filter(([key]) => key !== 'Star')
      .map(([key, value]) => ({
        label: translateTerm(key, i18n.language),
        value,
        color: colorMap[key] || '#666',
      }))
      .sort((a, b) => b.value - a.value)
  }, [filteredPlanets, i18n.language])

  // Nearest habitable
  const nearestHabitable = useMemo(() => {
    return filteredPlanets
      .filter(p => p.isHabitable && !p.id.startsWith('sol-') && p.distanceLy > 0)
      .sort((a, b) => a.distanceLy - b.distanceLy)[0] || null
  }, [filteredPlanets])

  // Don't show stats panel when spectating a planet
  if (selectedPlanet) return null

  return (
    <div className="pointer-events-none absolute left-4 top-4 z-20 space-y-2 w-64">
      {/* Main counter cards */}
      <div className="rounded-xl border border-white/10 bg-slate-950/80 p-3 backdrop-blur-xl shadow-2xl">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/30">
          {t('stats.visibleExoplanets')}
        </div>
        <div className="mt-0.5 text-2xl font-black text-white tabular-nums">
          {totalCount.toLocaleString()}
        </div>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 backdrop-blur-xl shadow-2xl">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/50">
          {t('stats.habitableCandidates')}
        </div>
        <div className="mt-0.5 text-2xl font-black text-emerald-400 tabular-nums">
          {habitableCount}
        </div>
      </div>

      {/* Discovery Timeline Sparkline */}
      {timelineData.length > 3 && (
        <div className="rounded-xl border border-cyan-500/10 bg-slate-950/80 p-3 backdrop-blur-xl shadow-2xl">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/40 mb-1">
            {i18n.language.startsWith('vi') ? 'Khám phá theo năm' : 'Discoveries by Year'}
          </div>
          <Sparkline data={timelineData} />
        </div>
      )}

      {/* Size Distribution Donut */}
      {sizeDistribution.length > 0 && (
        <div className="rounded-xl border border-purple-500/10 bg-slate-950/80 p-3 backdrop-blur-xl shadow-2xl">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-purple-400/40 mb-2">
            {i18n.language.startsWith('vi') ? 'Phân bố kích thước' : 'Size Distribution'}
          </div>
          <DonutChart segments={sizeDistribution} />
        </div>
      )}

      {/* Nearest Habitable */}
      {nearestHabitable && (
        <div className="rounded-xl border border-emerald-500/10 bg-slate-950/80 p-3 backdrop-blur-xl shadow-2xl">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/40 mb-1">
            {i18n.language.startsWith('vi') ? 'Gần nhất có thể ở được' : 'Nearest Habitable'}
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)] animate-pulse" />
            <div>
              <div className="text-xs font-bold text-emerald-300">{nearestHabitable.pl_name}</div>
              <div className="text-[10px] text-white/40 font-mono">
                {nearestHabitable.distanceLy.toFixed(1)} {i18n.language.startsWith('vi') ? 'năm ánh sáng' : 'light years'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
