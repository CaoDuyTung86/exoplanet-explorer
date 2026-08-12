import { useExplorerStore } from '../stores/explorerStore'
import { type ProcessedPlanet } from '../types'
import { Globe, Search, ArrowUpDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { translateTerm } from '../lib/astronomyDictionary'

type SortField = 'pl_name' | 'distanceLy' | 'pl_rade' | 'pl_bmasse' | 'pl_eqt' | 'habitabilityScore'

export function DataTable() {
  const { t, i18n } = useTranslation()
  const filteredPlanets = useExplorerStore((s) => s.filteredPlanets)
  const setSelectedPlanet = useExplorerStore((s) => s.setSelectedPlanet)
  const setViewMode = useExplorerStore((s) => s.setViewMode)
  
  const [sortField, setSortField] = useState<SortField>('habitabilityScore')
  const [sortAsc, setSortAsc] = useState(false)
  const [tableSearch, setTableSearch] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Filter & Sort
  const processedData = useMemo(() => {
    let result = filteredPlanets

    if (tableSearch.trim()) {
      const q = tableSearch.toLowerCase()
      result = result.filter((p) => p.pl_name.toLowerCase().includes(q) || p.hostname.toLowerCase().includes(q))
    }

    return [...result].sort((a, b) => {
      const valA = a[sortField] ?? -99999
      const valB = b[sortField] ?? -99999
      if (typeof valA === 'string' && typeof valB === 'string') {
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      return sortAsc ? Number(valA) - Number(valB) : Number(valB) - Number(valA)
    })
  }, [filteredPlanets, tableSearch, sortField, sortAsc])

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(processedData.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * pageSize
  const paginatedPlanets = processedData.slice(startIndex, startIndex + pageSize)

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc)
    } else {
      setSortField(field)
      setSortAsc(false)
    }
  }

  const handleRowClick = (planet: ProcessedPlanet) => {
    setSelectedPlanet(planet)
    setViewMode('3d')
  }

  return (
    <div className='flex h-full flex-col p-6 overflow-hidden bg-slate-950/90'>
      {/* Header & Search */}
      <div className='flex flex-wrap items-center justify-between gap-4 mb-4'>
        <div>
          <h2 className='text-lg font-bold text-white flex items-center gap-2'>
            <span>📊 {t('table.database')}</span>
          </h2>
          <p className='text-xs text-white/40 mt-0.5'>
            {t('table.clickRow')}
          </p>
        </div>

        <div className='flex items-center gap-3'>
          {/* Quick Table Search */}
          <div className='relative w-64'>
            <Search className='absolute left-3 top-2.5 h-3.5 w-3.5 text-white/40' />
            <input
              type='text'
              value={tableSearch}
              onChange={(e) => {
                setTableSearch(e.target.value)
                setCurrentPage(1)
              }}
              placeholder={t('table.searchPlaceholder')}
              className='w-full rounded-lg border border-white/10 bg-white/5 py-1.5 pl-9 pr-3 text-xs text-white placeholder-white/30 focus:border-primary focus:outline-none'
            />
          </div>

          <div className='text-xs font-mono text-white/50 bg-white/5 px-3 py-1.5 rounded-lg border border-white/10'>
            {t('table.total')}: <strong className='text-emerald-400'>{processedData.length.toLocaleString()}</strong>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className='flex-1 overflow-auto rounded-xl border border-white/10 bg-slate-950/60 shadow-2xl'>
        <table className='w-full text-left text-xs'>
          <thead className='sticky top-0 bg-slate-900/95 backdrop-blur-md text-white/40 border-b border-white/10 uppercase tracking-wider font-mono text-[10px] z-10'>
            <tr>
              <th className='py-3 px-4 cursor-pointer hover:text-white' onClick={() => handleSort('pl_name')}>
                <div className='flex items-center gap-1'>{t('table.planetName')} <ArrowUpDown className='h-3 w-3' /></div>
              </th>
              <th className='py-3 px-4 cursor-pointer hover:text-white' onClick={() => handleSort('habitabilityScore')}>
                <div className='flex items-center gap-1'>{t('table.habitability')} <ArrowUpDown className='h-3 w-3' /></div>
              </th>
              <th className='py-3 px-4 cursor-pointer hover:text-white' onClick={() => handleSort('distanceLy')}>
                <div className='flex items-center gap-1'>{t('table.distance')} <ArrowUpDown className='h-3 w-3' /></div>
              </th>
              <th className='py-3 px-4 cursor-pointer hover:text-white' onClick={() => handleSort('pl_rade')}>
                <div className='flex items-center gap-1'>{t('table.radius')} <ArrowUpDown className='h-3 w-3' /></div>
              </th>
              <th className='py-3 px-4 cursor-pointer hover:text-white' onClick={() => handleSort('pl_bmasse')}>
                <div className='flex items-center gap-1'>{t('table.mass')} <ArrowUpDown className='h-3 w-3' /></div>
              </th>
              <th className='py-3 px-4 cursor-pointer hover:text-white' onClick={() => handleSort('pl_eqt')}>
                <div className='flex items-center gap-1'>{t('table.temp')} <ArrowUpDown className='h-3 w-3' /></div>
              </th>
              <th className='py-3 px-4'>{t('table.discovery')}</th>
            </tr>
          </thead>
          <tbody className='divide-y divide-white/5 font-mono text-[11px]'>
            {paginatedPlanets.length > 0 ? (
              paginatedPlanets.map((planet) => (
                <tr
                  key={planet.id}
                  onClick={() => handleRowClick(planet)}
                  className='hover:bg-primary/10 transition-colors cursor-pointer group'
                >
                  <td className='py-3 px-4 font-bold text-white group-hover:text-primary transition-colors'>
                    <div className='flex items-center gap-2'>
                      {planet.isHabitable && <Globe className='h-3.5 w-3.5 text-emerald-400 flex-shrink-0' />}
                      <span>{planet.pl_name}</span>
                    </div>
                  </td>
                  <td className='py-3 px-4 font-bold'>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                      planet.habitabilityScore >= 70 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                      planet.habitabilityScore >= 40 ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                      'bg-slate-800 text-slate-400'
                    }`}>
                      {planet.habitabilityScore} / 100
                    </span>
                  </td>
                  <td className='py-3 px-4 text-white/70'>
                    {planet.distanceLy.toFixed(1)} ly
                  </td>
                  <td className='py-3 px-4 text-white/70'>
                    {planet.pl_rade !== null ? `${planet.pl_rade.toFixed(2)} R⊕` : '—'}
                  </td>
                  <td className='py-3 px-4 text-white/70'>
                    {planet.pl_bmasse !== null ? `${planet.pl_bmasse.toFixed(2)} M⊕` : '—'}
                  </td>
                  <td className='py-3 px-4 text-white/70'>
                    {planet.pl_eqt !== null ? `${planet.pl_eqt} K` : '—'}
                  </td>
                  <td className='py-3 px-4 text-white/40 text-[10px]'>
                    {translateTerm(planet.discoverymethod, i18n.language)} ({planet.disc_year})
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className='py-8 text-center text-white/40 italic'>
                  {t('table.noResults')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className='flex items-center justify-between pt-4 text-xs font-mono text-white/60'>
        <div className='flex items-center gap-2'>
          <span>{t('table.rowsPerPage')}</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setCurrentPage(1)
            }}
            className='rounded border border-white/10 bg-slate-900 px-2 py-1 text-white focus:outline-none'
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={200}>200</option>
          </select>
          <span className='ml-2 text-white/40'>
            {t('sidebar.showing')} {processedData.length > 0 ? startIndex + 1 : 0} - {Math.min(startIndex + pageSize, processedData.length)} {t('table.ofPages')} {processedData.length}
          </span>
        </div>

        <div className='flex items-center gap-1'>
          <button
            disabled={safePage === 1}
            onClick={() => setCurrentPage(1)}
            className='p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent'
          >
            <ChevronsLeft className='h-4 w-4' />
          </button>
          <button
            disabled={safePage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className='p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent'
          >
            <ChevronLeft className='h-4 w-4' />
          </button>
          <span className='px-3 py-1 bg-white/5 rounded border border-white/10 text-white font-bold'>
            Page {safePage} of {totalPages}
          </span>
          <button
            disabled={safePage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className='p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent'
          >
            <ChevronRight className='h-4 w-4' />
          </button>
          <button
            disabled={safePage === totalPages}
            onClick={() => setCurrentPage(totalPages)}
            className='p-1.5 rounded hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent'
          >
            <ChevronsRight className='h-4 w-4' />
          </button>
        </div>
      </div>
    </div>
  )
}
