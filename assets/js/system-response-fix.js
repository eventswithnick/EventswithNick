/* Events with Nick v7.7 - whole-system response feedback
   Purpose: show clear loading/saving feedback across public site and admin portal.
   It wraps network calls and button/form interactions without replacing existing functions. */
(function () {
  'use strict';

  const SETTINGS = {
    slowAfterMs: 3200,
    minimumVisibleMs: 360,
    buttonReleaseMs: 9000,
    completedVisibleMs: 900,
    pageLoadMessageMs: 1100
  };

  let activeRequests = 0;
  let startedAt = 0;
  let progress = 0;
  let progressTimer = null;
  let slowTimer = null;
  let hideTimer = null;
  let ui = null;

  const safeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  function ensureUi() {
    if (ui) return ui;

    const bar = document.createElement('div');
    bar.className = 'ewn-progress-bar';
    bar.setAttribute('aria-hidden', 'true');

    const status = document.createElement('div');
    status.className = 'ewn-system-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.innerHTML = [
      '<span class="ewn-system-status__spinner" aria-hidden="true"></span>',
      '<span class="ewn-system-status__text">',
      '<strong class="ewn-system-status__title">Working...</strong>',
      '<span class="ewn-system-status__hint">Please wait, the system is responding.</span>',
      '</span>'
    ].join('');

    const slowNote = document.createElement('div');
    slowNote.className = 'ewn-slow-note';
    slowNote.textContent = 'Still working. Network or Supabase response may take a few seconds.';

    document.body.appendChild(bar);
    document.body.appendChild(status);
    document.body.appendChild(slowNote);

    ui = {
      bar,
      status,
      slowNote,
      title: status.querySelector('.ewn-system-status__title'),
      hint: status.querySelector('.ewn-system-status__hint')
    };
    return ui;
  }

  function setMessage(message, hint) {
    const currentUi = ensureUi();
    if (message) currentUi.title.textContent = message;
    if (hint) currentUi.hint.textContent = hint;
  }

  function showStatus(message, hint) {
    const currentUi = ensureUi();
    clearTimeout(hideTimer);
    setMessage(message || 'Working...', hint || 'Please wait, the system is responding.');
    currentUi.status.classList.add('is-visible');
    currentUi.bar.classList.add('is-visible');
  }

  function hideStatus(force) {
    if (!ui) return;
    const elapsed = Date.now() - startedAt;
    const wait = force ? 0 : Math.max(0, SETTINGS.minimumVisibleMs - elapsed);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (activeRequests > 0) return;
      ui.status.classList.remove('is-visible');
      ui.bar.classList.remove('is-visible');
      ui.slowNote.classList.remove('is-visible');
      ui.bar.style.width = '0%';
      progress = 0;
    }, wait);
  }

  function startProgress() {
    const currentUi = ensureUi();
    if (!startedAt) startedAt = Date.now();
    clearInterval(progressTimer);
    progress = Math.max(progress, 12);
    currentUi.bar.style.width = progress + '%';
    progressTimer = setInterval(() => {
      if (activeRequests <= 0) return;
      progress = Math.min(88, progress + Math.max(1, Math.round((90 - progress) * 0.08)));
      currentUi.bar.style.width = progress + '%';
    }, 280);
  }

  function stopProgress() {
    const currentUi = ensureUi();
    clearInterval(progressTimer);
    progress = 100;
    currentUi.bar.style.width = '100%';
    setTimeout(() => {
      if (activeRequests <= 0) hideStatus(false);
    }, 180);
  }

  function beginWork(message, hint) {
    activeRequests += 1;
    if (activeRequests === 1) {
      startedAt = Date.now();
      showStatus(message, hint);
      startProgress();
      clearTimeout(slowTimer);
      slowTimer = setTimeout(() => {
        if (activeRequests > 0 && ui) {
          ui.slowNote.classList.add('is-visible');
          setMessage('Still working...', 'Please do not tap again or refresh yet.');
        }
      }, SETTINGS.slowAfterMs);
    } else {
      setMessage(message || 'Working...', hint || 'Please wait, the system is responding.');
    }
  }

  function endWork(successMessage) {
    activeRequests = Math.max(0, activeRequests - 1);
    if (activeRequests === 0) {
      clearTimeout(slowTimer);
      if (successMessage) {
        setMessage(successMessage, 'Done. You can continue.');
        if (ui) ui.slowNote.classList.remove('is-visible');
        setTimeout(() => hideStatus(false), SETTINGS.completedVisibleMs);
      }
      stopProgress();
    }
  }

  function inferMessageFromElement(element, mode) {
    const text = safeText(element?.getAttribute?.('aria-label') || element?.textContent || element?.value || '');
    const lower = text.toLowerCase();

    if (mode === 'submit') {
      if (lower.includes('booking') || lower.includes('request')) return 'Sending request...';
      if (lower.includes('gallery')) return 'Saving gallery image...';
      if (lower.includes('bank')) return 'Saving banking details...';
      if (lower.includes('website') || lower.includes('details')) return 'Saving website details...';
      if (lower.includes('quote')) return 'Generating quote...';
      return 'Saving information...';
    }

    if (lower.includes('download') || lower.includes('pdf')) return 'Preparing download...';
    if (lower.includes('export') || lower.includes('csv') || lower.includes('json')) return 'Preparing export...';
    if (lower.includes('save')) return 'Saving changes...';
    if (lower.includes('add')) return 'Adding information...';
    if (lower.includes('remove') || lower.includes('delete')) return 'Removing item...';
    if (lower.includes('generate') || lower.includes('preview')) return 'Generating preview...';
    if (lower.includes('reset')) return 'Resetting data...';
    if (lower.includes('login') || lower.includes('portal') || lower.includes('open secure')) return 'Opening secure portal...';
    if (lower.includes('status') || lower.includes('update')) return 'Updating status...';
    return 'Working...';
  }

  function shouldIgnoreClick(element) {
    if (!element) return true;
    if (element.closest('.nav-btn, .side-nav, .menu-toggle, .modal-close, [data-tab], [data-tab-jump]')) return true;
    if (element.matches('a[href^="#"], a[href^="tel:"], a[href^="mailto:"], a[href^="https://wa.me"], a[href^="https://api.whatsapp"], .owner-footer-link, .portal-link, .site-link')) return true;
    return false;
  }

  function setButtonWorking(button, message) {
    if (!button || button.dataset.ewnPermanentBusy === '1') return;
    if (button.classList.contains('ewn-btn-working')) return;

    const originalText = button.textContent;
    const originalDisabled = button.disabled;
    button.dataset.ewnOriginalText = originalText;
    button.dataset.ewnOriginalDisabled = String(originalDisabled);
    button.classList.add('ewn-btn-working');

    if (message && button.tagName === 'BUTTON') button.textContent = message;
    if (!button.closest('.nav-btn, .side-nav')) button.disabled = true;

    setTimeout(() => releaseButton(button), SETTINGS.buttonReleaseMs);
  }

  function releaseButton(button) {
    if (!button || !button.classList.contains('ewn-btn-working')) return;
    const originalText = button.dataset.ewnOriginalText;
    const originalDisabled = button.dataset.ewnOriginalDisabled === 'true';
    if (originalText && button.tagName === 'BUTTON') button.textContent = originalText;
    button.disabled = originalDisabled;
    button.classList.remove('ewn-btn-working');
    delete button.dataset.ewnOriginalText;
    delete button.dataset.ewnOriginalDisabled;
  }

  function markNearestPanel(element, working) {
    const panel = element?.closest?.('.card, .tab-panel, .booking-form, form');
    if (!panel) return;
    panel.classList.toggle(panel.tagName === 'FORM' ? 'ewn-form-working' : 'ewn-panel-working', !!working);
    if (working) setTimeout(() => markNearestPanel(element, false), SETTINGS.buttonReleaseMs);
  }

  function wireFormFeedback() {
    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      const button = form.querySelector('button[type="submit"], input[type="submit"]');
      const msg = inferMessageFromElement(button || form, 'submit');
      beginWork(msg, 'Please wait while the system processes this.');
      if (button instanceof HTMLButtonElement) setButtonWorking(button, msg.replace(/\.\.\.$/, '...'));
      markNearestPanel(form, true);
      setTimeout(() => endWork(), SETTINGS.completedVisibleMs + 1200);
    }, true);
  }

  function wireClickFeedback() {
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button, [role="button"]');
      if (!button || shouldIgnoreClick(button)) return;
      if (button.type === 'submit') return;

      const text = safeText(button.textContent || button.value || '');
      const actionable = /(save|add|remove|delete|download|export|reset|generate|preview|login|open secure|status|quote|refresh)/i.test(text);
      if (!actionable) return;

      const msg = inferMessageFromElement(button, 'click');
      beginWork(msg, 'Please wait; avoid tapping the same button repeatedly.');
      setButtonWorking(button, msg.replace(/\.\.\.$/, '...'));
      markNearestPanel(button, true);
      setTimeout(() => {
        releaseButton(button);
        endWork();
      }, Math.min(SETTINGS.buttonReleaseMs, 3200));
    }, true);
  }

  function patchFetch() {
    if (!window.fetch || window.fetch.__ewnResponsePatched) return;
    const originalFetch = window.fetch.bind(window);
    const patched = function () {
      beginWork('Loading data...', 'Connecting to the website database.');
      return originalFetch.apply(window, arguments)
        .then((response) => response)
        .finally(() => endWork());
    };
    patched.__ewnResponsePatched = true;
    window.fetch = patched;
  }

  function patchXhr() {
    if (!window.XMLHttpRequest || window.XMLHttpRequest.prototype.__ewnResponsePatched) return;
    const OriginalXHR = window.XMLHttpRequest;
    const originalOpen = OriginalXHR.prototype.open;
    const originalSend = OriginalXHR.prototype.send;

    OriginalXHR.prototype.open = function () {
      this.__ewnTracked = true;
      return originalOpen.apply(this, arguments);
    };

    OriginalXHR.prototype.send = function () {
      if (this.__ewnTracked) {
        beginWork('Loading data...', 'Connecting to the website database.');
        this.addEventListener('loadend', () => endWork(), { once: true });
      }
      return originalSend.apply(this, arguments);
    };

    OriginalXHR.prototype.__ewnResponsePatched = true;
  }

  function watchSuccessAndErrorMessages() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const node = mutation.target;
        if (!(node instanceof HTMLElement)) continue;
        if (!node.matches('.success, .error, #formNote, #loginError, #gallerySaved, #settingsSaved, #bankingSaved, #pricingSaved')) continue;
        const txt = safeText(node.textContent);
        if (!txt) continue;
        if (node.classList.contains('error') || /error|failed|could not|invalid|wrong/i.test(txt)) {
          activeRequests = 0;
          clearTimeout(slowTimer);
          showStatus('Action needs attention', txt.slice(0, 95));
          if (ui) ui.slowNote.classList.remove('is-visible');
          setTimeout(() => hideStatus(true), 2600);
        } else if (/success|saved|added|removed|sent|submitted|generated|loaded|updated|booking reference/i.test(txt)) {
          setMessage('Done successfully', txt.slice(0, 95));
          setTimeout(() => hideStatus(false), SETTINGS.completedVisibleMs);
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  }

  function showPageReadyFeedback() {
    window.addEventListener('load', () => {
      setTimeout(() => {
        showStatus('System ready', 'Buttons may take a few seconds when the database is busy.');
        if (ui) ui.status.classList.add('is-soft');
        setTimeout(() => {
          if (ui) ui.status.classList.remove('is-soft');
          hideStatus(true);
        }, SETTINGS.pageLoadMessageMs);
      }, 350);
    }, { once: true });
  }

  function init() {
    patchFetch();
    patchXhr();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        ensureUi();
        wireFormFeedback();
        wireClickFeedback();
        watchSuccessAndErrorMessages();
        showPageReadyFeedback();
      }, { once: true });
    } else {
      ensureUi();
      wireFormFeedback();
      wireClickFeedback();
      watchSuccessAndErrorMessages();
      showPageReadyFeedback();
    }
  }

  window.EWNSystemResponse = { begin: beginWork, end: endWork, show: showStatus, hide: hideStatus };
  init();
}());
