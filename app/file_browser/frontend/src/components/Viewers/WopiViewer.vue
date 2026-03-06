<script setup>
import { onMounted, ref } from 'vue';

const props = defineProps({
  file: Object
});

const formRef = ref(null);

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8971';
const backendWopiUrl = `${BACKEND_URL}/wopi/files/${btoa(props.file.path)}`;
const WOPI_SERVER_URL = import.meta.env.VITE_WOPI_SERVER_URL || 'http://localhost:9980';
const wopiServerURL = `${WOPI_SERVER_URL}/browser/dist/cool.html?WOPISrc=`;
const isConfigured = ref(false);

onMounted(() => {
  setTimeout(() => {
    isConfigured.value = true;
    formRef.value?.submit();
  }, 100);
});
</script>

<template>
  <div class="h-full w-full bg-gray-100 relative">
    <form
      ref="formRef"
      id="office_form"
      name="office_form"
      target="office_frame"
      :action="wopiServerURL + encodeURIComponent(backendWopiUrl)"
      method="post"
      class="hidden"
    >
      <input name="access_token" value="dummy_token_for_test" type="hidden" />
      <input name="access_token_ttl" value="0" type="hidden" />
    </form>

    <div v-if="!isConfigured" class="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
      <div class="text-center text-gray-600">
        <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p>Connecting to WOPI server...</p>
      </div>
    </div>

    <iframe
      v-show="isConfigured"
      name="office_frame"
      class="w-full h-full border-none bg-white"
      allowfullscreen
    ></iframe>
  </div>
</template>
