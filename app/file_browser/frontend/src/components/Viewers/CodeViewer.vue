<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import { VueMonacoEditor } from '@guolao/vue-monaco-editor';
import { FileCode2, Save, Check } from 'lucide-vue-next';

const props = defineProps({
  fileUrl: String,
  language: String
});

const code = ref('');
const originalCode = ref('');
const loading = ref(true);
const saving = ref(false);
const savedSuccess = ref(false);
const error = ref('');

const extMap = {
  'js': 'javascript',
  'ts': 'typescript',
  'vue': 'html',
  'py': 'python',
  'go': 'go',
  'json': 'json',
  'md': 'markdown',
  'txt': 'plaintext',
  'html': 'html',
  'css': 'css'
};

const resolvedLang = extMap[props.language] || 'plaintext';

const hasChanges = computed(() => {
  return code.value !== originalCode.value;
});

const saveChanges = async () => {
  if (!hasChanges.value || saving.value) return;
  saving.value = true;
  savedSuccess.value = false;
  try {
    // Put raw text to the same fileUrl (which contains ?path=...)
    await axios.put(props.fileUrl, code.value, {
      headers: {
        'Content-Type': 'text/plain'
      }
    });
    originalCode.value = code.value; // Reset changes state
    savedSuccess.value = true;
    
    // Auto-hide the success message after 3 seconds
    setTimeout(() => {
      savedSuccess.value = false;
    }, 3000);
  } catch (err) {
    console.error('Failed to save file:', err);
    alert('Failed to save file');
  } finally {
    saving.value = false;
  }
};

onMounted(async () => {
  try {
    const res = await axios.get(props.fileUrl, { responseType: 'text' });
    const textData = typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 2);
    code.value = textData;
    originalCode.value = textData;
  } catch (err) {
    console.error(err);
    error.value = 'Failed to load code content.';
  } finally {
    loading.value = false;
  }
});

const handleKeyDown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveChanges();
  }
};
</script>

<template>
  <div class="h-full w-full relative" @keydown="handleKeyDown">
    <div v-if="loading" class="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-900 z-10">
      <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
      Loading syntax highlighting...
    </div>
    <div v-if="error" class="absolute inset-0 flex items-center justify-center text-red-400 bg-gray-900 z-10 flex-col">
      <FileCode2 class="w-16 h-16 mb-4 opacity-50" />
      {{ error }}
    </div>
    
    <!-- Save Action Bar -->
    <div v-if="!loading && !error && (hasChanges || savedSuccess)" class="absolute top-4 right-6 z-20">
      <button 
        v-if="hasChanges || saving"
        @click="saveChanges" 
        :disabled="saving"
        class="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:opacity-70 text-white rounded shadow-lg transition-colors font-medium text-sm"
      >
        <div v-if="saving" class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
        <Save v-else class="w-4 h-4 mr-2" />
        {{ saving ? 'Saving...' : 'Save Changes (Ctrl+S)' }}
      </button>
      
      <!-- Success indicator -->
      <div 
        v-if="savedSuccess && !hasChanges && !saving" 
        class="flex items-center px-4 py-2 bg-green-600 text-white rounded shadow-lg font-medium text-sm transition-opacity duration-300"
      >
        <Check class="w-4 h-4 mr-2" />
        Saved successfully
      </div>
    </div>
    
    <vue-monaco-editor
      v-if="!loading && !error"
      v-model:value="code"
      theme="vs-dark"
      :language="resolvedLang"
      :options="{
        readOnly: false,
        minimap: { enabled: true },
        scrollBeyondLastLine: false,
        fontSize: 14,
        fontFamily: 'Consolas, monospace'
      }"
      class="h-full w-full"
    />
  </div>
</template>
