import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

/**
 * Dev-only middleware that emulates the Vercel Serverless function at /api/gemini.
 * In production, /api/gemini is served by api/gemini.ts on Vercel Node runtime.
 * Locally, Vite dev server doesn't auto-handle that path — without this plugin,
 * POST /api/gemini falls back to the SPA index.html and breaks the JSON parse.
 */
function geminiDevApi(): Plugin {
  return {
    name: 'hoki-gemini-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/gemini', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const raw = Buffer.concat(chunks).toString('utf8');
          const body = raw ? JSON.parse(raw) : {};

          const mod = await server.ssrLoadModule('/api/gemini.ts');
          const handler = (mod as { default: Function }).default;

          // Emulate Vercel handler signature ({ method, body }, { status().json() })
          const fakeReq = { method: req.method ?? 'POST', body };
          const fakeRes = {
            status(code: number) {
              res.statusCode = code;
              return {
                json(data: unknown) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify(data));
                },
              };
            },
          };
          await handler(fakeReq, fakeRes);
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: `Dev middleware error: ${String((err as Error)?.message ?? err)}` }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load all .env entries so api/gemini.ts can read GEMINI_API_KEY via process.env in dev.
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of Object.keys(env)) {
    if (key.startsWith('GEMINI_')) {
      process.env[key] = env[key];
    }
  }

  return {
    plugins: [react(), tailwindcss(), geminiDevApi()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api/yahoo': {
          target: 'https://query1.finance.yahoo.com',
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api\/yahoo/, ''),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          },
        },
      },
    },
  };
});
