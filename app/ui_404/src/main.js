import { createApp } from 'vue'
import i18next from 'i18next'
import I18NextVue from 'i18next-vue'
import HttpBackend from 'i18next-http-backend'
import LanguageDetector from 'i18next-browser-languagedetector'
import App from './App.vue'
import './main.css'

i18next
  .use(HttpBackend)
  .use(LanguageDetector)
  .init({
    fallbackLng: 'en',
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json'
    },
    detection: {
      order: ['querystring', 'navigator'],
      lookupQuerystring: 'lang',
      caches: ['localStorage', 'cookie']
    },
    interpolation: {
      escapeValue: false // not needed for vue as it escapes by default
    }
  })

const app = createApp(App)
app.use(I18NextVue, { i18next })
app.mount('#app')
