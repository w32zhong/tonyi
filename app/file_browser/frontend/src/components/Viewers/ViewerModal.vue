<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { X, Download, ChevronLeft, ChevronRight, ClipboardCopy, Check } from 'lucide-vue-next';
import CodeViewer from './CodeViewer.vue';
import PdfViewer from './PdfViewer.vue';
import VideoViewer from './VideoViewer.vue';
import ImageViewer from './ImageViewer.vue';
import PhotopeaViewer from './PhotopeaViewer.vue';
import WopiViewer from './WopiViewer.vue';
import AudioViewer from './AudioViewer.vue';
import GenericViewer from './GenericViewer.vue';
import MarkdownViewer from './MarkdownViewer.vue';

const props = defineProps({
  file: Object,
  apiBase: String,
  hasNext: Boolean,
  hasPrev: Boolean,
  currentDir: String
});

const emit = defineEmits(['close', 'next', 'prev']);

const copied = ref(false);

const copyPath = async () => {
  try {
    await navigator.clipboard.writeText(props.file.path);
  } catch {
    // Fallback for insecure contexts
    const ta = document.createElement('textarea');
    ta.value = props.file.path;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } finally {
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1500);
  }
};

const handleKeydown = (e) => {
  // Only trigger if not typing in an input/textarea (like Monaco editor)
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  if (e.key === 'ArrowRight' && props.hasNext) {
    emit('next');
  } else if (e.key === 'ArrowLeft' && props.hasPrev) {
    emit('prev');
  } else if (e.key === 'Escape') {
    emit('close');
  }
};

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});

const extension = computed(() => {
  if (!props.file.name.includes('.')) return '';
  return props.file.name.split('.').pop().toLowerCase();
});

const isMarkdown = computed(() => extension.value === 'md');
const isCode = computed(() => !isMarkdown.value && ['js', 'ts', 'vue', 'py', 'json', 'txt', 'html', 'css', 'go', 'yaml', 'yml', 'ini', 'config', 'cfg', 'toml', 'env', 'sh', 'bash', 'xml', 'sql', 'dockerfile', 'makefile', 'log', 'csv', 'rs', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'swift', 'kt', 'r', 'lua', 'pl', 'ex', 'exs', 'zig', 'nim', 'conf', 'properties'].includes(extension.value));
const isPdf = computed(() => ['pdf'].includes(extension.value));
const isVideo = computed(() => ['mp4', 'webm', 'ogg', 'mkv'].includes(extension.value));
const isImage = computed(() => ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension.value));
const isPhotopea = computed(() => ['psd', 'ai', 'xd', 'sketch', 'xcf'].includes(extension.value));
const isOffice = computed(() => ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp'].includes(extension.value));
const isAudio = computed(() => ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'].includes(extension.value));

const fileUrl = computed(() => {
  return `${props.apiBase}/file/content?path=${encodeURIComponent(props.file.path)}`;
});

const handleBackdropClick = (e) => {
  if (e.target.classList.contains('viewer-backdrop')) {
    emit('close');
  }
};
</script>

<template>
  <Teleport to="body">
    <div 
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] viewer-backdrop p-4 md:p-8"
      @click="handleBackdropClick"
    >
      <div class="relative w-full h-full max-w-6xl max-h-[90vh] bg-gray-900 text-white rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-700">
        
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 bg-gray-950 border-b border-gray-800">
          <div class="flex items-center space-x-2 truncate">
            <span class="font-medium text-gray-200 truncate">{{ file.name }}</span>
            <button
              @click="copyPath"
              class="p-1 rounded hover:bg-gray-800 transition-colors shrink-0"
              :title="copied ? 'Copied!' : 'Copy full path to clipboard'"
            >
              <Check v-if="copied" class="w-4 h-4 text-green-500" />
              <ClipboardCopy v-else class="w-4 h-4 text-gray-500 hover:text-gray-300" />
            </button>
          </div>
          
          <div class="flex items-center space-x-4">
            <!-- Navigation -->
            <div class="flex items-center bg-gray-900 rounded-lg p-1 border border-gray-800">
              <button 
                @click="emit('prev')" 
                :disabled="!hasPrev"
                class="p-1.5 hover:bg-gray-800 rounded-md transition-colors text-gray-400 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
                title="Previous file (Left Arrow)"
              >
                <ChevronLeft class="w-5 h-5" />
              </button>
              <button 
                @click="emit('next')" 
                :disabled="!hasNext"
                class="p-1.5 hover:bg-gray-800 rounded-md transition-colors text-gray-400 hover:text-white disabled:opacity-20 disabled:hover:bg-transparent"
                title="Next file (Right Arrow)"
              >
                <ChevronRight class="w-5 h-5" />
              </button>
            </div>

            <div class="w-px h-6 bg-gray-800"></div>

            <div class="flex items-center space-x-2">
              <a :href="fileUrl" target="_blank" download class="p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white" title="Download">
                <Download class="w-5 h-5" />
              </a>
              <button @click="emit('close')" class="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-lg transition-colors text-gray-400" title="Close (Esc)">
                <X class="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <!-- Viewer Content Area -->
        <div class="flex-1 overflow-hidden relative bg-black/50">
          <MarkdownViewer v-if="isMarkdown" :key="fileUrl" :file-url="fileUrl" :current-dir="currentDir" :api-base="apiBase" />
          <CodeViewer v-else-if="isCode" :key="fileUrl" :file-url="fileUrl" :language="extension" />
          <PdfViewer v-else-if="isPdf" :key="fileUrl" :file-url="fileUrl" />
          <VideoViewer v-else-if="isVideo" :key="fileUrl" :file-url="fileUrl" :type="extension" />
          <ImageViewer v-else-if="isImage" :key="fileUrl" :file-url="fileUrl" :file-name="file.name" />
          <PhotopeaViewer v-else-if="isPhotopea" :key="fileUrl" :file-url="fileUrl" />
          <WopiViewer v-else-if="isOffice" :key="fileUrl" :file="file" />
          <AudioViewer v-else-if="isAudio" :key="fileUrl" :file-url="fileUrl" :file-name="file.name" />
          <GenericViewer v-else :key="fileUrl" :file="file" :file-url="fileUrl" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
