import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signature helpers shared by every provider adapter.
 *
 * The comparison is the part worth being careful about. `a === b` on strings
 * returns at the first differing byte, and that timing is measurable across a
 * network by an attacker who can replay a payload while varying one byte at a
 * time. `timingSafeEqual` compares the whole buffer every time.
 */

/** Hex HMAC-SHA256 of `payload` under `secret`. */
export function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Constant-time comparison of two signatures.
 *
 * `timingSafeEqual` throws when its operands differ in length, which would
 * ordinarily force a length check first — itself a small leak. Hashing both
 * sides removes the need for one: two SHA-256 digests are always 32 bytes, so
 * the comparison is reached unconditionally and reads the whole buffer every
 * time, whatever arrived. Digest equality implies signature equality for any
 * pair an attacker can construct, and learning a digest yields no signature.
 */
export function signaturesMatch(a: string, b: string): boolean {
  const left = createHash('sha256').update(a).digest();
  const right = createHash('sha256').update(b).digest();

  return timingSafeEqual(left, right);
}

/**
 * A stable digest of a callback body, used as the delivery identity for
 * providers that supply none and as the audit fingerprint for those that do.
 *
 * Keys are sorted so that two deliveries differing only in property order — a
 * genuine possibility across JSON encoders and proxies — produce the same
 * digest and collide as the retry they are.
 */
export function payloadDigest(body: unknown): string {
  return createHash('sha256').update(canonicalise(body)).digest('hex');
}

function canonicalise(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value ?? null) ?? 'null';
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalise).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalise(entry)}`);

  return `{${entries.join(',')}}`;
}
