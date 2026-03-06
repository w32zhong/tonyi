<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ExternalLink } from 'lucide-vue-next';

const props = defineProps<{
  file: any;
}>();

const formRef = ref<HTMLFormElement | null>(null);

// In a real environment, this would come from your Backend (WOPI discovery XML)
// This is the URL of the Collabora/OnlyOffice server container.
// Example: "https://office.mydomain.com/hosting/discovery" 
const officeServerUrl = ref('http://192.168.232.115:9980/browser/dist/cool.html?WOPISrc=');
const isConfigured = ref(false);

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8971';
const backendWopiUrl = `${BACKEND_URL}/wopi/files/${btoa(props.file.path)}`;

const configureAndSubmit = () => {
  isConfigured.value = true;
  setTimeout(() => {
    formRef.value?.submit();
  }, 100);
};

onMounted(() => {
  if (isConfigured.value && formRef.value) {
    formRef.value.submit();
  }
});
</script>

<template>
  <div class="h-full w-full bg-gray-100 relative">
    
    <div v-if="!isConfigured" class="absolute inset-0 flex flex-col items-center justify-center p-8 text-center text-gray-800 bg-gray-50 z-20 overflow-y-auto">
      <h2 class="text-2xl font-bold mb-4">WOPI Client Setup Required</h2>
      <p class="mb-6 max-w-lg text-gray-600">
        To open Office documents directly in the browser, you need a WOPI client running (like <strong>Collabora Online</strong> or <strong>OnlyOffice</strong>).
      </p>
      
      <div class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 text-left max-w-2xl w-full mb-8">
        <h3 class="font-semibold mb-2">1. Run a local Collabora Docker container:</h3>
        <code class="block bg-gray-900 text-gray-100 p-4 rounded text-sm mb-4 whitespace-pre-wrap">
docker run -t -d -p 9980:9980 -e "extra_params=--o:ssl.enable=false" collabora/code
        </code>
        
        <h3 class="font-semibold mb-2">2. Enter your Office Server URL:</h3>
        <input 
          v-model="officeServerUrl" 
          type="text" 
          class="w-full p-2 border border-gray-300 rounded mb-4 font-mono text-sm" 
          placeholder="http://localhost:9980/loleaflet/dist/loleaflet.html?WOPISrc=" 
        />
        
        <button 
          @click="configureAndSubmit" 
          class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors flex items-center justify-center"
        >
          <ExternalLink class="w-4 h-4 mr-2" /> Connect to WOPI Server
        </button>
      </div>
      
      <p class="text-sm text-gray-500">
        Your Express backend is already configured to act as a WOPI Host at:<br>
        <code class="bg-gray-200 px-1 rounded">{{ backendWopiUrl }}</code>
      </p>
    </div>

    <!-- The WOPI Form Hack: POSTs to iframe to initiate WOPI connection -->
    <form 
      v-if="isConfigured"
      ref="formRef" 
      id="office_form" 
      name="office_form" 
      target="office_frame" 
      :action="officeServerUrl + encodeURIComponent(backendWopiUrl)" 
      method="post"
      class="hidden"
    >
      <input name="access_token" value="dummy_token_for_test" type="hidden" />
      <input name="access_token_ttl" value="0" type="hidden" />
    </form>
    
    <iframe 
      v-if="isConfigured"
      name="office_frame" 
      class="w-full h-full border-none bg-white" 
      allowfullscreen
    ></iframe>
  </div>
</template>
