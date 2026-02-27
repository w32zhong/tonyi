<template>
  <div class="bind-oauth-content">
    <div class="oauth-actions-grid">
      <Button
        class="w-full oauth-btn google-btn"
        @click="handleGoogleLogin"
        :loading="loading"
      >
        <i class="pi pi-google mr-2"></i>
        <span>{{ $t('continue_with_google') || 'Continue with Google' }}</span>
      </Button>

      <Button
        class="w-full oauth-btn github-btn"
        severity="secondary"
        @click="handleGithubLogin"
        :loading="loading"
      >
        <i class="pi pi-github mr-2"></i>
        <span>{{ $t('continue_with_github') || 'Continue with GitHub' }}</span>
      </Button>

      <div class="backend-messages" v-if="errorMsg">
        <Message severity="error">{{ errorMsg }}</Message>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, defineEmits } from 'vue'
import { useRoute } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'

const route = useRoute()
defineEmits(['panda-focus', 'panda-blur'])

const loading = ref(false)
const errorMsg = ref('')

const handleGoogleLogin = () => {
  loading.value = true
  errorMsg.value = ''

  // Pass the current action (login/signup/bind) to the backend
  const action = route.params.action || 'login'
  const next = new URLSearchParams(window.location.search).get('next') || '/'
  
  const authBaseUrl = import.meta.env.VITE_AUTH_BASE_URL || '/auth'
  const cleanUrl = authBaseUrl.replace(/\/$/, '')
  
  window.location.href = `${cleanUrl}/oauth2/google?next=${encodeURIComponent(next)}`
}

const handleGithubLogin = () => {
  loading.value = true
  errorMsg.value = ''

  // Pass the current action (login/signup/bind) to the backend
  const action = route.params.action || 'login'
  const next = new URLSearchParams(window.location.search).get('next') || '/'
  
  const authBaseUrl = import.meta.env.VITE_AUTH_BASE_URL || '/auth'
  const cleanUrl = authBaseUrl.replace(/\/$/, '')
  
  window.location.href = `${cleanUrl}/oauth2/github?next=${encodeURIComponent(next)}`
}
</script>

<style scoped>
.bind-oauth-content {
  position: relative;
}

.oauth-actions-grid {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.oauth-btn {
  font-weight: 700;
  padding: 0.75rem;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.backend-messages {
  margin-top: 1rem;
}

.w-full {
  width: 100%;
}

.mr-2 {
  margin-right: 0.5rem;
}
</style>
