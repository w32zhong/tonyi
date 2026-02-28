<template>
  <div class="login-combined-container">
    <EmailPassword
      @panda-focus="(f) => $emit('panda-focus', f)"
      @panda-blur="() => $emit('panda-blur')"
    />

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
import EmailPassword from './EmailPassword.vue'
import OAuth2 from './OAuth2.vue'

defineEmits(['panda-focus', 'panda-blur'])
</script>

<style scoped>
.login-combined-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
