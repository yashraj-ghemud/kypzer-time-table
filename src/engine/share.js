/**
 * Share-link codec. A plan is tiny text, so the whole plan travels inside the URL:
 *   {v, d, t, w, n} → JSON → deflate-raw (CompressionStream) → base64url, prefixed "z".
 * Falls back to plain base64url ("j" prefix) where CompressionStream is missing.
 */

export function bytesToB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

const hasCompression = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

export async function encodeShare(obj) {
  const json = JSON.stringify({ v: 2, ...obj });
  const bytes = new TextEncoder().encode(json);
  if (hasCompression()) {
    try {
      return 'z' + bytesToB64url(await pipe(bytes, new CompressionStream('deflate-raw')));
    } catch {
      /* fall through */
    }
  }
  return 'j' + bytesToB64url(bytes);
}

export async function decodeShare(str) {
  if (!str || str.length < 2) throw new Error('empty share payload');
  const kind = str[0];
  const bytes = b64urlToBytes(str.slice(1));
  let raw;
  if (kind === 'z') {
    if (!hasCompression()) throw new Error('This browser cannot open compressed links');
    raw = await pipe(bytes, new DecompressionStream('deflate-raw'));
  } else if (kind === 'j') raw = bytes;
  else throw new Error('unknown share payload');
  const obj = JSON.parse(new TextDecoder().decode(raw));
  if (!obj || typeof obj !== 'object') throw new Error('bad share payload');
  return {
    v: obj.v,
    d: typeof obj.d === 'string' ? obj.d : null,
    t: typeof obj.t === 'string' ? obj.t.slice(0, 20000) : '',
    w: typeof obj.w === 'string' ? obj.w.slice(0, 20000) : '',
    n: typeof obj.n === 'string' ? obj.n.slice(0, 120) : '',
  };
}
