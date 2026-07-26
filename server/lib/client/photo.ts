/**
 * Client-side photo helper: resize an image in the browser (canvas) before
 * upload so files stay small, then POST to /api/attachments and return the new
 * attachment id. PDFs (or non-images) are uploaded as-is.
 */

function resizeImage(file: File, maxDim = 1280, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas unavailable'));
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('encode failed'))), 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('could not read image'));
    };
    img.src = url;
  });
}

export type PreparedPhoto = { blob: Blob; filename: string };

/**
 * Resizes an image ready for upload without sending it. Split out from
 * `uploadPhoto` so the offline outbox can stash the finished blob in
 * IndexedDB and upload it later — resizing on the way in means a queued
 * photo costs the same storage as an uploaded one.
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (file.type.startsWith('image/')) {
    return { blob: await resizeImage(file), filename: 'photo.jpg' };
  }
  return { blob: file, filename: file.name || 'photo.jpg' };
}

/** Uploads an already-prepared photo and returns its attachment id. */
export async function uploadPrepared(photo: PreparedPhoto): Promise<string> {
  const form = new FormData();
  form.append('file', photo.blob, photo.filename);
  const res = await fetch('/api/attachments', { method: 'POST', body: form });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Upload failed.');
  }
  const data = await res.json();
  return data.id as string;
}

/** Uploads a photo (resized if it's an image) and returns its attachment id. */
export async function uploadPhoto(file: File): Promise<string> {
  return uploadPrepared(await preparePhoto(file));
}
