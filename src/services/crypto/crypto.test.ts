import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { DecryptError, open, seal } from './aead';
import { equalBytes, fromBase64Url, lengthPrefixed, randomBytes, toBase64Url, utf8 } from './bytes';
import { DEFAULT_ARGON, isAcceptableArgon, stretchPassphrase, type ArgonParams } from './kdf';
import { blindRecordId, deriveKeyring, newDataKey } from './keys';
import { prfExtension, prfOutputOf, PRF_SALT, withoutPrf } from './prf';
import { formatRecoveryKey, newRecoveryKey, parseRecoveryKey } from './recovery-key';
import { unwrapDataKey, wrapDataKey, type Factor } from './wrap';

/** Tiny Argon2id so the suite runs in milliseconds. Production uses DEFAULT_ARGON. */
const FAST: ArgonParams = { alg: 'argon2id', m: 64, t: 1, p: 1 };
const CTX = { userId: 'user-1' };

describe('lengthPrefixed', () => {
  it('never encodes two different field lists alike', () => {
    // The attack a delimiter invites: "a|bc" and "ab|c".
    expect(equalBytes(lengthPrefixed(['a', 'bc']), lengthPrefixed(['ab', 'c']))).toBe(false);
    fc.assert(
      fc.property(
        fc.array(fc.string(), { maxLength: 5 }),
        fc.array(fc.string(), { maxLength: 5 }),
        (x, y) => {
          const same = x.length === y.length && x.every((v, i) => v === y[i]);
          expect(equalBytes(lengthPrefixed(x), lengthPrefixed(y))).toBe(same);
        },
      ),
    );
  });
});

describe('base64url', () => {
  it('round-trips any bytes', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 100 }), (bytes) => {
        expect([...fromBase64Url(toBase64Url(bytes))]).toEqual([...bytes]);
      }),
    );
  });
});

describe('seal / open', () => {
  const key = () =>
    crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);

  it('round-trips, with a fresh IV every time', async () => {
    const k = await key();
    const a = await seal(k, utf8('hello'), utf8('ctx'));
    const b = await seal(k, utf8('hello'), utf8('ctx'));
    expect(equalBytes(a.iv, b.iv)).toBe(false);
    expect(new TextDecoder().decode(await open(k, a, utf8('ctx')))).toBe('hello');
  });

  it('refuses a flipped ciphertext bit, a wrong key, a wrong context and a wrong IV', async () => {
    const k = await key();
    const sealed = await seal(k, utf8('hello'), utf8('ctx'));
    const flipped = new Uint8Array(sealed.ct);
    flipped[0] = flipped[0]! ^ 1;
    const otherIv = randomBytes(12);

    await expect(open(k, { ...sealed, ct: flipped }, utf8('ctx'))).rejects.toThrow(DecryptError);
    await expect(open(await key(), sealed, utf8('ctx'))).rejects.toThrow(DecryptError);
    await expect(open(k, sealed, utf8('other'))).rejects.toThrow(DecryptError);
    await expect(open(k, { ...sealed, iv: otherIv }, utf8('ctx'))).rejects.toThrow(DecryptError);
  });
});

describe('the keyring', () => {
  it('derives the same working keys from the same data key, and non-extractable ones', async () => {
    const dataKey = newDataKey();
    const one = await deriveKeyring(dataKey, 1);
    const two = await deriveKeyring(dataKey, 1);
    expect(await blindRecordId(one, 'transactions', 't1')).toBe(
      await blindRecordId(two, 'transactions', 't1'),
    );
    expect(one.enc.extractable).toBe(false);
    expect(one.blind.extractable).toBe(false);
    await expect(crypto.subtle.exportKey('raw', one.enc)).rejects.toThrow();
  });

  it('blinds ids so they carry neither the table nor the id', async () => {
    const ring = await deriveKeyring(newDataKey(), 1);
    const id = '0192f000-aaaa-7000-8000-000000000001'; // a UUIDv7: its prefix is a timestamp
    const rid = await blindRecordId(ring, 'transactions', id);
    expect(rid).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(rid).not.toContain('0192f000');
    expect(rid).not.toBe(await blindRecordId(ring, 'categories', id)); // same id, other table
    const otherRing = await deriveKeyring(newDataKey(), 1);
    expect(rid).not.toBe(await blindRecordId(otherRing, 'transactions', id));
  });

  it('refuses a data key of the wrong size', async () => {
    await expect(deriveKeyring(randomBytes(16), 1)).rejects.toThrow(RangeError);
  });
});

describe('the recovery key', () => {
  it('round-trips any 128 bits, in groups of four', () => {
    fc.assert(
      fc.property(fc.uint8Array({ minLength: 16, maxLength: 16 }), (bytes) => {
        const shown = formatRecoveryKey(bytes);
        expect(shown).toMatch(/^([0-9A-Z*~$=]{4}-){6}[0-9A-Z*~$=]{3}$/);
        const parsed = parseRecoveryKey(shown);
        expect(parsed.ok && [...parsed.bytes]).toEqual([...bytes]);
      }),
    );
  });

  it('reads it the way people type it', () => {
    const key = newRecoveryKey();
    const sloppy = key.display.toLowerCase().replaceAll('-', ' ').replaceAll('0', 'o').replaceAll('1', 'l');
    const parsed = parseRecoveryKey(`  ${sloppy} `);
    expect(parsed.ok && [...parsed.bytes]).toEqual([...key.bytes]);
  });

  it('catches every single-character typo as a typo', () => {
    fc.assert(
      fc.property(
        fc.uint8Array({ minLength: 16, maxLength: 16 }),
        fc.nat(26),
        fc.constantFrom(...Array.from('0123456789ABCDEFGHJKMNPQRSTVWXYZ')),
        (bytes, position, replacement) => {
          const shown = formatRecoveryKey(bytes).replaceAll('-', '');
          if (shown.charAt(position) === replacement) return;
          const parsed = parseRecoveryKey(shown.slice(0, position) + replacement + shown.slice(position + 1));
          expect(parsed.ok).toBe(false);
        },
      ),
    );
  });

  it.each([
    ['', 'length'],
    ['AAAA', 'length'],
    ['UUUU-UUUU-UUUU-UUUU-UUUU-UUUU-UUU', 'characters'],
  ])('refuses %j as %s', (input, error) => {
    expect(parseRecoveryKey(input)).toEqual({ ok: false, error });
  });
});

describe('Argon2id', () => {
  it('is deterministic for a salt, different across salts, and normalises Unicode', async () => {
    const salt = randomBytes(16);
    const a = await stretchPassphrase('correct horse', salt, FAST);
    expect(equalBytes(a, await stretchPassphrase('correct horse', salt, FAST))).toBe(true);
    expect(equalBytes(a, await stretchPassphrase('correct horse', randomBytes(16), FAST))).toBe(false);
    // "é" precomposed vs "e" + combining accent: one passphrase, two keyboards.
    expect(
      equalBytes(await stretchPassphrase('café', salt, FAST), await stretchPassphrase('café', salt, FAST)),
    ).toBe(true);
  });

  it('holds production parameters above the floor and refuses weak ones', () => {
    expect(isAcceptableArgon(DEFAULT_ARGON)).toBe(true);
    expect(isAcceptableArgon(FAST)).toBe(false);
    expect(isAcceptableArgon(FAST, true)).toBe(true);
  });

  it('refuses parameters no phone could run, even when weak ones are allowed', () => {
    const over: ArgonParams[] = [
      { ...DEFAULT_ARGON, m: 4_000_000 },
      { ...DEFAULT_ARGON, t: 1_000 },
      { ...DEFAULT_ARGON, p: 64 },
      { ...DEFAULT_ARGON, m: Number.POSITIVE_INFINITY },
      { ...DEFAULT_ARGON, m: Number.NaN },
      { ...DEFAULT_ARGON, t: 2.5 },
      { ...DEFAULT_ARGON, alg: 'argon2i' as 'argon2id' },
    ];
    for (const params of over) {
      expect(isAcceptableArgon(params)).toBe(false);
      expect(isAcceptableArgon(params, true)).toBe(false);
    }
    expect(isAcceptableArgon({ ...DEFAULT_ARGON, m: 262_144, t: 8, p: 4 })).toBe(true);
  });
});

describe('wrapping the data key', () => {
  const factors = (): Factor[] => [
    { kind: 'recovery', bytes: newRecoveryKey().bytes },
    { kind: 'passkey', credentialId: 'cred-1', prfOutput: randomBytes(32) },
    { kind: 'passphrase', passphrase: 'a long sync passphrase', params: FAST },
  ];

  it.each(['recovery', 'passkey', 'passphrase'] as const)('round-trips through a %s', async (kind) => {
    const factor = factors().find((f) => f.kind === kind)!;
    const dataKey = newDataKey();
    const wrapped = await wrapDataKey(dataKey, 1, factor, CTX);
    const back = await unwrapDataKey(wrapped, factor, CTX, { allowWeakKdf: true });
    expect(equalBytes(back, dataKey)).toBe(true);
    // Nothing secret in what the server stores.
    expect(JSON.stringify(wrapped)).not.toContain(toBase64Url(dataKey));
  });

  it('refuses the wrong passphrase, the wrong recovery key and the wrong passkey', async () => {
    const dataKey = newDataKey();
    const pass = await wrapDataKey(
      dataKey,
      1,
      { kind: 'passphrase', passphrase: 'right', params: FAST },
      CTX,
    );
    await expect(
      unwrapDataKey(pass, { kind: 'passphrase', passphrase: 'wrong', params: FAST }, CTX, {
        allowWeakKdf: true,
      }),
    ).rejects.toThrow(DecryptError);

    const rec = await wrapDataKey(dataKey, 1, { kind: 'recovery', bytes: randomBytes(16) }, CTX);
    await expect(unwrapDataKey(rec, { kind: 'recovery', bytes: randomBytes(16) }, CTX)).rejects.toThrow(
      DecryptError,
    );

    const pk = await wrapDataKey(
      dataKey,
      1,
      { kind: 'passkey', credentialId: 'c', prfOutput: randomBytes(32) },
      CTX,
    );
    await expect(
      unwrapDataKey(pk, { kind: 'passkey', credentialId: 'c', prfOutput: randomBytes(32) }, CTX),
    ).rejects.toThrow(DecryptError);
  });

  it('is bound to its user and its version: copied elsewhere, it does not open', async () => {
    const factor: Factor = { kind: 'recovery', bytes: randomBytes(16) };
    const wrapped = await wrapDataKey(newDataKey(), 1, factor, CTX);
    await expect(unwrapDataKey(wrapped, factor, { userId: 'someone-else' })).rejects.toThrow(DecryptError);
    await expect(unwrapDataKey({ ...wrapped, keyVersion: 2 }, factor, CTX)).rejects.toThrow(DecryptError);
  });

  it('cannot be presented as a different kind of factor', async () => {
    const bytes = randomBytes(32);
    const wrapped = await wrapDataKey(
      newDataKey(),
      1,
      { kind: 'passkey', credentialId: 'recovery', prfOutput: bytes },
      CTX,
    );
    await expect(
      unwrapDataKey({ ...wrapped, kind: 'recovery' }, { kind: 'recovery', bytes }, CTX),
    ).rejects.toThrow(DecryptError);
  });

  it('refuses a passphrase wrap with weak or missing parameters', async () => {
    const factor: Factor = { kind: 'passphrase', passphrase: 'p', params: FAST };
    const wrapped = await wrapDataKey(newDataKey(), 1, factor, CTX);
    await expect(unwrapDataKey(wrapped, factor, CTX)).rejects.toThrow(RangeError);
    const { kdf: _kdf, ...noParams } = wrapped;
    await expect(unwrapDataKey(noParams, factor, CTX, { allowWeakKdf: true })).rejects.toThrow(RangeError);
  });

  it('refuses a server-inflated passphrase wrap before spending anything on it', async () => {
    const factor: Factor = { kind: 'passphrase', passphrase: 'p', params: FAST };
    const wrapped = await wrapDataKey(newDataKey(), 1, factor, CTX);
    const inflated = { ...wrapped, kdf: { ...DEFAULT_ARGON, m: 4_000_000 } };
    const started = performance.now();
    await expect(unwrapDataKey(inflated, factor, CTX, { allowWeakKdf: true })).rejects.toThrow(RangeError);
    expect(performance.now() - started).toBeLessThan(100); // 4 GiB of Argon2 would take far longer, or crash

    const longSalt = { ...wrapped, salt: toBase64Url(randomBytes(4_096)) };
    await expect(unwrapDataKey(longSalt, factor, CTX, { allowWeakKdf: true })).rejects.toThrow(RangeError);
  });
});

describe('passkey PRF', () => {
  it('asks every authenticator for the same app-specific salt', () => {
    expect(prfExtension().prf.eval.first).toEqual(PRF_SALT);
  });

  it('reads the output whether the browser gives an ArrayBuffer or a view', () => {
    const secret = randomBytes(32);
    expect(
      prfOutputOf({ getClientExtensionResults: () => ({ prf: { results: { first: secret.buffer } } }) }),
    ).toEqual(secret);
    expect(
      prfOutputOf({ getClientExtensionResults: () => ({ prf: { results: { first: secret } } }) }),
    ).toEqual(secret);
    expect(prfOutputOf({ getClientExtensionResults: () => ({}) })).toBeUndefined();
  });

  it('never lets the PRF secret leave in a credential sent to the server', () => {
    const secret = toBase64Url(randomBytes(32));
    const credential = {
      id: 'cred',
      response: { clientDataJSON: 'x', signature: 'y' },
      clientExtensionResults: { prf: { enabled: true, results: { first: secret } }, credProps: { rk: true } },
    };
    const sent = withoutPrf(credential);
    expect(JSON.stringify(sent)).not.toContain(secret);
    expect(JSON.stringify(sent)).not.toContain('prf');
    expect(sent.clientExtensionResults).toEqual({ credProps: { rk: true } });
    // The original is untouched: the unlock step still needs it.
    expect(credential.clientExtensionResults.prf.results.first).toBe(secret);
  });
});
