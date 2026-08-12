import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import enJSON from './locales/en.json'
import viJSON from './locales/vi.json'

i18n
  // Detect user language
  .use(LanguageDetector)
  // Pass the i18n instance to react-i18next.
  .use(initReactI18next)
  // Init i18next
  .init({
    resources: {
      en: { translation: enJSON },
      vi: { translation: viJSON },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // Not needed for React as it escapes by default
    },
  })

export default i18n
