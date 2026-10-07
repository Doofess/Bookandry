/**
 * Ask every other member of a household to confirm deleting its shared data,
 * by email.
 *
 * The request is made by the database, as the signed-in caller (request_wipe:
 * supabase/migrations/20261008000000_wipes.sql), which returns the requester's name (as the server has it) and one single-use
 * token per other member - not their address, because members never learn
 * each other's sign-in address. This function looks each address up itself,
 * with the project's service-role key (SUPABASE_SERVICE_ROLE_KEY, which
 * Supabase provides to hosted functions; never stored or handled by us), used
 * only for those lookups and to remove a request no email went out for. Each
 * token goes into a link mailed to its member. This function does not hand the
 * tokens back, but request_wipe can be called directly by a signed-in member,
 * who then holds them: that is safe because a token works only for the account
 * it was made for (wipe_wrong_account), so whoever holds it cannot confirm for
 * anyone else.
 *
 * Mailed through Resend (RESEND_API_KEY, in this project's Edge Function
 * secrets only). If an address cannot be found or an email cannot be sent, no
 * link is left that nobody received: when no email has gone out yet, the
 * request is removed outright (discard_wipe), so it does not count against the
 * hourly limit and "Try again" works; once one has, it is cancelled
 * (cancel_wipe), and the limit stands. Emails, tokens and keys are never logged.
 *
 * Sent to Resend: each member's address, the requester's name (as the server has it) and
 * the link. Deployed with the Supabase MCP / CLI: `supabase functions deploy send-wipe-requests`.
 */
import { createSupabaseContext } from 'npm:@supabase/server';
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGINS = new Set(['https://bookandry.com', 'http://localhost:4174']);
const SENDER = 'Bookandry <no-reply@bookandry.com>';
const KNOWN = new Set(['not_linked', 'wipe_pending', 'too_many_wipe_requests']);

function cors(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin !== null && ORIGINS.has(origin) ? origin : 'https://bookandry.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

type Input = { language: 'en' | 'he' };

function parse(body: unknown): Input | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const { language } = body as Record<string, unknown>;
  if (language !== 'en' && language !== 'he') return undefined;
  return { language };
}

const escape = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function letter(
  input: Input,
  requester: string,
  to: string,
  link: string,
): { subject: string; html: string; text: string } {
  const he = input.language === 'he';
  // Never the requester's address: members do not learn each other's.
  const name = requester !== '' ? requester : he ? 'חבר/ה במשק הבית' : 'A member of your household';
  const who = escape(name);
  const copy = he
    ? {
        subject: `${name} ביקש/ה למחוק את כל הנתונים של משק הבית ב־Bookandry`,
        title: 'בקשה למחוק את נתוני משק הבית',
        body: `${who} ביקש/ה למחוק את כל הנתונים המשותפים לכם ב־Bookandry: כל התנועות, הכרטיסים, חשבונות הבנק, הקטגוריות וההתחייבויות, של כל מי שבמשק הבית. שום דבר לא יימחק בלי הסכמה של כל השאר. החשבונות, התמונות והקישור ביניכם נשארים.`,
        button: 'לצפייה בבקשה',
        expiry: 'הקישור תקף לשבעה ימים ולשימוש אחד. כדי לענות צריך להתחבר עם כתובת המייל הזו.',
        ignore: 'לא ציפית לזה? אל תאשר/י, ושום דבר לא יימחק בלעדיך.',
        copyLink: 'הכפתור לא עובד? אפשר להעתיק את הקישור הזה לדפדפן:',
        footer: 'נשלח מ־Bookandry אל',
      }
    : {
        subject: `${name} asked to delete all of your household's data on Bookandry`,
        title: "A request to delete your household's data",
        body: `${who} asked to delete all of the data you share on Bookandry: every transaction, card, bank account, category and commitment, for everyone in the household. Nothing is deleted unless everyone else agrees. Your logins, pictures and the link between your accounts stay.`,
        button: 'Review the request',
        expiry: 'The link works once and for seven days. To answer, sign in with this email address.',
        ignore: "Not expecting this? Don't confirm: nothing is deleted without you.",
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
<tr><td dir="${dir}" align="${align}" style="padding:20px 32px 28px;border-top:1px solid #e4e4e7;font-family:${font};font-size:12px;line-height:1.6;color:#52525b;text-align:${align};">${escape(copy.footer)} <span dir="ltr" style="unicode-bidi:embed">${escape(to)}</span>. <a href="https://bookandry.com" style="color:#52525b;">bookandry.com</a></td></tr>
</table></td></tr></table>
</body></html>`;
  const text = [
    copy.title,
    '',
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
    if (input === undefined) return Response.json({ error: 'email_failed' }, { status: 400, headers });

    const key = Deno.env.get('RESEND_API_KEY');
    // Checked before the request is made: without both keys no email can go out, so
    // there is no point making one only to remove it again.
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (key === undefined || key === '' || serviceKey === undefined || serviceKey === '')
      return Response.json({ error: 'email_failed' }, { status: 503, headers });

    const url = Deno.env.get('SUPABASE_URL') ?? '';
    // The caller's own session: the request is theirs, made under their rules.
    const db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: req.headers.get('authorization') ?? '' } },
      auth: { persistSession: false },
    });
    const made = await db.rpc('request_wipe');
    if (made.error !== null) {
      const code = KNOWN.has(made.error.message) ? made.error.message : 'email_failed';
      return Response.json({ error: code }, { status: code === 'email_failed' ? 502 : 400, headers });
    }
    const answer = made.data as { id?: unknown; asks?: unknown; requesterName?: unknown } | null;
    const asks = answer?.asks;
    const requester = typeof answer?.requesterName === 'string' ? answer.requesterName : '';

    // Addresses are looked up here, never returned by the database. The
    // service-role key is used for these lookups, and to remove a request no
    // email went out for (discard_wipe, which only service_role may call).
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    let sent = 0;

    // Taking the request back leaves no link that nobody received. With no email
    // out yet it is removed, so the hourly limit does not refuse "Try again";
    // after a partial send it is cancelled, and the limit stands.
    const fail = async (status: number): Promise<Response> => {
      const discarded =
        sent === 0 && typeof answer?.id === 'string'
          ? (await admin.rpc('discard_wipe', { p_id: answer.id })).error === null
          : false;
      const cancelled = discarded ? false : (await db.rpc('cancel_wipe')).error === null;
      console.log(JSON.stringify({ fn: 'send-wipe-requests', status, sent, discarded, cancelled }));
      return Response.json({ error: 'email_failed' }, { status: 502, headers });
    };

    if (!Array.isArray(asks) || asks.length === 0) return await fail(0);

    const base = origin !== null && ORIGINS.has(origin) ? origin : 'https://bookandry.com';

    // Every address first, so a missing one sends nothing at all.
    const recipients: { to: string; token: string }[] = [];
    for (const ask of asks as { userId: string; token: string }[]) {
      const found = await admin.auth.admin.getUserById(ask.userId).catch(() => undefined);
      const to = found?.error === null ? found.data.user?.email : undefined;
      if (typeof to !== 'string' || to === '') return await fail(0);
      recipients.push({ to, token: ask.token });
    }

    for (const { to, token } of recipients) {
      const link = `${base}/wipe?t=${encodeURIComponent(token)}`;
      const { subject, html, text } = letter(input, requester, to, link);
      const mailed = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: SENDER, to: [to], subject, html, text }),
      }).catch(() => undefined);
      if (mailed?.ok !== true) return await fail(mailed?.status ?? 0);
      sent += 1;
    }
    return Response.json({ ok: true, asked: asks.length }, { headers });
  },
};
