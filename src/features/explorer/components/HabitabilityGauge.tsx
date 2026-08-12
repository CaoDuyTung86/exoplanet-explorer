export function HabitabilityGauge({ score }: { score: number }) {
  const getLabel = () => {
    if (score >= 70) return { text: 'Highly Promising', emoji: '🌍', color: 'text-emerald-400' }
    if (score >= 50) return { text: 'Potentially Habitable', emoji: '🔬', color: 'text-cyan-400' }
    if (score >= 30) return { text: 'Low Probability', emoji: '🌑', color: 'text-amber-400' }
    return { text: 'Unlikely Habitable', emoji: '🔴', color: 'text-white/40' }
  }

  const label = getLabel()
  const circumference = 2 * Math.PI * 40
  const strokeDashoffset = circumference - (score / 100) * circumference

  const getStrokeColor = () => {
    if (score >= 70) return '#10b981'  // emerald
    if (score >= 50) return '#06b6d4'  // cyan
    if (score >= 30) return '#f59e0b'  // amber
    return '#64748b'                   // slate
  }

  return (
    <div className='flex items-center gap-4'>
      {/* Circular gauge */}
      <div className='relative flex-shrink-0'>
        <svg width='90' height='90' className='-rotate-90'>
          {/* Background circle */}
          <circle
            cx='45'
            cy='45'
            r='40'
            fill='none'
            stroke='rgba(255,255,255,0.05)'
            strokeWidth='6'
          />
          {/* Score arc */}
          <circle
            cx='45'
            cy='45'
            r='40'
            fill='none'
            stroke={getStrokeColor()}
            strokeWidth='6'
            strokeLinecap='round'
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className='transition-all duration-1000 ease-out'
          />
        </svg>
        <div className='absolute inset-0 flex flex-col items-center justify-center'>
          <span className='text-2xl font-black text-white'>{score}</span>
          <span className='text-[9px] font-medium uppercase tracking-wider text-white/30'>/100</span>
        </div>
      </div>

      {/* Label */}
      <div>
        <div className='text-[10px] font-semibold uppercase tracking-wider text-white/30'>
          Habitability Score
        </div>
        <div className={`mt-0.5 text-sm font-bold ${label.color}`}>
          {label.emoji} {label.text}
        </div>
        <p className='mt-1 text-[10px] leading-relaxed text-white/30'>
          Based on temperature, radius, mass, and stellar type compatibility with Earth-like conditions.
        </p>
      </div>
    </div>
  )
}
