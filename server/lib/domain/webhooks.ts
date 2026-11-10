/**
 * Outgoing webhooks: which events exist, which URLs are acceptable, and the
 * body a delivery carries. Pure, so the address rules are unit-tested.
 */
export const WEBHOOK_EVENTS = {
  'stock.low': 'A supply runs low',
  'request.new': 'A new maintenance request',
  'lease.ending': 'A lease is about to end',
  'weather.alert': 'A weather alert (frost, heat, rain, fire)',
  'birth.due': 'A birth or hatch is close',
} as const;
export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;
export const WEBHOOK_EVENT_LIST = Object.keys(WEBHOOK_EVENTS) as WebhookEvent[];
export function isWebhookEvent(v: unknown): v is WebhookEvent {
  return typeof v === 'string' && v in WEBHOOK_EVENTS;
}

/** Loopback, private, link-local and other addresses a webhook must never reach. */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, '');
  const m = v.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b, c] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT (and Tailscale)
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (!v.includes(':')) return true; // not an address at all
  return v === '::' || v === '::1' || /^f[cd]/.test(v) || /^fe[89ab]/.test(v) || v.startsWith('ff') || v.startsWith('::ffff:') || v.startsWith('64:ff9b:');
}

/** Why a URL can't be used, or null when it's fine. The address is checked again when connecting. */
export function webhookUrlProblem(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return 'That doesn’t look like a web address.';
  }
  if (u.protocol !== 'https:') return 'The address must start with https://';
  if (u.username || u.password) return 'Leave sign-in details out of the address.';
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host.includes('.') && !host.includes(':')) return 'Use a full public address, not a local name.';
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return 'That address is on the local network.';
  const literal = /^[\d.]+$/.test(host) || host.includes(':');
  if (literal && isPrivateAddress(host)) return 'That address is on the local network.';
  return null;
}

export type WebhookPayload = { title: string; body: string; url?: string };

/** What gets posted. value1..3 are there so IFTTT's Webhooks service can use it as-is. */
export function webhookBody(event: string, p: WebhookPayload, at: string, origin: string | null) {
  const link = p.url ? (origin ? `${origin}${p.url}` : p.url) : '';
  return { event, title: p.title, body: p.body, url: link, at, value1: p.title, value2: p.body, value3: link };
}
