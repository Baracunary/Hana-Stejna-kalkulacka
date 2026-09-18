import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'node:path'

// `npm run dev` spouští jen frontend (Vite), ne serverless funkci z api/lead.ts.
// Aby šel v lokálním náhledu odzkoušet celý tok kalkulačky až po děkovnou obrazovku,
// odpovídá tenhle mock na /api/lead rovnou { ok: true }. Do produkčního buildu se nedostane.
function mockLeadApi() {
  return {
    name: 'mock-lead-api',
    // any: jde o interní typ Vite Connect serveru, tady nemá smysl ho duplikovat.
    configureServer(server: any) {
      server.middlewares.use('/api/lead', (req: any, res: any, next: () => void) => {
        if (req.method !== 'POST') return next()
        let telo = ''
        req.on('data', (kus: Buffer) => (telo += kus))
        req.on('end', () => {
          console.log('[DEV MOCK] /api/lead přijal poptávku:', telo.slice(0, 500))
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ ok: true }))
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [tailwindcss(), mockLeadApi()],
  // Klientské proměnné mají prefix PUBLIC_ (ne výchozí VITE_) — stejně jako na Vercelu.
  envPrefix: 'PUBLIC_',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        gdpr: resolve(__dirname, 'gdpr.html'),
        cookies: resolve(__dirname, 'cookies.html'),
      },
    },
  },
})
