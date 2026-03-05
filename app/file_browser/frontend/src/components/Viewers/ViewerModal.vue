<script setup lang="ts">
import { computed } from 'vue';
import { X, Download } from 'lucide-vue-next';
import CodeViewer from './CodeViewer.vue';
import PdfViewer from './PdfViewer.vue';
import VideoViewer from './VideoViewer.vue';
import ImageViewer from './ImageViewer.vue';
import PhotopeaViewer from './PhotopeaViewer.vue';
import WopiViewer from './WopiViewer.vue';
import AudioViewer from './AudioViewer.vue';
import GenericViewer from './GenericViewer.vue';

const props = defineProps<{
  file: any;
  apiBase: string;
}>();

const emit = defineEmits(['close']);

const extension = computed(() => {
  if (!props.file.name.includes('.')) return '';
  return props.file.name.split('.').pop().toLowerCase();
});

const isCode = computed(() => ['js', 'ts', 'vue', 'py', 'json', 'md', 'txt', 'html', 'css', 'go'].includes(extension.value));
const isPdf = computed(() => ['pdf'].includes(extension.value));
const isVideo = computed(() => ['mp4', 'webm', 'ogg', 'mkv'].includes(extension.value));
const isImage = computed(() => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension.value));
const isPhotopea = computed(() => ['psd', 'ai', 'xd', 'sketch', 'xcf'].includes(extension.value));
const isOffice = computed(() => ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].includes(extension.value));
const isAudio = computed(() => ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(extension.value));

const fileUrl = computed(() => {
  return `${props.apiBase}/file/content?path=${encodeURIComponent(props.file.path)}`;
});

const handleBackdropClick = (e: MouseEvent) => {
  if ((e.target as HTMLElement).classList.contains('viewer-backdrop')) {
    emit('close');
  }
};
</script>

<template>
  <Teleport to="body">
    <div 
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm viewer-backdrop p-4 md:p-8"
      @click="handleBackdropClick"
    >
      <div class="relative w-full h-full max-w-6xl max-h-[90vh] bg-gray-900 text-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-700">
        
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 bg-gray-950 border-b border-gray-800">
          <div class="flex items-center space-x-3 truncate">
            <span class="font-medium text-gray-200 truncate">{{ file.name }}</span>
            <span class="text-xs text-gray-500 bg-gray-800 px-2 py-1 rounded-md">{{ (file.size / 1024).toFixed(1) }} KB</span>
          </div>
          <div class="flex items-center space-x-2">
            <a :href="fileUrl" target="_blank" download class="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white" title="Download">
              <Download class="w-5 h-5" />
            </a>
            <button @click="emit('close')" class="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors text-gray-400">
              <X class="w-5 h-5" />
            </button>
          </div>
        </div>

        <!-- Viewer Content Area -->
        <div class="flex-1 overflow-hidden relative bg-black/50">
          <CodeViewer v-if="isCode" :file-url="fileUrl" :language="extension" />
          <PdfViewer v-else-if="isPdf" :file-url="fileUrl" />
          <VideoViewer v-else-if="isVideo" :file-url="fileUrl" :type="extension" />
          <ImageViewer v-else-if="isImage" :file-url="fileUrl" :file-name="file.name" />
          <PhotopeaViewer v-else-if="isPhotopea" :file-url="fileUrl" />
          <WopiViewer v-else-if="isOffice" :file="file" />
          <AudioViewer v-else-if="isAudio" :file-url="fileUrl" :file-name="file.name" />
          <GenericViewer v-else :file="file" :file-url="fileUrl" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
