import { useEffect, useRef, useState } from 'react'
import { Rocket, PanelLeft, Table2, Box, Volume2, VolumeX, TriangleAlert, Search } from 'lucide-react'
import { useExplorerStore } from './stores/explorerStore'
import { fetchCatalog } from './services/catalogApi'
import { fetchExoplanets, getCuratedFallback, processExoplanets } from './services/nasaApi'
import type { ProcessedPlanet } from './types'
import { playBgm, toggleAudioMute, isAudioMuted } from './services/audio'
import { StarMap3D } from './components/StarMap3D'
import { PlanetDetailCard } from './components/PlanetDetailCard'
import { FilterSidebar } from './components/FilterSidebar'
import { DataTable } from './components/DataTable'
import { ThemeToggle } from './components/ThemeToggle'
import { LanguageToggle } from './components/LanguageToggle'
import { StatsPanel } from './components/StatsPanel'
import { TimeMachine } from './components/TimeMachine'
import { AccountMenu } from './components/AccountMenu'
import { PresenceBar } from './components/PresenceBar'
import { PlanetSearch } from './components/PlanetSearch'
import { useAccountStore } from './stores/accountStore'
import { usePresenceStore } from './stores/presenceStore'
import { useTranslation } from 'react-i18next'

/** Where the currently displayed catalog came from. */
type DataSource = 'api' | 'legacy' | 'curated'

export function ExplorerPage() {
  const { t, i18n } = useTranslation()
  const [isMuted, setIsMuted] = useState(() => isAudioMuted())
  const [dataSource, setDataSource] = useState<DataSource | null>(null)
  const [loadWarning, setLoadWarning] = useState<string | null>(null)
  const setPlanets = useExplorerStore((s) => s.setPlanets)
  const setLoading = useExplorerStore((s) => s.setLoading)
  const isLoading = useExplorerStore((s) => s.isLoading)
  const filteredPlanets = useExplorerStore((s) => s.filteredPlanets)
  const sidebarOpen = useExplorerStore((s) => s.sidebarOpen)
  const setSidebarOpen = useExplorerStore((s) => s.setSidebarOpen)
  const viewMode = useExplorerStore((s) => s.viewMode)
  const setViewMode = useExplorerStore((s) => s.setViewMode)
  const selectedPlanet = useExplorerStore((s) => s.selectedPlanet)
  const timelineEnabled = useExplorerStore((s) => s.timelineEnabled)

  const planets = useExplorerStore((s) => s.planets)
  const loadSession = useAccountStore((s) => s.loadSession)
  const connectPresence = usePresenceStore((s) => s.connect)
  const disconnectPresence = usePresenceStore((s) => s.disconnect)
  const setPresenceFocus = usePresenceStore((s) => s.setFocus)

  // Who is signed in, and the presence socket. Both are independent of the catalog
  // load, so neither is allowed to hold up the map.
  useEffect(() => {
    loadSession()
  }, [loadSession])

  useEffect(() => {
    connectPresence()
    return () => disconnectPresence()
  }, [connectPresence, disconnectPresence])

  // Broadcast what this visitor is looking at, so it shows up in everyone else's list.
  useEffect(() => {
    setPresenceFocus(selectedPlanet?.id ?? null)
  }, [selectedPlanet?.id, setPresenceFocus])

  // The server reads the session cookie during the WebSocket handshake, so the identity
  // in the presence list is fixed for the life of the socket. Signing in or out has to
  // reopen it, or the room keeps showing the previous name.
  const accountUser = useAccountStore((s) => s.user)
  const accountReady = useAccountStore((s) => s.ready)
  const lastIdentity = useRef<number | null | undefined>(undefined)

  useEffect(() => {
    if (!accountReady) return
    const identity = accountUser?.id ?? null

    // The first settle after boot is the identity the socket already opened with.
    if (lastIdentity.current === undefined) {
      lastIdentity.current = identity
      return
    }
    if (lastIdentity.current === identity) return

    lastIdentity.current = identity
    disconnectPresence()
    connectPresence()
  }, [accountReady, accountUser?.id, connectPresence, disconnectPresence])

  useEffect(() => {
    if (planets.length > 0) return

    let cancelled = false

    /**
     * Legacy path: pull the raw catalog from NASA and derive everything in a worker.
     * This is what the app used to do on every load; it now only runs when our own
     * catalog API is unreachable.
     */
    async function loadFromNasaDirect(): Promise<ProcessedPlanet[]> {
      const raw = await fetchExoplanets()

      return new Promise<ProcessedPlanet[]>((resolve, reject) => {
        const worker = new Worker(new URL('./services/planetWorker.ts', import.meta.url), {
          type: 'module',
        })
        worker.onmessage = (e) => {
          worker.terminate()
          if (e.data.type === 'SUCCESS') {
            resolve(e.data.payload as ProcessedPlanet[])
          } else {
            reject(new Error(e.data.error))
          }
        }
        worker.onerror = (e) => {
          worker.terminate()
          reject(new Error(e.message))
        }
        worker.postMessage({ rawData: raw })
      })
    }

    async function loadData() {
      setLoading(true)

      // 1. Our own API: pre-processed, binary, no NASA on the critical path.
      try {
        const { planets: decoded, bytes } = await fetchCatalog()
        if (cancelled) return
        setDataSource('api')
        setPlanets(decoded)
        console.info(
          `Catalog loaded from API: ${decoded.length} planets, ${(bytes / 1024).toFixed(1)} KB binary`
        )
        return
      } catch (apiError) {
        if (cancelled) return
        console.warn('Catalog API unavailable, falling back to direct NASA fetch.', apiError)
      }

      // 2. Degraded: straight to NASA, deriving everything client-side.
      try {
        const fromNasa = await loadFromNasaDirect()
        if (cancelled) return
        setDataSource('legacy')
        setLoadWarning(t('data.degradedNoApi'))
        setPlanets(fromNasa)
        return
      } catch (nasaError) {
        if (cancelled) return
        console.error('Direct NASA fetch failed as well.', nasaError)
      }

      // 3. Nothing worked. Show the curated handful and say so out loud, rather than
      //    quietly pretending the catalog only ever had seven planets in it.
      setDataSource('curated')
      setLoadWarning(t('data.offlineFallback'))
      setPlanets(processExoplanets(getCuratedFallback()))
    }

    loadData()

    return () => { cancelled = true }
  }, [planets.length, setPlanets, setLoading, t])

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
    <div className='flex h-screen flex-col bg-slate-950 text-white overflow-hidden dark:bg-slate-950 dark:text-white bg-slate-50 text-slate-900 transition-colors duration-300'>
      {/* Top Navigation Bar */}
      <header className='flex h-12 shrink-0 items-center justify-between border-b border-white/5 dark:border-white/5 border-slate-300 bg-slate-950/95 dark:bg-slate-950/95 bg-white/95 px-4 backdrop-blur-md z-30 transition-colors duration-300'>
        <div className='flex items-center gap-3'>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`rounded-lg p-1.5 transition-all ${
              sidebarOpen
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/40 shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                : 'text-slate-400 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
            }`}
            title={sidebarOpen ? 'Close Filter Sidebar' : 'Open Filter Sidebar'}
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
          {/* Find a planet. Separate from the sidebar's search box on purpose: that one
              filters the map, this one takes you to a single world and changes nothing
              else. */}
          <button
            onClick={() => useExplorerStore.getState().setSearchOpen(true)}
            className='flex h-8 items-center gap-2 rounded-lg border border-cyan-500/20 bg-slate-100 px-3 text-xs text-slate-500 backdrop-blur-md transition-all hover:border-cyan-400/40 hover:text-slate-700 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:text-slate-200'
            title={t('search.title')}
          >
            <Search className='h-3.5 w-3.5' />
            <span className='hidden md:inline'>{t('search.button')}</span>
            <kbd className='hidden rounded border border-slate-300 px-1 font-mono text-[10px] dark:border-white/10 md:inline'>
              Ctrl K
            </kbd>
          </button>

          {/* View mode toggle */}
          <div className='flex h-8 items-center rounded-lg border border-cyan-500/20 bg-slate-100 dark:bg-slate-900/60 p-1 backdrop-blur-md transition-colors duration-300'>
            <button
              onClick={() => setViewMode('3d')}
              className={`flex h-6 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all ${
                viewMode === '3d'
                  ? 'bg-cyan-500/20 text-cyan-500 dark:text-cyan-300 border border-cyan-400/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Box className='h-3.5 w-3.5' /> {t('sidebar.viewMode.3d')}
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`flex h-6 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-all ${
                viewMode === 'table'
                  ? 'bg-cyan-500/20 text-cyan-500 dark:text-cyan-300 border border-cyan-400/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              <Table2 className='h-3.5 w-3.5' /> {t('sidebar.viewMode.table')}
            </button>
          </div>

          {/* Planet count + where the data came from */}
          <div className='hidden h-8 items-center gap-2 rounded-lg border border-cyan-500/20 bg-slate-100 dark:bg-slate-900/60 px-3 font-mono text-xs text-slate-600 dark:text-slate-300 backdrop-blur-md sm:flex transition-colors duration-300'>
            <span
              className={`h-2 w-2 animate-pulse rounded-full ${
                dataSource === null
                  ? 'bg-slate-400'
                  : dataSource === 'api'
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                    : 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
              }`}
              title={dataSource === 'api' ? 'Catalog API' : 'Degraded source'}
            />
            <span>{filteredPlanets.length.toLocaleString()} {i18n.language.startsWith('vi') ? 'hành tinh' : 'planets loaded'}</span>
          </div>

          <PresenceBar />
          <AccountMenu />

          <ThemeToggle />
          <LanguageToggle />

          {/* Audio Mute toggle */}
          <button
            onClick={() => setIsMuted(toggleAudioMute())}
            className={`flex h-8 w-8 items-center justify-center rounded-lg border backdrop-blur-md transition-all duration-300 ${
              isMuted
                ? 'border-slate-500/20 bg-slate-100 dark:bg-slate-900/60 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-400 hover:bg-black/5 dark:hover:bg-white/5'
                : 'border-cyan-500/20 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.2)] hover:bg-cyan-100 dark:hover:bg-cyan-800/30'
            }`}
            title={isMuted ? 'Unmute BGM' : 'Mute BGM'}
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

      {/* Degraded-mode banner. The old code failed silently; a visitor had no way to
          tell whether they were looking at 6,000 planets or the seven-planet fallback. */}
      {loadWarning && (
        <div className='flex shrink-0 items-center gap-2 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-600 dark:text-amber-300'>
          <TriangleAlert className='h-3.5 w-3.5 shrink-0' />
          <span className='flex-1'>{loadWarning}</span>
          <button
            onClick={() => setLoadWarning(null)}
            className='rounded px-2 py-0.5 font-medium transition-colors hover:bg-amber-500/20'
          >
            {t('data.dismiss')}
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Sidebar */}
        <div
          className={`absolute inset-y-0 left-0 z-40 h-full transition-transform duration-300 ease-in-out ${
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
              <TimeMachine />

              {/* Reset View Button. Hidden while the time machine is open — both sit at
                  the bottom centre, and the scrubber is the thing being used there. */}
              {!selectedPlanet && !timelineEnabled && (
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

      {/* Mounted at the root rather than inside the 3D view: Ctrl+K has to work while
          the table is open too, and choosing a result switches back to the map. */}
      <PlanetSearch />
    </div>
  )
}
