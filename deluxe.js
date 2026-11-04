/* 演出のみ。失敗しても内容はそのまま読める。prefers-reduced-motion では何もしない。 */
(() => {
  'use strict';
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduce.matches) return;
  const root = document.documentElement;
  root.classList.add('fx');
  const bg = document.createElement('div'); bg.className = 'fx-bglight'; bg.setAttribute('aria-hidden', 'true');
  document.body.prepend(bg);
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---- hero canvas: gold particles + confetti burst ---- */
  const hero = document.querySelector('.hero');
  if (hero && window.HTMLCanvasElement) {
    const cv = document.createElement('canvas'); cv.className = 'fx-canvas'; cv.setAttribute('aria-hidden', 'true');
    hero.prepend(cv);
    const ctx = cv.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
    let w = 0, h = 0, running = true, raf = 0;
    const resize = () => { w = hero.clientWidth; h = hero.clientHeight; cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener('resize', resize, { passive: true });
    const rnd = (a, b) => a + Math.random() * (b - a);
    const dust = Array.from({ length: mobile ? 36 : 80 }, () => ({ x: rnd(0, w), y: rnd(0, h), r: rnd(.6, 2.2), vy: rnd(-.25, -.06), vx: rnd(-.08, .08), t: rnd(0, 6.28), s: rnd(.01, .03) }));
    const colors = ['#dfc486', '#f6e3b0', '#bca879', '#fff4d2', '#c9ad6f'];
    let confetti = [];
    const burst = (n) => { for (let i = 0; i < n; i++) confetti.push({ x: rnd(w * .1, w * .9), y: rnd(-h * .3, -10), vx: rnd(-.6, .6), vy: rnd(1, 2.6), a: rnd(0, 6.28), va: rnd(-.12, .12), sz: rnd(4, 9), c: colors[i % 5], life: 1 }); };
    burst(mobile ? 50 : 110);
    const sparkles = [];
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of dust) {
        p.x += p.vx; p.y += p.vy; p.t += p.s;
        if (p.y < -5) { p.y = h + 5; p.x = rnd(0, w); }
        const a = .35 + .35 * Math.sin(p.t);
        ctx.globalAlpha = a; ctx.fillStyle = '#e8cf93'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
      if (Math.random() < .04 && sparkles.length < 6) sparkles.push({ x: rnd(0, w), y: rnd(0, h * .8), life: 1, sz: rnd(6, 14) });
      for (let i = sparkles.length - 1; i >= 0; i--) {
        const s = sparkles[i]; s.life -= .02; if (s.life <= 0) { sparkles.splice(i, 1); continue; }
        const k = Math.sin(s.life * Math.PI) * s.sz; ctx.globalAlpha = s.life; ctx.strokeStyle = '#fff2c9'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s.x - k, s.y); ctx.lineTo(s.x + k, s.y); ctx.moveTo(s.x, s.y - k); ctx.lineTo(s.x, s.y + k); ctx.stroke();
      }
      for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i]; c.x += c.vx + Math.sin(c.a) * .4; c.y += c.vy; c.a += c.va;
        if (c.y > h * .75) c.life -= .02;
        if (c.life <= 0 || c.y > h + 20) { confetti.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(c.life, 0) * .9; ctx.fillStyle = c.c;
        ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.fillRect(-c.sz / 2, -c.sz / 4, c.sz, c.sz / 2 * Math.abs(Math.cos(c.a * 2)) + 1); ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (running) raf = requestAnimationFrame(frame);
    };
    const start = () => { if (!running) { running = true; raf = requestAnimationFrame(frame); } };
    const stop = () => { running = false; cancelAnimationFrame(raf); };
    raf = requestAnimationFrame(frame);
    if ('IntersectionObserver' in window) new IntersectionObserver(([e]) => (e.isIntersecting ? start() : stop())).observe(hero);
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    reduce.addEventListener && reduce.addEventListener('change', () => { stop(); cv.remove(); root.classList.remove('fx'); });
  }

  /* ---- count-up for 50本 / 500枚 / 9枚 (400万円 is app.js既存) ---- */
  const countUp = (el, to, ms) => {
    const t0 = performance.now();
    const tick = (t) => { const p = Math.max(0, Math.min((t - t0) / ms, 1)); el.textContent = String(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  };
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (!e.isIntersecting) return; io.unobserve(e.target); e.target.classList.add('fx-on');
      const n = e.target.dataset.fxCount; if (n) countUp(e.target.querySelector('[data-fx-num]') || e.target, Number(n), 1400); });
  }, { rootMargin: '0px 0px -8% 0px' }) : null;

  document.querySelectorAll('.ticket-num').forEach((el) => {
    const node = el.firstChild; if (!node || node.nodeType !== 3) return; const v = parseInt(node.textContent, 10); if (!v) return;
    const span = document.createElement('span'); span.dataset.fxNum = ''; span.textContent = node.textContent; el.replaceChild(span, node);
    el.dataset.fxCount = String(v); io && io.observe(el);
  });
  const total = document.querySelector('.hero [data-total-count]');
  const fb = window.PRIZES_FALLBACK && window.PRIZES_FALLBACK.total_count;
  if (total && Number.isSafeInteger(fb)) setTimeout(() => countUp(total, fb, 1600), 300);

  /* ---- staged reveal ---- */
  const stage = (sel, left) => document.querySelectorAll(sel).forEach((el, i) => {
    el.classList.add('fx-stage'); if (left) el.classList.add('fx-left'); el.style.setProperty('--i', String(i % 6)); io ? io.observe(el) : el.classList.add('fx-on');
  });
  stage('.draw-steps .flow-step'); stage('.draw-rules li', true); stage('.ticket-summary > div'); stage('.ticket-notes li', true);
  stage('.lottery-flow .flow-step'); stage('.section-kicker', true);

  /* ---- draw order timeline (app.jsが描画した後) ---- */
  const order = document.querySelector('#draw-order');
  const prep = () => { const items = document.querySelectorAll('#draw-order-list .draw-order-item'); items.forEach((li, i) => li.style.setProperty('--i', String(i))); return items.length; };
  if (order) {
    if (!prep()) { const mo = new MutationObserver(() => { if (prep()) mo.disconnect(); }); mo.observe(order, { childList: true, subtree: true }); }
    io ? io.observe(order) : order.classList.add('fx-on');
  }

  /* ---- special card shine ---- */
  const addShine = () => document.querySelectorAll('.secret-card:not([data-fx])').forEach((c) => { c.dataset.fx = '1'; const s = document.createElement('span'); s.className = 'fx-shine'; s.setAttribute('aria-hidden', 'true'); c.append(s); });
  addShine(); const sp = document.querySelector('#special-prizes'); if (sp) new MutationObserver(addShine).observe(sp, { childList: true });

  /* ---- card tilt (PCのみ) ---- */
  if (fine) {
    let pending = null;
    document.addEventListener('pointermove', (ev) => {
      const v = ev.target.closest && ev.target.closest('.prize-card .prize-visual');
      if (pending) pending.style.removeProperty('--rx'), pending.style.removeProperty('--ry');
      if (!v) { pending = null; return; }
      const r = v.getBoundingClientRect(); const x = (ev.clientX - r.left) / r.width - .5; const y = (ev.clientY - r.top) / r.height - .5;
      v.style.setProperty('--ry', (x * 8).toFixed(2) + 'deg'); v.style.setProperty('--rx', (-y * 8).toFixed(2) + 'deg'); pending = v;
    }, { passive: true });
  }
})();
