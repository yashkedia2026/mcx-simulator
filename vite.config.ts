import path from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { loadEnv } from 'vite'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    environment: 'node',
  },
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api/market': {
        target: `http://127.0.0.1:${process.env.MARKET_DATA_PORT ?? loadEnv(mode, process.cwd(), 'MARKET_DATA_').MARKET_DATA_PORT ?? '3001'}`,
      },
    },
  },
}))
