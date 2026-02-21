<template>
  <div class="app-container">
    <Toolbar class="topbar">
      <template #start>
        <div class="logo-container">
          <h3>Approach Zero</h3>
        </div>
      </template>

      <template #end>
        <div class="theme-switch-container">
          <i class="pi pi-sun theme-icon"></i>
          <ToggleSwitch v-model="nightTheme" @change="toggleTheme" />
          <i class="pi pi-moon theme-icon"></i>
          <Button icon="pi pi-language" text rounded @click="toggleLanguage" />
        </div>
      </template>
    </Toolbar>


    <div class="login-wrapper">
      <div class="loginbox">
        <img :src="panda_image" class="panda" alt="Panda" />

        <div class="message-container" v-if="errMsg || warnMsg || succMsg">
          <Message style="position: absolute; bottom: -110px" severity="success" v-if="succMsg">
            {{succMsg}}
          </Message>
          <Message style="position: absolute; bottom: -110px" severity="error" v-if="errMsg">
            {{errMsg}}
          </Message>
          <Message style="position: absolute; bottom: -200px" severity="warn" v-if="warnMsg">
            {{warnMsg}}
          </Message>
        </div>

        <Card class="login-card">
          <template #title>
            {{ $t('login') }}
          </template>

          <template #content>
            <div class="form-container">
              <div class="field">
                <label for="username">{{ $t('username') }}</label>
                <InputText id="username" type="text" v-model="username"
                 @focus="panda_image = panda_username"
                 @keyup.enter="onLogin"
                 @blur="panda_image = panda_normal"
                 class="w-full" />
              </div>

              <div class="field">
                <label for="password">{{ $t('password') }}</label>
                <InputText id="password" type="password" v-model="password"
                 @focus="panda_image = panda_password"
                 @keyup.enter="onLogin"
                 @blur="panda_image = panda_normal"
                 class="w-full" />
              </div>
            </div>
          </template>

          <template #footer>
            <div class="footer-actions">
              <Button :label="$t('login')" @click="onLogin" :disabled="showProgress" class="w-full" />
            </div>
          </template>
        </Card>

        <ProgressBar mode="indeterminate" v-show="showProgress" class="progress-bar" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useTranslation } from 'i18next-vue'
import axios from 'axios'

import Toolbar from 'primevue/toolbar'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import ProgressBar from 'primevue/progressbar'
import Message from 'primevue/message'

const { i18next } = useTranslation()

const logo = ref('/resource/logo.png')
const panda_normal = ref('/resource/panda-normal.png')
const panda_username = ref('/resource/panda-username.png')
const panda_password = ref('/resource/panda-password.png')

const panda_image = ref(panda_normal.value)

const nightTheme = ref(false)
const username = ref('')
const password = ref('')
const succMsg = ref('')
const warnMsg = ref('')
const errMsg = ref('')
const showProgress = ref(false)

const toggleTheme = () => {
  const root = document.getElementsByTagName('html')[0]
  if (nightTheme.value) {
    root.classList.add('p-dark')
  } else {
    root.classList.remove('p-dark')
  }
  localStorage.setItem('theme', nightTheme.value ? 'dark' : 'light')
}

const toggleLanguage = () => {
  const langs = ['en', 'zh', 'fr', 'ja']
  const currentLang = i18next.language.split('-')[0] // handle cases like en-US
  const currentIndex = langs.indexOf(currentLang) >= 0 ? langs.indexOf(currentLang) : 0
  const nextIndex = (currentIndex + 1) % langs.length
  i18next.changeLanguage(langs[nextIndex])
}

onMounted(() => {
  // Check user preference
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    nightTheme.value = true
  }

  toggleTheme()


})

const formCheck = (validCallbk) => {
  if (username.value.trim() === "") {
    errMsg.value = i18next.t('errors.empty_username')
  } else if (password.value.trim() === "") {
    errMsg.value = i18next.t('errors.empty_password')
  } else {
    validCallbk()
  }
}

const getNextURL = () => {
  const parms = window.location.search
  const match = parms.match(/next=([^&]+)/) || []
  if (match[1]) return decodeURIComponent(match[1])
  return '/'
}

const JwtRequst = () => {
  const authBaseUrl = import.meta.env.VITE_AUTH_BASE_URL || '/auth';
  axios.post(`${authBaseUrl.replace(/\/$/, '')}/authentication`, {
    username: username.value,
    password: password.value
  })
  .then(res => {
    const data = res.data
    showProgress.value = false

    if (data.pass) {
      succMsg.value = i18next.t('success_redirect')
      setTimeout(() => {
        const url = getNextURL()
        window.location.replace(url)
      }, 2000)
    } else if (data.msg) {
      errMsg.value = `${i18next.t('login_failed')}: ${data.msg.errmsg}`
      if (data.msg.left_chances > 0) {
        warnMsg.value = `${i18next.t('chances_left', { count: data.msg.left_chances })}`
      }
    } else {
      warnMsg.value = i18next.t('errors.service_unavailable')
    }
  })
  .catch(err => {
    showProgress.value = false
    errMsg.value = err.toString()
  })
}

const onLogin = () => {
  errMsg.value = ''
  warnMsg.value = ''
  succMsg.value = ''

  formCheck(() => {
    showProgress.value = true
    setTimeout(JwtRequst, 500)
  })
}
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.topbar {
  position: fixed;
  top: 0;
  width: 100%;
  z-index: 1000;
  border: none;
  background: color-mix(in srgb, var(--p-surface-0) 80%, transparent);
  backdrop-filter: blur(10px);
}

 :global(.p-dark) .topbar {
  background: color-mix(in srgb, var(--p-surface-900) 80%, transparent);
}

.logo-container {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.logo-img {
  height: 2rem;
}

.theme-switch-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.theme-icon {
  font-size: 1.25rem;
}

.login-wrapper {
  flex-grow: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  position: relative;
  z-index: 10;
}

.loginbox {
  position: relative;
  width: 100%;
  max-width: 400px;
  margin-top: 5rem;
}

.panda {
  position: absolute;
  z-index: 20;
  top: -85px;
  left: 50%;
  width: 120px;
  height: 95px;
  transform: translate(-50%, 0);
  transition: all 0.3s ease;
}

.message-container {
  position: absolute;
  width: 100%;
  display: flex;
  justify-content: center;
}

.login-card {
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  overflow: visible;
}

.form-container {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.w-full {
  width: 100%;
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  height: 4px;
  border-bottom-left-radius: 12px;
  border-bottom-right-radius: 12px;
}


@media (max-width: 768px) {
  .loginbox {
    padding: 0 1rem;
  }
}
</style>
