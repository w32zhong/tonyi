<script setup>
import { ref } from 'vue';

const props = defineProps({
  fileUrl: String,
  fileName: String
});

const scale = ref(1);
const isDragging = ref(false);
const position = ref({ x: 0, y: 0 });
const startPos = ref({ x: 0, y: 0 });

const handleWheel = (e) => {
  e.preventDefault();
  const delta = e.deltaY * -0.001;
  const newScale = Math.min(Math.max(0.1, scale.value + delta), 5);
  scale.value = newScale;
};

const handleMouseDown = (e) => {
  isDragging.value = true;
  startPos.value = {
    x: e.clientX - position.value.x,
    y: e.clientY - position.value.y
  };
};

const handleMouseMove = (e) => {
  if (!isDragging.value) return;
  position.value = {
    x: e.clientX - startPos.value.x,
    y: e.clientY - startPos.value.y
  };
};

const handleMouseUp = () => {
  isDragging.value = false;
};

const reset = () => {
  scale.value = 1;
  position.value = { x: 0, y: 0 };
};
</script>

<template>
  <div class="h-full w-full bg-black/90 flex flex-col items-center justify-center relative overflow-hidden"
       @wheel="handleWheel"
       @mousedown="handleMouseDown"
       @mousemove="handleMouseMove"
       @mouseup="handleMouseUp"
       @mouseleave="handleMouseUp"
  >
    <!-- Controls -->
    <div class="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900/80 backdrop-blur px-6 py-2 rounded-full flex items-center gap-4 text-white z-20 shadow-xl border border-gray-700/50">
      <button @click="scale = Math.max(0.1, scale - 0.2)" class="hover:text-blue-400 font-mono text-xl leading-none px-2">−</button>
      <span class="text-sm font-medium min-w-[3rem] text-center w-12">{{ Math.round(scale * 100) }}%</span>
      <button @click="scale = Math.min(5, scale + 0.2)" class="hover:text-blue-400 font-mono text-xl leading-none px-2">+</button>
      <div class="w-px h-4 bg-gray-600 mx-2"></div>
      <button @click="reset" class="text-xs hover:text-blue-400 font-medium uppercase tracking-wider">Reset</button>
    </div>

    <!-- Image -->
    <img 
      :src="fileUrl" 
      :alt="fileName"
      class="max-w-none transition-transform duration-75 select-none"
      :style="{
        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
        cursor: isDragging ? 'grabbing' : 'grab'
      }"
      draggable="false"
    />
  </div>
</template>
