import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Keys that have a PROD_/LOCAL_ pair in .env and get exposed as VITE_<KEY>
const SWITCHED_KEYS = [
  'API_BASE_URL',
  'JSON_SERVER_URL',
  'SCRAPER_API',
  'ENDO_PIPELINE_URL',
  'FALLBACK_TENDER_API',
  'PRICING_API',
]

// Keys that are the same in both modes
const SHARED_KEYS = ['OPENAI_API_KEY']

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') // '' -> load unprefixed vars too
  const isProd = String(env.PRODUCTION).toLowerCase() === 'true'
  const prefix = isProd ? 'PROD_' : 'LOCAL_'

  const define = {}
  for (const key of SWITCHED_KEYS) {
    const value = env[prefix + key]
    if (!value) throw new Error(`Missing ${prefix}${key} in Frontend/.env`)
    define[`import.meta.env.VITE_${key}`] = JSON.stringify(value)
  }
  for (const key of SHARED_KEYS) {
    define[`import.meta.env.VITE_${key}`] = JSON.stringify(env[key] ?? '')
  }

  console.log(`[env] PRODUCTION=${isProd} -> API ${define['import.meta.env.VITE_API_BASE_URL']}`)

  return {
  define,
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
        target: env[prefix + 'ENDO_PIPELINE_URL'],
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/pipeline-proxy/, ''),
      }
    }
  }
  }
})
