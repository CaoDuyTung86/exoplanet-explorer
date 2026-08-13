import { useTranslation } from 'react-i18next'

export function LanguageToggle() {
  const { i18n } = useTranslation()

  const toggleLanguage = () => {
    const newLang = i18n.language.startsWith('vi') ? 'en' : 'vi'
    i18n.changeLanguage(newLang)
  }

  return (
    <button
      onClick={toggleLanguage}
      className='flex h-8 w-12 items-center justify-center rounded-lg border border-cyan-500/20 bg-slate-100 dark:bg-slate-900/60 font-mono text-xs font-bold text-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.2)] backdrop-blur-md transition-all hover:bg-slate-800/80 uppercase'
      title={i18n.language.startsWith('vi') ? 'Chuyển sang tiếng Anh' : 'Switch to Vietnamese'}
    >
      {i18n.language.startsWith('vi') ? 'VI' : 'EN'}
    </button>
  )
}
