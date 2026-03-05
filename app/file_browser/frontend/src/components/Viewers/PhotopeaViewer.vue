<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  fileUrl: string;
}>();

const iframeRef = ref<HTMLIFrameElement | null>(null);
const loading = ref(true);

const handleLoad = () => {
  loading.value = false;
  // Send the file to Photopea when it's ready.
  if (iframeRef.value?.contentWindow) {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", props.fileUrl, true);
    xhr.responseType = "arraybuffer";
    xhr.onload = function() {
      if (this.status == 200) {
        const buffer = this.response;
        // The script format Photopea understands:
        iframeRef.value?.contentWindow?.postMessage(buffer, "*");
      }
    };
    xhr.send();
  }
};
</script>

<template>
  <div class="h-full w-full relative bg-gray-900 flex items-center justify-center">
    <div v-if="loading" class="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-900 z-10">
      <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
      Loading Photopea Engine...
    </div>
    <iframe 
      ref="iframeRef"
      src="https://www.photopea.com" 
      class="w-full h-full border-none"
      @load="handleLoad"
    ></iframe>
  </div>
</template>
