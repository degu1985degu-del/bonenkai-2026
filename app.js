(() => {
  'use strict';

  const categories = new Set(['家電', 'Apple', 'AI利用権']);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const runningAnimations = new Set();
  let currentData = null;
  let activeFilter = 'all';
  let countAnimation = 0;
  let revealObserver = null;

  function element(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
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
        || (item.image !== undefined && typeof item.image !== 'string')
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
    if (/AirPods/i.test(item.name)) return 'airpods';
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

  function createPrizeCard(item) {
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
    card.append(visual, info);
    return card;
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
      element('h3', 'secret-title', 'その正体は、近日公開。'),
      element('p', 'secret-quantity', `${item.qty}本`),
      element('p', 'secret-note', 'コミュニティの一年を締めくくる、特別な景品。')
    );
    return card;
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
    const count = items.reduce((sum, item) => sum + item.qty, 0);
    const countLabel = document.querySelector('#lineup-count');
    if (countLabel) countLabel.textContent = `全${count}本`;
    const status = document.querySelector('#lineup-status');
    if (status && announce) {
      status.textContent = `${activeFilter === 'all' ? 'すべてのカテゴリ' : activeFilter}：${items.length}種類、全${count}本を表示しています。`;
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
      observeReveals();
    } catch {
      showNotice('景品情報を読み込めませんでした。時間をおいてもう一度ご確認ください。');
      document.querySelectorAll('.reveal').forEach((node) => node.classList.add('is-revealed'));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
