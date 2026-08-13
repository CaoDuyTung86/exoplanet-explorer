/* eslint-disable */
import { useState, useEffect, useTransition } from 'react'
import { Search, RotateCcw, Globe, Filter, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { translateTerm } from '../lib/astronomyDictionary'
import { useExplorerStore } from '../stores/explorerStore'
import { DISCOVERY_METHODS } from '../types'

export function FilterSidebar() {
  const { t, i18n } = useTranslation()
  const filters = useExplorerStore((s) => s.filters)
  const setFilters = useExplorerStore((s) => s.setFilters)
  const resetFilters = useExplorerStore((s) => s.resetFilters)
  const filteredPlanets = useExplorerStore((s) => s.filteredPlanets)
  const planets = useExplorerStore((s) => s.planets)
  const simulationSpeed = useExplorerStore((s) => s.simulationSpeed)
  const setSimulationSpeed = useExplorerStore((s) => s.setSimulationSpeed)

  return (
    <div className='flex h-full w-full flex-col border-r border-slate-200 dark:border-white/5 bg-white/90 dark:bg-slate-950/80 backdrop-blur-lg'>
      {/* Header */}
      <div className='border-b border-slate-200 dark:border-white/5 p-4'>
        <div className='flex items-center justify-between'>
          <h3 className='flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white'>
            <Filter className='h-4 w-4 text-primary' />
            {t('sidebar.title')}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={resetFilters}
              className='flex items-center gap-1 rounded px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400 dark:text-white/40 transition-colors hover:bg-slate-100 dark:bg-white/5 hover:text-slate-700 dark:text-white/70'
            >
              <RotateCcw className='h-3 w-3' /> {t('sidebar.reset')}
            </button>
            {/* Close button */}
            <button
              onClick={() => useExplorerStore.getState().setSidebarOpen(false)}
              className="flex items-center justify-center rounded-full p-1 text-slate-600 dark:text-white/50 hover:bg-slate-200 dark:bg-white/10 hover:text-slate-900 dark:text-white transition-colors"
              title="Close Sidebar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className='mt-2 text-[11px] text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-white/30'>
          {t('sidebar.showing')} <strong className='text-primary'>{filteredPlanets.length.toLocaleString()}</strong> {t('sidebar.of')} {planets.length.toLocaleString()} {t('sidebar.planets')}
        </div>
      </div>

      <div className='flex-1 overflow-y-auto p-4 space-y-5'>
        {/* Search */}
        <div>
          <label className='mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-white/30'>
            {t('sidebar.searchLabel')}
          </label>
          <div className='relative'>
            <Search className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/20' />
            <input
              type='text'
              value={filters.searchQuery}
              onChange={(e) => setFilters({ searchQuery: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredPlanets.length > 0) {
                  useExplorerStore.getState().setSelectedPlanet(filteredPlanets[0])
                  useExplorerStore.getState().setSidebarOpen(false) // Close sidebar on mobile
                }
              }}
              placeholder={t('sidebar.searchPlaceholder')}
              className='w-full rounded-lg border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/5 py-2 pl-8 pr-3 text-xs text-slate-900 dark:text-white placeholder:text-white/20 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/30'
            />
          </div>
        </div>

        {/* Habitable Only Toggle */}
        <div className='flex items-center justify-between rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3'>
          <div className='flex items-center gap-2'>
            <Globe className='h-4 w-4 text-emerald-400' />
            <span className='text-xs font-semibold text-emerald-300'>{t('sidebar.habitability')}</span>
          </div>
          <button
            onClick={() => setFilters({ showHabitableOnly: !filters.showHabitableOnly })}
            className={`relative flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
              filters.showHabitableOnly ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-white/10'
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                filters.showHabitableOnly ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Scientific Overlays Toggle */}
        <div className='flex items-center justify-between rounded-lg border border-purple-500/20 bg-purple-500/5 p-3'>
          <div className='flex items-center gap-2'>
            <Globe className='h-4 w-4 text-purple-400' />
            <span className='text-xs font-semibold text-purple-300'>{t('sidebar.scientificOverlays')}</span>
          </div>
          <button
            onClick={() => useExplorerStore.getState().setShowScientificOverlays(!useExplorerStore.getState().showScientificOverlays)}
            className={`relative flex h-5 w-9 items-center rounded-full p-0.5 transition-colors ${
              useExplorerStore((s) => s.showScientificOverlays) ? 'bg-purple-500' : 'bg-slate-200 dark:bg-white/10'
            }`}
          >
            <span
              className={`h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${
                useExplorerStore((s) => s.showScientificOverlays) ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Simulation Speed */}
        <div>
          <div className='mb-1.5 flex items-center justify-between'>
            <label className='text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-white/30'>
              {t('sidebar.simulationSpeed')}
            </label>
            <span className='font-mono text-[10px] font-bold text-primary'>
              {simulationSpeed.toFixed(1)}x
            </span>
          </div>
          <input
            type='range'
            min={0.1}
            max={10.0}
            step={0.1}
            value={simulationSpeed}
            onChange={(e) => setSimulationSpeed(Number(e.target.value))}
            className='w-full accent-primary'
          />
        </div>

        {/* Range Sliders */}
        <RangeFilter
          label={t('sidebar.radiusRange')}
          min={0} max={30} step={0.5}
          value={filters.radiusRange}
          onChange={(v) => setFilters({ radiusRange: v })}
        />

        <RangeFilter
          label={t('sidebar.temperatureRange')}
          min={0} max={5000} step={50}
          value={filters.tempRange}
          onChange={(v) => setFilters({ tempRange: v })}
        />

        <RangeFilter
          label={t('sidebar.distanceRange')}
          min={0} max={10000} step={100}
          value={filters.distanceRange}
          onChange={(v) => setFilters({ distanceRange: v })}
        />

        <RangeFilter
          label={t('sidebar.orbitalPeriodRange')}
          min={0} max={10000} step={10}
          value={filters.orbitalPeriodRange}
          onChange={(v) => setFilters({ orbitalPeriodRange: v })}
        />

        <RangeFilter
          label={t('sidebar.discoveryYear')}
          min={1992} max={2026} step={1}
          value={filters.yearRange}
          onChange={(v) => setFilters({ yearRange: v })}
        />

        {/* Discovery Method */}
        <div>
          <label className='mb-2 block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-white/30'>
            {t('sidebar.discoveryMethod')}
          </label>
          <div className='flex flex-wrap gap-1.5'>
            {DISCOVERY_METHODS.slice(0, 6).map((method) => {
              const isActive = filters.discoveryMethods.includes(method)
              return (
                <button
                  key={method}
                  onClick={() => {
                    const methods = isActive
                      ? filters.discoveryMethods.filter((m) => m !== method)
                      : [...filters.discoveryMethods, method]
                    setFilters({ discoveryMethods: methods })
                  }}
                  className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-all ${
                    isActive
                      ? 'border-primary/50 bg-primary/20 text-primary'
                      : 'border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 dark:text-white/40 hover:border-slate-400 dark:border-white/20 hover:text-slate-700 dark:text-white/60'
                  }`}
                >
                  {translateTerm(method, i18n.language)}
                </button>
              )
            })}
          </div>
        </div>

        {/* Spectral Type */}
        <div>
          <label className='mb-2 block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-white/30'>
            {t('sidebar.spectralType')}
          </label>
          <div className='flex flex-wrap gap-1.5'>
            {['O', 'B', 'A', 'F', 'G', 'K', 'M'].map((type) => {
              const isActive = filters.spectralTypes.includes(type)
              return (
                <button
                  key={type}
                  onClick={() => {
                    const types = isActive
                      ? filters.spectralTypes.filter((t) => t !== type)
                      : [...filters.spectralTypes, type]
                    setFilters({ spectralTypes: types })
                  }}
                  className={`rounded-md border px-2.5 py-1 text-[10px] font-bold transition-all ${
                    isActive
                      ? 'border-primary/50 bg-primary/20 text-primary'
                      : 'border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 dark:text-white/40 hover:border-slate-400 dark:border-white/20 hover:text-slate-700 dark:text-white/60'
                  }`}
                >
                  {type}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function RangeFilter({
  label, min, max, step, value, onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: [number, number]
  onChange: (v: [number, number]) => void
}) {
  const [localValue, setLocalValue] = useState(value)
  const [, startTransition] = useTransition()

  // Sync external resets
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  const handleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setLocalValue([val, localValue[1]])
    startTransition(() => {
      onChange([val, localValue[1]])
    })
  }

  const handleMaxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value)
    setLocalValue([localValue[0], val])
    startTransition(() => {
      onChange([localValue[0], val])
    })
  }

  return (
    <div>
      <div className='mb-1.5 flex items-center justify-between'>
        <label className='text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 dark:text-slate-400 dark:text-white/30'>
          {label}
        </label>
        <span className='font-mono text-[10px] text-slate-500 dark:text-slate-400 dark:text-white/40'>
          {localValue[0].toLocaleString()} – {localValue[1].toLocaleString()}
        </span>
      </div>
      <div className='flex gap-2'>
        <input
          type='range'
          min={min}
          max={max}
          step={step}
          value={localValue[0]}
          onChange={handleMinChange}
          className='w-full accent-primary'
        />
        <input
          type='range'
          min={min}
          max={max}
          step={step}
          value={localValue[1]}
          onChange={handleMaxChange}
          className='w-full accent-primary'
        />
      </div>
    </div>
  )
}
