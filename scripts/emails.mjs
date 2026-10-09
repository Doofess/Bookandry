/**
 * The emails Supabase Auth sends for Bookandry, built to look like the app.
 *
 *   node scripts/emails.mjs
 *
 * Writes:
 *   public/email/header.png - the mark and the name, in the brand's face
 *   public/email/band.png   - the engraved bands from the front door's panel
 *   supabase/templates/*.html - one file per email, pasted into the dashboard
 *     (Authentication -> Emails -> Templates); subjects in the README
 *
 * Images are served from bookandry.com, so a deploy must go out before the
 * templates are pasted. Colours come from src/index.css, so the emails follow
 * the app whenever its colours change. Rendered in Playwright's Chromium, which
 * is what reads the oklch() values and draws the PNGs.
 *
 * Each email is written twice, English and Hebrew, and picks one by the
 * account's language (user_metadata.language, kept by src/app/account.ts).
 * `printf "%v"` makes a missing language read "<nil>" rather than stop the
 * template: comparing a missing key directly can fail to render.
 */
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://bookandry.com';

// --- colours, from the app's own tokens --------------------------------------

const css = readFileSync(join(root, 'src/index.css'), 'utf8');
const lightTokens = css.slice(css.indexOf(':root {'), css.indexOf('.dark {'));
function token(name) {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(lightTokens);
  if (match === null) throw new Error(`no --${name} in src/index.css`);
  return match[1].trim();
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });

/** An oklch() (or any CSS colour) as #rrggbb, the way email clients need it. */
async function hex(color) {
  return page.evaluate((c) => {
    const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d');
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  }, color);
}

const deep = await hex(token('brand-deep'));
const paper = await hex(token('brand-deep-foreground'));
const vivid = await hex(token('brand-vivid'));

// --- images -------------------------------------------------------------------

const font = readFileSync(
  join(
    root,
    'node_modules/@fontsource-variable/frank-ruhl-libre/files/frank-ruhl-libre-latin-wght-normal.woff2',
  ),
).toString('base64');

/** The Logo component's mark (src/components/logo.tsx), inverse tone. */
const mark = `<svg width="44" height="44" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="11" fill="${paper}"/>
  <rect x="4.5" y="8" width="15" height="8" rx="1.5" fill="${deep}"/>
  <circle cx="12" cy="12" r="1.9" fill="${paper}"/>
  <circle cx="7" cy="10" r="0.9" fill="${paper}"/>
  <circle cx="17" cy="14" r="0.9" fill="${paper}"/>
</svg>`;

const fixed = (n) => String(Math.round(n * 10) / 10);

/** The front door's bands (src/features/account/engraving.tsx), as a strip. */
function bands(width, height) {
  const rows = [
    { y: 16, amplitude: 9, wavelength: 90, copies: 6 },
    { y: 36, amplitude: 4.5, wavelength: 45, copies: 4 },
  ];
  const paths = rows.flatMap(({ y, amplitude, wavelength, copies }) =>
    Array.from({ length: copies }, (_, k) => {
      const phase = (k / copies) * Math.PI * 2;
      const steps = Math.ceil((width / wavelength) * 16);
      let d = '';
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * width;
        const yy = y + amplitude * Math.sin((x / wavelength) * Math.PI * 2 + phase);
        d += `${i === 0 ? 'M' : 'L'}${fixed(x)} ${fixed(yy)}`;
      }
      return `<path d="${d}"/>`;
    }),
  );
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${deep}"/>
  <g fill="none" stroke="${vivid}" stroke-opacity="0.45" stroke-width="1">${paths.join('')}</g>
</svg>`;
}

async function render(html, path, transparent) {
  await page.setContent(`<!doctype html><html><head><style>
    @font-face { font-family: 'Frank Ruhl Libre'; font-weight: 300 900;
      src: url(data:font/woff2;base64,${font}) format('woff2'); }
    html, body { margin: 0; background: transparent; }
    #shot { display: inline-flex; align-items: center; }
  </style></head><body><div id="shot">${html}</div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(dirname(path), { recursive: true });
  await page.locator('#shot').screenshot({ path, omitBackground: transparent });
}

// 280x48 shown, 560x96 drawn: sharp on high-density screens.
await render(
  `<div style="display:flex;align-items:center;gap:14px;width:280px;height:48px">${mark}
    <span style="font:700 34px/1 'Frank Ruhl Libre',serif;color:${paper};letter-spacing:-0.01em">Bookandry</span></div>`,
  join(root, 'public/email/header.png'),
  true,
);
await render(bands(560, 44), join(root, 'public/email/band.png'), false);
await browser.close();

// --- templates ----------------------------------------------------------------

const ink = '#18181b';
const muted = '#52525b';
const page_ = '#f4f4f5';
const body = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Escapes text for HTML. Template tags ({{ }}) pass through untouched. */
const esc = (s) => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

/** An address inside a sentence, kept left-to-right even in Hebrew. */
const EMAIL = '<span dir="ltr" style="unicode-bidi:embed">{{ .Email }}</span>';

function email({ lang, preview, title, lead, button, after, fallback, footer }) {
  const rtl = lang === 'he';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${page_};" dir="${dir}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${page_};">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td bgcolor="${deep}" style="background:${deep};padding:28px 32px 20px;" align="${align}">
<a href="${SITE}" style="text-decoration:none;"><img src="${SITE}/email/header.png" width="280" height="48" alt="Bookandry" style="display:block;border:0;width:280px;height:48px;color:${paper};font:700 28px Georgia,serif;"></a>
</td></tr>
<tr><td bgcolor="${deep}" style="background:${deep};line-height:0;font-size:0;"><img src="${SITE}/email/band.png" width="560" height="44" alt="" style="display:block;border:0;width:100%;max-width:560px;height:auto;"></td></tr>
<tr><td dir="${dir}" align="${align}" style="padding:36px 32px 8px;font-family:${body};color:${ink};text-align:${align};">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:${ink};">${title}</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:${ink};">${lead}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="margin:0 0 28px;"><tr>
<td bgcolor="${deep}" style="border-radius:10px;background:${deep};">
<a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 28px;font-family:${body};font-size:16px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${button}</a>
</td></tr></table>
<p style="clear:both;margin:0 0 24px;font-size:14px;line-height:1.6;color:${muted};">${after}</p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:${muted};">${fallback}</p>
<p dir="ltr" style="margin:0 0 28px;font-size:13px;line-height:1.5;word-break:break-all;text-align:left;"><a href="{{ .ConfirmationURL }}" style="color:${deep};">{{ .ConfirmationURL }}</a></p>
</td></tr>
<tr><td dir="${dir}" align="${align}" style="padding:20px 32px 28px;border-top:1px solid #e4e4e7;font-family:${body};font-size:12px;line-height:1.6;color:${muted};text-align:${align};">${footer} <a href="${SITE}" style="color:${muted};">bookandry.com</a></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

const HE = '{{ if eq (printf "%v" .Data.language) "he" }}';

const TEMPLATES = {
  'reset-password': {
    subject: { en: 'Reset your Bookandry password', he: 'איפוס הסיסמה ל־Bookandry' },
    en: {
      preview: 'Choose a new password for your Bookandry account.',
      title: 'Reset your password',
      lead: `Someone asked to reset the password for the Bookandry account ${EMAIL}. If it was you, choose a new one:`,
      button: 'Choose a new password',
      after: "Didn't ask for this? Ignore this email and your password stays as it is. The link works once.",
      fallback: 'Button not working? Copy this link into your browser:',
      footer: `Sent by Bookandry to ${EMAIL}.`,
    },
    he: {
      preview: 'בחירת סיסמה חדשה לחשבון Bookandry שלך.',
      title: 'איפוס סיסמה',
      lead: `התקבלה בקשה לאפס את הסיסמה של חשבון Bookandry ${EMAIL}. אם הבקשה הגיעה ממך, אפשר לבחור סיסמה חדשה:`,
      button: 'בחירת סיסמה חדשה',
      after: 'לא ביקשת? אפשר להתעלם מהמייל הזה, והסיסמה תישאר כמו שהיא. הקישור עובד פעם אחת.',
      fallback: 'הכפתור לא עובד? אפשר להעתיק את הקישור הזה לדפדפן:',
      footer: `נשלח מ־Bookandry אל ${EMAIL}.`,
    },
  },
  'confirm-signup': {
    subject: { en: 'Confirm your email for Bookandry', he: 'אישור כתובת המייל ל־Bookandry' },
    en: {
      preview: 'One step left to create your Bookandry account.',
      title: 'Confirm your email',
      lead: `Welcome to Bookandry. Confirm that ${EMAIL} is your address to finish creating your account:`,
      button: 'Confirm email',
      after: "Didn't create an account? Ignore this email and nothing will happen.",
      fallback: 'Button not working? Copy this link into your browser:',
      footer: `Sent by Bookandry to ${EMAIL}.`,
    },
    he: {
      preview: 'נשאר צעד אחד ליצירת החשבון ב־Bookandry.',
      title: 'אישור כתובת המייל',
      lead: `ברוכים הבאים ל־Bookandry. כדי לסיים ליצור את החשבון, צריך לאשר ש־${EMAIL} היא הכתובת שלך:`,
      button: 'אישור כתובת המייל',
      after: 'לא יצרת חשבון? אפשר להתעלם מהמייל הזה ושום דבר לא יקרה.',
      fallback: 'הכפתור לא עובד? אפשר להעתיק את הקישור הזה לדפדפן:',
      footer: `נשלח מ־Bookandry אל ${EMAIL}.`,
    },
  },
};

const out = join(root, 'supabase/templates');
mkdirSync(out, { recursive: true });
for (const [name, t] of Object.entries(TEMPLATES)) {
  const html = `${HE}\n${email({ lang: 'he', ...t.he })}\n{{ else }}\n${email({ lang: 'en', ...t.en })}\n{{ end }}\n`;
  writeFileSync(join(out, `${name}.html`), html);
  writeFileSync(join(out, `${name}.subject.txt`), `${HE}${t.subject.he}{{ else }}${t.subject.en}{{ end }}\n`);
}
console.log(`colours: deep ${deep}, paper ${paper}, vivid ${vivid}`);
console.log(
  `wrote ${Object.keys(TEMPLATES).length * 2} files to supabase/templates and 2 images to public/email`,
);
