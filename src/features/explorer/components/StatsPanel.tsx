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

// Sparkline component — pure SVG with interactive hover & key year milestones
function Sparkline({ data, lng }: { data: { year: number; count: number }[]; lng: string }) {
  const [hoveredPoint, setHoveredPoint] = useState<{ year: number; count: number; x: number; y: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)

  if (data.length < 2) return null
  
  const counts = data.map((d) => d.count)
  const max = Math.max(...counts, 1)
  const width = 260
  const height = 50
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - (d.count / max) * (height - 10) - 4
    return { x, y, year: d.year, count: d.count }
  })

  const pointsString = points.map((p) => `${p.x},${p.y}`).join(' ')
  const fillPoints = pointsString + ` ${width},${height} 0,${height}`

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return
    const rect = svgRef.current.getBoundingClientRect()
    const mouseX = ((e.clientX - rect.left) / rect.width) * width

    // Find closest data point by X coordinate
    let closest = points[0]
    let minDistance = Math.abs(mouseX - points[0].x)
    for (let i = 1; i < points.length; i++) {
      const dist = Math.abs(mouseX - points[i].x)
      if (dist < minDistance) {
        minDistance = dist
        closest = points[i]
      }
    }
    setHoveredPoint(closest)
  }

  const handleMouseLeave = () => {
    setHoveredPoint(null)
  }

  const minYear = data[0].year
  const maxYear = data[data.length - 1].year

  const isVi = lng.startsWith('vi')

  return (
    <div className="space-y-1.5">
      {/* Interactive Tooltip Banner */}
      <div className="h-5 flex items-center justify-between text-xs font-mono">
        {hoveredPoint ? (
          <>
            <span className="text-cyan-400 font-bold">{isVi ? 'Năm' : 'Year'} {hoveredPoint.year}</span>
            <span className="text-emerald-400 font-bold">+{hoveredPoint.count.toLocaleString()} {isVi ? 'hành tinh' : 'planets'}</span>
          </>
        ) : (
          <span className="text-slate-500 dark:text-slate-400 text-[10px] italic">
            {isVi ? 'Rê chuột vào biểu đồ để xem chi tiết' : 'Hover over chart for details'}
          </span>
        )}
      </div>

      {/* SVG Chart */}
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-12 overflow-visible cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <polygon points={fillPoints} fill="url(#sparkFill)" />

          {/* Line */}
          <polyline
            points={pointsString}
            fill="none"
            stroke="#06b6d4"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Hover indicator */}
          {hoveredPoint && (
            <g>
              <line
                x1={hoveredPoint.x}
                y1={0}
                x2={hoveredPoint.x}
                y2={height}
                stroke="#38bdf8"
                strokeWidth="1"
                strokeDasharray="2 2"
              />
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="4"
                fill="#38bdf8"
                stroke="#020617"
                strokeWidth="1.5"
                className="shadow-[0_0_8px_#38bdf8]"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Timeline Milestones Axis */}
      <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-slate-400 dark:text-slate-400 pt-0.5 border-t border-slate-300 dark:border-white/10">
        <span>{minYear}</span>
        <span className="text-cyan-400/80 font-medium">2009 (Kepler)</span>
        <span className="text-purple-400/80 font-medium">2018 (TESS)</span>
        <span>{maxYear}</span>
      </div>
    </div>
  )
}

// Mini donut chart — pure SVG with clean symmetrical legend
function DonutChart({ segments, lng }: { segments: { label: string; value: number; color: string }[]; lng: string }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  if (total === 0) return null
  
  const radius = 32
  const circumference = 2 * Math.PI * radius

  const preparedSegments = segments.map((seg, i) => {
    const pct = seg.value / total
    const dashLength = pct * circumference
    const offsetBefore = segments.slice(0, i).reduce((sum, s) => sum + s.value / total, 0)
    const dashOffset = -offsetBefore * circumference
    return { ...seg, dashLength, dashOffset, pct }
  })

  const isVi = lng.startsWith('vi')

  return (
    <div className="flex items-center gap-4">
      {/* Donut SVG */}
      <div className="relative flex-shrink-0">
        <svg viewBox="0 0 80 80" className="h-20 w-20">
          {preparedSegments.map((seg, i) => (
            <circle
              key={i}
              cx="40"
              cy="40"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="9"
              strokeDasharray={`${seg.dashLength} ${circumference - seg.dashLength}`}
              strokeDashoffset={seg.dashOffset}
              className="transition-all duration-500 hover:opacity-80"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xs font-bold font-mono text-slate-900 dark:text-white">{total.toLocaleString()}</span>
          <span className="text-[8px] uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-400">{isVi ? 'Tổng' : 'Total'}</span>
        </div>
      </div>

      {/* Symmetrical Legend Table */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {segments.filter((s) => s.value > 0).map((seg, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 min-w-0 pr-2">
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
              <span className="text-slate-600 dark:text-slate-300 font-medium truncate text-[11px]" title={seg.label}>
                {seg.label}
              </span>
            </div>
            <span className="font-mono font-bold text-slate-900 dark:text-white text-[11px] tabular-nums flex-shrink-0">
              {seg.value.toLocaleString()}
            </span>
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
  const sidebarOpen = useExplorerStore((s) => s.sidebarOpen)

  // Animated counts
  const totalCount = useCountUp(filteredPlanets.length)
  const habitableCount = useCountUp(filteredPlanets.filter((p) => p.isHabitable).length)

  // Discovery timeline data
  const timelineData = useMemo(() => {
    const yearCounts = new Map<number, number>()
    filteredPlanets.forEach((p) => {
      if (p.disc_year && !p.id.startsWith('sol-')) {
        yearCounts.set(p.disc_year, (yearCounts.get(p.disc_year) || 0) + 1)
      }
    })

    const years = Array.from(yearCounts.keys()).sort()
    if (years.length < 2) return []

    const minYear = years[0]
    const maxYear = years[years.length - 1]
    const data: { year: number; count: number }[] = []
    for (let y = minYear; y <= maxYear; y++) {
      data.push({ year: y, count: yearCounts.get(y) || 0 })
    }
    return data
  }, [filteredPlanets])

  // Size distribution
  const sizeDistribution = useMemo(() => {
    const counts: Record<string, number> = {}
    filteredPlanets.forEach((p) => {
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
    return (
      filteredPlanets
        .filter((p) => p.isHabitable && !p.id.startsWith('sol-') && p.distanceLy > 0)
        .sort((a, b) => a.distanceLy - b.distanceLy)[0] || null
    )
  }, [filteredPlanets])

  // Don't show stats panel when spectating a planet
  if (selectedPlanet) return null

  return (
    <div
      className={`pointer-events-auto absolute top-4 z-20 space-y-2.5 w-72 md:w-80 transition-all duration-300 ease-in-out ${
        sidebarOpen ? 'left-[19rem] md:left-[21rem]' : 'left-4'
      }`}
    >
      {/* Main counter cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-slate-300 dark:border-white/10 bg-slate-950/85 p-3 backdrop-blur-xl shadow-2xl">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-400">
            {t('stats.visibleExoplanets')}
          </div>
          <div className="mt-1 text-2xl font-black text-slate-900 dark:text-white tabular-nums tracking-tight">
            {totalCount.toLocaleString()}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 backdrop-blur-xl shadow-2xl">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
            {t('stats.habitableCandidates')}
          </div>
          <div className="mt-1 text-2xl font-black text-emerald-300 tabular-nums tracking-tight">
            {habitableCount.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Discovery Timeline Sparkline */}
      {timelineData.length > 3 && (
        <div className="rounded-xl border border-cyan-500/20 bg-slate-950/85 p-3.5 backdrop-blur-xl shadow-2xl space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 flex items-center justify-between">
            <span>{i18n.language.startsWith('vi') ? 'Khám phá theo năm' : 'Discoveries by Year'}</span>
            <span className="text-[9px] font-mono text-cyan-400/60 font-normal">NASA TAP</span>
          </div>
          <Sparkline data={timelineData} lng={i18n.language} />
        </div>
      )}

      {/* Size Distribution Donut */}
      {sizeDistribution.length > 0 && (
        <div className="rounded-xl border border-purple-500/20 bg-slate-950/85 p-3.5 backdrop-blur-xl shadow-2xl space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-purple-400">
            {i18n.language.startsWith('vi') ? 'Phân bố kích thước' : 'Size Distribution'}
          </div>
          <DonutChart segments={sizeDistribution} lng={i18n.language} />
        </div>
      )}

      {/* Nearest Habitable */}
      {nearestHabitable && (
        <div className="rounded-xl border border-emerald-500/20 bg-slate-950/85 p-3 backdrop-blur-xl shadow-2xl">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 mb-1">
            {i18n.language.startsWith('vi') ? 'Gần nhất có thể ở được' : 'Nearest Habitable'}
          </div>
          <div className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_#34d399] animate-pulse flex-shrink-0" />
            <div className="flex-1 min-w-0 flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-300 truncate">{nearestHabitable.pl_name}</span>
              <span className="text-[11px] text-slate-600 dark:text-slate-300 font-mono font-semibold ml-2 flex-shrink-0">
                {nearestHabitable.distanceLy.toFixed(1)} {i18n.language.startsWith('vi') ? 'ly' : 'ly'}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
