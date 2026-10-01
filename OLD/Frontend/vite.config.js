import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: [
      '@univerjs/core',
      '@univerjs/themes',
      '@univerjs/docs',
      '@univerjs/docs-ui',
      '@univerjs/ui',
      '@univerjs/design',
      '@univerjs/engine-render',
    ],
  },
  server: {
    host: true,              // allow external access
    port: 5173,
    strictPort: true,

    allowedHosts: [
      'openprocure.ai',
      'www.openprocure.ai',
      'localhost',
      '192.168.1.3'
    ],

    hmr: process.env.VITE_HMR_HOST
      ? { host: process.env.VITE_HMR_HOST, protocol: 'ws' }
      : true,           // default: use localhost WS (works for local dev)
    proxy: {
      '/gem-proxy': {
        target: 'https://mkp.gem.gov.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gem-proxy/, ''),
        secure: false
      },
      '/gem-media': {
        target: 'https://mkp.gem.gov.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gem-media/, ''),
        secure: false,
      },
      '/gem-cpa-proxy': {
        target: 'https://fulfilment.gem.gov.in',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/gem-cpa-proxy/, ''),
        secure: false,
        headers: {
          'Referer': 'https://fulfilment.gem.gov.in/'
        }
      },
      '/openai-proxy': {
        target: 'https://api.openai.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openai-proxy/, ''),
        secure: false
      },
      '/pipeline-proxy': {
        target: 'http://localhost:5170',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pipeline-proxy/, ''),
      }
    }
  }
})
