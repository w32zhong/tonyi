<script setup>
import { ref, onMounted } from 'vue';
import VuePdfEmbed from 'vue-pdf-embed';
import { ChevronLeft, ChevronRight } from 'lucide-vue-next';

const props = defineProps({
  fileUrl: String
});

const loading = ref(true);
const pageCount = ref(0);
const currentPage = ref(1);

const handleDocumentRender = () => {
  loading.value = false;
};

onMounted(() => {
  loading.value = true;
});

const prevPage = () => { if (currentPage.value > 1) currentPage.value--; };
const nextPage = () => { if (currentPage.value < pageCount.value) currentPage.value++; };

</script>

<template>
  <div class="h-full w-full bg-gray-100 flex flex-col relative overflow-hidden">
    
    <!-- Controls Toolbar -->
    <div class="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-gray-900/80 backdrop-blur-md px-4 py-2 rounded-full flex items-center shadow-lg border border-gray-700/50">
      <button @click="prevPage" :disabled="currentPage <= 1" class="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-30">
        <ChevronLeft class="w-5 h-5" />
      </button>
      <span class="px-4 font-mono text-sm">{{ currentPage }} / {{ pageCount || '?' }}</span>
      <button @click="nextPage" :disabled="currentPage >= pageCount" class="p-1 hover:bg-gray-700 rounded transition-colors disabled:opacity-30">
        <ChevronRight class="w-5 h-5" />
      </button>
    </div>

    <div v-if="loading" class="absolute inset-0 flex items-center justify-center text-gray-500 bg-gray-100 z-10">
      <div class="animate-spin w-8 h-8 border-4 border-gray-300 border-t-gray-500 rounded-full mb-4"></div>
      Loading PDF...
    </div>
    
    <!-- PDF Container -->
    <div class="flex-1 overflow-auto bg-gray-200 w-full h-full custom-scrollbar">
      <VuePdfEmbed 
        :source="props.fileUrl" 
        :page="currentPage"
        @rendered="handleDocumentRender"
        @loaded="pageCount = $event.numPages"
        class="max-w-4xl mx-auto shadow-2xl my-8 bg-white"
      />
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 10px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: #f1f1f1;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #c1c1c1;
  border-radius: 5px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: #a8a8a8;
}
</style>
