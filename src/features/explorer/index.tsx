import { useEffect, useState } from 'react'
import { Rocket, PanelLeft, Table2, Box, Volume2, VolumeX } from 'lucide-react'
import { useExplorerStore } from './stores/explorerStore'
import { fetchExoplanets } from './services/nasaApi'
import { playBgm, toggleAudioMute, isAudioMuted } from './services/audio'
import { StarMap3D } from './components/StarMap3D'
import { PlanetDetailCard } from './components/PlanetDetailCard'
import { FilterSidebar } from './components/FilterSidebar'
import { DataTable } from './components/DataTable'
import { LanguageToggle } from './components/LanguageToggle'
import { StatsPanel } from './components/StatsPanel'
import { useTranslation } from 'react-i18next'

export function ExplorerPage() {
  const { t, i18n } = useTranslation()
  const [isMuted, setIsMuted] = useState(() => isAudioMuted())
  const setPlanets = useExplorerStore((s) => s.setPlanets)
  const setLoading = useExplorerStore((s) => s.setLoading)
  const isLoading = useExplorerStore((s) => s.isLoading)
  const filteredPlanets = useExplorerStore((s) => s.filteredPlanets)
  const sidebarOpen = useExplorerStore((s) => s.sidebarOpen)
  const setSidebarOpen = useExplorerStore((s) => s.setSidebarOpen)
  const viewMode = useExplorerStore((s) => s.viewMode)
  const setViewMode = useExplorerStore((s) => s.setViewMode)
  const selectedPlanet = useExplorerStore((s) => s.selectedPlanet)

  const planets = useExplorerStore((s) => s.planets)

  useEffect(() => {
    if (planets.length > 0) return

    let cancelled = false

    async function loadData() {
      try {
        setLoading(true)
        const raw = await fetchExoplanets()
        if (cancelled) return

        // Spawn a web worker to process data without blocking the main thread
        const worker = new Worker(new URL('./services/planetWorker.ts', import.meta.url), {
          type: 'module',
        })

        worker.onmessage = (e) => {
          if (cancelled) {
            worker.terminate()
            return
          }
          if (e.data.type === 'SUCCESS') {
            setPlanets(e.data.payload)
          } else {
            console.error('Worker failed to process data:', e.data.error)
            setLoading(false)
          }
          worker.terminate() // Cleanup worker after it finishes
        }

        worker.postMessage({ rawData: raw })
      } catch (err) {
        console.error('Failed to fetch NASA exoplanet data:', err)
        setLoading(false)
      }
    }

    loadData()

    return () => { cancelled = true }
  }, [planets.length, setPlanets, setLoading])

  // Start BGM on first interaction (Autoplay policy bypass via capture phase)
  useEffect(() => {
    const unlockAudio = () => {
      playBgm()
      window.removeEventListener('pointerdown', unlockAudio, { capture: true } as EventListenerOptions)
      window.removeEventListener('keydown', unlockAudio, { capture: true } as EventListenerOptions)
    }
    window.addEventListener('pointerdown', unlockAudio, { capture: true })
    window.addEventListener('keydown', unlockAudio, { capture: true })
    return () => {
      window.removeEventListener('pointerdown', unlockAudio, { capture: true } as EventListenerOptions)
      window.removeEventListener('keydown', unlockAudio, { capture: true } as EventListenerOptions)
    }
  }, [])

  return (
    <div className='flex h-screen flex-col bg-slate-950 text-white overflow-hidden'>
      {/* Top Navigation Bar */}
      <header className='flex h-12 shrink-0 items-center justify-between border-b border-white/5 bg-slate-950/95 px-4 backdrop-blur-md z-30'>
        <div className='flex items-center gap-3'>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className='rounded-lg p-1.5 text-white/40 transition-colors hover:bg-white/5 hover:text-white'
          >
            <PanelLeft className='h-4 w-4' />
          </button>

          <div className='flex items-center gap-2'>
            <Rocket className='h-5 w-5 text-primary' />
            <h1 className='text-sm font-bold tracking-wide'>{t('appName')}</h1>
          </div>

          <span className='rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary'>
            NASA TAP API
          </span>
        </div>

        <div className='flex items-center gap-3'>
          {/* View mode toggle */}
          <div className='flex h-8 items-center rounded-lg border border-cyan-500/20 bg-slate-900/60 p-1 backdrop-blur-md'>
            <button
              onClick={() => setViewMode('3d')}
              className={`flex h-6 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all ${
                viewMode === '3d'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Box className='h-3.5 w-3.5' /> {t('sidebar.viewMode.3d')}
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex h-6 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all ${
                viewMode === 'table'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
              }`}
            >
              <Table2 className='h-3.5 w-3.5' /> {t('sidebar.viewMode.table')}
            </button>
          </div>

          {/* Planet count */}
          <div className='hidden h-8 items-center gap-2 rounded-lg border border-cyan-500/20 bg-slate-900/60 px-3 font-mono text-xs text-slate-300 backdrop-blur-md sm:flex'>
            <span className='h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' />
            <span>{filteredPlanets.length.toLocaleString()} {i18n.language.startsWith('vi') ? 'hành tinh' : 'planets loaded'}</span>
          </div>

          <LanguageToggle />

          {/* Audio Mute toggle */}
          <button
            onClick={() => setIsMuted(toggleAudioMute())}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border backdrop-blur-md transition-all ${
              isMuted
                ? 'border-red-500/20 bg-red-900/40 text-red-400 hover:bg-red-900/60'
                : 'border-cyan-500/20 bg-slate-900/60 text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.2)] hover:bg-slate-800/80'
            }`}
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
          >
            {isMuted ? <VolumeX className='h-4 w-4' /> : <Volume2 className='h-4 w-4' />}
          </button>
        </div>
      </header>

      {/* Full Screen Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#050510] backdrop-blur-md">
          <div className="flex flex-col items-center space-y-6">
            <div className="relative flex h-36 w-36 items-center justify-center">
              <div className="absolute h-32 w-32 animate-[spin_3s_linear_infinite] rounded-full border-b-2 border-t-2 border-cyan-500 opacity-50"></div>
              <div className="absolute h-24 w-24 animate-[spin_2s_linear_infinite_reverse] rounded-full border-l-2 border-r-2 border-blue-400 opacity-70"></div>
              <Rocket className="h-10 w-10 animate-pulse text-cyan-300" />
            </div>
            <div className="pt-2 text-center">
              <h2 className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text font-mono text-2xl font-bold tracking-widest text-transparent">
                {t('loading.title')}
              </h2>
              <p className="mt-3 font-mono text-sm text-cyan-500/70">
                {t('loading.subtitle')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <div
          className={`absolute inset-y-0 left-0 z-40 h-full transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${
            sidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
          }`}
        >
          <div className="h-full w-72 md:w-80 border-r border-slate-800 bg-[#0a0a1a]/95 backdrop-blur-md">
            <FilterSidebar />
          </div>
        </div>

        {/* Mobile Backdrop */}
        {sidebarOpen && (
          <div 
            className="absolute inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* 3D Canvas / Data Table */}
        <main className="relative flex-1">
          {viewMode === '3d' ? (
            <>
              <StarMap3D />
              <PlanetDetailCard />
              <StatsPanel />

              {/* Reset View Button */}
              {!selectedPlanet && (
                <div className='pointer-events-none absolute bottom-6 left-1/2 -translate-x-1/2 z-20'>
                  <button
                    onClick={() => useExplorerStore.getState().triggerCameraReset()}
                    className='pointer-events-auto rounded-full border border-white/10 bg-black/60 px-4 py-2 text-xs font-semibold text-white/70 shadow-xl backdrop-blur-md transition-all hover:bg-white/10 hover:text-white'
                  >
                    {t('controls.resetView')}
                  </button>
                </div>
              )}
            </>
          ) : (
            <DataTable />
          )}
        </main>
      </div>
    </div>
  )
}
