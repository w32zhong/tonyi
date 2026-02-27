import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  base: process.env.VITE_UI_BASE || '/',
  plugins: [
    vue(),
    nodePolyfills({
      include: ['crypto', 'util', 'stream', 'events', 'buffer', 'string_decoder', 'vm'],
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
