<template>
  <div class="bind-oauth-content">
    <div class="oauth-actions-grid">
      <Button
        class="w-full oauth-btn google-btn"
        @click="handleGoogleLogin"
        :loading="loading"
      >
        <i class="pi pi-google mr-2"></i>
        <span>{{ $t('continue_with_google') }}</span>
      </Button>

      <Button
        class="w-full oauth-btn github-btn"
        severity="secondary"
        @click="handleGithubLogin"
        :loading="loading"
      >
        <i class="pi pi-github mr-2"></i>
        <span>{{ $t('continue_with_github') }}</span>
      </Button>

      <div class="backend-messages" v-if="errorMsg">
        <Message severity="error">{{ errorMsg }}</Message>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, defineEmits } from 'vue'
import { useTranslation } from 'i18next-vue'
import Button from 'primevue/button'
import Message from 'primevue/message'

const { t } = useTranslation()

defineEmits(['panda-focus', 'panda-blur'])

const loading = ref(false)
const errorKey = ref('')
const errorMsg = computed(() => errorKey.value ? t(errorKey.value) : '')

const handleGoogleLogin = () => {
  loading.value = true
  errorKey.value = ''

  const next = new URLSearchParams(window.location.search).get('next') || '/'
  
  const authBaseUrl = import.meta.env.VITE_AUTH_BASE_URL || '/auth'
  const cleanUrl = authBaseUrl.replace(/\/$/, '')
  
  window.location.href = `${cleanUrl}/oauth2/google?next=${encodeURIComponent(next)}`
}

const handleGithubLogin = () => {
  loading.value = true
  errorKey.value = ''

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
</style>

<style>
/* Unscoped global rules for button theming */
.google-btn {
  --p-button-primary-background: #db4437;
  --p-button-primary-hover-background: #c53929;
  --p-button-primary-active-background: #b03224;
  --p-button-primary-border-color: #db4437;
  --p-button-primary-hover-border-color: #c53929;
  --p-button-primary-active-border-color: #b03224;
  --p-button-primary-color: #ffffff;
  --p-button-primary-hover-color: #ffffff;
  --p-button-primary-active-color: #ffffff;
}

.p-dark .google-btn {
  --p-button-primary-background: #f28b82;
  --p-button-primary-hover-background: #f6aea9;
  --p-button-primary-active-background: #f9c2be;
  --p-button-primary-border-color: #f28b82;
  --p-button-primary-hover-border-color: #f6aea9;
  --p-button-primary-active-border-color: #f9c2be;
  --p-button-primary-color: #202124;
  --p-button-primary-hover-color: #202124;
  --p-button-primary-active-color: #202124;
}

.github-btn {
  --p-button-secondary-background: #24292e;
  --p-button-secondary-hover-background: #1b1f23;
  --p-button-secondary-active-background: #121417;
  --p-button-secondary-border-color: #24292e;
  --p-button-secondary-hover-border-color: #1b1f23;
  --p-button-secondary-active-border-color: #121417;
  --p-button-secondary-color: #ffffff;
  --p-button-secondary-hover-color: #ffffff;
  --p-button-secondary-active-color: #ffffff;
}

.p-dark .github-btn {
  --p-button-secondary-background: #f0f6fc;
  --p-button-secondary-hover-background: #e1e4e8;
  --p-button-secondary-active-background: #d1d5da;
  --p-button-secondary-border-color: #f0f6fc;
  --p-button-secondary-hover-border-color: #e1e4e8;
  --p-button-secondary-active-border-color: #d1d5da;
  --p-button-secondary-color: #24292e;
  --p-button-secondary-hover-color: #24292e;
  --p-button-secondary-active-color: #24292e;
}
</style>
