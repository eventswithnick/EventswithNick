/* Events with Nick v7.8 - public smoothness and perceived-speed upgrade
   Runs before app.js. It does not replace existing functions or database logic. */
(function () {
  'use strict';

  const doc = document.documentElement;
  const nav = navigator || {};
  const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowMemory = typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4;
  const lowCpu = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4;
  const saveData = !!(nav.connection && nav.connection.saveData);
  const smallScreen = matchMedia('(max-width: 860px)').matches;
  const shouldFastMode = reducedMotion || saveData || smallScreen || isTouch || lowMemory || lowCpu;

  doc.classList.add('ewn-public-smoothness-ready');
  if (shouldFastMode) doc.classList.add('ewn-fast-mode');

  /* Make scroll/touch/wheel listeners passive by default so the page does not stutter while scrolling. */
  (function patchPassiveListeners() {
    if (EventTarget.prototype.__ewnPassivePatch) return;
    const originalAdd = EventTarget.prototype.addEventListener;
    const passiveTypes = new Set(['touchstart', 'touchmove', 'wheel', 'mousewheel']);

    EventTarget.prototype.addEventListener = function (type, listener, options) {
      if (passiveTypes.has(type) && (options === undefined || options === false)) {
        return originalAdd.call(this, type, listener, { passive: true });
      }
      return originalAdd.call(this, type, listener, options);
    };

    EventTarget.prototype.__ewnPassivePatch = true;
  }());

  const onReady = (fn) => {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, { once: true });
    else fn();
  };

  function optimiseImages() {
    const images = Array.from(document.images || []);
    images.forEach((img, index) => {
      if (!img.hasAttribute('decoding')) img.setAttribute('decoding', 'async');

      const inHeaderOrHero = !!img.closest('.hero, .site-header, .top-strip, .brand, .hero-logo-ring');
      if (inHeaderOrHero || index < 3) {
        img.setAttribute('loading', 'eager');
        img.setAttribute('fetchpriority', 'high');
      } else {
        img.setAttribute('loading', 'lazy');
        img.setAttribute('fetchpriority', 'low');
      }

      img.addEventListener('error', () => img.classList.add('ewn-image-error'), { once: true });
    });
  }

  function markDynamicImageContainers() {
    const gallery = document.getElementById('galleryGrid');
    if (!gallery) return;
    if (!gallery.children.length) gallery.classList.add('ewn-gallery-waiting');

    const observer = new MutationObserver(() => {
      gallery.classList.toggle('ewn-gallery-waiting', !gallery.children.length);
      optimiseImages();
    });
    observer.observe(gallery, { childList: true, subtree: true });
  }

  function renderInstantCachedGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid || grid.children.length) return;

    const keys = ['ewn_gallery_items', 'EWN_GALLERY_ITEMS', 'events_with_nick_gallery', 'gallery_items'];
    let cached = null;
    for (const key of keys) {
      try {
        const parsed = JSON.parse(localStorage.getItem(key) || 'null');
        if (Array.isArray(parsed) && parsed.length) { cached = parsed; break; }
      } catch (_) {}
    }
    if (!cached) return;

    const clean = cached.map((item, index) => ({
      title: item.title || item.name || `Gallery image ${index + 1}`,
      category: item.category || item.type || 'Gallery',
      image: item.image || item.src || item.url || item.imageUrl || ''
    })).filter((item) => item.image).slice(0, 24);

    if (!clean.length) return;

    const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[ch]));

    grid.classList.remove('ewn-gallery-waiting');
    grid.innerHTML = clean.map((item) => `
      <article class="gallery-item ewn-gallery-card reveal tilt-card">
        <img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" decoding="async" fetchpriority="low" />
        <div><p class="eyebrow">${esc(item.category)}</p><h3>${esc(item.title)}</h3></div>
      </article>
    `).join('');
  }

  function simplifyCountersInFastMode() {
    if (!doc.classList.contains('ewn-fast-mode')) return;
    document.querySelectorAll('[data-count]').forEach((node) => {
      const value = node.getAttribute('data-count');
      if (value) node.textContent = value;
    });
  }

  function deferNonCriticalEmbeds() {
    // A safe hook for future third-party embeds; keeps current site logic untouched.
    document.querySelectorAll('iframe:not([loading])').forEach((frame) => {
      frame.setAttribute('loading', 'lazy');
    });
  }

  function showTapResponse() {
    document.addEventListener('click', (event) => {
      const target = event.target.closest('a, button, .btn');
      if (!target) return;
      target.classList.add('ewn-tapped');
      setTimeout(() => target.classList.remove('ewn-tapped'), 180);
    }, { passive: true });
  }

  onReady(() => {
    optimiseImages();
    markDynamicImageContainers();
    renderInstantCachedGallery();
    simplifyCountersInFastMode();
    deferNonCriticalEmbeds();
    showTapResponse();

    window.addEventListener('load', () => {
      requestAnimationFrame(() => {
        optimiseImages();
        doc.classList.add('ewn-page-fully-loaded');
      });
    }, { once: true });
  });
}());
