import { useEffect, useMemo, useRef, useState } from 'react'
import { Radio, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { usePresenceStore } from '../stores/presenceStore'
import { useExplorerStore } from '../stores/explorerStore'

/**
 * Who else is on the map right now.
 *
 * Collapsed it is a count; opened it lists each visitor and the planet they are looking
 * at, and clicking one flies there. The planet *name* is resolved from the catalog this
 * browser already holds — the server only ever broadcasts ids, so nobody can put
 * arbitrary text in someone else's presence row.
 */
export function PresenceBar() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const status = usePresenceStore((s) => s.status)
  const peers = usePresenceStore((s) => s.peers)
  const self = usePresenceStore((s) => s.self)
  const backend = usePresenceStore((s) => s.backend)
  const planets = useExplorerStore((s) => s.planets)

  const others = useMemo(
    () => Object.values(peers).filter((peer) => peer.id !== self?.id),
    [peers, self?.id]
  )

  // `self` is the identity handed over in the welcome frame and never changes after
  // that, so our own focus has to be read back out of the peer map like everyone
  // else's — otherwise our row claims we are looking at nothing.
  const selfPeer = self ? (peers[self.id] ?? self) : null

  // Resolving a name means a scan of ~6,300 planets, so it is done once per peer list
  // change rather than once per render.
  const planetNames = useMemo(() => {
    const wanted = new Set(
      [...others, ...(selfPeer ? [selfPeer] : [])]
        .map((p) => p.planetId)
        .filter(Boolean) as string[]
    )
    if (wanted.size === 0) return new Map<string, string>()

    const names = new Map<string, string>()
    for (const planet of planets) {
      if (wanted.has(planet.id)) names.set(planet.id, planet.pl_name)
    }
    return names
  }, [others, selfPeer, planets])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const flyTo = (planetId: string | null) => {
    if (!planetId) return
    const planet = planets.find((p) => p.id === planetId)
    if (planet) useExplorerStore.getState().setSelectedPlanet(planet)
    setOpen(false)
  }

  // Nothing to show before the socket has said hello.
  if (status !== 'live' || !selfPeer) return null

  return (
    <div className='relative' ref={containerRef}>
      <button
        onClick={() => setOpen(!open)}
        title={t('presence.title')}
        className='flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 dark:border-white/10 bg-slate-100 dark:bg-slate-900/60 px-2.5 text-xs font-medium text-slate-600 dark:text-slate-300 backdrop-blur-md transition-colors hover:text-slate-900 dark:hover:text-white'
      >
        <Users className='h-3.5 w-3.5' />
        <span className='font-mono'>{others.length + 1}</span>

        {/* A stack of dots is a cheaper "who is here" than avatars, and it reads at a
            glance from the header. */}
        <span className='hidden items-center -space-x-1 sm:flex'>
          {others.slice(0, 4).map((peer) => (
            <span
              key={peer.id}
              className='h-2 w-2 rounded-full ring-1 ring-slate-100 dark:ring-slate-900'
              style={{ backgroundColor: peer.color }}
            />
          ))}
        </span>
      </button>

      {open && (
        <div className='absolute right-0 top-10 z-50 w-72 overflow-hidden rounded-xl border border-slate-300 dark:border-white/10 bg-white dark:bg-slate-950/95 shadow-2xl backdrop-blur-xl'>
          <div className='flex items-center justify-between border-b border-slate-200 dark:border-white/10 px-3 py-2'>
            <span className='flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/40'>
              <Radio className='h-3 w-3 text-emerald-400' />
              {t('presence.title')}
            </span>
            {/* Says whether the fan-out is really going through Redis or the process is
                on its own — the quickest way to spot a half-wired deployment. */}
            <span className='font-mono text-[10px] text-slate-400 dark:text-white/25'>
              {backend}
            </span>
          </div>

          <div className='max-h-72 overflow-y-auto p-1.5'>
            <PeerRow
              peer={selfPeer}
              planetName={
                selfPeer.planetId ? (planetNames.get(selfPeer.planetId) ?? null) : null
              }
              isSelf
              label={t('presence.you')}
            />

            {others.length === 0 ? (
              <p className='px-2 py-3 text-[11px] leading-relaxed text-slate-500 dark:text-white/40'>
                {t('presence.aloneHere')}
              </p>
            ) : (
              others.map((peer) => (
                <PeerRow
                  key={peer.id}
                  peer={peer}
                  planetName={peer.planetId ? (planetNames.get(peer.planetId) ?? null) : null}
                  onClick={() => flyTo(peer.planetId)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface PeerRowProps {
  peer: { id: string; name: string; color: string; authenticated: boolean }
  planetName: string | null
  isSelf?: boolean
  label?: string
  onClick?: () => void
}

function PeerRow({ peer, planetName, isSelf, label, onClick }: PeerRowProps) {
  const { t } = useTranslation()

  return (
    <button
      onClick={onClick}
      disabled={!onClick || !planetName}
      className='flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors enabled:hover:bg-slate-100 dark:enabled:hover:bg-white/5 disabled:cursor-default'
    >
      <span
        className='h-2.5 w-2.5 shrink-0 rounded-full'
        style={{ backgroundColor: peer.color }}
      />
      <span className='min-w-0 flex-1'>
        <span className='flex items-center gap-1.5'>
          <span className='truncate text-xs text-slate-800 dark:text-white/80'>{peer.name}</span>
          {isSelf && (
            <span className='shrink-0 rounded bg-slate-200 px-1 text-[9px] font-semibold uppercase text-slate-500 dark:bg-white/10 dark:text-white/40'>
              {label}
            </span>
          )}
          {peer.authenticated && !isSelf && (
            <span className='shrink-0 text-[9px] text-cyan-500' title={t('presence.signedIn')}>
              ●
            </span>
          )}
        </span>
        <span className='block truncate text-[10px] text-slate-500 dark:text-white/30'>
          {planetName ? t('presence.viewing', { planet: planetName }) : t('presence.browsing')}
        </span>
      </span>
    </button>
  )
}
