import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import App from './App.vue'
import EmailPassword from './EmailPassword.vue'
import OAuth2 from './OAuth2.vue'
import EmailPasswordAndOAuth2 from './EmailPasswordAndOAuth2.vue'

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

// Router Setup
const routes = [
  {
    path: '/:action(login|signup)',
    name: 'EmailPasswordAndOAuth2',
    component: EmailPasswordAndOAuth2
  },
  {
    path: '/:action(bind)/email_password',
    name: 'EmailPassword',
    component: EmailPassword
  },
  {
    path: '/:action(bind)/oauth2',
    name: 'OAuth2',
    component: OAuth2
  },
  {
    path: '/',
    redirect: '/login'
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

// i18next Setup
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

app.use(router)
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
