// Emails to local businesses on the partners marketplace, through Resend.
// Shared by partner-signup, partner-verify-payment and partner-mailer.
// Same look as the password emails (../_shared/passwordEmail.ts): the
// site's fog background, a white card, an ink pill button.
//
// Secrets: RESEND_API_KEY, RESEND_FROM, optional SITE_URL (default
// https://hotel.churmuri.com).

export function siteUrl(): string {
  return (Deno.env.get('SITE_URL') ?? 'https://hotel.churmuri.com').replace(/\/+$/, '');
}

export function partnerPageUrl(portalToken: string): string {
  return `${siteUrl()}/partner/${portalToken}`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function formatDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

export interface PartnerEmail {
  subject: string;
  /** Plain paragraphs (escaped here) or pre-built HTML blocks. */
  paragraphs: (string | { html: string })[];
  button?: { label: string; href: string };
  footnote?: string;
}

function render(e: PartnerEmail) {
  const blocks = e.paragraphs.map(p => typeof p === 'string'
    ? `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#333">${escapeHtml(p)}</p>`
    : p.html).join('');
  const button = e.button
    ? `<a href="${e.button.href}" style="display:inline-block;margin-top:8px;background:#111;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-size:15px;font-weight:500">${escapeHtml(e.button.label)}</a>`
    : '';
  const footnote = e.footnote ? `<p style="margin:22px 0 0;font-size:13px;line-height:1.5;color:#666">${escapeHtml(e.footnote)}</p>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#eef0ec;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="font-size:24px;font-weight:600;letter-spacing:-0.02em;margin-bottom:20px">Cabadra <span style="font-weight:400;color:#777">Partners</span></div>
    <div style="background:#fff;border-radius:24px;padding:28px">${blocks}${button}${footnote}</div>
    <p style="margin:16px 0 0;font-size:12px;color:#888;text-align:center">Cabadra · A Churmuri product · info@churmuri.com</p>
  </div></body></html>`;
  const text = [
    ...e.paragraphs.map(p => (typeof p === 'string' ? p : p.html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, ' ').replace(/\s+\n/g, '\n').trim())),
    e.button ? `${e.button.label}: ${e.button.href}` : '',
    e.footnote ?? '',
  ].filter(Boolean).join('\n\n');
  return { html, text };
}

/** A two-column table of figures, for reports and receipts. */
export function figuresHtml(rows: [string, string][]): { html: string } {
  return {
    html: `<table style="width:100%;border-collapse:collapse;margin:4px 0 18px">${rows.map(([k, v]) =>
      `<tr><td style="padding:9px 0;border-bottom:1px solid #eee;font-size:14px;color:#555">${escapeHtml(k)}</td><td style="padding:9px 0;border-bottom:1px solid #eee;font-size:14px;font-weight:600;text-align:right">${escapeHtml(v)}</td></tr>`).join('')}</table>`,
  };
}

/** Sends one email. Throws with a reason on failure. */
export async function sendPartnerEmail(to: string, e: PartnerEmail): Promise<void> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('RESEND_FROM');
  if (!apiKey || !from) throw new Error('RESEND_API_KEY / RESEND_FROM not set');
  const { html, text } = render(e);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject: e.subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(`Resend: ${(body as { message?: string }).message ?? res.status}`);
  }
}

/** Runs a promise after the response where the runtime allows it. */
export function inBackground(p: Promise<unknown>) {
  const logged = p.catch(err => console.error(err instanceof Error ? err.message : err));
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(logged);
  return logged;
}
