<script setup lang="ts">
import { FileQuestion, Download } from 'lucide-vue-next';

const props = defineProps<{
  fileUrl: string;
  file: any;
}>();
</script>

<template>
  <div class="h-full w-full bg-gray-900 flex flex-col items-center justify-center text-gray-400">
    <FileQuestion class="w-24 h-24 mb-6 opacity-50" />
    <h3 class="text-xl font-medium text-white mb-2">No preview available</h3>
    <p class="text-gray-500 mb-8 max-w-sm text-center">
      The file format <strong>.{{ file.name.split('.').pop() }}</strong> is not supported for online preview. 
    </p>
    
    <a :href="fileUrl" target="_blank" download class="flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-900/20">
      <Download class="w-5 h-5 mr-2" />
      Download File
    </a>
  </div>
</template>
