import { useState } from 'react'
import { Check, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountStore } from '../stores/accountStore'
import { useExplorerStore } from '../stores/explorerStore'
import { DEFAULT_FILTERS } from '../types'

/**
 * Filter presets, stored server-side against the account.
 *
 * A preset is applied on top of the defaults rather than merged into whatever is
 * currently set — otherwise loading a preset saved with three sliders would silently
 * inherit the other seven from the screen it was loaded on, and would not reproduce.
 */
export function SavedFilters() {
  const { t } = useTranslation()
  const [name, setName] = useState('')

  const user = useAccountStore((s) => s.user)
  const savedFilters = useAccountStore((s) => s.savedFilters)
  const saveFilterPreset = useAccountStore((s) => s.saveFilterPreset)
  const deleteFilterPreset = useAccountStore((s) => s.deleteFilterPreset)
  const busy = useAccountStore((s) => s.busy)

  const filters = useExplorerStore((s) => s.filters)
  const setFilters = useExplorerStore((s) => s.setFilters)

  if (!user) return null

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (await saveFilterPreset(trimmed, filters)) setName('')
  }

  return (
    <div className='border-t border-slate-200 pt-4 dark:border-white/5'>
      <label className='mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-white/30'>
        {t('account.savedFilters')}
      </label>

      <div className='mb-2 flex gap-1.5'>
        <input
          type='text'
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
          maxLength={60}
          placeholder={t('account.presetNamePlaceholder')}
          className='min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-100 px-2.5 py-1.5 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-primary/50 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/20'
        />
        <button
          onClick={save}
          disabled={busy || name.trim().length === 0}
          title={t('account.savePreset')}
          className='shrink-0 rounded-lg bg-cyan-500/20 px-2.5 text-cyan-600 transition-colors hover:bg-cyan-500/30 disabled:opacity-40 dark:text-cyan-300'
        >
          <Save className='h-3.5 w-3.5' />
        </button>
      </div>

      {savedFilters.length === 0 ? (
        <p className='text-[10px] leading-relaxed text-slate-500 dark:text-white/30'>
          {t('account.noPresets')}
        </p>
      ) : (
        <div className='space-y-1'>
          {savedFilters.map((preset) => (
            <div
              key={preset.id}
              className='group flex items-center gap-1.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-slate-100 dark:hover:bg-white/5'
            >
              <button
                onClick={() => setFilters({ ...DEFAULT_FILTERS, ...preset.filters })}
                className='flex min-w-0 flex-1 items-center gap-1.5 text-left'
              >
                <Check className='h-3 w-3 shrink-0 text-cyan-500' />
                <span className='truncate text-[11px] text-slate-800 dark:text-white/70'>
                  {preset.name}
                </span>
              </button>
              <button
                onClick={() => deleteFilterPreset(preset.id)}
                title={t('account.deletePreset')}
                className='shrink-0 rounded p-1 text-slate-400 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100'
              >
                <Trash2 className='h-3 w-3' />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
