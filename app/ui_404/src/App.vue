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

onMounted(() => {
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
  background: white;
  padding: 2rem;
  border-radius: 1rem;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
  width: 100%;
  max-width: 600px;
  text-align: center;
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
  color: #2f3542;
  font-size: 1.1rem;
}

.redirect-action {
  color: #747d8c;
  font-size: 0.95rem;
}

.redirect-link {
  color: #3742fa;
  font-weight: 600;
  text-decoration: none;
  transition: color 0.2s;
}

.redirect-link:hover {
  text-decoration: underline;
  color: #5352ed;
}

/* Ensure the injected span has some emphasis */
:deep(#n-sec) {
  font-weight: 700;
  color: #ff4757;
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
