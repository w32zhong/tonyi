<template>
  <div class="login-password-content">
    <Form v-slot="$form" :initialValues="initialValues" :resolver="resolver" :validateOnBlur="true" @submit="onFormSubmit" class="form-grid">
      <div class="flex flex-col gap-1">
        <InputText
          name="username"
          type="text"
          class="w-full"
          :placeholder="$t('username')"
          fluid
          @focus="$emit('panda-focus', 'username')"
          @blur="$emit('panda-blur')"
        />
        <Message v-if="$form?.username?.invalid" severity="error" size="small" variant="simple">{{ $t($form?.username?.error?.message) }}</Message>
      </div>

      <div class="flex flex-col gap-1">
        <Password
          name="password"
          :placeholder="$t('password')"
          :feedback="false"
          toggleMask
          fluid
          @focus="$emit('panda-focus', 'password')"
          @blur="$emit('panda-blur')"
        />
        <Message v-if="$form?.password?.invalid" severity="error" size="small" variant="simple">{{ $t($form?.password?.error?.message) }}</Message>
      </div>

      <div class="footer-actions mt-4">
        <Button
          type="submit"
          :label="actionTitle"
          class="w-full login-btn"
          :loading="loading"
          :disabled="!$form?.valid || !$form?.username?.value || !$form?.password?.value"
        />
      </div>

      <div class="backend-messages" v-if="succMsg || failMsg">
        <Message v-if="succMsg" severity="success" closable @close="succKey = ''">{{ succMsg }}</Message>
        <Message v-if="failMsg" severity="error" closable @close="resetFail">{{ failMsg }}</Message>
      </div>
    </Form>
  </div>
</template>

<script setup>
import { ref, reactive, computed, defineEmits } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useRoute } from 'vue-router'
import axios from 'axios'
import { z } from 'zod'

// PrimeVue components
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Message from 'primevue/message'
import { Form } from '@primevue/forms'

const { t } = useTranslation()
const route = useRoute()

defineEmits(['panda-focus', 'panda-blur'])

const actionTitle = computed(() => {
  const action = route.params.action || 'login'
  return t(action)
})

// State
const loading = ref(false)
const succKey = ref('')
const failInfo = ref({ key: '', chances: -1 })

const resetFail = () => {
  failInfo.value.key = ''
  failInfo.value.chances = -1
}

const succMsg = computed(() => succKey.value ? t(succKey.value) : '')
const failMsg = computed(() => {
  if (!failInfo.value.key) return ''
  const base = t(failInfo.value.key)
  return failInfo.value.chances >= 0
    ? `${base}\n${t('chances_left', { count: failInfo.value.chances })}`
    : base
})

const initialValues = reactive({
  username: '',
  password: ''
})

const resolver = ({ values }) => {
  const schema = z.object({
    username: z
      .string()
      .email('errors.invalid_email')
      .max(32, 'errors.username_too_long'),
    password: z
      .string()
      .min(8, 'errors.password_too_short')
      .max(128, 'errors.password_too_long')
      .regex(/[a-z]/, 'errors.password_needs_lowercase')
      .regex(/[A-Z]/, 'errors.password_needs_uppercase')
      .regex(/[0-9]/, 'errors.password_needs_number')
      .regex(/[^a-zA-Z0-9]/, 'errors.password_needs_special'),
  })

  const result = schema.safeParse(values)
  if (result.success) return { errors: {} }

  const errors = {}
  for (const issue of result.error.issues) {
    const field = issue.path[0]
    if (!errors[field]) errors[field] = []
    errors[field].push({ message: issue.message })
  }
  return { errors }
}

// Form Submission
const onFormSubmit = async ({ valid, states }) => {
  if (!valid) return

  succKey.value = ''
  resetFail()
  loading.value = true

  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL || 'admin@localhost.me'
  const username = states.username.value === adminEmail ? 'admin' : states.username.value

  try {
    const authBaseUrl = import.meta.env.VITE_AUTH_BASE_URL || '/auth'
    const cleanUrl = authBaseUrl.replace(/\/$/, '')

    const response = await axios.post(`${cleanUrl}/authentication`, {
      username,
      password: states.password.value
    }, {
      timeout: 5000
    })

    const data = response.data
    loading.value = false

    if (data.pass) {
      succKey.value = 'success_redirect'
      const next = new URLSearchParams(window.location.search).get('next') || '/'
      setTimeout(() => window.location.assign(next), 5000)
    } else {
      states.password.value = ''
      failInfo.value.key = 'login_failed'
      failInfo.value.chances = typeof data.msg?.left_chances === 'number' ? data.msg.left_chances : -1
    }
  } catch (err) {
    loading.value = false
    states.password.value = ''
    failInfo.value.key = 'errors.service_unavailable'
    failInfo.value.chances = -1
  }
}
</script>

<style scoped>
.login-password-content {
  position: relative;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.backend-messages {
  margin-top: 1rem;
}

.backend-messages :deep(.p-message-text) {
  white-space: pre-line;
}

.w-full {
  width: 100%;
}

.login-btn {
  font-weight: 700;
  padding: 0.75rem;
  border-radius: 0.75rem;
}
</style>
