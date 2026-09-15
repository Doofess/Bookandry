/**
 * A fixed TZ is a belt; `src/lib/dates.test.ts` carries the braces.
 *
 * `process.env.TZ` is historically unreliable on Windows (nodejs/node#31478),
 * so the date model never round-trips a calendar date through UTC in the first
 * place. The guard test asserts the TZ actually took effect, so a silent
 * Windows fallback shows up on day one rather than in the final phase.
 */
export default function setup(): void {
  process.env['TZ'] = 'Etc/UTC';
}
