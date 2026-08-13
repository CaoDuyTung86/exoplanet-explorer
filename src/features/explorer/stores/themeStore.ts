import { create } from 'zustand'

interface ThemeState {
  theme: 'dark' | 'light'
  toggleTheme: () => void
  setTheme: (theme: 'dark' | 'light') => void
}

export const useThemeStore = create<ThemeState>((set) => {
  // Initialize theme based on document class
  const isDark = document.documentElement.classList.contains('dark')
  return {
    theme: isDark ? 'dark' : 'light',
    toggleTheme: () =>
      set((state) => {
        const newTheme = state.theme === 'dark' ? 'light' : 'dark'
        if (newTheme === 'dark') {
          document.documentElement.classList.add('dark')
        } else {
          document.documentElement.classList.remove('dark')
        }
        return { theme: newTheme }
      }),
    setTheme: (theme) => {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
      set({ theme })
    },
  }
})
