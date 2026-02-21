import { createApp } from 'vue'
import i18next from 'i18next'
import I18NextVue from 'i18next-vue'
import LanguageDetector from 'i18next-browser-languagedetector'
import App from './App.vue'
import './main.css'

import enTranslation from './locales/en/translation.json'
import zhTranslation from './locales/zh/translation.json'
import frTranslation from './locales/fr/translation.json'
import jaTranslation from './locales/ja/translation.json'

i18next
  .use(LanguageDetector)
  .init({
    fallbackLng: 'en',
    resources: {
      en: { translation: enTranslation },
      zh: { translation: zhTranslation },
      fr: { translation: frTranslation },
      ja: { translation: jaTranslation }
    },
    detection: {
      order: ['querystring', 'cookie', 'localStorage', 'navigator'],
      lookupQuerystring: 'lang',
      caches: ['localStorage', 'cookie'],
      cookieOptions: { path: '/', sameSite: 'strict' }
    },
    interpolation: {
      escapeValue: false // not needed for vue as it escapes by default
    }
  })

const app = createApp(App)
app.use(I18NextVue, { i18next })
app.mount('#app')
