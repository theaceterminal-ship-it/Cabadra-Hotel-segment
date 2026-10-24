// Emails a "set your password" link through Resend. Shared by
// verify-setup-payment (welcome email after the first property is paid
// for) and send-password-link (asked for from the sign-in page).
//
// The link is a Supabase recovery link (auth.admin.generateLink): opening
// it signs the owner in on /set-password, where they choose a password.
// It works for Google-only accounts too, which is the point.
//
// Secrets: RESEND_API_KEY, RESEND_FROM (e.g. "Cabadra <hello@churmuri.com>",
// on a domain verified in Resend), optional SITE_URL (default
// https://hotel.churmuri.com; must be on Supabase's redirect allowlist).

// deno-lint-ignore no-explicit-any
type AdminClient = any;

export type PasswordEmailKind = 'welcome' | 'requested';

function siteUrl(): string {
  return (Deno.env.get('SITE_URL') ?? 'https://hotel.churmuri.com').replace(/\/+$/, '');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function render(kind: PasswordEmailKind, link: string, name?: string, propertyName?: string) {
  const hello = name ? `Hi ${escapeHtml(name)},` : 'Hi,';
  const intro = kind === 'welcome'
    ? `${propertyName ? `<strong>${escapeHtml(propertyName)}</strong> is set up on Cabadra.` : 'Your Cabadra account is ready.'} You can always sign in with Google. If you'd also like to sign in with your email and a password, set one here:`
    : 'You asked for a link to set your Cabadra password. Use the button below to choose one:';
  const subject = kind === 'welcome' ? 'Your Cabadra account is ready: set a password' : 'Set your Cabadra password';

  const html = `<!doctype html><html><body style="margin:0;background:#eef0ec;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <div style="max-width:480px;margin:0 auto;padding:32px 16px">
    <div style="font-size:24px;font-weight:600;letter-spacing:-0.02em;margin-bottom:20px">Cabadra</div>
    <div style="background:#fff;border-radius:24px;padding:28px">
      <p style="margin:0 0 12px;font-size:15px">${hello}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.55;color:#333">${intro}</p>
      <a href="${link}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-size:15px;font-weight:500">Set a password</a>
      <p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#666">The link works once and expires in an hour. If it has, ask for a new one on the sign-in page under “Forgot your password?”. If you didn’t ask for this, you can ignore this email.</p>
    </div>
    <p style="margin:16px 0 0;font-size:12px;color:#888;text-align:center">Cabadra · A Churmuri product · info@churmuri.com</p>
  </div></body></html>`;

  const text = `${hello.replace(/<[^>]+>/g, '')}\n\n${intro.replace(/<[^>]+>/g, '')}\n\n${link}\n\nThe link works once and expires in an hour. If it has, ask for a new one on the sign-in page under "Forgot your password?".`;
  return { subject, html, text };
}

/** Generates the link and sends the email. Throws with a reason on failure. */
export async function sendPasswordEmail(
  admin: AdminClient,
  email: string,
  kind: PasswordEmailKind,
  details: { name?: string; propertyName?: string } = {},
): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM');
  if (!apiKey || !from) throw new Error('RESEND_API_KEY / RESEND_FROM not set');

  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${siteUrl()}/set-password` },
  });
  const link = data?.properties?.action_link;
  if (error || !link) throw new Error(error?.message ?? 'Could not create the password link');

  const { subject, html, text } = render(kind, link, details.name, details.propertyName);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [email], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Resend: ${(body as { message?: string }).message ?? res.status}`);
  }
}
