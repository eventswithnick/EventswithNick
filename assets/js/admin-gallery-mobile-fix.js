/* Events with Nick - admin gallery mobile + add/remove repair
   This file runs after the existing admin.js and takes ownership only of the Gallery tab. */
(function () {
  'use strict';

  const LOCAL_KEYS = [
    'ewn_gallery_items',
    'EWN_GALLERY_ITEMS',
    'events_with_nick_gallery',
    'gallery_items'
  ];

  const DEFAULT_GALLERY = [
    {
      id: 'default-1',
      title: 'Elegant event setup',
      category: 'Decor',
      image: 'assets/img/gallery-1.jpg',
      localOnly: true
    },
    {
      id: 'default-2',
      title: 'Luxury table styling',
      category: 'Events',
      image: 'assets/img/gallery-2.jpg',
      localOnly: true
    },
    {
      id: 'default-3',
      title: 'Celebration detail',
      category: 'Special Events',
      image: 'assets/img/gallery-3.jpg',
      localOnly: true
    }
  ];

  let selectedImageData = '';
  let currentGalleryItems = [];
  let isBusy = false;

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

  function getProjectRefFromUrl(url) {
    try {
      const host = new URL(url).host;
      return host.split('.')[0];
    } catch (_) {
      return '';
    }
  }

  function parseJson(value) {
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function getSupabaseAccessToken() {
    const cfg = backendConfig();
    const projectRef = getProjectRefFromUrl(cfg.supabaseUrl || '');
    const possibleKeys = [];
    if (projectRef) possibleKeys.push(`sb-${projectRef}-auth-token`);
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) possibleKeys.push(key);
    }
    possibleKeys.push('supabase.auth.token', 'ewn_admin_token', 'EWN_ADMIN_TOKEN');

    for (const key of [...new Set(possibleKeys)]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = parseJson(raw);
      if (parsed?.access_token) return parsed.access_token;
      if (parsed?.currentSession?.access_token) return parsed.currentSession.access_token;
      if (parsed?.session?.access_token) return parsed.session.access_token;
      if (typeof raw === 'string' && raw.split('.').length === 3) return raw;
    }
    return '';
  }

  function supabaseHeaders({ admin = false, prefer = '' } = {}) {
    const cfg = backendConfig();
    const token = admin ? getSupabaseAccessToken() : '';
    const headers = {
      apikey: cfg.supabaseAnonKey,
      Authorization: `Bearer ${token || cfg.supabaseAnonKey}`,
      'Content-Type': 'application/json'
    };
    if (prefer) headers.Prefer = prefer;
    return headers;
  }

  async function supabaseFetch(path, options = {}) {
    const cfg = backendConfig();
    const url = `${String(cfg.supabaseUrl).replace(/\/$/, '')}/rest/v1/${path}`;
    const response = await fetch(url, options);
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch (_) { data = text; }
    }
    if (!response.ok) {
      const message = data?.message || data?.error_description || data?.hint || text || `Supabase request failed (${response.status})`;
      throw new Error(message);
    }
    return data;
  }

  function readLocalGallery() {
    for (const key of LOCAL_KEYS) {
      const parsed = parseJson(localStorage.getItem(key));
      if (Array.isArray(parsed)) return parsed;
    }
    const configGallery = window.SITE_CONFIG?.gallery || window.EWN_SITE_CONFIG?.gallery || window.siteConfig?.gallery;
    if (Array.isArray(configGallery) && configGallery.length) return configGallery;
    return DEFAULT_GALLERY;
  }

  function writeLocalGallery(items) {
    const clean = Array.isArray(items) ? items : [];
    for (const key of LOCAL_KEYS) localStorage.setItem(key, JSON.stringify(clean));
    window.dispatchEvent(new CustomEvent('ewn-gallery-updated', { detail: clean }));
  }

  function normalizeItem(item, index = 0) {
    return {
      id: item.id ?? item.item_id ?? item.uuid ?? `local-${Date.now()}-${index}`,
      title: item.title || item.name || `Gallery image ${index + 1}`,
      category: item.category || item.type || 'Gallery',
      image: item.image || item.src || item.url || item.imageUrl || '',
      created_at: item.created_at || item.createdAt || new Date().toISOString(),
      localOnly: !!item.localOnly
    };
  }

  function sortNewestFirst(items) {
    return [...items].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  async function loadGalleryItems() {
    if (isSupabaseMode()) {
      try {
        const rows = await supabaseFetch('gallery_items?select=*&order=created_at.desc', {
          headers: supabaseHeaders({ admin: false })
        });
        if (Array.isArray(rows)) {
          currentGalleryItems = rows.map(normalizeItem);
          writeLocalGallery(currentGalleryItems);
          return currentGalleryItems;
        }
      } catch (error) {
        console.warn('Gallery Supabase load failed, using local fallback:', error.message);
      }
    }
    currentGalleryItems = sortNewestFirst(readLocalGallery().map(normalizeItem));
    return currentGalleryItems;
  }

  async function addGalleryItem(item) {
    const clean = {
      title: item.title.trim(),
      category: item.category.trim(),
      image: item.image.trim()
    };

    if (isSupabaseMode()) {
      const token = getSupabaseAccessToken();
      if (token) {
        const inserted = await supabaseFetch('gallery_items', {
          method: 'POST',
          headers: supabaseHeaders({ admin: true, prefer: 'return=representation' }),
          body: JSON.stringify(clean)
        });
        const row = Array.isArray(inserted) ? inserted[0] : inserted;
        return normalizeItem(row || clean);
      }
    }

    const localItem = normalizeItem({ ...clean, id: `local-${Date.now()}`, created_at: new Date().toISOString(), localOnly: true });
    const items = [localItem, ...readLocalGallery().map(normalizeItem).filter((x) => String(x.id) !== String(localItem.id))];
    writeLocalGallery(items);
    return localItem;
  }

  async function removeGalleryItem(id) {
    const item = currentGalleryItems.find((x) => String(x.id) === String(id));
    const isNumericSupabaseId = /^\d+$/.test(String(id));

    if (isSupabaseMode() && isNumericSupabaseId && getSupabaseAccessToken()) {
      await supabaseFetch(`gallery_items?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: supabaseHeaders({ admin: true })
      });
    }

    const updated = currentGalleryItems.filter((x) => String(x.id) !== String(id));
    currentGalleryItems = updated;
    writeLocalGallery(updated);
    return item;
  }

  function setStatus(message, type = 'ok') {
    const saved = $('gallerySaved');
    if (!saved) return;
    saved.textContent = message || '';
    saved.className = type === 'error' ? 'error gallery-status-pill' : 'success gallery-status-pill';
    saved.setAttribute('aria-live', 'polite');
    saved.setAttribute('role', type === 'error' ? 'alert' : 'status');
  }

  function setGalleryBusy(active, buttonText = '') {
    const form = $('galleryForm');
    const submitBtn = form ? form.querySelector('button[type="submit"]') : null;
    if (form) form.classList.toggle('gallery-busy', !!active);
    if (!submitBtn) return;

    if (!submitBtn.dataset.originalText) {
      submitBtn.dataset.originalText = submitBtn.textContent.trim() || 'Add Gallery Image';
    }

    submitBtn.disabled = !!active;
    submitBtn.setAttribute('aria-busy', active ? 'true' : 'false');
    submitBtn.textContent = active ? (buttonText || 'Please wait...') : submitBtn.dataset.originalText;
  }

  function renderAdminGallery(items = currentGalleryItems) {
    const box = $('adminGallery');
    if (!box) return;

    const normalized = sortNewestFirst((items || []).map(normalizeItem)).filter((item) => item.image);
    currentGalleryItems = normalized;

    if (!normalized.length) {
      box.innerHTML = '<div class="gallery-empty-state"><strong>No gallery images yet.</strong><p>Add an image above and it will appear here with a remove button.</p></div>';
      return;
    }

    box.innerHTML = normalized.map((item) => `
      <article class="admin-gallery-card" data-gallery-id="${esc(item.id)}">
        <img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy" onerror="this.closest('.admin-gallery-card').classList.add('image-load-error'); this.alt='Image could not load';" />
        <div class="admin-gallery-info">
          <h3>${esc(item.title)}</h3>
          <p>${esc(item.category)}${item.localOnly ? ' • local preview' : ''}</p>
        </div>
        <div class="gallery-actions">
          <button class="gallery-remove-btn" type="button" data-remove-gallery="${esc(item.id)}">Remove image</button>
        </div>
      </article>
    `).join('');
  }

  async function refreshAdminGallery(showMessage = false) {
    try {
      const items = await loadGalleryItems();
      renderAdminGallery(items);
      if (showMessage) setStatus(`Gallery loaded: ${items.filter((x) => x.image).length} image(s).`);
    } catch (error) {
      const box = $('adminGallery');
      if (box) box.innerHTML = `<div class="gallery-error-state"><strong>Gallery could not load.</strong><p>${esc(error.message)}</p></div>`;
      setStatus(error.message || 'Gallery could not load.', 'error');
    }
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('The selected image could not be read.'));
      reader.readAsDataURL(file);
    });
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  }

  async function compressImageFile(file) {
    const original = await readFileAsDataURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = original;
      await image.decode();

      const maxSide = 1400;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
      if (!blob) return original;
      return await readFileAsDataURL(blob);
    } catch (error) {
      console.warn('Image compression failed, using original file:', error.message);
      return original;
    }
  }

  function showPreview(src) {
    const wrap = $('galleryPreviewWrap');
    const img = $('galleryPreview');
    if (!wrap || !img) return;
    if (src) {
      img.src = src;
      wrap.classList.remove('hidden');
    } else {
      img.removeAttribute('src');
      wrap.classList.add('hidden');
    }
  }

  function injectRefreshButton() {
    const form = $('galleryForm');
    if (!form || $('galleryRefreshBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'galleryRefreshBtn';
    btn.type = 'button';
    btn.className = 'gallery-refresh-btn';
    btn.textContent = 'Refresh Gallery Images';
    btn.addEventListener('click', () => refreshAdminGallery(true));
    form.insertAdjacentElement('afterend', btn);
  }

  function wireGalleryEvents() {
    const form = $('galleryForm');
    const fileInput = $('galleryImageFile');
    const urlInput = $('galleryImageUrl');
    const clearBtn = $('clearGalleryImageBtn');
    const adminGallery = $('adminGallery');

    injectRefreshButton();

    if (fileInput && !fileInput.dataset.ewnGalleryFixed) {
      fileInput.dataset.ewnGalleryFixed = '1';
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const wasBusy = isBusy;
        isBusy = true;
        setGalleryBusy(true, 'Preparing photo...');
        setStatus('Preparing selected photo... please wait.');
        try {
          selectedImageData = await compressImageFile(file);
          if (urlInput) urlInput.value = '';
          showPreview(selectedImageData);
          setStatus('Photo ready. Tap Add Gallery Image to save it.');
        } catch (error) {
          selectedImageData = '';
          showPreview('');
          setStatus(error.message || 'The selected photo could not be prepared.', 'error');
        } finally {
          isBusy = wasBusy;
          if (!isBusy) setGalleryBusy(false);
        }
      });
    }

    if (urlInput && !urlInput.dataset.ewnGalleryFixed) {
      urlInput.dataset.ewnGalleryFixed = '1';
      urlInput.addEventListener('input', () => {
        selectedImageData = '';
        if (fileInput) fileInput.value = '';
        showPreview(urlInput.value.trim());
      });
    }

    if (clearBtn && !clearBtn.dataset.ewnGalleryFixed) {
      clearBtn.dataset.ewnGalleryFixed = '1';
      clearBtn.addEventListener('click', () => {
        selectedImageData = '';
        if (fileInput) fileInput.value = '';
        if (urlInput) urlInput.value = '';
        showPreview('');
        setStatus('Selected photo cleared.');
      });
    }

    if (form && !form.dataset.ewnGalleryFixed) {
      form.dataset.ewnGalleryFixed = '1';
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (isBusy) {
          setStatus('Please wait, the gallery is still processing your previous action.');
          return;
        }
        isBusy = true;
        setGalleryBusy(true, 'Uploading image...');

        const fd = new FormData(form);
        const title = String(fd.get('title') || '').trim();
        const category = String(fd.get('category') || '').trim();
        const image = selectedImageData || String(fd.get('image') || '').trim();

        try {
          if (!title || !category) throw new Error('Please enter the image title and category.');
          if (!image) throw new Error('Please upload a photo or paste an image URL.');
          setStatus('Uploading image... please wait. Do not refresh the page.');
          await addGalleryItem({ title, category, image });
          setStatus('Finalising gallery display...');
          form.reset();
          selectedImageData = '';
          showPreview('');
          await refreshAdminGallery(false);
          setStatus('Gallery image added successfully. It is now visible in the admin gallery.');
        } catch (error) {
          setStatus(error.message || 'Gallery image could not be saved.', 'error');
        } finally {
          isBusy = false;
          setGalleryBusy(false);
        }
      }, true);
    }

    if (adminGallery && !adminGallery.dataset.ewnGalleryFixed) {
      adminGallery.dataset.ewnGalleryFixed = '1';
      adminGallery.addEventListener('click', async (event) => {
        const btn = event.target.closest('[data-remove-gallery]');
        if (!btn) return;
        const id = btn.getAttribute('data-remove-gallery');
        const item = currentGalleryItems.find((x) => String(x.id) === String(id));
        if (!confirm(`Remove this gallery image${item?.title ? `: ${item.title}` : ''}?`)) return;
        try {
          btn.disabled = true;
          btn.textContent = 'Removing...';
          setStatus('Removing image... please wait.');
          await removeGalleryItem(id);
          await refreshAdminGallery(false);
          setStatus('Gallery image removed.');
        } catch (error) {
          btn.disabled = false;
          btn.textContent = 'Remove image';
          setStatus(error.message || 'Gallery image could not be removed.', 'error');
        }
      });
    }
  }

  function galleryTabIsActive() {
    const gallery = $('gallery');
    return !!gallery && (gallery.classList.contains('active') || gallery.offsetParent !== null);
  }

  function bootGalleryFix() {
    wireGalleryEvents();
    refreshAdminGallery(false);
  }

  document.addEventListener('DOMContentLoaded', bootGalleryFix);
  window.addEventListener('load', bootGalleryFix);
  window.addEventListener('ewn-gallery-updated', (event) => renderAdminGallery(event.detail || currentGalleryItems));

  document.addEventListener('click', (event) => {
    const tabButton = event.target.closest('[data-tab="gallery"], [data-tab-jump="gallery"]');
    if (tabButton) setTimeout(() => refreshAdminGallery(true), 120);
  });

  const observer = new MutationObserver(() => {
    if (galleryTabIsActive()) {
      wireGalleryEvents();
      refreshAdminGallery(false);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  window.EWNGalleryAdminFix = { refresh: refreshAdminGallery, render: renderAdminGallery, load: loadGalleryItems };
}());
