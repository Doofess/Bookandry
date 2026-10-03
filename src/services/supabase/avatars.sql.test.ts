import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { freshPg, type Session, type TestPg } from '@/test/pg-harness';

/*
 * The avatars migration on real Postgres dressed as Supabase: a profile
 * picture is its own account's, to read and to change - nobody else's, and
 * not before the second step, for an account that has one.
 */

const ALICE = '00000000-0000-4000-8000-00000000000a';
const BOB = '00000000-0000-4000-8000-00000000000b';

let t: TestPg;
let alice: Session;
let bob: Session;

beforeEach(async () => {
  t = await freshPg();
  alice = t.as(ALICE);
  bob = t.as(BOB);
});
afterEach(async () => {
  await t.close();
});

const put = (s: Session, name: string) =>
  s.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [name]);
const names = async (s: Session) =>
  (await s.query<{ name: string }>(`select name from storage.objects where bucket_id = 'avatars'`)).map(
    (r) => r.name,
  );
const refused = (p: Promise<unknown>): Promise<string> =>
  p.then(
    () => 'accepted',
    (e: unknown) => (e instanceof Error ? e.message : String(e)),
  );

describe('profile pictures', () => {
  it('is a private bucket', async () => {
    const [bucket] = await t.pg
      .query<{ public: boolean }>(`select public from storage.buckets where id = 'avatars'`)
      .then((r) => r.rows);
    expect(bucket?.public).toBe(false);
  });

  it('lets an account keep, replace and remove a picture in its own folder', async () => {
    await put(alice, `${ALICE}/avatar`);
    expect(await names(alice)).toEqual([`${ALICE}/avatar`]);
    await alice.query(`update storage.objects set owner = $1 where name = $2`, [ALICE, `${ALICE}/avatar`]);
    await alice.query(`delete from storage.objects where name = $1`, [`${ALICE}/avatar`]);
    expect(await names(alice)).toEqual([]);
  });

  it("keeps everyone out of another account's folder", async () => {
    await put(alice, `${ALICE}/avatar`);
    expect(await names(bob)).toEqual([]);
    expect(await refused(put(bob, `${ALICE}/avatar`))).toMatch(/row-level security/);
    await bob.query(`delete from storage.objects where name = $1`, [`${ALICE}/avatar`]);
    expect(await names(alice)).toEqual([`${ALICE}/avatar`]);
  });

  it('keeps out anyone not signed in', async () => {
    await put(alice, `${ALICE}/avatar`);
    expect(await names(t.as(null))).toEqual([]);
  });

  it('waits for the second step on an account that has one', async () => {
    await put(alice, `${ALICE}/avatar`);
    await t.pg.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [ALICE]);
    expect(await names(alice)).toEqual([]);
    expect(await refused(put(alice, `${ALICE}/other`))).toMatch(/row-level security/);
    expect(await names(t.as(ALICE, { aal: 'aal2' }))).toEqual([`${ALICE}/avatar`]);
  });

  it('leaves every other private function out of reach', async () => {
    expect(await refused(alice.query(`select private.require_user()`))).toMatch(/permission denied/);
  });
});
