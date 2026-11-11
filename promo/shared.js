// Timeline engine for the promo films.
// All motion is CSS animations plus a few JS "tweens" (counters, typed text, progress).
// window.seek(ms) puts every one of them at an exact time, so render.mjs can capture
// frame by frame. Opened normally in a browser, the page just plays (click to restart).
(function () {
  const DURATION = Number(document.body.dataset.duration) * 1000;
  const tweens = [];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ease = t => 1 - Math.pow(1 - t, 3);

  // <span data-count="from,to,start,dur" data-prefix="₹" data-fmt="inr">
  document.querySelectorAll('[data-count]').forEach(el => {
    const [from, to, start, dur] = el.dataset.count.split(',').map(Number);
    const prefix = el.dataset.prefix || '';
    const fmt = el.dataset.fmt === 'inr' ? n => n.toLocaleString('en-IN') : n => String(n);
    tweens.push(t => {
      const p = ease(clamp((t / 1000 - start) / dur, 0, 1));
      el.textContent = prefix + fmt(Math.round(from + (to - from) * p));
    });
  });

  // <span data-type="start,charsPerSecond">text</span>
  document.querySelectorAll('[data-type]').forEach(el => {
    const full = el.textContent;
    const [start, cps] = el.dataset.type.split(',').map(Number);
    tweens.push(t => {
      const n = clamp(Math.floor((t / 1000 - start) * cps), 0, full.length);
      el.textContent = full.slice(0, n);
      el.classList.toggle('typing', n > 0 && n < full.length);
    });
  });

  // <div data-swap="t1,t2,..."> children shown one at a time, child i from t_i
  document.querySelectorAll('[data-swap]').forEach(el => {
    const times = el.dataset.swap.split(',').map(Number);
    const kids = [...el.children];
    tweens.push(t => {
      let idx = 0;
      times.forEach((s, i) => { if (t / 1000 >= s) idx = i; });
      kids.forEach((k, i) => (k.style.display = i === idx ? '' : 'none'));
    });
  });

  const bar = document.querySelector('.progress');
  if (bar) tweens.push(t => (bar.style.width = (100 * t / DURATION).toFixed(3) + '%'));

  function seek(ms) {
    document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; });
    tweens.forEach(f => f(ms));
  }
  window.seek = seek;
  window.DURATION = DURATION;

  if (!/[?&]render/.test(location.search)) {
    let t0 = performance.now();
    const loop = now => { seek(Math.min(now - t0, DURATION)); requestAnimationFrame(loop); };
    document.addEventListener('click', () => (t0 = performance.now()));
    requestAnimationFrame(loop);
  } else {
    seek(0);
  }
})();
