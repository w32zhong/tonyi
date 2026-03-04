<template>
  <div class="login-password-content">
    <Form v-slot="$form" :key="formKey" :initialValues="initialValues" :resolver="resolver" :validateOnBlur="true" @submit="onFormSubmit" class="form-grid">
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
        <Message v-if="$form?.username?.invalid" severity="error" size="small" variant="simple">
          {{ $t($form?.username?.error?.message) }}
        </Message>
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
        <Message v-if="$form?.password?.invalid" severity="error" size="small" variant="simple">
          {{ $t($form?.password?.error?.message) }}
        </Message>
      </div>

      <div class="flex flex-col gap-1" v-if="isBindOrChange">
        <Password
          name="repeat_password"
          :placeholder="$t('repeat_password')"
          :feedback="false"
          toggleMask
          fluid
          @focus="$emit('panda-focus', 'password')"
          @blur="$emit('panda-blur')"
        />
        <Message v-if="$form?.repeat_password?.invalid" severity="error" size="small" variant="simple">
          {{ $t($form?.repeat_password?.error?.message) }}
        </Message>
      </div>

      <div class="footer-actions mt-4">
        <Button
          type="submit"
          :label="actionTitle"
          class="w-full login-btn"
          :loading="loading"
          :disabled="isFormSubmitDisabled($form)"
        />
      </div>

      <div class="backend-messages" v-if="succMsg || failMsg">
        <Message v-if="succMsg" severity="success" closable @close="succKey = ''">{{ succMsg }}</Message>
        <Message v-if="failMsg" severity="error" closable @close="failKey = ''">{{ failMsg }}</Message>
      </div>
    </Form>
  </div>
</template>

<script setup>
import { ref, reactive, computed, defineEmits, onMounted } from 'vue'
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

const emit = defineEmits(['panda-focus', 'panda-blur', 'login-failed'])

/* EmailPassword is also imported as a child component inside EmailPasswordAndOAuth2 */
const isBindOrChange = computed(() => ['signup', 'change'].includes(route.params.action))

const actionTitle = computed(() => {
  const action = route.params.action || 'login'
  return t(action)
})

const authBase = import.meta.env.VITE_AUTH_BASE_URL.replace(/\/$/, '') || '/auth'

// State
const loading = ref(false)
const succKey = ref('')
const failKey = ref('')
const formKey = ref(0)

const succMsg = computed(() => succKey.value ? t(succKey.value) : '')
const failMsg = computed(() => failKey.value ? t(failKey.value) : '')

const toErrorKey = (payload) => payload?.reason ? `errors.${payload.reason}` : 'errors.service_unavailable'

const initialValues = reactive({
  username: '',
  password: '',
  repeat_password: ''
})

onMounted(async () => {
  if (!isBindOrChange.value) return

  try {
    const response = await axios.post(`${authBase}/profile`, {}, { timeout: 5000 })
    const profile = response.data

    if (profile?.email) {
      initialValues.username = profile.email
      formKey.value += 1
    }
  } catch (err) {
    failKey.value = toErrorKey(err.response?.data)
  }
})

const resolver = ({ values }) => {
  let schema = z.object({
    username: z
      .string()
      .min(1, 'errors.email_required')
      .email('errors.invalid_email')
      .max(32, 'errors.username_too_long'),
    password: z
      .string()
      .min(1, 'errors.password_required')
  })

  if (isBindOrChange.value) {
    schema = schema.extend({
      password: z
        .string()
        .min(1, 'errors.password_required')
        .min(8, 'errors.password_too_short')
        .max(128, 'errors.password_too_long')
        .regex(/[a-z]/, 'errors.password_needs_lowercase')
        .regex(/[A-Z]/, 'errors.password_needs_uppercase')
        .regex(/[0-9]/, 'errors.password_needs_number')
        .regex(/[^a-zA-Z0-9]/, 'errors.password_needs_special'),
      repeat_password: z
        .string()
        .min(1, 'errors.password_required')

    }).refine((data) => data.password === data.repeat_password, {
      message: 'errors.passwords_do_not_match',
      path: ['repeat_password']
    })
  }

  const result = schema.safeParse(values)
  if (!result.success) {
    const formattedErrors = result.error.format()
    /* convert to PrimeVue resolver format */
    const primeVueErrors = {}
    for (const [key, val] of Object.entries(formattedErrors)) {
      if (key !== '_errors' && val?._errors?.length > 0) {
        primeVueErrors[key] = [{ message: val._errors[0] }]
      }
    }
    return { errors: primeVueErrors }
  } else {
    return { errors: {} }
  }
}

const isFormSubmitDisabled = ($form) => {
  // If the form hasn't initialized yet, disable the button
  if (!$form) return true
  // If the form has validation errors, disable the button
  if (!$form.valid) return true

  // Ensure all fields have actual values entered
  const hasUsername = !!$form.username?.value
  const hasPassword = !!$form.password?.value
  if (!hasUsername || !hasPassword) return true

  // If isBindOrChange, ensure the repeat password is also filled
  if (isBindOrChange.value) {
    const hasRepeatPassword = !!$form.repeat_password?.value
    if (!hasRepeatPassword) return true
  }

  // If all checks pass, enable the button
  return false
}

const onFormSubmit = async ({ valid, states }) => {
  if (!valid) return

  succKey.value = ''
  failKey.value = ''
  loading.value = true

  const username = states.username.value

  try {
    let response
    if (isBindOrChange.value) {
      response = await axios.post(`${authBase}/bind`, {
        method: "password",
        password: states.password.value
      }, { timeout: 5000 })
    } else {
      response = await axios.post(`${authBase}/login`, {
        method: "email_and_password",
        email: username,
        password: states.password.value
      }, { timeout: 5000 })
    }

    const data = response.data
    loading.value = false

    if (data.pass) {
      succKey.value = 'success_redirect'
      const argKey = import.meta.env.VITE_REDIRECT_URL_ARGKEY || 'next'
      const next = new URLSearchParams(window.location.search).get(argKey) || '/'
      setTimeout(() => window.location.assign(next), 2000)
    } else {
      emit('login-failed')
      failKey.value = toErrorKey(data)
      states.password.value = ''
      if (states.repeat_password) states.repeat_password.value = ''
    }
  } catch (err) {
    loading.value = false
    failKey.value = toErrorKey(err.response?.data)
    states.password.value = ''
    if (states.repeat_password) states.repeat_password.value = ''
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
