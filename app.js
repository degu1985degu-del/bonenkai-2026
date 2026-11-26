(() => {
  'use strict';

  const categories = new Set(['家電', 'Apple', 'オーディオ', 'AI利用権', '近日発表']);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const runningAnimations = new Set();
  let currentData = null;
  let activeFilter = 'all';
  let countAnimation = 0;
  let revealObserver = null;
  let prizeDialog = null;
  let dialogOpener = null;

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  }

  // 特賞の中身（後日 prizes.json の reveal に入れる）。無ければ「近日公開」を表示する。
  function validReveal(reveal) {
    if (!reveal || typeof reveal !== 'object' || Array.isArray(reveal)) return false;
    if (typeof reveal.name !== 'string' || !reveal.name.trim()) return false;
    for (const key of ['model', 'color', 'image', 'description']) {
      if (reveal[key] !== undefined && typeof reveal[key] !== 'string') return false;
    }
    if (reveal.specs !== undefined && (!Array.isArray(reveal.specs) || reveal.specs.some((spec) => typeof spec !== 'string'))) return false;
    return true;
  }

  function validateData(data) {
    if (!data || typeof data.total_label !== 'string' || !data.total_label.trim()
      || !Number.isSafeInteger(data.total_count) || data.total_count < 1
      || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error('景品データの形式が正しくありません。');
    }
    let total = 0;
    for (const item of data.items) {
      if (!item || typeof item.name !== 'string' || !item.name.trim()
        || typeof item.category !== 'string'
        || !Number.isSafeInteger(item.qty) || item.qty < 1
        || (item.secret !== undefined && typeof item.secret !== 'boolean')
        || (item.model !== undefined && typeof item.model !== 'string')
        || (item.color !== undefined && typeof item.color !== 'string')
        || (item.price !== undefined && (!Number.isSafeInteger(item.price) || item.price < 1))
        || (item.image !== undefined && typeof item.image !== 'string')
        || (item.upcoming !== undefined && typeof item.upcoming !== 'boolean')
        || (item.hint !== undefined && typeof item.hint !== 'string')
        || (item.description !== undefined && typeof item.description !== 'string')
        || (item.reveal !== undefined && !validReveal(item.reveal))
        || (item.specs !== undefined && (!Array.isArray(item.specs) || item.specs.some((spec) => typeof spec !== 'string')))
        || (!item.secret && !categories.has(item.category))) {
        throw new Error('景品の項目に不正な値があります。');
      }
      total += item.qty;
    }
    if (total !== data.total_count) {
      throw new Error('景品の本数と総本数が一致していません。');
    }
    return data;
  }

  function localImagePath(value) {
    if (typeof value !== 'string' || !value.startsWith('images/')) return null;
    try {
      const decoded = decodeURIComponent(value);
      if (!decoded.startsWith('images/') || /[\\?#\u0000-\u001f]/.test(decoded)) return null;
      if (decoded.split('/').some((part) => part === '..' || part === '.')) return null;
      return value;
    } catch {
      return null;
    }
  }

  function artType(item) {
    if (item.category === 'AI利用権') return 'claude';
    if (/Mac mini/i.test(item.name)) return 'mini';
    if (/AirPods|FreeClip/i.test(item.name)) return 'airpods';
    if (/iPad|Apple Watch/i.test(item.name)) return 'mini';
    if (/加湿/.test(item.name)) return 'purifier';
    if (/コーヒー|デロンギ/.test(item.name)) return 'coffee';
    if (/ホットクック/.test(item.name)) return 'cooker';
    if (/空気清浄|Dyson/i.test(item.name)) return 'purifier';
    return 'rice';
  }

  function createProductArt(item) {
    const type = artType(item);
    const art = element('div', `product-art product-art--${type}`);
    art.setAttribute('aria-hidden', 'true');
    art.append(
      element('span', 'product-body'),
      element('span', 'product-detail'),
      element('span', 'product-mark', type === 'claude' ? '✳' : ''),
      element('span', 'product-extra')
    );
    return art;
  }

  function createUpcomingCard(item) {
    const card = element('article', 'prize-card prize-card--upcoming reveal');
    card.dataset.category = item.category;
    const visual = element('div', 'prize-visual');
    const art = element('div', 'secret-art');
    art.setAttribute('aria-hidden', 'true');
    const box = element('div', 'gift-box');
    box.append(element('span', 'gift-ribbon'));
    art.append(box, element('span', 'gift-question', '?'));
    visual.append(art, element('span', 'prize-quantity', `${item.qty}本`));
    const info = element('div', 'prize-info');
    info.append(
      element('p', 'prize-category', '追加景品'),
      element('h3', 'prize-name', item.name)
    );
    if (item.model) info.append(element('p', 'prize-model', item.model));
    if (item.color) info.append(element('p', 'prize-color', `カラー：${item.color}`));
    card.append(visual, info);
    return card;
  }

  function createPrizeCard(item) {
    if (item.upcoming) return createUpcomingCard(item);
    const card = element('article', 'prize-card reveal');
    card.dataset.category = item.category;
    const visual = element('div', 'prize-visual');
    const art = createProductArt(item);
    visual.append(art);
    const imagePath = localImagePath(item.image);
    if (imagePath) {
      const photo = element('img', 'prize-image');
      photo.alt = '';
      // 読込完了まで非表示なので、遅延読込の待ち状態にはしない。
      photo.loading = 'eager';
      photo.decoding = 'async';
      photo.hidden = true;
      photo.addEventListener('load', () => {
        art.hidden = true;
        photo.hidden = false;
        visual.classList.add('has-photo');
      }, { once: true });
      photo.addEventListener('error', () => {
        photo.remove();
        visual.classList.remove('has-photo');
        art.hidden = false;
      }, { once: true });
      photo.src = imagePath;
      visual.append(photo);
    }
    visual.append(element('span', 'prize-quantity', `${item.qty}本`));
    const info = element('div', 'prize-info');
    info.append(
      element('p', 'prize-category', item.category),
      element('h3', 'prize-name', item.name)
    );
    if (item.model) info.append(element('p', 'prize-model', item.model));
    if (item.color) info.append(element('p', 'prize-color', `カラー：${item.color}`));
    if (item.price && !item.secret) info.append(element('p', 'prize-price', `参考価格 ¥${item.price.toLocaleString('ja-JP')}（税込）`));
    if (Array.isArray(item.specs) && item.specs.length) {
      const specs = element('ul', 'prize-specs');
      specs.append(...item.specs.map((spec) => element('li', '', spec)));
      info.append(specs);
    }
    const open = element('button', 'prize-open');
    open.type = 'button';
    open.setAttribute('aria-haspopup', 'dialog');
    open.setAttribute('aria-label', `${item.name}の詳細を見る`);
    open.append(element('span', '', '詳細を見る'), element('span', 'prize-open-arrow', '↗'));
    open.lastChild.setAttribute('aria-hidden', 'true');
    info.append(open);
    card.classList.add('is-clickable');
    card.addEventListener('click', (event) => {
      if (event.target.closest('a')) return;
      const selection = window.getSelection ? String(window.getSelection()) : '';
      if (selection && !event.target.closest('.prize-open')) return;
      openPrizeDialog(item, open);
    });
    card.append(visual, info);
    return card;
  }

  // ---- 景品の詳細ポップアップ（<dialog>） ----
  function ensurePrizeDialog() {
    if (prizeDialog) return prizeDialog;
    const dialog = element('dialog', 'prize-dialog');
    dialog.id = 'prize-dialog';
    dialog.setAttribute('aria-labelledby', 'prize-dialog-title');
    dialog.setAttribute('aria-describedby', 'prize-dialog-desc');
    const panel = element('div', 'prize-dialog-panel');
    const close = element('button', 'prize-dialog-close');
    close.type = 'button';
    close.setAttribute('aria-label', '閉じる');
    close.append(element('span', '', '×'));
    close.firstChild.setAttribute('aria-hidden', 'true');
    close.addEventListener('click', () => closePrizeDialog());
    const body = element('div', 'prize-dialog-body');
    panel.append(close, body);
    dialog.append(panel);
    // 背景（パネルの外側）をクリックしたら閉じる。
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closePrizeDialog();
    });
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      closePrizeDialog();
    });
    dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('dialog-open');
      if (dialogOpener && document.contains(dialogOpener)) dialogOpener.focus({ preventScroll: true });
      dialogOpener = null;
    });
    document.body.append(dialog);
    prizeDialog = dialog;
    return dialog;
  }

  function buildDialogContent(item) {
    const frag = document.createDocumentFragment();
    const visual = element('div', 'prize-dialog-visual');
    const art = createProductArt(item);
    visual.append(art);
    const imagePath = localImagePath(item.image);
    if (imagePath) {
      const photo = element('img', 'prize-dialog-image');
      photo.alt = item.name;
      photo.decoding = 'async';
      photo.hidden = true;
      photo.addEventListener('load', () => {
        art.hidden = true;
        photo.hidden = false;
        visual.classList.add('has-photo');
      }, { once: true });
      photo.addEventListener('error', () => {
        photo.remove();
        art.hidden = false;
      }, { once: true });
      photo.src = imagePath;
      visual.append(photo);
    }
    visual.append(element('span', 'prize-quantity', `${item.qty}本`));

    const info = element('div', 'prize-dialog-info');
    const order = Number.isSafeInteger(item.no) ? `抽選順 ${String(item.no).padStart(2, '0')}` : '';
    info.append(element('p', 'prize-dialog-category', order ? `${item.category}　/　${order}` : item.category));
    const title = element('h2', 'prize-dialog-title', item.name);
    title.id = 'prize-dialog-title';
    info.append(title);
    const desc = element('p', 'prize-dialog-desc', item.description || '');
    desc.id = 'prize-dialog-desc';
    if (!item.description) desc.hidden = true;
    info.append(desc);

    if (Array.isArray(item.specs) && item.specs.length) {
      info.append(element('h3', 'prize-dialog-heading', 'スペック'));
      const specs = element('ul', 'prize-dialog-specs');
      specs.append(...item.specs.map((spec) => element('li', '', spec)));
      info.append(specs);
    }
    const facts = element('dl', 'prize-dialog-facts');
    const addFact = (label, value) => {
      if (!value) return;
      const row = element('div', 'prize-dialog-fact');
      row.append(element('dt', '', label), element('dd', '', value));
      facts.append(row);
    };
    addFact('型番', item.model);
    addFact('カラー', item.color);
    addFact('本数', `${item.qty}本`);
    if (item.price && !item.secret) addFact('参考価格', `¥${item.price.toLocaleString('ja-JP')}（税込）`);
    info.append(facts);
    info.append(element('p', 'prize-dialog-note', '※ 写真はイメージです。色は運営で発注した色で、指定・交換はできません。'));
    frag.append(visual, info);
    return frag;
  }

  function openPrizeDialog(item, opener) {
    if (!item || item.secret || item.upcoming) return;
    const dialog = ensurePrizeDialog();
    dialog.classList.remove('is-scratch');
    const body = dialog.querySelector('.prize-dialog-body');
    body.replaceChildren(buildDialogContent(item));
    dialogOpener = opener || null;
    if (dialog.open) return;
    document.documentElement.classList.add('dialog-open');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.querySelector('.prize-dialog-panel').scrollTop = 0;
    const close = dialog.querySelector('.prize-dialog-close');
    if (close) close.focus({ preventScroll: true });
  }

  // ---- 特賞のスクラッチくじ ----
  function buildRevealContent(item) {
    const wrap = element('div', 'scratch-prize');
    const reveal = item.reveal;
    if (!reveal) {
      wrap.classList.add('is-soon');
      wrap.append(
        element('p', 'scratch-soon-kicker', 'COMING SOON'),
        element('p', 'scratch-soon-title', '近日公開'),
        element('p', 'scratch-soon-text', '特賞の中身は、後日ここで発表します。お楽しみに。')
      );
      return wrap;
    }
    const imagePath = localImagePath(reveal.image);
    if (imagePath) {
      const visual = element('div', 'scratch-prize-visual');
      const photo = element('img', 'scratch-prize-image');
      photo.alt = reveal.name;
      photo.decoding = 'async';
      photo.addEventListener('error', () => visual.remove(), { once: true });
      photo.src = imagePath;
      visual.append(photo);
      wrap.append(visual);
    }
    wrap.append(element('p', 'scratch-prize-name', reveal.name));
    if (reveal.model) wrap.append(element('p', 'scratch-prize-model', reveal.model));
    return wrap;
  }

  function buildRevealDetails(item) {
    const reveal = item.reveal;
    const info = element('div', 'scratch-details');
    if (!reveal) return info;
    if (reveal.description) info.append(element('p', 'prize-dialog-desc', reveal.description));
    if (Array.isArray(reveal.specs) && reveal.specs.length) {
      info.append(element('h3', 'prize-dialog-heading', 'スペック'));
      const specs = element('ul', 'prize-dialog-specs');
      specs.append(...reveal.specs.map((spec) => element('li', '', spec)));
      info.append(specs);
    }
    const facts = element('dl', 'prize-dialog-facts');
    const addFact = (label, value) => {
      if (!value) return;
      const row = element('div', 'prize-dialog-fact');
      row.append(element('dt', '', label), element('dd', '', value));
      facts.append(row);
    };
    addFact('型番', reveal.model);
    addFact('カラー', reveal.color);
    addFact('本数', `${item.qty}本`);
    if (facts.childElementCount) info.append(facts);
    return info;
  }

  function paintScratchSurface(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const w = canvas.width;
    const h = canvas.height;
    ctx.globalCompositeOperation = 'source-over';
    const gold = ctx.createLinearGradient(0, 0, w, h);
    gold.addColorStop(0, '#9c7d3c');
    gold.addColorStop(0.22, '#e9cf8e');
    gold.addColorStop(0.42, '#bf9b52');
    gold.addColorStop(0.55, '#fff0c4');
    gold.addColorStop(0.7, '#c9a65e');
    gold.addColorStop(1, '#8c6d31');
    ctx.fillStyle = gold;
    ctx.fillRect(0, 0, w, h);
    // 金箔っぽい細かい粒と斜めの筋。
    for (let i = 0; i < Math.round(w * h / 260); i++) {
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,248,220,.22)' : 'rgba(90,64,20,.18)';
      ctx.fillRect(Math.random() * w, Math.random() * h, ratio, ratio);
    }
    ctx.strokeStyle = 'rgba(255,250,230,.12)';
    ctx.lineWidth = 2 * ratio;
    for (let x = -h; x < w; x += 18 * ratio) {
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x + h, 0);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(80,58,18,.55)';
    ctx.lineWidth = ratio;
    ctx.setLineDash([6 * ratio, 5 * ratio]);
    ctx.strokeRect(10 * ratio, 10 * ratio, w - 20 * ratio, h - 20 * ratio);
    ctx.setLineDash([]);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(70,50,14,.82)';
    ctx.font = `600 ${Math.round(Math.min(w / 9, 38 * ratio))}px Georgia, "Times New Roman", serif`;
    ctx.fillText('✦ SCRATCH ✦', w / 2, h / 2 - 16 * ratio);
    ctx.font = `600 ${Math.round(14 * ratio)}px -apple-system, BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", sans-serif`;
    ctx.fillText('ここを指やマウスで削ってください', w / 2, h / 2 + 24 * ratio);
    return ctx;
  }

  function setupScratch(stage, canvas, onReveal) {
    const ctx = paintScratchSurface(canvas);
    if (!ctx) { onReveal(); return { revealAll: onReveal }; }
    let drawing = false;
    let last = null;
    let done = false;
    let strokes = 0;
    const ratio = canvas.width / Math.max(1, canvas.getBoundingClientRect().width);
    const brush = 24 * ratio;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brush * 2;

    function point(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * ratio, y: (event.clientY - rect.top) * ratio };
    }
    function scratchTo(p) {
      ctx.beginPath();
      if (last) {
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        ctx.arc(p.x, p.y, brush, 0, Math.PI * 2);
        ctx.fill();
      }
      last = p;
      strokes += 1;
      if (strokes % 6 === 0) checkProgress();
    }
    function clearedRatio() {
      try {
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const step = 4 * 12;
        let clear = 0;
        let total = 0;
        for (let i = 3; i < data.length; i += step) {
          total += 1;
          if (data[i] < 40) clear += 1;
        }
        return total ? clear / total : 1;
      } catch {
        return 1;
      }
    }
    function checkProgress() {
      if (done) return;
      const cleared = clearedRatio();
      stage.style.setProperty('--scratch-progress', cleared.toFixed(2));
      if (cleared >= 0.5) revealAll();
    }
    function revealAll() {
      if (done) return;
      done = true;
      drawing = false;
      onReveal();
    }
    canvas.addEventListener('pointerdown', (event) => {
      if (done) return;
      event.preventDefault();
      drawing = true;
      last = null;
      stage.classList.add('is-scratching');
      try { canvas.setPointerCapture(event.pointerId); } catch { /* 無視 */ }
      scratchTo(point(event));
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!drawing || done) return;
      event.preventDefault();
      const events = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [event];
      (events.length ? events : [event]).forEach((e) => scratchTo(point(e)));
    });
    const stop = () => {
      if (!drawing) return;
      drawing = false;
      last = null;
      checkProgress();
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);
    canvas.addEventListener('lostpointercapture', stop);
    return { revealAll };
  }

  function burstSparkles(stage) {
    if (reducedMotion.matches) return;
    const layer = element('div', 'scratch-burst');
    layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 26; i++) {
      const spark = element('span', 'scratch-spark', i % 3 === 0 ? '✦' : '');
      const angle = (Math.PI * 2 * i) / 26 + Math.random() * 0.3;
      const dist = 90 + Math.random() * 140;
      spark.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      spark.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
      spark.style.setProperty('--d', `${(Math.random() * 0.25).toFixed(2)}s`);
      layer.append(spark);
    }
    stage.append(layer);
    window.setTimeout(() => layer.remove(), 1800);
  }

  function openScratchDialog(item, number, opener) {
    if (!item || !item.secret) return;
    const dialog = ensurePrizeDialog();
    dialog.classList.add('is-scratch');
    const body = dialog.querySelector('.prize-dialog-body');
    const box = element('div', 'scratch-box');
    box.append(element('p', 'prize-dialog-category', `THE GRAND SURPRISE　/　特賞 ${number}`));
    const title = element('h2', 'prize-dialog-title', `特賞 ${number}`);
    title.id = 'prize-dialog-title';
    const lead = element('p', 'prize-dialog-desc scratch-lead', '金色の面を削って、特賞をのぞいてみよう。');
    lead.id = 'prize-dialog-desc';
    box.append(title, lead);

    const stage = element('div', 'scratch-stage');
    const under = element('div', 'scratch-under');
    under.setAttribute('aria-hidden', 'true');
    under.append(buildRevealContent(item));
    const canvas = element('canvas', 'scratch-canvas');
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'スクラッチ面。削ると特賞の情報が出てきます。');
    const glow = element('span', 'scratch-glow');
    glow.setAttribute('aria-hidden', 'true');
    stage.append(under, glow, canvas);

    const controls = element('div', 'scratch-controls');
    const all = element('button', 'scratch-all', 'すべて削る');
    all.type = 'button';
    const hint = element('p', 'scratch-hint', '半分くらい削ると、一気にめくれます。');
    controls.append(all, hint);
    const status = element('p', 'sr-only');
    status.setAttribute('aria-live', 'polite');
    const details = buildRevealDetails(item);
    details.hidden = true;
    box.append(stage, controls, status, details);
    body.replaceChildren(box);

    dialogOpener = opener || null;
    if (!dialog.open) {
      document.documentElement.classList.add('dialog-open');
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    dialog.querySelector('.prize-dialog-panel').scrollTop = 0;

    const onReveal = () => {
      stage.classList.remove('is-scratching');
      stage.classList.add('is-revealed');
      if (item.reveal) stage.classList.add('has-reveal');
      under.removeAttribute('aria-hidden');
      all.disabled = true;
      all.textContent = 'めくれました';
      hint.textContent = item.reveal ? '' : '中身の発表まで、もう少しお待ちください。';
      details.hidden = !details.childElementCount;
      status.textContent = item.reveal ? `特賞 ${number}：${item.reveal.name}` : `特賞 ${number}：近日公開`;
      burstSparkles(stage);
      if (reducedMotion.matches) canvas.remove();
      else window.setTimeout(() => canvas.remove(), 900);
    };
    const start = () => {
      const scratch = setupScratch(stage, canvas, onReveal);
      all.addEventListener('click', () => scratch.revealAll());
    };
    if (typeof window.requestAnimationFrame === 'function') window.requestAnimationFrame(start);
    else start();
    const close = dialog.querySelector('.prize-dialog-close');
    if (close) close.focus({ preventScroll: true });
  }

  function closePrizeDialog() {
    if (!prizeDialog || !prizeDialog.open) return;
    if (typeof prizeDialog.close === 'function') prizeDialog.close();
    else {
      prizeDialog.removeAttribute('open');
      prizeDialog.dispatchEvent(new Event('close'));
    }
  }

  function createSecretCard(item, index) {
    const card = element('article', 'secret-card reveal');
    const label = element('p', 'secret-label', `特賞 ${String(index + 1).padStart(2, '0')}`);
    const art = element('div', 'secret-art');
    art.setAttribute('aria-hidden', 'true');
    const box = element('div', 'gift-box');
    box.append(element('span', 'gift-ribbon'));
    art.append(box, element('span', 'gift-question', '?'));
    card.append(
      label,
      art,
      element('h3', 'secret-title', item.hint ? `${item.hint}。中身は当日のお楽しみ。` : 'その正体は、近日公開。'),
      element('p', 'secret-quantity', `${item.qty}本`),
      element('p', 'secret-note', 'コミュニティの一年を締めくくる、特別な景品。')
    );
    const number = String(index + 1).padStart(2, '0');
    const open = element('button', 'secret-open');
    open.type = 'button';
    open.setAttribute('aria-haspopup', 'dialog');
    open.setAttribute('aria-label', `特賞 ${number}のスクラッチを削る`);
    open.append(element('span', 'secret-open-icon', '✦'), element('span', '', 'スクラッチを削る'));
    open.firstChild.setAttribute('aria-hidden', 'true');
    card.append(open);
    card.classList.add('is-clickable');
    card.addEventListener('click', () => openScratchDialog(item, number, open));
    return card;
  }

  function renderDrawOrder() {
    const list = document.querySelector('#draw-order-list');
    if (!list || !currentData) return;
    const ordered = currentData.items
      .map((item, index) => ({ item, order: Number.isSafeInteger(item.no) ? item.no : index + 1 }))
      .sort((a, b) => a.order - b.order);
    list.replaceChildren(...ordered.map(({ item, order }) => {
      const row = element('li', item.secret ? 'draw-order-item is-special' : 'draw-order-item');
      row.append(
        element('span', 'draw-order-no', String(order).padStart(2, '0')),
        element('span', 'draw-order-name', item.name),
        element('span', 'draw-order-qty', `${item.qty}本`)
      );
      return row;
    }));
  }

  function showReveal(node) {
    node.classList.add('is-revealed');
    if (reducedMotion.matches || typeof node.animate !== 'function') return;
    try {
      const animation = node.animate([
        { opacity: 0.35, transform: 'translateY(14px)' },
        { opacity: 1, transform: 'translateY(0)' }
      ], { duration: 650, easing: 'cubic-bezier(.2,.7,.3,1)' });
      runningAnimations.add(animation);
      animation.finished.then(
        () => runningAnimations.delete(animation),
        () => runningAnimations.delete(animation)
      );
    } catch {
      // 演出に失敗しても、コンテンツはそのまま表示する。
    }
  }

  function observeReveals() {
    const nodes = document.querySelectorAll('.reveal:not(.is-revealed)');
    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      nodes.forEach((node) => node.classList.add('is-revealed'));
      return;
    }
    try {
      if (!revealObserver) {
        revealObserver = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            revealObserver.unobserve(entry.target);
            showReveal(entry.target);
          }
        }, { threshold: 0.08 });
      }
      nodes.forEach((node) => revealObserver.observe(node));
    } catch {
      nodes.forEach((node) => node.classList.add('is-revealed'));
    }
  }

  function renderLineup(announce = false) {
    if (!currentData) return;
    const grid = document.querySelector('#prize-grid');
    if (!grid) return;
    if (revealObserver) grid.querySelectorAll('.reveal').forEach((node) => revealObserver.unobserve(node));
    const items = currentData.items.filter((item) => !item.secret
      && (activeFilter === 'all' || item.category === activeFilter));
    grid.replaceChildren(...items.map(createPrizeCard));
    const countItems = activeFilter === 'all' ? currentData.items : items;
    const count = countItems.reduce((sum, item) => sum + item.qty, 0);
    const countLabel = document.querySelector('#lineup-count');
    if (countLabel) countLabel.textContent = `全${count}本`;
    const status = document.querySelector('#lineup-status');
    if (status && announce) {
      status.textContent = `${activeFilter === 'all' ? 'すべてのカテゴリ' : activeFilter}：${items.length}種類、全${count}本${activeFilter === 'all' ? '（特賞を含む）' : ''}を表示しています。`;
    }
    document.querySelectorAll('#prize-filters button[data-filter]').forEach((button) => {
      const selected = button.dataset.filter === activeFilter;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('is-active', selected);
    });
    observeReveals();
  }

  function setTotalLabel(data) {
    document.querySelectorAll('[data-total-count]').forEach((node) => {
      node.textContent = String(data.total_count);
    });
    document.querySelectorAll('[data-total-label]').forEach((node) => {
      node.textContent = data.total_label;
    });
    const specialCount = data.items.filter((item) => item.secret).reduce((sum, item) => sum + item.qty, 0);
    document.querySelectorAll('[data-special-count]').forEach((node) => {
      node.textContent = String(specialCount);
    });
    const amount = document.querySelector('#prize-total');
    if (!amount) return;
    const amountLabel = amount.closest('.amount');
    if (amountLabel) amountLabel.setAttribute('aria-label', `景品総額${data.total_label}`);
    const hasKnownAmount = data.total_label === '400万円';
    document.querySelectorAll('[data-currency-symbol]').forEach((node) => {
      node.hidden = !hasKnownAmount;
    });
    if (!hasKnownAmount) {
      amount.textContent = data.total_label;
      return;
    }
    const finalText = '4,000,000';
    if (reducedMotion.matches || typeof window.requestAnimationFrame !== 'function') {
      amount.textContent = finalText;
      return;
    }
    const start = performance.now();
    const duration = 1450;
    function tick(now) {
      if (reducedMotion.matches) {
        amount.textContent = finalText;
        return;
      }
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(4000000 * eased / 1000) * 1000;
      amount.textContent = value.toLocaleString('en-US');
      if (progress < 1) countAnimation = requestAnimationFrame(tick);
      else countAnimation = 0;
    }
    countAnimation = requestAnimationFrame(tick);
  }

  function showNotice(message) {
    const notice = document.querySelector('#data-notice');
    if (!notice) return;
    notice.textContent = message;
    notice.hidden = !message;
  }

  async function loadData() {
    if (window.location.protocol === 'file:') return validateData(window.PRIZES_FALLBACK);
    try {
      const response = await fetch('prizes.json', { cache: 'no-store' });
      if (!response.ok) throw new Error('景品データを取得できませんでした。');
      return validateData(await response.json());
    } catch {
      const fallback = validateData(window.PRIZES_FALLBACK);
      showNotice('景品情報を更新できなかったため、保存済みのラインナップを表示しています。');
      return fallback;
    }
  }

  function bindFilters() {
    const filters = document.querySelector('#prize-filters');
    if (!filters) return;
    filters.addEventListener('click', (event) => {
      const button = event.target.closest('button[data-filter]');
      if (!button || !filters.contains(button)) return;
      const filter = button.dataset.filter;
      if (filter !== 'all' && !categories.has(filter)) return;
      if (filter === activeFilter) return;
      activeFilter = filter;
      renderLineup(true);
    });
  }

  function handleMotionChange() {
    if (!reducedMotion.matches) return;
    runningAnimations.forEach((animation) => animation.cancel());
    runningAnimations.clear();
    if (revealObserver) revealObserver.disconnect();
    document.querySelectorAll('.reveal').forEach((node) => node.classList.add('is-revealed'));
    if (countAnimation) {
      cancelAnimationFrame(countAnimation);
      countAnimation = 0;
      if (currentData) setTotalLabel(currentData);
    }
  }

  async function init() {
    bindFilters();
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && prizeDialog && prizeDialog.open) {
        event.preventDefault();
        closePrizeDialog();
      }
    });
    if (typeof reducedMotion.addEventListener === 'function') {
      reducedMotion.addEventListener('change', handleMotionChange);
    }
    try {
      currentData = await loadData();
      setTotalLabel(currentData);
      const special = document.querySelector('#special-prizes');
      if (special) {
        special.replaceChildren(...currentData.items.filter((item) => item.secret).map(createSecretCard));
      }
      renderLineup();
      renderDrawOrder();
      observeReveals();
    } catch {
      showNotice('景品情報を読み込めませんでした。時間をおいてもう一度ご確認ください。');
      document.querySelectorAll('.reveal').forEach((node) => node.classList.add('is-revealed'));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
