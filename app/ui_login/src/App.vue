<template>
  <div class="app-container">
    <!-- Navbar -->
    <Toolbar class="header-glass">
      <template #end>
        <div class="actions-group">
          <Button
            :icon="isDark ? 'pi pi-sun' : 'pi pi-moon'"
            text
            rounded
            @click="toggleTheme"
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
        <div class="panda-wrapper" :style="{ top: pandaTop }">
          <img :src="pandaImage" class="panda-img" alt="Panda" />
        </div>

        <!-- Login Card -->
        <Card class="card-glass">
          <template #title>
            {{ actionTitle }}
          </template>
          <template #content>
            <router-view
              @panda-focus="handlePandaFocus"
              @panda-blur="handlePandaBlur"
            />
          </template>
        </Card>
      </div>
    </main>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useTranslation } from 'i18next-vue'

// PrimeVue components
import Toolbar from 'primevue/toolbar'
import Button from 'primevue/button'
import Menu from 'primevue/menu'
import Card from 'primevue/card'
import { useRoute } from 'vue-router'

const { i18next, t } = useTranslation()
const route = useRoute()

// Assets
import pandaNormalImage from '@/assets/panda-normal.png'
import pandaUsernameImage from '@/assets/panda-username.png'
import pandaPasswordImage from '@/assets/panda-password.png'

const pandaImage = ref(pandaNormalImage)
const pandaNormalTop = '-80px'
const pandaTop = ref(pandaNormalTop)
const pandaUsernameTop = '-85px'
const pandaPasswordTop = '-70px'

const actionTitle = computed(() => {
  const action = route.params.action || 'login'
  return t(action)
})


const handlePandaFocus = (field) => {
  if (field === 'username') {
    pandaImage.value = pandaUsernameImage
    pandaTop.value = pandaUsernameTop
  } else if (field === 'password') {
    pandaImage.value = pandaPasswordImage
    pandaTop.value = pandaPasswordTop
  }
}

const handlePandaBlur = () => {
  pandaImage.value = pandaNormalImage
  pandaTop.value = pandaNormalTop
}

// State
const isDark = ref(false)

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
  gap: 1.5rem;
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
  left: 70%;
  transform: translateX(-50%);
  z-index: 99;
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
