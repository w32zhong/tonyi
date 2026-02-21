import { createApp } from 'vue'
import App from './App.vue'

import i18next from 'i18next'
import I18NextVue from 'i18next-vue'
import LanguageDetector from 'i18next-browser-languagedetector'

import PrimeVue from 'primevue/config'
import Tooltip from 'primevue/tooltip'
import UsingTheme from '@primeuix/themes/nora'
import 'primeicons/primeicons.css'
import './style.css'

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
    }
  })

const app = createApp(App)

app.use(I18NextVue, { i18next })
app.directive('tooltip', Tooltip)
app.use(PrimeVue, {
    theme: {
        preset: UsingTheme,
        options: {
            darkModeSelector: '.p-dark',
        }
    }
})

app.mount('#app')
