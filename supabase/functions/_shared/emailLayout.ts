// One responsive frame for every email Cabadra sends a guest, so they all fit the screen they are read on:
//   - a viewport tag, full-width tables and fluid images (nothing is a fixed pixel width);
//   - on phones (480px and under) the padding tightens, buttons fill the width, the detail rows stack,
//     and the code digits shrink to stay on one line;
//   - light colours are forced, so a dark-mode mail app doesn't turn white cards into grey slabs.
// Classes used by the emails: wrap, card-in, h1, btn, lbl, val, digit, offer-name, offer-cta.

const CSS = `
body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table{border-collapse:collapse}
img{border:0;outline:none;text-decoration:none;max-width:100%;height:auto}
a{word-break:break-word}
@media only screen and (max-width:480px){
  .wrap{padding:14px 10px !important}
  .card-in{padding:22px 18px !important}
  .h1{font-size:22px !important}
  .btn{display:block !important;margin:0 0 10px 0 !important;text-align:center !important}
  .lbl,.val{display:block !important;width:100% !important;box-sizing:border-box}
  .lbl{padding-bottom:0 !important}
  .val{padding-top:1px !important;padding-bottom:10px !important}
  .digit{width:30px !important;height:42px !important;line-height:42px !important;font-size:22px !important;margin:0 2px !important}
  .offer-name,.offer-cta{display:block !important;width:100% !important;box-sizing:border-box;text-align:left !important}
  .offer-cta{padding-top:0 !important}
}`;

export function emailShell(opts: { title: string; hotelName: string; heroUrl?: string | null; inner: string; footer: string; maxWidth?: number }): string {
  const max = opts.maxWidth ?? 520;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${opts.title}</title>
<style>${CSS}</style>
</head>
<body style="margin:0;padding:0;background:#eef0ec;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef0ec;width:100%">
<tr><td align="center" class="wrap" style="padding:28px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${max}px">
    <tr><td style="padding:0 4px 14px;font-size:15px;font-weight:600;letter-spacing:-0.01em;color:#444">${opts.hotelName}</td></tr>
    <tr><td style="background:#ffffff;border-radius:24px;overflow:hidden">
      ${opts.heroUrl ? `<img src="${opts.heroUrl}" alt="" width="${max}" style="display:block;width:100%;height:auto;max-height:220px;object-fit:cover">` : ''}
      <div class="card-in" style="padding:28px">${opts.inner}</div>
    </td></tr>
    <tr><td style="padding:16px 8px 0;font-size:12px;line-height:1.5;color:#888;text-align:center">${opts.footer}</td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}
