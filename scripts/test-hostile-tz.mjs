/**
 * Runs the calendar-date suite under deliberately hostile timezones.
 *
 * The date model never round-trips a calendar date through UTC, so a viewer's
 * offset cannot change a result - but that is a claim, and this is the proof.
 * Each zone is chosen for a specific failure mode:
 *
 *   Pacific/Kiritimati  UTC+14, the extreme east: toISOString() reports the
 *                       PREVIOUS day for most of the local day.
 *   Pacific/Niue        UTC-11, the extreme west: the mirror image.
 *   America/Sao_Paulo   has transitioned DST at local MIDNIGHT, so a local
 *                       midnight can simply not exist.
 *   Asia/Jerusalem      the primary audience's zone.
 *
 * Note: process.env.TZ is unreliable when set mid-process on Windows, so each
 * zone gets a fresh child process.
 */
import { spawnSync } from 'node:child_process';

const ZONES = ['Etc/UTC', 'Pacific/Kiritimati', 'Pacific/Niue', 'America/Sao_Paulo', 'Asia/Jerusalem'];
const FILES = ['src/lib/dates.test.ts', 'src/domain/occurrences.test.ts'];

let failed = false;

for (const tz of ZONES) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vitest', 'run', '--project', 'unit', ...FILES.filter(Boolean)],
    { env: { ...process.env, TZ: tz }, encoding: 'utf8', shell: process.platform === 'win32' },
  );

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const summary = /Tests {2}(.+)/.exec(output)?.[1]?.trim() ?? 'no summary';

  if (result.status === 0) {
    console.log(`  ok   ${tz.padEnd(20)} ${summary}`);
  } else {
    failed = true;
    console.error(`  FAIL ${tz.padEnd(20)} ${summary}`);
    console.error(output.split('\n').slice(-30).join('\n'));
  }
}

if (failed) {
  console.error('\ntest:tz - calendar dates are NOT offset-independent.\n');
  process.exit(1);
}
console.log('\ntest:tz - calendar dates are offset-independent across all zones.');
