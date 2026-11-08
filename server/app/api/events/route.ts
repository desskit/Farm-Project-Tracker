import { requireUser } from '@/lib/auth/session';
import { CHANGE_AUDIENCE, subscribe, type ChangeEvent } from '@/lib/realtime/bus';
import { can } from '@/lib/domain/permissions';

// Long-lived SSE stream — must run on the Node runtime and never be cached or
// statically rendered.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  let viewer;
  try {
    viewer = await requireUser();
  } catch {
    // A plain 401 (not a thrown error page) so EventSource stops cleanly and
    // the client's auth handling takes over.
    return new Response('Unauthorized', { status: 401 });
  }

  const encoder = new TextEncoder();
  let unsubscribe = () => {};
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      // Tell the browser how quickly to reconnect, then confirm we're live.
      send('retry: 3000\n\n');
      send(': connected\n\n');

      unsubscribe = subscribe((e: ChangeEvent) => {
        // Only tell this device about changes its person may see.
        const need = CHANGE_AUDIENCE[e.resource];
        if (need && !can(viewer, need)) return;
        send(`event: change\ndata: ${JSON.stringify(e)}\n\n`);
      });

      // Comment heartbeat keeps intermediaries (Caddy, browsers) from timing
      // the idle connection out.
      heartbeat = setInterval(() => send(': ping\n\n'), 25000);

      req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      if (heartbeat) clearInterval(heartbeat);
      unsubscribe();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Disable proxy buffering so events flush immediately behind Caddy/nginx.
      'X-Accel-Buffering': 'no',
    },
  });
}
