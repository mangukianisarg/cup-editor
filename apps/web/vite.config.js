import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createOpenAiArtworkHandler } from './openai-artwork-api.js'

function openAiArtworkApi() {
  const handler = createOpenAiArtworkHandler()
  return {
    name: 'openai-artwork-api',
    configureServer(server) {
      server.middlewares.use(handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler)
    },
  }
}

export default defineConfig({
  plugins: [openAiArtworkApi(), react()],
  server: {
    port: 5173,
  },
})
