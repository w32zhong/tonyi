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
import Button from 'primevue/button'
import Message from 'primevue/message'

defineEmits(['panda-focus', 'panda-blur'])

const loading = ref(false)
const errorMsg = ref('')

const handleGoogleLogin = () => {
  loading.value = true
  errorMsg.value = ''
  console.log('Simulating Google OAuth2 redirect...')

  // Simulation: redirect after 1.5s
  setTimeout(() => {
    loading.value = false
    // In a real app: window.location.href = '...'
    alert('Simulating redirect to Google Auth...')
  }, 1500)
}

const handleGithubLogin = () => {
  loading.value = true
  errorMsg.value = ''
  console.log('Simulating GitHub OAuth2 redirect...')

  setTimeout(() => {
    loading.value = false
    alert('Simulating redirect to GitHub Auth...')
  }, 1500)
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
