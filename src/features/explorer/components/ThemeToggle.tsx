import { Sun, Moon } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme)
  const toggleTheme = useThemeStore((s) => s.toggleTheme)

  return (
    <button
      onClick={toggleTheme}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border backdrop-blur-md transition-all ${
        theme === 'light'
          ? 'border-yellow-400/40 bg-yellow-400/20 text-yellow-500 shadow-[0_0_10px_rgba(250,204,21,0.2)]'
          : 'border-slate-500/20 bg-slate-900/60 text-slate-400 hover:bg-white/5 hover:text-white'
      }`}
      title={theme === 'light' ? 'Switch to Dark Theme' : 'Switch to Light Theme'}
    >
      {theme === 'light' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}
