<script setup lang="ts">
import { ref, onMounted } from 'vue';
import axios from 'axios';
import { Cloud, Folder, File, Code, Image as ImageIcon, Film, FileText, ChevronRight, UploadCloud, FileMusic, FileType2 } from 'lucide-vue-next';
import ViewerModal from './components/Viewers/ViewerModal.vue';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const API_BASE = `${BACKEND_URL}/api`;

const currentDir = ref('/');
const files = ref<any[]>([]);
const loading = ref(false);
const selectedFile = ref<any | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const fetchFiles = async (dir: string) => {
  loading.value = true;
  try {
    const res = await axios.get(`${API_BASE}/files`, { params: { dir } });
    files.value = res.data;
    currentDir.value = dir;
  } catch (error) {
    console.error('Failed to fetch files:', error);
  } finally {
    loading.value = false;
  }
};

const handleDoubleClick = (file: any) => {
  if (file.isDir) {
    const newDir = currentDir.value.endsWith('/') 
      ? `${currentDir.value}${file.name}` 
      : `${currentDir.value}/${file.name}`;
    fetchFiles(newDir);
  } else {
    selectedFile.value = file;
  }
};

const goUp = () => {
  if (currentDir.value === '/') return;
  const parts = currentDir.value.split('/').filter(Boolean);
  parts.pop();
  const newDir = '/' + parts.join('/');
  fetchFiles(newDir);
};

const handleFileUpload = async (event: Event) => {
  const target = event.target as HTMLInputElement;
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
    fetchFiles(currentDir.value);
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

const getIcon = (file: any) => {
  if (file.isDir) return Folder;
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['js', 'ts', 'py', 'html', 'css', 'json'].includes(ext)) return Code;
  if (['jpg', 'png', 'gif', 'jpeg', 'webp', 'svg'].includes(ext)) return ImageIcon;
  if (['mp4', 'mkv', 'webm', 'mov'].includes(ext)) return Film;
  if (['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(ext)) return FileMusic;
  if (['md'].includes(ext)) return FileType2;
  if (['pdf', 'txt', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'ppt'].includes(ext)) return FileText;
  return File;
};

const getIconColor = (file: any) => {
  if (file.isDir) return 'text-blue-500';
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (['js', 'ts', 'py', 'html', 'css', 'json'].includes(ext)) return 'text-yellow-500';
  if (['jpg', 'png', 'gif', 'jpeg', 'webp', 'svg'].includes(ext)) return 'text-pink-500';
  if (['mp4', 'mkv', 'webm', 'mov'].includes(ext)) return 'text-purple-500';
  if (['mp3', 'wav', 'flac', 'aac', 'm4a'].includes(ext)) return 'text-emerald-500';
  if (['md'].includes(ext)) return 'text-sky-500';
  if (['pdf'].includes(ext)) return 'text-red-500';
  if (['docx', 'doc'].includes(ext)) return 'text-blue-600';
  if (['xlsx', 'xls'].includes(ext)) return 'text-green-600';
  if (['pptx', 'ppt'].includes(ext)) return 'text-orange-500';
  return 'text-gray-500';
};

onMounted(() => {
  fetchFiles('/');
});
</script>

<template>
  <div class="flex flex-col h-screen bg-gray-50">
    <!-- Header -->
    <header class="bg-white border-b border-gray-200 px-6 py-4 flex items-center shadow-sm">
      <Cloud class="w-8 h-8 text-blue-600 mr-3" />
      <h1 class="text-xl font-bold text-gray-800 tracking-tight">VueReve</h1>
    </header>

    <!-- Main Workspace -->
    <main class="flex-1 overflow-hidden flex flex-col p-6">
      
      <!-- Breadcrumbs and Actions -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center text-sm text-gray-600 bg-white p-3 rounded-lg shadow-sm border border-gray-100">
          <button @click="fetchFiles('/')" class="hover:bg-gray-100 px-2 py-1 rounded transition-colors flex items-center">
            <Cloud class="w-4 h-4 mr-1"/> Root
          </button>
          <div v-for="(part, index) in currentDir.split('/').filter(Boolean)" :key="index" class="flex items-center">
            <ChevronRight class="w-4 h-4 mx-1 text-gray-400" />
            <span class="px-2 py-1 font-medium">{{ part }}</span>
          </div>
        </div>

        <button @click="triggerUpload" class="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm">
          <UploadCloud class="w-5 h-5 mr-2" />
          Upload File
        </button>
        <input type="file" ref="fileInput" class="hidden" @change="handleFileUpload" />
      </div>

      <!-- File List -->
      <div class="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 overflow-auto">
        <div v-if="loading" class="p-8 text-center text-gray-500 animate-pulse">Loading files...</div>
        
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
            <tr v-for="file in files" :key="file.name" 
                @dblclick="handleDoubleClick(file)"
                class="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition-colors select-none group">
              <td class="py-3 px-4 flex items-center">
                <component :is="getIcon(file)" class="w-6 h-6 mr-3 transition-colors" :class="[getIconColor(file), 'group-hover:opacity-80']" />
                <span class="text-gray-700 font-medium group-hover:text-blue-700 transition-colors">{{ file.name }}</span>
              </td>
              <td class="py-3 px-4 text-gray-500 text-sm">
                {{ file.isDir ? '-' : (file.size / 1024).toFixed(1) + ' KB' }}
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
    </main>

    <!-- Viewer Modal -->
    <ViewerModal 
      v-if="selectedFile" 
      :file="selectedFile" 
      :api-base="API_BASE"
      @close="selectedFile = null" 
    />
  </div>
</template>
