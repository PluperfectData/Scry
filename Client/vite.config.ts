import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The API allows exactly this origin for CORS, so the port must not drift.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
})
