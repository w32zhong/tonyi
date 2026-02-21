<template>
  <div class="app-container">
    <!-- Navbar -->
    <Toolbar class="header-glass">
      <template #start>
        <!-- Logo or empty -->
      </template>

      <template #end>
        <div class="actions-group">
          <Button
            :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
            text
            rounded
            @click="toggleTheme"
            v-tooltip="isDark ? 'Light Mode' : 'Dark Mode'"
          />

          <Button
            icon="pi pi-language"
            text
            rounded
            @click="onLangClick"
            aria-haspopup="true"
            aria-controls="lang_menu"
          />
          <Menu ref="langMenu" id="lang_menu" :model="langItems" :popup="true" />
        </div>
      </template>
    </Toolbar>

    <!-- Main Content -->
    <main class="login-container">
      <div class="login-box">
        <!-- Cute Panda -->
        <div class="panda-wrapper">
          <img :src="pandaImage" class="panda-img" alt="Panda" />
        </div>

        <!-- Messages -->
        <div class="message-wrapper">
          <Message v-if="succMsg" severity="success" closable @close="succMsg = ''">{{ succMsg }}</Message>
          <Message v-if="errMsg" severity="error" closable @close="errMsg = ''">{{ errMsg }}</Message>
          <Message v-if="warnMsg" severity="warn" closable @close="warnMsg = ''">{{ warnMsg }}</Message>
        </div>

        <!-- Login Card -->
        <Card class="card-glass">
          <template #title>
            <span class="card-title">{{ $t('login') }}</span>
          </template>

          <template #content>
            <div class="form-grid">
              <div class="input-field">
                <label for="username">{{ $t('username') }}</label>
                <InputText
                  id="username"
                  v-model="username"
                  class="w-full"
                  @focus="pandaImage = pandaUsername"
                  @blur="pandaImage = pandaNormal"
                  @keyup.enter="handleLogin"
                />
              </div>

              <div class="input-field">
                <label for="password">{{ $t('password') }}</label>
                <InputText
                  id="password"
                  type="password"
                  v-model="password"
                  class="w-full"
                  @focus="pandaImage = pandaPassword"
                  @blur="pandaImage = pandaNormal"
                  @keyup.enter="handleLogin"
                />
              </div>
            </div>
          </template>

          <template #footer>
            <Button
              :label="$t('login')"
              class="w-full login-btn"
              @click="handleLogin"
              :loading="loading"
            />
          </template>
        </Card>

        <!-- Progress -->
        <ProgressBar v-if="loading" mode="indeterminate" class="progress-bar" />
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useTranslation } from 'i18next-vue'
import axios from 'axios'

// PrimeVue components
import Toolbar from 'primevue/toolbar'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import Card from 'primevue/card'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import ProgressBar from 'primevue/progressbar'

const { i18next, t } = useTranslation()

// Assets (Relative Paths)
const pandaNormal = './resource/panda-normal.png'

const pandaUsername = './resource/panda-username.png'
const pandaPassword = './resource/panda-password.png'

const pandaImage = ref(pandaNormal)

// State
const isDark = ref(false)
const username = ref('')
const password = ref('')
const loading = ref(false)
const succMsg = ref('')
const errMsg = ref('')
const warnMsg = ref('')

// Language Menu
const langMenu = ref()
const langItems = [
  { label: 'English', command: () => i18next.changeLanguage('en') },
  { label: '中文', command: () => i18next.changeLanguage('zh') },
  { label: 'Français', command: () => i18next.changeLanguage('fr') },
  { label: '日本語', command: () => i18next.changeLanguage('ja') }
]

const onLangClick = (event) => {
  langMenu.value.toggle(event)
}

// Theme Logic
const applyTheme = (dark) => {
  const html = document.documentElement
  if (dark) {
    html.classList.add('p-dark')
  } else {
    html.classList.remove('p-dark')
  }
}

const toggleTheme = () => {
  isDark.value = !isDark.value
  applyTheme(isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

// Login Logic
const handleLogin = async () => {
  succMsg.value = ''
  errMsg.value = ''
  warnMsg.value = ''

  if (!username.value.trim()) {
    errMsg.value = t('errors.empty_username')
    return
  }
  if (!password.value.trim()) {
    errMsg.value = t('errors.empty_password')
    return
  }

  loading.value = true

  try {
    const authBaseUrl = import.meta.env.VITE_AUTH_BASE_URL || '/auth'
    const cleanUrl = authBaseUrl.replace(/\/$/, '')

    const response = await axios.post(`${cleanUrl}/authentication`, {
      username: username.value,
      password: password.value
    })

    const data = response.data
    loading.value = false

    if (data.pass) {
      succMsg.value = t('success_redirect')
      const next = new URLSearchParams(window.location.search).get('next') || '/'
      setTimeout(() => window.location.assign(next), 1500)
    } else {
      errMsg.value = data.msg?.errmsg || t('login_failed')
      if (data.msg?.left_chances > 0) {
        warnMsg.value = t('chances_left', { count: data.msg.left_chances })
      }
    }
  } catch (err) {
    loading.value = false
    errMsg.value = err.message || t('errors.service_unavailable')
  }
}

onMounted(() => {
  const savedTheme = localStorage.getItem('theme')
  if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    isDark.value = true
  }
  applyTheme(isDark.value)
})
</script>

<style scoped>
/* Glass Effect Constants */
.header-glass, .card-glass {
  backdrop-filter: blur(12px);
  border: 1px solid color-mix(in srgb, var(--p-surface-200) 20%, transparent);
}

.p-dark .header-glass, .p-dark .card-glass {
  border-color: color-mix(in srgb, var(--p-surface-700) 30%, transparent);
}

/* Header */
.header-glass {
  position: sticky;
  top: 0;
  width: 100%;
  background: color-mix(in srgb, var(--p-surface-0) 60%, transparent);
  border-radius: 0;
  z-index: 1000;
  padding: 0.5rem 1rem;
}

.p-dark .header-glass {
  background: color-mix(in srgb, var(--p-surface-900) 60%, transparent);
}

.actions-group {
  display: flex;
  align-items: center;
  gap: 1.5rem; /* Requested padding between widgets */
}

/* Main Layout */
.login-container {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem 1rem;
}

.login-box {
  width: 100%;
  max-width: 420px;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* Panda Positioning */
.panda-wrapper {
  position: absolute;
  top: -20%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  display: flex;
  justify-content: center;
}

.panda-img {
  width: 120px;
  height: auto;
  transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.panda-img:hover {
  transform: scale(1.05);
}

/* Card Styling */
.card-glass {
  background: color-mix(in srgb, var(--p-surface-0) 70%, transparent);
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2);
  border-radius: 1.5rem;
  overflow: visible;
  padding: 1rem;
}

.p-dark .card-glass {
  background: color-mix(in srgb, var(--p-surface-900) 70%, transparent);
}

.card-title {
  display: block;
  text-align: center;
  font-weight: 700;
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

/* Form Styling */
.form-grid {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.input-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.input-field label {
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--p-text-secondary-color);
}

.w-full {
  width: 100%;
}

.login-btn {
  font-weight: 700;
  padding: 0.75rem;
  border-radius: 0.75rem;
}

/* Messages */
.message-wrapper {
  margin-bottom: 1rem;
  z-index: 10;
}

.progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 4px;
  border-radius: 0 0 1.5rem 1.5rem;
}

/* Mobile Responsive Adjustments */
@media (max-width: 480px) {
  .login-box {
    max-width: 100%;
  }

  .card-glass {
    border-radius: 1rem;
    padding: 0.5rem;
  }

  .panda-img {
    width: 110px;
  }

  .actions-group {
    gap: 0.75rem;
  }
}
</style>
