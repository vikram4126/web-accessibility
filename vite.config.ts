import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['pdf-lib', 'pdfjs-dist'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('pdf-lib')) return 'pdf-lib';
          if (id.includes('pdfjs-dist')) return 'pdfjs';
        },
      },
    },
  },
})
