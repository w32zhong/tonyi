<template>
  <div class="login-combined-container">
    <div class="card-title-container">
      <span class="card-title-text">{{ actionTitle }}</span>
    </div>

    <EmailPassword
      @panda-focus="(f) => $emit('panda-focus', f)"
      @panda-blur="() => $emit('panda-blur')"
    />

    <div class="section-divider">
      <div class="line"></div>
      <span class="text">{{ $t('or_continue_with') || 'OR' }}</span>
      <div class="line"></div>
    </div>

    <OAuth2
      @panda-focus="(f) => $emit('panda-focus', f)"
      @panda-blur="() => $emit('panda-blur')"
    />
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useTranslation } from 'i18next-vue'
import EmailPassword from './EmailPassword.vue'
import OAuth2 from './OAuth2.vue'

const { t } = useTranslation()
const route = useRoute()

defineEmits(['panda-focus', 'panda-blur'])

const actionTitle = computed(() => {
  const action = route.params.action || 'login'
  return t(action)
})
</script>

<style scoped>
.login-combined-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.card-title-container {
  margin-bottom: 1.5rem;
  padding-left: 0.5rem;
  text-align: left;
}

.card-title-text {
  font-weight: 700;
  font-size: 1.25rem;
  opacity: 0.8;
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
