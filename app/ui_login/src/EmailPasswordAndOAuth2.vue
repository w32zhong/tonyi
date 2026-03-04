<template>
  <div class="login-combined-container">
    <EmailPassword
      @panda-focus="(f) => $emit('panda-focus', f)"
      @panda-blur="() => $emit('panda-blur')"
      @login-failed="loginFailed = true"
    />

    <div class="helper-links">
      <div v-if="loginFailed" class="helper-link">
        <span class="text-secondary">{{ $t('forgot_password') }}</span>
        <RouterLink to="/signin/email" class="primary-link">{{ $t('click_here') }}</RouterLink>
      </div>
      <div class="helper-link">
        <span class="text-secondary">{{ $t('no_account') }}</span>
        <RouterLink to="/signup/email" class="primary-link">{{ $t('signup_here') }}</RouterLink>
      </div>
    </div>

    <div class="section-divider">
      <div class="line"></div>
      <span class="text">{{ $t('or_continue_with') }}</span>
      <div class="line"></div>
    </div>

    <OAuth2
      @panda-focus="(f) => $emit('panda-focus', f)"
      @panda-blur="() => $emit('panda-blur')"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import EmailPassword from './EmailPassword.vue'
import OAuth2 from './OAuth2.vue'

defineEmits(['panda-focus', 'panda-blur'])

const loginFailed = ref(false)
</script>

<style scoped>
.login-combined-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.helper-links {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.875rem;
  text-align: center;
  margin-top: -0.5rem;
}

.text-secondary {
  color: var(--p-text-color-secondary, #6b7280);
}

.primary-link {
  color: var(--p-primary-color, #3b82f6);
  text-decoration: none;
  font-weight: 500;
}

.primary-link:hover {
  text-decoration: underline;
}

.section-divider {
  display: flex;
  align-items: center;
  margin: 1.5rem 0;
  opacity: 0.6;
}

.section-divider .line {
  flex: 1;
  height: 1px;
  background: var(--p-surface-300);
}

.section-divider .text {
  padding: 0 1rem;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
}
</style>
