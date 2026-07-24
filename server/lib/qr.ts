/**
 * Server-side QR generation. Renders a self-contained SVG string (no external
 * requests, no client library) for printing asset stickers that deep-link back
 * into the app.
 */
import 'server-only';
import QRCode from 'qrcode';

export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#1a1a1a', light: '#ffffff' },
  });
}
