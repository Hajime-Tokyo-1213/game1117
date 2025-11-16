import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    define: {
      __VITE_NODE_ENV__: JSON.stringify(env.NODE_ENV || mode),
    },
    server: {
      port: env.PORT || 3000,
    open: true,
    hmr: {
      overlay: false
    },
    proxy: {
      '/api/zaico': {
        target: 'https://api.zaico.co.jp/v1',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/zaico/, ''),
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            // リクエストヘッダーからAPIキーを取得して設定
            const apiKey = req.headers['x-api-key'];
            if (apiKey) {
              proxyReq.setHeader('Authorization', `Bearer ${apiKey}`);
            }
            proxyReq.setHeader('Content-Type', 'application/json');
            proxyReq.setHeader('Accept', 'application/json');
          });
        }
      }
    }
  },
    build: {
      sourcemap: true
    }
  }
})