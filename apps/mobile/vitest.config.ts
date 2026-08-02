import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@hermes/shared': path.resolve(__dirname, '../shared/src')
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: true,
    testTimeout: 10_000
  }
})
