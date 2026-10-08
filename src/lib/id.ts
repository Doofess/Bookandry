/**
 * UUIDv7, hand-rolled over crypto.getRandomValues.
 *
 * NOT `crypto.randomUUID()`, which is SECURE-CONTEXT ONLY. The standard mobile
 * dev loop for a PWA is `pnpm dev --host` plus opening http://192.168.x.x on a
 * phone - not a secure context, so `crypto.randomUUID` is undefined there and
 * every save throws. `crypto.getRandomValues` IS available in insecure contexts.
 *
 * v7 rather than v4 because the timestamp prefix makes ids sortable, which buys
 * three things for free: a deterministic feed order for two transactions on the
 * same calendar date, sequential B-tree keys when bulk-importing, and a
 * human-diffable export file in time order.
 *
 * The factory is injectable so tests get stable ids, which in turn makes export
 * fixtures byte-stable and the import round-trip a plain toEqual.
 */

const HEX: readonly string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function uuidV7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const ms = Date.now();
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff; // money-allow: id bytes from a timestamp
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff; // money-allow: id bytes from a timestamp
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff; // money-allow: id bytes from a timestamp
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff; // money-allow: id bytes from a timestamp
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff; // money-allow: id bytes from a timestamp
  bytes[5] = ms & 0xff;
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant

  const h = Array.from(bytes, (b) => HEX[b]!);
  return [
    h.slice(0, 4).join(''),
    h.slice(4, 6).join(''),
    h.slice(6, 8).join(''),
    h.slice(8, 10).join(''),
    h.slice(10).join(''),
  ].join('-');
}

let factory: () => string = uuidV7;

export function newId(): string {
  return factory();
}

/** Test seam. Returns a restore function. */
export function setIdFactory(next: () => string): () => void {
  const previous = factory;
  factory = next;
  return () => {
    factory = previous;
  };
}

/** A deterministic counter factory, for tests and seeded demo data. */
export function counterIdFactory(prefix = 'id'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-${String(n).padStart(6, '0')}`;
  };
}
