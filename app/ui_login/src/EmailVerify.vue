<template>
  <div class="email-verify-content">
    <Form v-slot="$form" :initialValues="initialValues" :resolver="resolver" :validateOnBlur="true" @submit="onFormSubmit" class="form-grid">
      <div class="flex flex-col gap-1">
        <InputText
          name="email"
          type="email"
          class="w-full"
          :placeholder="$t('email')"
          fluid
          :disabled="codeSent"
          @focus="$emit('panda-focus', 'username')"
          @blur="$emit('panda-blur')"
        />
        <Message v-if="$form?.email?.invalid" severity="error" size="small" variant="simple">{{ $t($form?.email?.error?.message) }}</Message>
      </div>

      <div class="flex flex-col gap-1 otp-container" v-if="codeSent">
        <label class="otp-label">{{ $t('verification_code') }}</label>
        <InputOtp
          name="code"
          :length="6"
          @focus="$emit('panda-focus', 'password')"
          @blur="$emit('panda-blur')"
        />
        <Message v-if="$form?.code?.invalid" severity="error" size="small" variant="simple">{{ $t($form?.code?.error?.message) }}</Message>
      </div>

      <div class="footer-actions mt-4 flex gap-2">
        <Button
          v-if="!codeSent"
          type="button"
          :label="$t('send_verification_code') || 'Send Verification Code'"
          class="w-full login-btn"
          :loading="sendingCode"
          @click="sendCode($form)"
          :disabled="!$form?.email?.value || $form?.email?.invalid"
        />
        <Button
          v-if="codeSent"
          type="submit"
          :label="actionTitle"
          class="w-full login-btn"
          :loading="loading"
          :disabled="!$form?.valid || !$form?.email?.value || !$form?.code?.value"
        />
      </div>

      <div class="backend-messages" v-if="succMsg || failMsg || infoMsg">
        <Message v-if="infoMsg" severity="info" closable @close="infoMsg = ''">{{ infoMsg }}</Message>
        <Message v-if="succMsg" severity="success" closable @close="succKey = ''">{{ succMsg }}</Message>
        <Message v-if="failMsg" severity="error" closable @close="resetFail">{{ failMsg }}</Message>
      </div>
    </Form>
  </div>
</template>

<script setup>
import { ref, reactive, computed, defineEmits } from 'vue'
import { useTranslation } from 'i18next-vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import { z } from 'zod'
import { solve } from 'busybot'

import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputOtp from 'primevue/inputotp'
import Message from 'primevue/message'
import { Form } from '@primevue/forms'

const { t } = useTranslation()
const route = useRoute()
const router = useRouter()

defineEmits(['panda-focus', 'panda-blur'])

const actionTitle = computed(() => {
  const action = route.params.action || 'signup'
  return t(action)
})

const loading = ref(false)
const sendingCode = ref(false)
const codeSent = ref(false)
const emailSalt = ref(null)

const succKey = ref('')
const failInfo = ref({ key: '', msg: '' })
const infoMsg = ref('')

const resetFail = () => {
  failInfo.value.key = ''
  failInfo.value.msg = ''
}

const succMsg = computed(() => succKey.value ? t(succKey.value) : '')
const failMsg = computed(() => {
  if (failInfo.value.msg) return failInfo.value.msg
  if (!failInfo.value.key) return ''
  return t(failInfo.value.key)
})

const initialValues = reactive({
  email: '',
  code: ''
})

const resolver = ({ values }) => {
  const schema = z.object({
    email: z.string().email('errors.invalid_email').max(64, 'errors.username_too_long'),
    code: codeSent.value ? z.string().min(1, 'errors.required_field') : z.string().optional()
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

const authBaseUrl = import.meta.env.VITE_AUTH_BASE_URL || '/auth'
const cleanUrl = authBaseUrl.replace(/\/$/, '')

const sendCode = async ($form) => {
  if (!$form?.email?.value || $form?.email?.invalid) return

  sendingCode.value = true
  resetFail()
  succKey.value = ''
  infoMsg.value = ''

  try {
    const chalResp = await axios.get(`${cleanUrl}/challenge`)
    const challengeData = chalResp.data
    infoMsg.value = t('solving_challenge') || 'Solving anti-bot challenge...'

    const { challenge, signature } = challengeData
    const solution = await solve(challenge)
    infoMsg.value = ''

    const emailResult = await axios.post(`${cleanUrl}/email`, {
      email: $form.email.value,
      challenge,
      signature,
      solution
    })

    if (emailResult.data.pass) {
      emailSalt.value = emailResult.data.salt
      codeSent.value = true
      succKey.value = 'code_sent_successfully'
    } else {
      failInfo.value.msg = emailResult.data.errmsg || t('failed_to_send_code')
    }
  } catch (err) {
    failInfo.value.key = 'errors.service_unavailable'
    failInfo.value.msg = err.response?.data?.error || err.message
  } finally {
    sendingCode.value = false
  }
}

const onFormSubmit = async ({ valid, states }) => {
  if (!valid) return

  succKey.value = ''
  resetFail()
  loading.value = true

  try {
    const isUserSet = window.__USER__ != null
    const routePath = isUserSet ? 'change' : 'login'

    const response = await axios.post(`${cleanUrl}/${routePath}`, {
      method: "email",
      email: states.email.value,
      email_salt: emailSalt.value,
      code: states.code.value
    })

    const data = response.data

    if (data.pass) {
      succKey.value = 'success_redirect'
      setTimeout(() => {
        const next = new URLSearchParams(window.location.search).get('next') || '/'

        if (route.params.action === 'signup') {
           router.push(`/signup/password${window.location.search}`)
        } else if (route.params.action === 'signin') {
           router.push(`/change/password${window.location.search}`)
        } else {
           window.location.assign(next)
        }
      }, 1000)
    } else {
      failInfo.value.msg = data.errmsg || t('login_failed')
    }
  } catch (err) {
    failInfo.value.key = 'errors.service_unavailable'
    failInfo.value.msg = err.response?.data?.error || err.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.email-verify-content {
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

.otp-container {
  align-items: center;
  margin-top: 0.5rem;
}

.otp-label {
  font-size: 0.875rem;
  color: var(--p-text-color-secondary);
  margin-bottom: 0.5rem;
}

.login-btn {
  font-weight: 700;
  padding: 0.75rem;
  border-radius: 0.75rem;
}
</style>
