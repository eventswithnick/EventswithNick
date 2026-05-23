/* Events with Nick - public gallery Supabase/local sync repair */
(function () {
  'use strict';

  const LOCAL_KEYS = ['ewn_gallery_items', 'EWN_GALLERY_ITEMS', 'events_with_nick_gallery', 'gallery_items'];
  const DEFAULT_GALLERY = [
    { title: 'Elegant event setup', category: 'Decor', image: 'assets/img/gallery-1.jpg' },
    { title: 'Luxury table styling', category: 'Events', image: 'assets/img/gallery-2.jpg' },
    { title: 'Celebration detail', category: 'Special Events', image: 'assets/img/gallery-3.jpg' }
  ];

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>'"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[ch]));

  function backendConfig() {
    return window.EWN_BACKEND || window.ewnBackend || {};
  }

  function isSupabaseMode() {
    const cfg = backendConfig();
    return String(cfg.provider || '').toLowerCase() === 'supabase' && !!cfg.supabaseUrl && !!cfg.supabaseAnonKey;
  }

  function parseJson(value) {
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function readLocalGallery() {
    for (const key of LOCAL_KEYS) {
      const parsed = parseJson(localStorage.getItem(key));
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
    const configGallery = window.SITE_CONFIG?.gallery || window.EWN_SITE_CONFIG?.gallery || window.siteConfig?.gallery;
    if (Array.isArray(configGallery) && configGallery.length) return configGallery;
    return DEFAULT_GALLERY;
  }

  function normalize(item, index) {
    return {
      id: item.id ?? `gallery-${index}`,
      title: item.title || item.name || `Gallery image ${index + 1}`,
      category: item.category || item.type || 'Gallery',
      image: item.image || item.src || item.url || item.imageUrl || '',
      created_at: item.created_at || item.createdAt || ''
    };
  }

  async function loadSupabaseGallery() {
    const cfg = backendConfig();
    const url = `${String(cfg.supabaseUrl).replace(/\/$/, '')}/rest/v1/gallery_items?select=*&order=created_at.desc`;
    const response = await fetch(url, {
      headers: {
        apikey: cfg.supabaseAnonKey,
        Authorization: `Bearer ${cfg.supabaseAnonKey}`,
        'Content-Type': 'application/json'
      }
    });
    if (!response.ok) throw new Error('Public gallery could not load from Supabase.');
    return await response.json();
  }

  async function loadGallery() {
    if (isSupabaseMode()) {
      try {
        const rows = await loadSupabaseGallery();
        if (Array.isArray(rows) && rows.length) {
          localStorage.setItem('ewn_gallery_items', JSON.stringify(rows));
          return rows.map(normalize);
        }
      } catch (error) {
        console.warn(error.message);
      }
    }
    return readLocalGallery().map(normalize);
  }

  function renderGallery(items) {
    const grid = $('galleryGrid');
    if (!grid) return;
    const clean = (items || []).map(normalize).filter((item) => item.image);
    if (!clean.length) return;

    grid.innerHTML = clean.map((item) => `
      <article class="gallery-item ewn-gallery-card reveal tilt-card">
        <img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" />
        <div>
          <p class="eyebrow">${esc(item.category)}</p>
          <h3>${esc(item.title)}</h3>
        </div>
      </article>
    `).join('');
  }

  async function bootPublicGallery() {
    const grid = $('galleryGrid');
    if (!grid) return;
    const items = await loadGallery();
    renderGallery(items);
  }

  document.addEventListener('DOMContentLoaded', bootPublicGallery);
  window.addEventListener('load', bootPublicGallery);
  window.addEventListener('ewn-gallery-updated', (event) => renderGallery(event.detail || []));
}());
