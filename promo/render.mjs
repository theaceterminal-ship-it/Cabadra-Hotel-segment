// Renders a promo page to MP4, frame by frame.
//   node promo/render.mjs hotels            -> promo/out/cabadra-hotels.mp4
//   node promo/render.mjs partners --fps 30 -> promo/out/cabadra-partners.mp4
//   node promo/render.mjs hotels --still 12.5  -> PNG of one moment, for checking
// Needs Playwright (Chromium) and ffmpeg on PATH.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Playwright is resolved like require() so a globally installed copy works too.
const { chromium } = createRequire(import.meta.url)('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const name = args[0];
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const fps = Number(opt('--fps') || 30);
const still = opt('--still');
if (!name) { console.error('usage: node promo/render.mjs <hotels|partners> [--fps 30] [--still seconds]'); process.exit(1); }

const outDir = join(here, 'out');
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, `${name}.html`)).href + '?render', { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.DURATION);

if (still !== undefined) {
  for (const s of still.split(',')) {
    await page.evaluate(ms => window.seek(ms), Number(s) * 1000);
    const file = join(outDir, `${name}-${s}s.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
  await browser.close();
  process.exit(0);
}

const out = join(outDir, `cabadra-${name}.mp4`);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out],
  { stdio: ['pipe', 'inherit', 'inherit'] });

const frames = Math.round(duration / 1000 * fps);
for (let f = 0; f < frames; f++) {
  await page.evaluate(ms => window.seek(ms), f * 1000 / fps);
  const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (f % (fps * 5) === 0) console.log(`${name}: ${(f / fps).toFixed(0)}s / ${(duration / 1000).toFixed(0)}s`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
console.log(out);
