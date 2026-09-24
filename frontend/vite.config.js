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
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      // main.jsx only mounts <App /> on the page; App itself is covered by App.test.jsx.
      exclude: ['src/**/*.test.{js,jsx}', 'src/test/**', 'src/main.jsx'],
      // The workshop guide's target: fail the run if coverage drops below 80%.
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
      reporter: ['text-summary', 'text', 'html'],
      reportsDirectory: 'coverage',
    },
    css: false,
  },
})
