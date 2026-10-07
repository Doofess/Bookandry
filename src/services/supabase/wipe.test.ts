import { describe, expect, it, vi } from 'vitest';

import { SpaceWipedError } from '@/db/sync/protocol';
import type { Rev } from '@/lib/rev';

import { MalformedResponseError, ServerError, rpcTransport, type Rpc } from './transport';
import { cancelWipe, confirmWipe, declineWipe, peekWipe, wipeMyData, wipeStatus } from './wipe';

const token = 'f'.repeat(64);

describe('the wipe calls', () => {
  it('reads what the server answers, and refuses an answer of the wrong shape', async () => {
    const rpc = vi.fn<Rpc>();
    rpc.mockResolvedValueOnce(2);
    expect(await wipeMyData(rpc)).toBe(2);
    rpc.mockResolvedValueOnce('2');
    await expect(wipeMyData(rpc)).rejects.toBeInstanceOf(MalformedResponseError);

    rpc.mockResolvedValueOnce(null);
    expect(await wipeStatus(rpc)).toBeNull();
    rpc.mockResolvedValueOnce({
      id: 'r',
      status: 'pending',
      mine: true,
      requesterName: 'Dana',
      createdAt: '2026-10-07T10:00:00Z',
      expiresAt: '2026-10-14T10:00:00Z',
      waitingFor: ['Noa'],
    });
    expect(await wipeStatus(rpc)).toMatchObject({ status: 'pending', waitingFor: ['Noa'] });
    rpc.mockResolvedValueOnce({ status: 'odd' });
    await expect(wipeStatus(rpc)).rejects.toBeInstanceOf(MalformedResponseError);

    rpc.mockResolvedValueOnce({ requesterName: 'Dana', createdAt: 'a', expiresAt: 'b', members: 2 });
    expect(await peekWipe(rpc, token)).toMatchObject({ members: 2 });
    expect(rpc).toHaveBeenLastCalledWith('peek_wipe', { p_token: token });
    rpc.mockResolvedValueOnce({ requesterName: 'Dana' });
    await expect(peekWipe(rpc, token)).rejects.toBeInstanceOf(MalformedResponseError);

    rpc.mockResolvedValueOnce('done');
    expect(await confirmWipe(rpc, token)).toBe('done');
    rpc.mockResolvedValueOnce('waiting');
    expect(await confirmWipe(rpc, token)).toBe('waiting');
    rpc.mockResolvedValueOnce('odd');
    await expect(confirmWipe(rpc, token)).rejects.toBeInstanceOf(MalformedResponseError);

    rpc.mockResolvedValueOnce(null);
    await declineWipe(rpc, token);
    expect(rpc).toHaveBeenLastCalledWith('decline_wipe', { p_token: token });
    rpc.mockResolvedValueOnce(null);
    await cancelWipe(rpc);
    expect(rpc).toHaveBeenLastCalledWith('cancel_wipe', {});
  });

  it('treats a request called off because the household changed as no longer open', async () => {
    const rpc = vi.fn<Rpc>();
    rpc.mockResolvedValueOnce('cancelled');
    await expect(confirmWipe(rpc, token)).rejects.toMatchObject({
      name: 'ServerError',
      code: 'wipe_invalid',
    });
  });
});

const record = {
  rid: 'r'.repeat(43),
  rev: '0000000000000001.abcd.00000001' as Rev,
  keyVersion: 1,
  iv: 'i'.repeat(16),
  ct: 'c'.repeat(22),
};

describe('epochs on the wire', () => {
  it('sends the epoch with a push, reads it from a pull, and names a refused push', async () => {
    const rpc = vi.fn<Rpc>();
    rpc.mockResolvedValueOnce({ records: [], cursor: 0, hasMore: false, epoch: 3 });
    expect((await rpcTransport(rpc).pull(0, 10)).epoch).toBe(3);
    rpc.mockResolvedValueOnce({ records: [], cursor: 0, hasMore: false });
    expect((await rpcTransport(rpc).pull(0, 10)).epoch).toBeUndefined();
    rpc.mockResolvedValueOnce({ records: [], cursor: 0, hasMore: false, epoch: -1 });
    await expect(rpcTransport(rpc).pull(0, 10)).rejects.toBeInstanceOf(MalformedResponseError);

    rpc.mockResolvedValueOnce([]);
    await rpcTransport(rpc, 'space').push([record], 3);
    expect(rpc).toHaveBeenLastCalledWith(
      'push_records',
      expect.objectContaining({ p_epoch: 3, p_space: 'space' }),
    );
    rpc.mockResolvedValueOnce([]);
    await rpcTransport(rpc).push([record]);
    expect(rpc.mock.lastCall?.[1]).not.toHaveProperty('p_epoch');

    rpc.mockRejectedValueOnce(new ServerError('wiped'));
    await expect(rpcTransport(rpc).push([record], 0)).rejects.toBeInstanceOf(SpaceWipedError);
    rpc.mockRejectedValueOnce(new ServerError('quota_exceeded'));
    await expect(rpcTransport(rpc).push([record], 0)).rejects.toBeInstanceOf(ServerError);
  });
});
