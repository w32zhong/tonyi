<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import axios from 'axios';
import { Cloud, Folder, File, Code, Image as ImageIcon, Film, FileText, ChevronRight, ChevronLeft, UploadCloud, FileMusic, FileType2, ClipboardCopy, Check } from 'lucide-vue-next';
import ViewerModal from '../components/Viewers/ViewerModal.vue';

const route = useRoute();
const router = useRouter();

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8971';
const API_BASE = `${BACKEND_URL}/api`;

const currentDir = ref('/');
const files = ref([]);
const loading = ref(false);
const selectedFile = ref(null);
const highlightedFile = ref(null);
const fileInput = ref(null);
const copied = ref(false);
const pagination = ref({
  page: 1, limit: 200, totalItems: 0, totalPages: 1,
});

// Navigation for ViewerModal
const hasNextFile = computed(() => {
  if (!selectedFile.value) return false;
  const currentIndex = files.value.findIndex(f => f.path === selectedFile.value.path);
  const hasNextInList = files.value.slice(currentIndex + 1).some(f => !f.isDir);
  return hasNextInList || pagination.value.page < pagination.value.totalPages;
});

const hasPrevFile = computed(() => {
  if (!selectedFile.value) return false;
  const currentIndex = files.value.findIndex(f => f.path === selectedFile.value.path);
  const hasPrevInList = files.value.slice(0, currentIndex).some(f => !f.isDir);
  return hasPrevInList || pagination.value.page > 1;
});

const goToNextFile = async () => {
  if (!selectedFile.value) return;
  const currentIndex = files.value.findIndex(f => f.path === selectedFile.value.path);
  const nextInList = files.value.slice(currentIndex + 1).find(f => !f.isDir);

  if (nextInList) {
    router.push({ path: nextInList.path, query: { mode: 'preview' } });
  } else if (pagination.value.page < pagination.value.totalPages) {
    await fetchFiles(currentDir.value, pagination.value.page + 1);
    const firstInNew = files.value.find(f => !f.isDir);
    if (firstInNew) router.push({ path: firstInNew.path, query: { mode: 'preview' } });
  }
};

const goToPrevFile = async () => {
  if (!selectedFile.value) return;
  const currentIndex = files.value.findIndex(f => f.path === selectedFile.value.path);
  const prevInList = [...files.value.slice(0, currentIndex)].reverse().find(f => !f.isDir);

  if (prevInList) {
    router.push({ path: prevInList.path, query: { mode: 'preview' } });
  } else if (pagination.value.page > 1) {
    await fetchFiles(currentDir.value, pagination.value.page - 1);
    const lastInNew = [...files.value].reverse().find(f => !f.isDir);
    if (lastInNew) router.push({ path: lastInNew.path, query: { mode: 'preview' } });
  }
};

// Breadcrumb segments computed from currentDir
const breadcrumbs = computed(() => {
  const parts = currentDir.value.split('/').filter(Boolean);
  return parts.map((part, index) => ({
    part: part,
    path: '/' + parts.slice(0, index + 1).join('/'),
  }));
});

const fetchFiles = async (dir, page = 1) => {
  loading.value = true;
  highlightedFile.value = null;
  try {
    const res = await axios.get(`${API_BASE}/files`, { params: { dir, page } });
    files.value = res.data.items;
    pagination.value = res.data.pagination;
    currentDir.value = dir;
  } catch (error) {
    console.error('Failed to fetch files:', error);
  } finally {
    loading.value = false;
  }
};

const locateFile = async (path, mode) => {
  loading.value = true;
  const isPreview = mode === 'preview';
  const isDownload = mode === 'download';

  try {
    const res = await axios.get(`${API_BASE}/locate`, { params: { path } });
    files.value = res.data.items;
    pagination.value = res.data.pagination;
    currentDir.value = res.data.dir;
    
    if (res.data.file) {
      highlightedFile.value = res.data.file;
      
      if (isPreview) {
        selectedFile.value = res.data.file;
      } else if (isDownload) {
        const downloadUrl = `${API_BASE}/file/content?path=${encodeURIComponent(res.data.file.path)}`;
        window.open(downloadUrl, '_blank');
        router.replace({ path: res.data.file.path });
      } else {
        selectedFile.value = null;
      }
    } else {
      selectedFile.value = null;
    }
  } catch (error) {
    console.error('Failed to locate path:', error);
    router.push('/');
  } finally {
    loading.value = false;
  }
};

const handleDoubleClick = (file) => {
  if (file.isDir) {
    router.push(file.path);
  } else {
    router.push({ path: file.path, query: { mode: 'preview' } });
  }
};

const goUp = () => {
  if (currentDir.value === '/') return;
  const parts = currentDir.value.split('/').filter(Boolean);
  parts.pop();
  router.push('/' + parts.join('/'));
};

const handleFileUpload = async (event) => {
  const target = event.target;
  if (!target.files || target.files.length === 0) return;
  
  const file = target.files?.[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    await axios.post(`${API_BASE}/upload`, formData, {
      params: { dir: currentDir.value },
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    fetchFiles(currentDir.value, pagination.value.page);
  } catch (error) {
    console.error('Upload failed:', error);
    alert('Failed to upload file');
  } finally {
    if (fileInput.value) fileInput.value.value = '';
  }
};

const triggerUpload = () => {
  fileInput.value?.click();
};

const copyPath = async () => {
  try {
    await navigator.clipboard.writeText(currentDir.value);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = currentDir.value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } finally {
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 1500);
  }
};

const getIcon = (file) => {
  if (file.isDir) return Folder;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['js', 'ts', 'py', 'html', 'css', 'json', 'yaml', 'yml', 'ini', 'config', 'cfg', 'toml', 'env', 'sh', 'bash', 'xml', 'sql', 'dockerfile', 'makefile', 'log', 'csv', 'rs', 'rb', 'php', 'java', 'c', 'cpp', 'h', 'hpp', 'swift', 'kt', 'r', 'lua', 'pl', 'ex', 'exs', 'zig', 'nim', 'conf', 'properties', 'go', 'vue'].includes(ext)) return Code;
  if (['jpg', 'png', 'gif', 'jpeg', 'webp', 'svg'].includes(ext)) return ImageIcon;
  if (['mp4', 'mkv', 'webm', 'mov'].includes(ext)) return Film;
  if (['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(ext)) return FileMusic;
  if (['md'].includes(ext)) return FileType2;
  if (['pdf', 'txt', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'].includes(ext)) return FileText;
  return File;
};

const getIconColor = (file) => {
  const icon = getIcon(file);
  if (icon === Folder) return 'text-blue-500';
  if (icon === Code) return 'text-yellow-500';
  if (icon === ImageIcon) return 'text-pink-500';
  if (icon === Film) return 'text-purple-500';
  if (icon === FileMusic) return 'text-emerald-500';
  if (icon === FileType2) return 'text-sky-500';

  if (icon === FileText) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') return 'text-red-500';
    if (['docx', 'doc'].includes(ext)) return 'text-blue-600';
    if (['xlsx', 'xls'].includes(ext)) return 'text-green-600';
    if (['pptx', 'ppt'].includes(ext)) return 'text-orange-500';
  }

  return 'text-gray-500';
};

const formatSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const closeViewer = () => {
  selectedFile.value = null;
  router.push(currentDir.value);
};

// Main Router Watcher
watch(
  () => ({ path: route.path, query: { ...route.query } }),
  (newRoute) => {
    const path = newRoute.path || '/';
    const mode = newRoute.query.mode;
    locateFile(path, mode);
  },
  { immediate: true }
);
</script>

<template>
  <div class="flex flex-col h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-6 py-4 flex items-center shadow-sm">
      <Cloud class="w-8 h-8 text-blue-600 mr-3" />
      <h1 class="text-xl font-bold text-gray-800 tracking-tight">File Browser</h1>
    </header>

    <!-- Main Workspace -->
    <main class="flex-1 overflow-hidden flex flex-col p-6">

      <!-- Breadcrumbs and Actions -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center text-sm text-gray-600 bg-white p-3 rounded-lg shadow-sm border border-gray-100 min-w-0 overflow-x-auto">
          <!-- Root button -->
          <button @click="router.push('/')" class="hover:bg-gray-100 px-2 py-1 rounded transition-colors flex items-center shrink-0"
                  :class="{ 'bg-blue-50 text-blue-700 font-semibold': currentDir === '/' }">
            Home
          </button>

          <!-- Clickable breadcrumb for each path segment -->
          <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
            <ChevronRight class="w-4 h-4 mx-1 text-gray-400 shrink-0" />
            <button
              @click="router.push(crumb.path)"
              class="px-2 py-1 rounded transition-colors font-medium shrink-0 hover:bg-gray-100"
              :class="index === breadcrumbs.length - 1 && !selectedFile ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600'"
            >
              {{ crumb.part }}
            </button>
          </template>

          <!-- Copy path button -->
          <button
            @click="copyPath"
            class="ml-2 p-1 rounded hover:bg-gray-100 transition-colors shrink-0"
            :title="copied ? 'Copied!' : 'Copy path to clipboard'"
          >
            <Check v-if="copied" class="w-4 h-4 text-green-500" />
            <ClipboardCopy v-else class="w-4 h-4 text-gray-400 hover:text-gray-600" />
          </button>
        </div>

        <button @click="triggerUpload" class="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm ml-4 shrink-0">
          <UploadCloud class="w-5 h-5 mr-2" />
          Upload File
        </button>
        <input type="file" ref="fileInput" class="hidden" @change="handleFileUpload" />
      </div>

      <!-- File List -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col overflow-hidden">
        <div class="flex-1 overflow-auto">
          <div v-if="loading" class="p-8 text-center text-gray-500 animate-pulse">Loading...</div>

          <table v-else class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-gray-100 text-gray-500 text-sm">
                <th class="py-3 px-4 font-medium">Name</th>
                <th class="py-3 px-4 font-medium w-32">Size</th>
                <th class="py-3 px-4 font-medium w-48">Modified</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="currentDir !== '/'"
                  @dblclick="goUp()"
                  class="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors select-none group">
                <td class="py-3 px-4 flex items-center">
                  <Folder class="w-6 h-6 mr-3 text-blue-400 group-hover:text-blue-500 transition-colors" />
                  <span class="text-gray-700 font-medium">..</span>
                </td>
                <td class="py-3 px-4 text-gray-400 text-sm">-</td>
                <td class="py-3 px-4 text-gray-400 text-sm">-</td>
              </tr>

              <tr v-for="file in files" :key="file.path"
                  @dblclick="handleDoubleClick(file)"
                  class="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors select-none group"
                  :class="{ 'bg-yellow-50': highlightedFile && highlightedFile.path === file.path }">
                <td class="py-3 px-4 flex items-center">
                  <component :is="getIcon(file)" class="w-6 h-6 mr-3 transition-colors" :class="[getIconColor(file), 'group-hover:opacity-80']" />
                  <span class="text-gray-700 font-medium group-hover:text-blue-700 transition-colors">{{ file.name }}</span>
                </td>
                <td class="py-3 px-4 text-gray-500 text-sm">
                  {{ file.isDir ? '-' : formatSize(file.size) }}
                </td>
                <td class="py-3 px-4 text-gray-500 text-sm">
                  {{ new Date(file.mtime).toLocaleDateString() }}
                </td>
              </tr>

              <tr v-if="files.length === 0">
                <td colspan="3" class="py-12 text-center text-gray-400">This folder is empty.</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div v-if="pagination.totalPages > 1" class="shrink-0 flex flex-col items-center gap-2 px-4 py-3 border-t border-gray-100 bg-white">
          <div class="flex items-center gap-2">
            <button
              @click="fetchFiles(currentDir, pagination.page - 1)"
              :disabled="pagination.page <= 1"
              class="flex items-center px-3 py-1.5 text-sm rounded-md border transition-colors disabled:opacity-30"
            >
              <ChevronLeft class="w-4 h-4 mr-1" /> Prev
            </button>
            <span class="text-sm text-gray-500 px-2">{{ pagination.page }} / {{ pagination.totalPages }}</span>
            <button
              @click="fetchFiles(currentDir, pagination.page + 1)"
              :disabled="pagination.page >= pagination.totalPages"
              class="flex items-center px-3 py-1.5 text-sm rounded-md border transition-colors disabled:opacity-30"
            >
              Next <ChevronRight class="w-4 h-4 ml-1" />
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- Viewer Modal -->
    <ViewerModal
      v-if="selectedFile"
      :file="selectedFile"
      :api-base="API_BASE"
      :current-dir="currentDir"
      :has-next="hasNextFile"
      :has-prev="hasPrevFile"
      @next="goToNextFile"
      @prev="goToPrevFile"
      @close="closeViewer"
    />
  </div>
</template>
