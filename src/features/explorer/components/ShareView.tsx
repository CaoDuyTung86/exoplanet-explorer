import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Link2, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../services/http'
import { createShare, shareCardFor, shareLinkFor } from '../services/shareApi'
import { captureShareState } from '../lib/shareState'
import { useExplorerStore } from '../stores/explorerStore'

/**
 * Turn what is on screen into a link.
 *
 * The link is minted on click rather than kept up to date as the visitor moves, for two
 * reasons: a request per camera frame is absurd, and a link that changed while it sat in
 * the panel would not be the one they copied. So the panel shows the view as it was the
 * moment the button was pressed, and pressing again after moving mints a new one.
 *
 * The URL is shown in a selectable field even after a successful copy. `navigator
 * .clipboard` needs a secure context and can be refused by permissions, and a share
 * button whose only feedback is "copied" is useless in exactly the case where it lied.
 */
export function ShareView() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [card, setCard] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fieldRef = useRef<HTMLInputElement>(null)

  const planetsLoaded = useExplorerStore((s) => s.planets.length > 0)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard denied — select the text so Ctrl+C still works, and say nothing that
      // claims the copy happened.
      fieldRef.current?.select()
    }
  }

  async function mint() {
    setOpen(true)
    setPending(true)
    setError(null)
    setCopied(false)

    try {
      const link = await createShare(captureShareState())
      const value = shareLinkFor(link.slug)
      setUrl(value)
      setCard(shareCardFor(link.slug))
      await copy(value)
    } catch (cause) {
      setUrl(null)
      setCard(null)
      // A 404 here means the focused planet is not in the catalog the API serves, which
      // in practice means the map is running off the NASA fallback. Anything else, show
      // what the server said — those messages are written to be read.
      setError(
        cause instanceof ApiError ? cause.message : t('share.unavailable')
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div ref={containerRef} className='relative'>
      <button
        onClick={() => (open ? setOpen(false) : mint())}
        disabled={!planetsLoaded}
        className={`flex h-8 w-8 items-center justify-center rounded-lg border backdrop-blur-md transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
          open
            ? 'border-cyan-400/40 bg-cyan-500/20 text-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.2)] dark:text-cyan-300'
            : 'border-slate-500/20 bg-slate-100 text-slate-500 hover:bg-black/5 hover:text-slate-700 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-white'
        }`}
        title={t('share.title')}
      >
        <Link2 className='h-4 w-4' />
      </button>

      {open && (
        <div className='absolute right-0 top-10 z-50 w-80 rounded-xl border border-cyan-500/20 bg-white/95 p-3 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-slate-950/95'>
          <div className='mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200'>
            <Link2 className='h-3.5 w-3.5 text-cyan-500' />
            {t('share.title')}
          </div>

          {pending && (
            <p className='py-2 text-xs text-slate-500 dark:text-slate-400'>{t('share.minting')}</p>
          )}

          {error && !pending && (
            <p className='flex items-start gap-2 py-1 text-xs text-amber-600 dark:text-amber-300'>
              <TriangleAlert className='mt-0.5 h-3.5 w-3.5 shrink-0' />
              <span>{error}</span>
            </p>
          )}

          {url && !pending && (
            <>
              <div className='flex items-center gap-1.5'>
                <input
                  ref={fieldRef}
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className='min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-700 outline-none focus:border-cyan-400/60 dark:border-white/10 dark:bg-black/40 dark:text-slate-200'
                />
                <button
                  onClick={() => copy(url)}
                  className='flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 transition-colors hover:bg-cyan-500/20 dark:text-cyan-300'
                  title={t('share.copy')}
                >
                  {copied ? <Check className='h-3.5 w-3.5' /> : <Copy className='h-3.5 w-3.5' />}
                </button>
              </div>
              <p className='mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400'>
                {copied ? t('share.copied') : t('share.hint')}
              </p>

              {/*
                The card the link unfurls into, shown before it is sent. It is the same
                URL a crawler fetches, so what is on screen here is literally what will
                appear in the chat window — and if the API cannot draw it, the image
                simply fails to load and takes its caption with it rather than leaving a
                broken frame promising something that will not arrive.
              */}
              {card && (
                <div className='mt-2.5'>
                  <img
                    src={card}
                    alt={t('share.cardAlt')}
                    width={1200}
                    height={630}
                    loading='lazy'
                    onError={() => setCard(null)}
                    className='w-full rounded-lg border border-white/10'
                  />
                  <p className='mt-1.5 text-[11px] text-slate-500 dark:text-slate-400'>
                    {t('share.cardHint')}
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
