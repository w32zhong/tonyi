import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  base: './',
  plugins: [vue()],
	/* Vite dev server runs on 5173, we need this proxy to get around CORS */
  server: {
    proxy: {
      '/oauth2': 'http://localhost:8080'
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  }
})
