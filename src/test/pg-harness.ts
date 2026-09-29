import { PGlite, type PGliteInterface } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ServerError, type Rpc } from '@/services/supabase/transport';

/**
 * Real Postgres, in-process, dressed as Supabase - so the migration's rules
 * are tested as SQL, not as a description of SQL, and without Docker.
 *
 * What is emulated is only what the migration relies on: the `anon` and
 * `authenticated` roles, `auth.users`, `auth.uid()` and `auth.jwt()` reading
 * `request.jwt.claims` (as Supabase's do), `auth.mfa_factors`, and Supabase's default
 * privileges, which grant those roles everything on new tables and functions.
 * That last one matters: the migration's REVOKEs are only proven by a test
 * that starts from Supabase's permissive defaults.
 *
 * What PGlite cannot show: two pushes truly concurrent. It has one
 * connection. The counter-row lock is there for that; `supabase start` (Phase
 * 4 e2e) is where it gets exercised.
 */
const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  grant usage on schema public to anon, authenticated, service_role;

  create schema auth;
  grant usage on schema auth to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
  $$;
  create function auth.jwt() returns jsonb language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
  $$;
  create table auth.mfa_factors (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users on delete cascade,
    status text not null
  );

  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

const MIGRATIONS = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');

export type Role = 'anon' | 'authenticated';

export type Session = {
  /** Run SQL as this caller, inside a transaction that rolls back on error. */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Call a public function the way PostgREST would: named arguments. */
  rpc: Rpc;
};

export type TestPg = {
  readonly pg: PGliteInterface;
  /**
   * A signed-in user (created in auth.users on first use), or anon for null.
   * `aal` is the session's assurance level: 'aal2' after a second step.
   */
  as(userId: string | null, options?: { readonly aal?: 'aal1' | 'aal2' }): Session;
  close(): Promise<void>;
};

// Booting Postgres and migrating once per test file, then cloning that for
// each test, is several times faster than starting from nothing every time.
let template: Promise<PGlite> | undefined;

async function migrated(): Promise<PGlite> {
  const pg = new PGlite();
  await pg.exec(SUPABASE_STUB);
  for (const file of readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await pg.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
  }
  return pg;
}

export async function freshPg(): Promise<TestPg> {
  template ??= migrated();
  const pg = await (await template).clone();

  const as = (userId: string | null, options: { readonly aal?: 'aal1' | 'aal2' } = {}): Session => {
    const role: Role = userId === null ? 'anon' : 'authenticated';
    const claims = JSON.stringify(
      userId === null ? { role } : { sub: userId, role, aal: options.aal ?? 'aal1' },
    );

    const query = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
      if (userId !== null) {
        await pg.query('insert into auth.users (id) values ($1) on conflict do nothing', [userId]);
      }
      return pg.transaction(async (tx) => {
        await tx.exec(`set local role ${role}`);
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims]);
        const result = await tx.query<T>(sql, params);
        return result.rows;
      });
    };

    const rpc: Rpc = async (fn, args) => {
      if (!/^[a-z_]+$/.test(fn)) throw new Error(`bad function name ${fn}`);
      const names = Object.keys(args);
      const values = names.map((n) => {
        const v = args[n];
        return v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
      });
      const call = names.map((n, i) => `${n} => $${String(i + 1)}`).join(', ');
      try {
        const rows = await query<{ r: unknown }>(`select public.${fn}(${call}) as r`, values);
        return rows[0]?.r ?? null;
      } catch (error) {
        // What supabase-js hands back: the raised message. Normalised the same
        // way the app's adapter does, so tests see the app's errors.
        throw new ServerError(error instanceof Error ? error.message : String(error));
      }
    };

    return { query, rpc };
  };

  return { pg, as, close: () => pg.close() };
}
