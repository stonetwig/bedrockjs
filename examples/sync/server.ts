/**
 * BedrockJS sync — todo example server.
 *
 * Run from the repo root:
 *   deno task sync:dev
 *
 * Then open http://localhost:8080/examples/sync/
 */

import { contentType } from 'jsr:@std/media-types@1';
import { extname, join, normalize } from 'jsr:@std/path@1';
import { createSyncServer } from '../../src/sync/server.ts';
import { denoKvAdapter } from '../../src/sync/adapters/deno-kv.ts';

const ROOT = new URL('../..', import.meta.url).pathname;

const sync = await createSyncServer({
  storage: denoKvAdapter({ path: ':memory:' }),
  models: ['todo'],
  cors: true,
});

async function serveStatic(pathname: string): Promise<Response> {
  // Default to the example index when hitting the example dir.
  if (pathname === '/' || pathname === '') pathname = '/examples/sync/';
  if (pathname.endsWith('/')) pathname += 'index.html';

  const safe = normalize(pathname);
  if (safe.includes('..')) return new Response('forbidden', { status: 403 });

  const filePath = join(ROOT, safe);
  try {
    const data = await Deno.readFile(filePath);
    return new Response(data, {
      headers: {
        'content-type':
          contentType(extname(filePath)) ?? 'application/octet-stream',
      },
    });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

const port = Number(Deno.env.get('PORT') ?? '8080');
console.log(`bedrockjs sync example: http://localhost:${port}/examples/sync/`);

Deno.serve({ port }, async (req) => {
  const url = new URL(req.url);
  if (url.pathname.startsWith('/sync/')) return sync(req);
  return serveStatic(url.pathname);
});
