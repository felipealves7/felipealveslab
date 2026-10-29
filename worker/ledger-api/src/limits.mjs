// Daily caps kept in KV. KV is eventually consistent, so the caps are approximate under bursts.

export const PER_VISITOR_PER_DAY = 2;
export const GLOBAL_PER_DAY = 50;
export const MAX_QUESTION_CHARS = 300;
const TTL_SECONDS = 2 * 24 * 3600;

export const utcDate = (now = new Date()) => now.toISOString().slice(0, 10);

/** The visitor key uses a hash of the IP, so KV never stores an address. */
export async function visitorKey(ip, date) {
  const bytes = new TextEncoder().encode(`ledger-visitor:${ip || 'unknown'}`);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(hash)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `v:${date}:${hex}`;
}
export const globalKey = (date) => `g:${date}`;

async function read(kv, key) {
  const n = Number(await kv.get(key));
  return Number.isFinite(n) ? n : 0;
}

export async function checkCaps(kv, vKey, gKey) {
  const [visitor, global] = await Promise.all([read(kv, vKey), read(kv, gKey)]);
  if (visitor >= PER_VISITOR_PER_DAY) return { ok: false, reason: 'visitor_limit', visitor, global };
  if (global >= GLOBAL_PER_DAY) return { ok: false, reason: 'daily_limit', visitor, global };
  return { ok: true, visitor, global };
}

export async function count(kv, vKey, gKey, { visitor, global }) {
  await Promise.all([
    kv.put(vKey, String(visitor + 1), { expirationTtl: TTL_SECONDS }),
    kv.put(gKey, String(global + 1), { expirationTtl: TTL_SECONDS }),
  ]);
}
