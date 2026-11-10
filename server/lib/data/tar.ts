/**
 * A minimal streaming .tar.gz writer (POSIX ustar), so a whole backup — the
 * database plus every uploaded photo and document — downloads as one file
 * without loading it into memory or adding a dependency. Opens with any
 * archive tool (`tar -xzf`, 7-Zip, macOS Archive Utility).
 */
import 'server-only';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';

function octal(n: number, width: number): string {
  return n.toString(8).padStart(width - 1, '0') + '\0';
}

/** A 512-byte ustar header for a regular file. Long names use the prefix field. */
export function tarHeader(name: string, size: number, mtime: number): Buffer {
  const h = Buffer.alloc(512, 0);
  let prefix = '';
  let base = name;
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf('/', 155);
    if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100) throw new Error(`Path too long for tar: ${name}`);
    prefix = name.slice(0, cut);
    base = name.slice(cut + 1);
  }
  h.write(base, 0, 100, 'utf8');
  h.write(octal(0o644, 8), 100, 8, 'ascii');
  h.write(octal(0, 8), 108, 8, 'ascii');
  h.write(octal(0, 8), 116, 8, 'ascii');
  h.write(octal(size, 12), 124, 12, 'ascii');
  h.write(octal(Math.floor(mtime / 1000), 12), 136, 12, 'ascii');
  h.write('        ', 148, 8, 'ascii'); // checksum is computed with this field as spaces
  h.write('0', 156, 1, 'ascii');
  h.write('ustar\u000000', 257, 8, 'ascii');
  h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(octal(sum, 7) + ' ', 148, 8, 'ascii');
  return h;
}

async function* files(root: string, rel = ''): AsyncGenerator<string> {
  const entries = await fs.readdir(path.join(root, rel), { withFileTypes: true }).catch(() => []);
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) yield* files(root, r);
    else if (e.isFile()) yield r;
  }
}

async function* tarStream(root: string, top: string): AsyncGenerator<Buffer> {
  for await (const rel of files(root)) {
    const full = path.join(root, rel);
    const st = await fs.stat(full);
    yield tarHeader(`${top}/${rel}`, st.size, st.mtimeMs);
    for await (const chunk of createReadStream(full)) yield chunk as Buffer;
    const pad = (512 - (st.size % 512)) % 512;
    if (pad) yield Buffer.alloc(pad, 0);
  }
  yield Buffer.alloc(1024, 0); // end-of-archive marker
}

/** Streams everything under `root` as a gzipped tar, with entries under `top/`. */
export function tarGzStream(root: string, top: string): Readable {
  return Readable.from(tarStream(root, top)).pipe(createGzip());
}

export type TarEntry = { name: string; path?: string; content?: string | Buffer };

async function* entryStream(entries: AsyncIterable<TarEntry> | Iterable<TarEntry>, top: string): AsyncGenerator<Buffer> {
  for await (const e of entries) {
    if (e.path) {
      const st = await fs.stat(e.path).catch(() => null);
      if (!st?.isFile()) continue; // a receipt whose file has gone is skipped, not fatal
      yield tarHeader(`${top}/${e.name}`, st.size, st.mtimeMs);
      for await (const chunk of createReadStream(e.path)) yield chunk as Buffer;
      const pad = (512 - (st.size % 512)) % 512;
      if (pad) yield Buffer.alloc(pad, 0);
    } else {
      const buf = Buffer.isBuffer(e.content) ? e.content : Buffer.from(e.content ?? '', 'utf8');
      yield tarHeader(`${top}/${e.name}`, buf.length, Date.now());
      yield buf;
      const pad = (512 - (buf.length % 512)) % 512;
      if (pad) yield Buffer.alloc(pad, 0);
    }
  }
  yield Buffer.alloc(1024, 0);
}

/** Streams an explicit list of entries (files on disk or text made on the spot) as a gzipped tar. */
export function tarGzEntries(entries: AsyncIterable<TarEntry> | Iterable<TarEntry>, top: string): Readable {
  return Readable.from(entryStream(entries, top)).pipe(createGzip());
}
