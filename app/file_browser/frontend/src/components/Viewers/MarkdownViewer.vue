<script setup>
import { ref, onMounted, computed } from 'vue';
import axios from 'axios';
import MarkdownIt from 'markdown-it';
import { VueMonacoEditor } from '@guolao/vue-monaco-editor';
import { FileCode2, Save, Check, Eye, Code as CodeIcon } from 'lucide-vue-next';

const props = defineProps({
  fileUrl: String,
  currentDir: String,
  apiBase: String
});

const code = ref('');
const originalCode = ref('');
const loading = ref(true);
const saving = ref(false);
const savedSuccess = ref(false);
const error = ref('');
const viewMode = ref('preview'); // 'preview' or 'source'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true
});

// Custom renderer rule for images to handle relative paths
const defaultImageRender = md.renderer.rules.image || function (tokens, idx, options, env, self) {
  return self.renderToken(tokens, idx, options);
};

md.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx];
  const srcIndex = token.attrIndex('src');
  if (srcIndex !== -1) {
    let src = token.attrs[srcIndex][1];
    // Check if it's a relative path (doesn't start with http, https, or /)
    if (!src.match(/^(https?:\/\/|\/)/)) {
      // Clean currentDir and join with relative src
      const basePath = props.currentDir.endsWith('/') ? props.currentDir : props.currentDir + '/';
      const fullPath = (basePath + src).replace(/\/\/+/g, '/');
      token.attrs[srcIndex][1] = `${props.apiBase}/file/content?path=${encodeURIComponent(fullPath)}`;
    }
  }
  return defaultImageRender(tokens, idx, options, env, self);
};

const renderedHtml = computed(() => {
  return md.render(code.value);
});

const hasChanges = computed(() => {
  return code.value !== originalCode.value;
});

const saveChanges = async () => {
  if (!hasChanges.value || saving.value) return;
  saving.value = true;
  savedSuccess.value = false;
  try {
    await axios.put(props.fileUrl, code.value, {
      headers: {
        'Content-Type': 'text/plain'
      }
    });
    originalCode.value = code.value;
    savedSuccess.value = true;
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
    error.value = 'Failed to load markdown content.';
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
  <div class="h-full w-full relative bg-gray-900 flex flex-col" @keydown="handleKeyDown">
    <!-- Toolbar -->
    <div class="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700 shrink-0">
      <div class="flex items-center space-x-1">
        <button 
          @click="viewMode = 'preview'" 
          class="flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          :class="viewMode === 'preview' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'"
        >
          <Eye class="w-4 h-4 mr-1.5" />
          Preview
        </button>
        <button 
          @click="viewMode = 'source'" 
          class="flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          :class="viewMode === 'source' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-700 hover:text-white'"
        >
          <CodeIcon class="w-4 h-4 mr-1.5" />
          Source
        </button>
      </div>

      <div class="flex items-center space-x-2">
        <div 
          v-if="savedSuccess && !hasChanges && !saving" 
          class="flex items-center px-3 py-1.5 bg-green-600/20 text-green-400 rounded-md text-sm font-medium"
        >
          <Check class="w-4 h-4 mr-1.5" />
          Saved
        </div>
        <button 
          v-if="hasChanges || saving"
          @click="saveChanges" 
          :disabled="saving"
          class="flex items-center px-4 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-md transition-colors font-medium text-sm"
        >
          <div v-if="saving" class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
          <Save v-else class="w-4 h-4 mr-1.5" />
          {{ saving ? 'Saving...' : 'Save' }}
        </button>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-hidden relative">
      <div v-if="loading" class="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-gray-900 z-10">
        <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
        Loading content...
      </div>
      <div v-if="error" class="absolute inset-0 flex items-center justify-center text-red-400 bg-gray-900 z-10 flex-col">
        <FileCode2 class="w-16 h-16 mb-4 opacity-50" />
        {{ error }}
      </div>

      <!-- Preview Mode -->
      <div 
        v-if="viewMode === 'preview' && !loading && !error" 
        class="h-full w-full overflow-auto bg-white text-gray-900 p-8 md:p-12"
      >
        <div class="max-w-4xl mx-auto markdown-body" v-html="renderedHtml"></div>
      </div>

      <!-- Source Mode -->
      <vue-monaco-editor
        v-if="viewMode === 'source' && !loading && !error"
        v-model:value="code"
        theme="vs-dark"
        language="markdown"
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
  </div>
</template>

<style scoped>
.markdown-body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
  line-height: 1.6;
}

.markdown-body :deep(h1), .markdown-body :deep(h2) {
  border-bottom: 1px solid #eaecef;
  padding-bottom: .3em;
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.markdown-body :deep(h1) { font-size: 2em; }
.markdown-body :deep(h2) { font-size: 1.5em; }
.markdown-body :deep(h3) { font-size: 1.25em; margin-top: 24px; margin-bottom: 16px; font-weight: 600; }

.markdown-body :deep(p), .markdown-body :deep(ul), .markdown-body :deep(ol), .markdown-body :deep(blockquote) {
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-body :deep(ul), .markdown-body :deep(ol) {
  padding-left: 2em;
}

.markdown-body :deep(blockquote) {
  padding: 0 1em;
  color: #6a737d;
  border-left: .25em solid #dfe2e5;
}

.markdown-body :deep(code) {
  padding: .2em .4em;
  margin: 0;
  font-size: 85%;
  background-color: rgba(27,31,35,.05);
  border-radius: 3px;
  font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, monospace;
}

.markdown-body :deep(pre) {
  padding: 16px;
  overflow: auto;
  font-size: 85%;
  line-height: 1.45;
  background-color: #f6f8fa;
  border-radius: 3px;
  margin-bottom: 16px;
}

.markdown-body :deep(pre code) {
  background-color: transparent;
  padding: 0;
}

.markdown-body :deep(img) {
  max-width: 100%;
}

.markdown-body :deep(a) {
  color: #0366d6;
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(table) {
  border-spacing: 0;
  border-collapse: collapse;
  margin-top: 0;
  margin-bottom: 16px;
}

.markdown-body :deep(table th), .markdown-body :deep(table td) {
  padding: 6px 13px;
  border: 1px solid #dfe2e5;
}

.markdown-body :deep(table tr) {
  background-color: #fff;
  border-top: 1px solid #c6cbd1;
}

.markdown-body :deep(table tr:nth-child(2n)) {
  background-color: #f6f8fa;
}
</style>
