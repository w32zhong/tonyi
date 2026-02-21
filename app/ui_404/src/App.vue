<template>
  <div class="container">
    <div v-if="!isI18nLoaded" class="loading">Loading...</div>
    <div v-else class="error-content">
      <h1 class="error-code">404</h1>
      <h2 class="error-title">{{ $t('translation:title') }}</h2>
      <p class="error-desc">{{ $t('translation:description') }}</p>

      <div class="countdown-box">
        <p>{{ $t('translation:redirect_message', { count: remainingTime }) }}</p>
        <button class="redirect-btn" @click="redirectNow">{{ $t('translation:redirect_now') }}</button>
      </div>

    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useTranslation } from 'i18next-vue'

const { i18next } = useTranslation()

const remainingTime = ref(parseInt(import.meta.env.VITE_REDIRECT_TIMEOUT || '5', 10))
const redirectUrl = import.meta.env.VITE_REDIRECT_URL || '/'
let timer = null

const isI18nLoaded = ref(false)


onMounted(() => {
  // Wait for i18next to initialize the translation resources over HTTP
  if (i18next.isInitialized) {
    isI18nLoaded.value = true
    startTimer()
  } else {
    i18next.on('initialized', () => {
      isI18nLoaded.value = true
      startTimer()
    })
  }
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
}
.error-content {
  background: white;
  padding: 3rem 4rem;
  border-radius: 1rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  max-width: 500px;
}
.error-code {
  font-size: 6rem;
  margin: 0;
  color: #ff4757;
  font-weight: 800;
  line-height: 1;
}
.error-title {
  font-size: 1.8rem;
  margin: 1rem 0;
  color: #2f3542;
}
.error-desc {
  color: #747d8c;
  margin-bottom: 2rem;
}
.countdown-box {
  background: #f1f2f6;
  padding: 1.5rem;
  border-radius: 0.5rem;
  margin-bottom: 2rem;
}
.countdown-box p {
  margin: 0 0 1rem 0;
  font-weight: 500;
  color: #2f3542;
}
.redirect-btn {
  background: #3742fa;
  color: white;
  border: none;
  padding: 0.6rem 1.5rem;
  border-radius: 2rem;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}
.redirect-btn:hover {
  background: #5352ed;
}
</style>
