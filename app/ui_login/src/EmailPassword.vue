<template>
  <div class="login-password-content">
    <Form v-slot="$form" :initialValues="initialValues" :resolver="resolver" :validateOnBlur="true" @submit="onFormSubmit" class="form-grid">
      <div class="flex flex-col gap-1">
        <InputText
          name="username"
          type="text"
          class="w-full"
          :class="{ 'p-disabled': isBindOrChange }"
          :placeholder="$t('username')"
          :readonly="isBindOrChange"
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

      <div class="flex flex-col gap-1" v-if="isBindOrChange">
        <Password
          name="repeat_password"
          :placeholder="$t('repeat_password') || 'Repeat Password'"
          :feedback="false"
          toggleMask
          fluid
          @focus="$emit('panda-focus', 'password')"
          @blur="$emit('panda-blur')"
        />
        <Message v-if="$form?.repeat_password?.invalid" severity="error" size="small" variant="simple">{{ $t($form?.repeat_password?.error?.message) }}</Message>
      </div>

      <div class="footer-actions mt-4">
        <Button
          type="submit"
          :label="actionTitle"
          class="w-full login-btn"
          :loading="loading"
          :disabled="!$form?.valid || !$form?.username?.value || !$form?.password?.value || (isBindOrChange && !$form?.repeat_password?.value)"
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

const isBindOrChange = computed(() => ['signup', 'change'].includes(route.params.action))

const actionTitle = computed(() => {
  const action = route.params.action || 'login'
  return t(action)
})

// State
const loading = ref(false)
const succKey = ref('')
const failInfo = ref({ key: '', msg: '', chances: -1 })

const resetFail = () => {
  failInfo.value.key = ''
  failInfo.value.msg = ''
  failInfo.value.chances = -1
}

const succMsg = computed(() => succKey.value ? t(succKey.value) : '')
const failMsg = computed(() => {
  if (failInfo.value.msg) return failInfo.value.msg
  if (!failInfo.value.key) return ''
  const base = t(failInfo.value.key)
  return failInfo.value.chances >= 0
    ? `${base}\n${t('chances_left', { count: failInfo.value.chances })}`
    : base
})

const initialValues = reactive({
  username: window.__USER__?.email || '',
  password: '',
  repeat_password: ''
})

const resolver = ({ values }) => {
  const schemaObj = {
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
      .regex(/[^a-zA-Z0-9]/, 'errors.password_needs_special')
  }

  if (isBindOrChange.value) {
    schemaObj.repeat_password = z.string()
  }

  const schema = z.object(schemaObj)
  const result = schema.safeParse(values)
  
  const errors = {}
  
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0]
      if (!errors[field]) errors[field] = []
      errors[field].push({ message: issue.message })
    }
  }

  if (isBindOrChange.value && values.password !== values.repeat_password) {
    if (!errors.repeat_password) errors.repeat_password = []
    errors.repeat_password.push({ message: 'errors.passwords_do_not_match' })
  }

  if (Object.keys(errors).length > 0) return { errors }
  return { errors: {} }
}

// Form Submission
const onFormSubmit = async ({ valid, states }) => {
  if (!valid) return

  succKey.value = ''
  resetFail()
  loading.value = true

  const username = states.username.value

  try {
    const authBaseUrl = import.meta.env.VITE_AUTH_BASE_URL || '/auth'
    const cleanUrl = authBaseUrl.replace(/\/$/, '')

    let response
    if (isBindOrChange.value) {
      response = await axios.post(`${cleanUrl}/bind`, {
        method: "password",
        password: states.password.value
      }, { timeout: 5000 })
    } else {
      response = await axios.post(`${cleanUrl}/login`, {
        method: "email_and_password",
        email: username,
        password: states.password.value
      }, { timeout: 5000 })
    }

    const data = response.data
    loading.value = false

    if (data.pass) {
      succKey.value = 'success_redirect'
      const next = new URLSearchParams(window.location.search).get('next') || '/'
      setTimeout(() => window.location.assign(next), 2000)
    } else {
      states.password.value = ''
      if (states.repeat_password) states.repeat_password.value = ''
      
      if (data.reason || data.errmsg) {
        failInfo.value.msg = data.errmsg || data.reason
      } else {
        failInfo.value.key = 'login_failed'
        failInfo.value.chances = typeof data.msg?.left_chances === 'number' ? data.msg.left_chances : -1
      }
    }
  } catch (err) {
    loading.value = false
    states.password.value = ''
    if (states.repeat_password) states.repeat_password.value = ''
    failInfo.value.key = 'errors.service_unavailable'
    failInfo.value.msg = err.response?.data?.error || err.message
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

.login-btn {
  font-weight: 700;
  padding: 0.75rem;
  border-radius: 0.75rem;
}
</style>
