import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Cloudflare quick tunnels get a random *.trycloudflare.com hostname each run
    allowedHosts: ['.trycloudflare.com'],
  },
})
