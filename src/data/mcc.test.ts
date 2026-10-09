import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import list from '@/data/mcc.json';
import { MCC_CODES } from '@/domain/mcc-codes';

const ROOT = resolve(__dirname, '../..');
const read = (path: string): string => readFileSync(resolve(ROOT, path), 'utf8');
const SOURCES = read('src/data/mcc-SOURCES.md');
const SCRIPT = read('scripts/build-mcc.mjs');

/** A "- Name: `value`" line of mcc-SOURCES.md. */
const recorded = (name: string): string | undefined =>
  new RegExp(`^- ${name}: \`([^\`]+)\`$`, 'm').exec(SOURCES)?.[1];

describe('the business types the app ships', () => {
  it('lists each code once, as four digits, with an English and a Hebrew name', () => {
    const codes = list.map((entry) => entry.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const entry of list) {
      expect(entry.code, JSON.stringify(entry)).toMatch(/^\d{4}$/);
      expect(entry.en.trim(), entry.code).not.toBe('');
      expect(entry.he.trim(), entry.code).not.toBe('');
      expect(Object.keys(entry).sort(), entry.code).toEqual(['code', 'en', 'he']);
    }
    // In code order, so a diff after an upstream update reads line by line.
    expect([...codes].sort()).toEqual(codes);
  });

  it('is exactly the code set of the upstream commit recorded in mcc-SOURCES.md', () => {
    // The script pins the commit and the file's hash; SOURCES records what was built from them.
    expect(recorded('Commit')).toBe(/const COMMIT = '([0-9a-f]{40})'/.exec(SCRIPT)?.[1]);
    expect(recorded('File SHA-256')).toBe(/const SHA256 = '([0-9a-f]{64})'/.exec(SCRIPT)?.[1]);
    const codes = list.map((entry) => entry.code);
    expect(String(codes.length)).toBe(recorded('Codes'));
    expect(createHash('sha256').update(codes.join('\n')).digest('hex')).toBe(recorded('Codes SHA-256'));
  });

  it('gives the app and the Edge Functions the same codes', () => {
    expect(MCC_CODES).toEqual(list.map((entry) => entry.code));
    expect(read('supabase/functions/_shared/mcc-codes.ts'), 'run: pnpm data:mcc').toBe(
      read('src/domain/mcc-codes.ts'),
    );
  });

  it('is loaded only through import(), so the main chunk does not carry it', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? files(path) : [path];
      });
    const statically = files(resolve(ROOT, 'src'))
      .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path))
      .filter((path) => /from\s+'[^']*mcc\.json'/.test(readFileSync(path, 'utf8')));
    expect(statically).toEqual([]);
  });
});
