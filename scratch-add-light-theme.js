import fs from 'fs'
import path from 'path'

const files = [
  'src/features/explorer/components/FilterSidebar.tsx',
  'src/features/explorer/components/StatsPanel.tsx',
  'src/features/explorer/components/DataTable.tsx',
  'src/features/explorer/components/PlanetDetailCard.tsx',
  'src/features/explorer/components/LanguageToggle.tsx'
]

const replacements = [
  { regex: /(?<!dark:)bg-slate-950\/80/g, replacement: 'bg-white/90 dark:bg-slate-950/80' },
  { regex: /(?<!dark:)border-white\/5/g, replacement: 'border-slate-200 dark:border-white/5' },
  { regex: /(?<!dark:)border-white\/10/g, replacement: 'border-slate-300 dark:border-white/10' },
  { regex: /(?<!dark:)border-white\/20/g, replacement: 'border-slate-400 dark:border-white/20' },
  { regex: /(?<!dark:)text-white(?!\/)/g, replacement: 'text-slate-900 dark:text-white' },
  { regex: /(?<!dark:)text-white\/30/g, replacement: 'text-slate-400 dark:text-white/30' },
  { regex: /(?<!dark:)text-white\/40/g, replacement: 'text-slate-500 dark:text-white/40' },
  { regex: /(?<!dark:)text-white\/50/g, replacement: 'text-slate-600 dark:text-white/50' },
  { regex: /(?<!dark:)text-white\/60/g, replacement: 'text-slate-700 dark:text-white/60' },
  { regex: /(?<!dark:)text-white\/70/g, replacement: 'text-slate-700 dark:text-white/70' },
  { regex: /(?<!dark:)text-white\/80/g, replacement: 'text-slate-800 dark:text-white/80' },
  { regex: /(?<!dark:)text-slate-400/g, replacement: 'text-slate-500 dark:text-slate-400' },
  { regex: /(?<!dark:)text-slate-300/g, replacement: 'text-slate-600 dark:text-slate-300' },
  { regex: /(?<!dark:)text-slate-500/g, replacement: 'text-slate-500 dark:text-slate-400' },
  { regex: /(?<!dark:)bg-slate-900\/40/g, replacement: 'bg-slate-100 dark:bg-slate-900/40' },
  { regex: /(?<!dark:)bg-slate-900\/50/g, replacement: 'bg-slate-50 dark:bg-slate-900/50' },
  { regex: /(?<!dark:)bg-slate-900\/60/g, replacement: 'bg-slate-100 dark:bg-slate-900/60' },
  { regex: /(?<!dark:)bg-slate-900\/80/g, replacement: 'bg-white dark:bg-slate-900/80' },
  { regex: /(?<!dark:)bg-white\/5/g, replacement: 'bg-slate-100 dark:bg-white/5' },
  { regex: /(?<!dark:)bg-white\/10/g, replacement: 'bg-slate-200 dark:bg-white/10' },
  { regex: /(?<!dark:)bg-white\/20/g, replacement: 'bg-slate-300 dark:bg-white/20' }
]

files.forEach(file => {
  const filepath = path.resolve('d:/clone repo/exoplanet-explorer', file)
  if (fs.existsSync(filepath)) {
    let content = fs.readFileSync(filepath, 'utf-8')
    replacements.forEach(r => {
      content = content.replace(r.regex, r.replacement)
    })
    fs.writeFileSync(filepath, content)
    console.log(`Updated ${file}`)
  } else {
    console.log(`File not found: ${file}`)
  }
})
