<template>
  <div class="container">
    <div class="error-content">
      <div class="image-wrapper">
        <img :src="beeImage" alt="404 Page Not Found" class="error-image" />
      </div>

      <div class="countdown-box">
        <!-- Render HTML safely so <span id="n-sec"> works -->
        <p v-html="$t('translation:redirect_message', { count: remainingTime })"></p>
        <p class="redirect-action">
          {{ $t('translation:redirect_prefix') }}<a :href="redirectUrl" class="redirect-link" @click.prevent="redirectNow">{{ $t('translation:redirect_now') }}</a>{{ $t('translation:redirect_suffix') }}
        </p>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useTranslation } from 'i18next-vue'
import beeImage from './assets/404-bee.png'

const { i18next } = useTranslation()

const remainingTime = ref(parseInt(import.meta.env.VITE_REDIRECT_TIMEOUT || '5', 10))
const redirectUrl = import.meta.env.VITE_REDIRECT_URL || '/'
let timer = null

// Apply or remove the .p-dark class on <html> to match ui_login behaviour
const applyTheme = (dark) => {
  if (dark) {
    document.documentElement.classList.add('p-dark')
  } else {
    document.documentElement.classList.remove('p-dark')
  }
}

onMounted(() => {
  // Honour the preference saved by ui_login, then fall back to OS preference
  const savedTheme = localStorage.getItem('theme')
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  applyTheme(savedTheme === 'dark' || (!savedTheme && prefersDark))

  // Since translations are bundled, they are available immediately.
  startTimer()
})

const startTimer = () => {
  timer = setInterval(() => {
    if (remainingTime.value > 1) {
      remainingTime.value -= 1
    } else {
      clearInterval(timer)
      redirectNow()
    }
  }, 1000)
}

const redirectNow = () => {
  if (timer) clearInterval(timer)
  window.location.href = redirectUrl
}


</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1rem;
}
.error-content {
  background: color-mix(in srgb, var(--p-surface-0) 70%, transparent);
  border: 1px solid color-mix(in srgb, var(--p-surface-200) 20%, transparent);
  backdrop-filter: blur(12px);
  padding: 2rem;
  border-radius: 1rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
  width: 100%;
  max-width: 600px;
  text-align: center;
}

:global(.p-dark) .error-content {
  background: color-mix(in srgb, var(--p-surface-900) 70%, transparent);
  border-color: color-mix(in srgb, var(--p-surface-700) 30%, transparent);
}

.image-wrapper {
  margin-bottom: 2rem;
}

.error-image {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}

.countdown-box {
  padding: 1rem;
}
.countdown-box p {
  margin: 0 0 1rem 0;
  font-weight: 500;
  color: var(--p-surface-900);
  font-size: 1.1rem;
}

:global(.p-dark) .countdown-box p {
  color: var(--p-surface-0);
}

.redirect-action {
  color: var(--p-surface-500);
  font-size: 0.95rem;
}

:global(.p-dark) .redirect-action {
  color: var(--p-surface-400);
}

.redirect-link {
  color: var(--p-primary-color);
  font-weight: 600;
  text-decoration: none;
  transition: color 0.2s;
}

.redirect-link:hover {
  text-decoration: underline;
  color: var(--p-primary-hover-color);
}

/* Ensure the injected span has some emphasis */
:deep(#n-sec) {
  font-weight: 700;
  color: var(--p-red-500);
  font-size: 1.2rem;
}

@media (max-width: 480px) {
  .error-content {
    padding: 1.5rem 1rem;
  }
  .countdown-box p {
    font-size: 1rem;
  }
}
</style>
