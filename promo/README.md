# Promo films

Two short films made from the product's own copy and features:

- `out/cabadra-hotels.mp4`: for hotel owners (43 s, 1920×1080, 30 fps)
- `out/cabadra-partners.mp4`: for local businesses listing in the guest app (39 s)

They're silent, so add a music bed in whatever editor or app you post from.

## Editing

Each film is one HTML page (`hotels.html`, `partners.html`) using `shared.css` / `shared.js`.
Open a page in a browser to watch it play (click to restart). Every element's timing is in
its inline `--d` (enters) / `--o` (scene leaves) style, in seconds.

Render again after a change (needs Playwright's Chromium and ffmpeg):

```bash
node promo/render.mjs hotels
node promo/render.mjs partners
node promo/render.mjs hotels --still 12.5,30   # PNG stills to check a moment
```
