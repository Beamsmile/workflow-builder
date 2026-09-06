import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Dev-only file store for the workflow tabs.
 *
 *   GET    /api/workflows          → [{ name, process }]  (every workflows/*.flow.json)
 *   PUT    /api/workflows/<name>   → write workflows/<name>.flow.json
 *   DELETE /api/workflows/<name>   → remove it
 *
 * Only runs under `vite dev`. In a built/deployed site the endpoint is absent
 * and the app falls back to localStorage (see src/lib/storage.ts).
 */
function workflowsApi(): Plugin {
  const dir = path.resolve(process.cwd(), 'workflows');
  const safe = (name: string) =>
    name.replace(/\.flow\.json$/i, '').replace(/[\\/]/g, '').replace(/\.\.+/g, '.').slice(0, 120);
  const send = (res: any, code: number, body: unknown) => {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };

  return {
    name: 'workflows-api',
    configureServer(server) {
      server.middlewares.use('/api/workflows', async (req, res) => {
        try {
          await fs.mkdir(dir, { recursive: true });
          const rel = decodeURIComponent((req.url ?? '/').split('?')[0]).replace(/^\/+/, '');

          if (req.method === 'GET' && !rel) {
            const files = (await fs.readdir(dir)).filter((f: string) =>
              f.toLowerCase().endsWith('.flow.json'),
            );
            const out = [];
            for (const f of files) {
              try {
                const process = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
                out.push({ name: f.replace(/\.flow\.json$/i, ''), process });
              } catch {
                /* skip an unreadable file */
              }
            }
            return send(res, 200, out);
          }

          if (req.method === 'PUT' && rel) {
            const chunks: Uint8Array[] = [];
            for await (const c of req as AsyncIterable<Uint8Array>) chunks.push(c);
            const text = Buffer.concat(chunks).toString('utf8');
            JSON.parse(text); // reject invalid JSON
            await fs.writeFile(path.join(dir, `${safe(rel)}.flow.json`), text);
            return send(res, 200, { ok: true });
          }

          if (req.method === 'DELETE' && rel) {
            await fs.rm(path.join(dir, `${safe(rel)}.flow.json`), { force: true });
            return send(res, 200, { ok: true });
          }

          send(res, 404, { error: 'not found' });
        } catch (err) {
          send(res, 500, { error: String(err) });
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), workflowsApi()],
  server: {
    port: 5173,
    open: true,
  },
});
