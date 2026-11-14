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

## Voiceover

`out/cabadra-hotels-voiceover.mp4` and `out/cabadra-partners-voiceover.mp4` are the same films with
narration. The script and timings are in `voiceover.json` (`at` = when a line starts, `until` = the
latest it may end). The voice is Kokoro, an open-source text-to-speech model that runs locally
(voice `af_heart`; the opening "अतिथि देवो भव" uses the Hindi voice `hf_alpha`).

```bash
pip install kokoro-onnx soundfile
# kokoro-v1.0.onnx and voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx releases,
# saved as kokoro.onnx and voices.bin in $KOKORO_DIR
KOKORO_DIR=/path/to/models python3 promo/voiceover.py hotels
KOKORO_DIR=/path/to/models python3 promo/voiceover.py partners
```

For the Hindi narration (script under `"hindi"` in `voiceover.json`, voice `hf_alpha`), add `--hindi`.
It writes `out/cabadra-hotels-voiceover-hindi.mp4` and `out/cabadra-partners-voiceover-hindi.mp4`:

```bash
KOKORO_DIR=/path/to/models python3 promo/voiceover.py hotels --hindi
```

Run it after `render.mjs`; it reads the silent MP4 and writes the `-voiceover` one next to it.

## Vertical (9:16) cuts for Reels and Shorts

`hotels-vertical.html` and `partners-vertical.html` are portrait layouts (1080×1920) of the same scenes,
with the same timings, so the voiceover scripts fit them unchanged. Content stays clear of the top ~220 px
and bottom ~380 px, where Reels and Shorts draw their own buttons and captions.

```bash
node promo/render.mjs hotels-vertical
KOKORO_DIR=/path/to/models python3 promo/voiceover.py hotels-vertical          # English
KOKORO_DIR=/path/to/models python3 promo/voiceover.py hotels-vertical --hindi  # Hindi
```

When you change a scene's timing, change it in both the 16:9 and 9:16 pages.
