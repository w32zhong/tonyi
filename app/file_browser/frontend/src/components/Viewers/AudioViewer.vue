<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Play, Pause, Volume2, VolumeX, Music } from 'lucide-vue-next';

const props = defineProps<{
  fileUrl: string;
  fileName: string;
}>();

const audioRef = ref<HTMLAudioElement | null>(null);
const isPlaying = ref(false);
const duration = ref(0);
const currentTime = ref(0);
const volume = ref(1);
const isMuted = ref(false);

const formatTime = (seconds: number) => {
  if (isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const togglePlay = () => {
  if (audioRef.value) {
    if (isPlaying.value) {
      audioRef.value.pause();
    } else {
      audioRef.value.play();
    }
  }
};

const toggleMute = () => {
  if (audioRef.value) {
    audioRef.value.muted = !audioRef.value.muted;
    isMuted.value = audioRef.value.muted;
  }
};

const seek = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (audioRef.value) {
    audioRef.value.currentTime = parseFloat(target.value);
  }
};

const changeVolume = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (audioRef.value) {
    audioRef.value.volume = parseFloat(target.value);
    volume.value = audioRef.value.volume;
    if (volume.value > 0) {
      audioRef.value.muted = false;
      isMuted.value = false;
    }
  }
};

onMounted(() => {
  if (audioRef.value) {
    audioRef.value.addEventListener('timeupdate', () => {
      currentTime.value = audioRef.value?.currentTime || 0;
    });
    audioRef.value.addEventListener('loadedmetadata', () => {
      duration.value = audioRef.value?.duration || 0;
    });
    audioRef.value.addEventListener('play', () => isPlaying.value = true);
    audioRef.value.addEventListener('pause', () => isPlaying.value = false);
    audioRef.value.addEventListener('ended', () => {
      isPlaying.value = false;
      currentTime.value = 0;
    });
  }
});
</script>

<template>
  <div class="h-full w-full bg-gray-900 flex flex-col items-center justify-center p-8 relative">
    
    <!-- Spinning Vinyl Record or Icon -->
    <div class="relative w-48 h-48 mb-12 flex items-center justify-center">
      <div 
        class="absolute inset-0 rounded-full border-[12px] border-gray-800 shadow-[0_0_40px_rgba(0,0,0,0.5)] bg-gradient-to-br from-gray-700 to-gray-900"
        :class="{ 'animate-spin-slow': isPlaying }"
      ></div>
      <div 
        class="absolute w-16 h-16 rounded-full bg-gray-950 flex items-center justify-center border-4 border-gray-700 z-10"
        :class="{ 'animate-spin-slow': isPlaying }"
      >
        <Music class="w-6 h-6 text-gray-400" />
      </div>
    </div>

    <!-- Title -->
    <h2 class="text-white text-2xl font-semibold tracking-wide truncate max-w-lg mb-2 text-center">{{ fileName }}</h2>
    <p class="text-gray-400 text-sm mb-12">Audio File</p>

    <!-- Controls -->
    <div class="w-full max-w-md bg-gray-800 rounded-2xl p-6 shadow-2xl border border-gray-700/50">
      
      <!-- Progress Bar -->
      <div class="flex items-center space-x-4 mb-6">
        <span class="text-xs font-medium text-gray-400 w-10 text-right">{{ formatTime(currentTime) }}</span>
        <input 
          type="range" 
          class="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          :value="currentTime"
          :max="duration"
          step="0.1"
          @input="seek"
        />
        <span class="text-xs font-medium text-gray-400 w-10">{{ formatTime(duration) }}</span>
      </div>

      <!-- Playback Controls -->
      <div class="flex items-center justify-between">
        
        <!-- Volume Control -->
        <div class="flex items-center space-x-2 group w-24">
          <button @click="toggleMute" class="text-gray-400 hover:text-white transition-colors">
            <VolumeX v-if="isMuted || volume === 0" class="w-5 h-5" />
            <Volume2 v-else class="w-5 h-5" />
          </button>
          <input 
            type="range" 
            class="w-16 h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
            :value="volume"
            max="1"
            step="0.05"
            @input="changeVolume"
          />
        </div>

        <!-- Play/Pause -->
        <button 
          @click="togglePlay"
          class="w-14 h-14 flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-full shadow-lg shadow-blue-900/30 transition-transform active:scale-95"
        >
          <Pause v-if="isPlaying" class="w-6 h-6 fill-current" />
          <Play v-else class="w-6 h-6 fill-current ml-1" />
        </button>

        <!-- Empty spacer for balance -->
        <div class="w-24"></div>
      </div>
    </div>

    <!-- Hidden native audio element -->
    <audio ref="audioRef" :src="fileUrl" preload="metadata"></audio>
  </div>
</template>

<style scoped>
.animate-spin-slow {
  animation: spin 8s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none;
  height: 12px;
  width: 12px;
  border-radius: 50%;
  background: currentColor;
  cursor: pointer;
  box-shadow: 0 0 10px rgba(0,0,0,0.5);
}
</style>