import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import httpProxy from 'http-proxy'

const TARGET_HEADER = 'x-hermes-gateway-target'
const TARGET_QUERY = '__gateway_target'

function dynamicGatewayProxy(): Plugin {
  const proxy = httpProxy.createProxyServer({})
  const isGatewayPath = (url = '') => /^\/(?:api|auth|login)(?:\/|\?|$)/.test(url)

  proxy.on('proxyRes', (proxyRes, req) => {
    const target = (req as import('http').IncomingMessage & { __hermesTarget?: string }).__hermesTarget
    if (!target || !req.url?.startsWith('/login')) return

    const existing = proxyRes.headers['set-cookie'] || []
    const targetCookie = `hermes_gateway_target=${encodeURIComponent(target)}; Path=/; SameSite=Lax`
    proxyRes.headers['set-cookie'] = [...existing, targetCookie]
  })

  const targetFromRequest = (req: import('http').IncomingMessage): string | null => {
    const header = req.headers[TARGET_HEADER]
    const raw = Array.isArray(header) ? header[0] : header
    const queryTarget = new URL(req.url || '/', 'http://vite.local').searchParams.get(TARGET_QUERY)
    const refererTarget = (() => {
      try {
        return new URL(req.headers.referer || '').searchParams.get(TARGET_QUERY)
      } catch {
        return null
      }
    })()
    const cookieTarget = req.headers.cookie?.match(/(?:^|;\s*)hermes_gateway_target=([^;]+)/)?.[1]

    try {
      const target = new URL(raw || queryTarget || refererTarget || (cookieTarget ? decodeURIComponent(cookieTarget) : '') || '')

      if (target.protocol !== 'http:' && target.protocol !== 'https:') return null
      const requestHost = req.headers.host?.split(':')[0]
      const targetHost = target.hostname
      if (requestHost && targetHost === requestHost && target.port !== '9119') return null
      return target.origin
    } catch {
      return null
    }
  }

  const proxyRequest = (req: import('http').IncomingMessage, res: import('http').ServerResponse, next: () => void) => {
    if (!isGatewayPath(req.url)) return next()

    const target = targetFromRequest(req)
    if (!target) {
      res.statusCode = 400
      res.end('Missing or invalid Gateway target. Enter the real Gateway URL (for example http://192.168.10.5:9119), not the H5 URL.')
      return
    }

    ;(req as import('http').IncomingMessage & { __hermesTarget?: string }).__hermesTarget = target
    delete req.headers[TARGET_HEADER]
    const requestUrl = new URL(req.url || '/', 'http://vite.local')
    requestUrl.searchParams.delete(TARGET_QUERY)
    req.url = `${requestUrl.pathname}${requestUrl.search}`
    proxy.web(req, res, {
      target,
      changeOrigin: true,
      secure: false,
      cookieDomainRewrite: ''
    }, error => {
      if (!res.headersSent) {
        res.statusCode = 502
        res.end(`Gateway proxy failed: ${error.message}`)
      }
    })
  }

  return {
    name: 'dynamic-hermes-gateway-proxy',
    configureServer(server) {
      server.middlewares.use(proxyRequest)
      server.httpServer?.on('upgrade', (req, socket, head) => {
        if (!isGatewayPath(req.url)) return
        const target = targetFromRequest(req)
        if (!target) {
          socket.destroy()
          return
        }
        delete req.headers[TARGET_HEADER]
        const requestUrl = new URL(req.url || '/', 'http://vite.local')
        requestUrl.searchParams.delete(TARGET_QUERY)
        req.url = `${requestUrl.pathname}${requestUrl.search}`
        proxy.ws(req, socket, head, { target, changeOrigin: true, secure: false })
      })
    }
  }
}

export default defineConfig(({ mode }) => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), dynamicGatewayProxy()],
    css: {
      postcss: { plugins: [] }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@hermes/shared': path.resolve(__dirname, '../shared/src'),
        react: path.resolve(__dirname, '../../node_modules/react'),
        'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
        'react/jsx-dev-runtime': path.resolve(__dirname, '../../node_modules/react/jsx-dev-runtime.js'),
        'react/jsx-runtime': path.resolve(__dirname, '../../node_modules/react/jsx-runtime.js')
      },
      dedupe: ['react', 'react-dom']
    },
    server: {
      host: '0.0.0.0',
      port: 5175,
      strictPort: true,
      // Dynamic proxy is installed by dynamicGatewayProxy().
    },
    preview: {
      host: '127.0.0.1',
      port: 4175
    }
  }
})
