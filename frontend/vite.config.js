import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app calls the API at /api/helpdesk on its own origin. On AWS, CloudFront routes that
// path to the Lambda; locally, Vite forwards it to the FastAPI server (uvicorn on :8000).
const API_TARGET = process.env.HELPDESK_API_TARGET || 'http://localhost:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api/helpdesk': { target: API_TARGET, changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.test.{js,jsx}'],  // e2e/ holds Playwright tests (npm run test:e2e)
    css: false,
  },
})
