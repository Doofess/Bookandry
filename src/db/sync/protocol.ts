import type { Rev } from '@/lib/rev';

import type { SyncedTable } from './tables';

/**
 * One row's state, as the sync engine exchanges it.
 *
 * PLAINTEXT at this layer, on purpose. Encryption (and blinding the table and
 * id) is a decorator around the transport, so the merge rules here are tested
 * without crypto and the crypto is tested without merge rules - and neither
 * can be the reason the other's tests pass.
 */
export type SyncRecord = {
  readonly tbl: SyncedTable;
  readonly id: string;
  readonly rev: Rev;
  readonly deleted: boolean;
  /**
   * The row, or null for a deletion. For `settings`, only the synced fields
   * (`{ defaultCurrency }`), never the device-local ones.
   */
  readonly row: unknown;
};

/**
 * What the server did with one pushed record.
 *
 * `stored`: the server now holds this rev - including when it already did, so
 * a push whose acknowledgement was lost can simply be sent again.
 * `stale`: the server holds a NEWER rev. The next pull brings it.
 */
export type PushResult = {
  readonly tbl: SyncedTable;
  readonly id: string;
  readonly rev: Rev;
  readonly status: 'stored' | 'stale';
};

export type PullPage = {
  readonly records: readonly SyncRecord[];
  /** Resume point for the next pull. Opaque to the engine. */
  readonly cursor: number;
  readonly hasMore: boolean;
  /** The space's erase counter; absent from a server that keeps none. */
  readonly epoch?: number;
};

export type SyncTransport = {
  /** `epoch`: the space's erase counter as this device last saw it. A newer one refuses the push. */
  push(records: readonly SyncRecord[], epoch?: number): Promise<readonly PushResult[]>;
  /**
   * Records changed since `cursor`, oldest first. The server never splits one
   * push across two pages, so a transaction and the first-payment override
   * written with it always arrive together.
   */
  pull(cursor: number, limit: number): Promise<PullPage>;
};

/** The space was erased since this device last pulled: pull, and clear, before pushing again. */
export class SpaceWipedError extends Error {
  constructor() {
    super('space wiped');
    this.name = 'SpaceWipedError';
  }
}
