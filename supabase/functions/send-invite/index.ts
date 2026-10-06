/**
 * Invite someone to link accounts, by email.
 *
 * The invitation is made by the database, as the signed-in caller
 * (create_invite: supabase/migrations/20261007000000_households.sql), which
 * returns its single-use token once and keeps only a hash. The token goes
 * into a link mailed to the address - and nowhere else: it is not returned to
 * the inviter, so the link reaches only the inbox it was sent to. Accepting
 * also needs that address's account, signed in.
 *
 * Mailed through Resend, which already sends the account's emails. The key
 * lives only in this project's Edge Function secrets (RESEND_API_KEY) - never
 * in the app, the repo or `.env.local`. If the email cannot be sent, the
 * invitation is taken back, so no link exists that nobody received.
 *
 * Sent to Resend: the invitee's address, the inviter's name and email, and
 * the link. Deployed with the Supabase MCP / CLI: `supabase functions deploy send-invite`.
 */
import { createSupabaseContext } from 'npm:@supabase/server';
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGINS = new Set(['https://bookandry.com', 'http://localhost:4174']);
const SENDER = 'Bookandry <no-reply@bookandry.com>';
const KNOWN = new Set([
  'invite_self',
  'already_member',
  'household_full',
  'too_many_invites',
  'malformed_invite',
]);

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin !== null && ORIGINS.has(origin) ? origin : 'https://bookandry.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

type Input = { email: string; currency: string; language: 'en' | 'he'; inviterName: string };

function parse(body: unknown): Input | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { email, currency, language, inviterName } = body as Record<string, unknown>;
  if (typeof email !== 'string' || email.length > 254) return undefined;
  if (typeof currency !== 'string' || !/^[A-Z]{3}$/.test(currency)) return undefined;
  if (language !== 'en' && language !== 'he') return undefined;
  if (typeof inviterName !== 'string' || inviterName.length > 80) return undefined;
  return { email: email.trim(), currency, language, inviterName: inviterName.trim() };
}

const escape = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function letter(input: Input, from: string, link: string): { subject: string; html: string; text: string } {
  const he = input.language === 'he';
  const name = input.inviterName === '' ? from : input.inviterName;
  const who = `${escape(name)} (<span dir="ltr" style="unicode-bidi:embed">${escape(from)}</span>)`;
  const copy = he
    ? {
        subject: `הזמנה מ־${name} לשתף משק בית ב־Bookandry`,
        title: 'הזמנה לשתף משק בית',
        body: `קיבלת הזמנה מ־${who} לקשר את החשבונות שלכם ב־Bookandry. אחרי הקישור תראו יחד את ההוצאות, ההכנסות, הכרטיסים וחשבונות הבנק של שניכם, וכל אחד יוכל לערוך. אפשר לבטל את הקישור בכל עת, ואז כל אחד שומר רק את שלו.`,
        button: 'צפייה בהזמנה',
        expiry: 'הקישור תקף לשבעה ימים ולשימוש אחד. כדי לאשר צריך להתחבר עם כתובת המייל הזו.',
        ignore: 'לא ציפית להזמנה הזו? אפשר להתעלם מהמייל ושום דבר לא יקרה.',
        copyLink: 'הכפתור לא עובד? אפשר להעתיק את הקישור הזה לדפדפן:',
        footer: 'נשלח מ־Bookandry אל',
      }
    : {
        subject: `${name} invited you to share a household on Bookandry`,
        title: 'An invitation to share a household',
        body: `${who} invited you to link your Bookandry accounts. Once linked, you both see each other's spending, income, cards and bank accounts in one place, and either of you can edit. You can unlink at any time, and then each of you keeps only your own.`,
        button: 'View the invitation',
        expiry: 'The link works once and for seven days. To accept, sign in with this email address.',
        ignore: "Weren't expecting this? You can ignore this email and nothing will happen.",
        copyLink: 'Button not working? Copy this link into your browser:',
        footer: 'Sent by Bookandry to',
      };
  const dir = he ? 'rtl' : 'ltr';
  const align = he ? 'right' : 'left';
  const font = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const html = `<!doctype html>
<html lang="${input.language}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(copy.title)}</title></head>
<body style="margin:0;padding:0;background:#f1f4f2;" dir="${dir}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1f4f2;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">
<tr><td bgcolor="#0f492e" style="background:#0f492e;padding:28px 32px 20px;" align="${align}"><a href="https://bookandry.com" style="text-decoration:none;"><img src="https://bookandry.com/email/header.png" width="280" height="48" alt="Bookandry" style="display:block;border:0;width:280px;height:48px;color:#f5fcf7;font:700 28px Georgia,serif;"></a></td></tr>
<tr><td bgcolor="#0f492e" style="background:#0f492e;line-height:0;font-size:0;"><img src="https://bookandry.com/email/band.png" width="560" height="44" alt="" style="display:block;border:0;width:100%;max-width:560px;height:auto;"></td></tr>
<tr><td dir="${dir}" align="${align}" style="padding:36px 32px 8px;font-family:${font};color:#18181b;text-align:${align};">
<h1 style="margin:0 0 16px;font-size:24px;line-height:1.3;font-weight:700;color:#18181b;">${escape(copy.title)}</h1>
<p style="margin:0 0 28px;font-size:16px;line-height:1.6;color:#18181b;">${copy.body}</p>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${align}" style="margin:0 0 28px;"><tr><td bgcolor="#0f492e" style="border-radius:10px;background:#0f492e;"><a href="${escape(link)}" style="display:inline-block;padding:14px 28px;font-family:${font};font-size:16px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:10px;">${escape(copy.button)}</a></td></tr></table>
<p style="clear:both;margin:0 0 12px;font-size:14px;line-height:1.6;color:#52525b;">${escape(copy.expiry)}</p>
<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#52525b;">${escape(copy.ignore)}</p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#52525b;">${escape(copy.copyLink)}</p>
<p dir="ltr" style="margin:0 0 28px;font-size:13px;line-height:1.5;word-break:break-all;text-align:left;"><a href="${escape(link)}" style="color:#0f492e;">${escape(link)}</a></p>
</td></tr>
<tr><td dir="${dir}" align="${align}" style="padding:20px 32px 28px;border-top:1px solid #e4e4e7;font-family:${font};font-size:12px;line-height:1.6;color:#52525b;text-align:${align};">${escape(copy.footer)} <span dir="ltr" style="unicode-bidi:embed">${escape(input.email)}</span>. <a href="https://bookandry.com" style="color:#52525b;">bookandry.com</a></td></tr>
</table></td></tr></table>
</body></html>`;
  const text = [
    copy.title,
    '',
    `${name} (${from})`,
    copy.body.replace(/<[^>]+>/g, ''),
    '',
    link,
    '',
    copy.expiry,
    copy.ignore,
  ].join('\n');
  return { subject: copy.subject, html, text };
}

export default {
  fetch: async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const headers = cors(origin);
    if (req.method === 'OPTIONS') return new Response('ok', { headers });
    if (req.method !== 'POST') return Response.json({ error: 'method' }, { status: 405, headers });

    const { data: ctx, error } = await createSupabaseContext(req, { auth: 'user' });
    if (error || !ctx?.userClaims) return Response.json({ error: 'unauthorized' }, { status: 401, headers });

    const input = parse(await req.json().catch(() => undefined));
    if (input === undefined) return Response.json({ error: 'malformed_invite' }, { status: 400, headers });

    const key = Deno.env.get('RESEND_API_KEY');
    if (key === undefined || key === '')
      return Response.json({ error: 'email_failed' }, { status: 503, headers });

    // The caller's own session: the invitation is theirs, made under their rules.
    const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const made = await db.rpc('create_invite', { p_email: input.email, p_currency: input.currency });
    if (made.error !== null) {
      const code = KNOWN.has(made.error.message) ? made.error.message : 'email_failed';
      return Response.json({ error: code }, { status: code === 'email_failed' ? 502 : 400, headers });
    }
    const invite = made.data as { id: string; token: string };
    const base = origin !== null && ORIGINS.has(origin) ? origin : 'https://bookandry.com';
    const link = `${base}/link?t=${encodeURIComponent(invite.token)}`;
    const from = typeof ctx.userClaims.email === 'string' ? ctx.userClaims.email : '';
    const { subject, html, text } = letter(input, from, link);

    const sent = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: SENDER, to: [input.email], subject, html, text }),
    }).catch(() => undefined);
    if (sent?.ok !== true) {
      await db.rpc('revoke_invite', { p_id: invite.id });
      console.log(JSON.stringify({ fn: 'send-invite', status: sent?.status ?? 0 }));
      return Response.json({ error: 'email_failed' }, { status: 502, headers });
    }
    return Response.json({ ok: true }, { headers });
  },
};
