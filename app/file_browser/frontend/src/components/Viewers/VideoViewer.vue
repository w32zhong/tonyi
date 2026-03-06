<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import Artplayer from 'artplayer';

const props = defineProps({
  fileUrl: String,
  type: String
});

const artRef = ref(null);
let art = null;

onMounted(() => {
  if (artRef.value) {
    art = new Artplayer({
      container: artRef.value,
      url: props.fileUrl,
      type: props.type,
      volume: 0.5,
      isLive: false,
      muted: false,
      autoplay: true,
      pip: true,
      autoSize: true,
      autoMini: true,
      screenshot: true,
      setting: true,
      loop: true,
      flip: true,
      playbackRate: true,
      aspectRatio: true,
      fullscreen: true,
      fullscreenWeb: true,
      subtitleOffset: true,
      miniProgressBar: true,
      mutex: true,
      backdrop: true,
      playsInline: true,
      autoPlayback: true,
      airplay: true,
      theme: '#23ade5',
    });
  }
});

onBeforeUnmount(() => {
  if (art) {
    art.destroy(false);
  }
});
</script>

<template>
  <div class="h-full w-full bg-black relative">
    <div ref="artRef" class="w-full h-full absolute inset-0"></div>
  </div>
</template>
