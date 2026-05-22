(function () {
  const defaults = window.EWN_DEFAULTS || {};
  const backend = window.EWN_BACKEND || { provider: 'local' };
  const keys = {
    settings: 'ewn_site_settings_v7',
    services: 'ewn_services_v7',
    gallery: 'ewn_gallery_v7',
    packages: 'ewn_packages_v7',
    quotePricing: 'ewn_quote_pricing_v7',
    banking: 'ewn_banking_details_v7',
    bookings: 'ewn_bookings_v7',
    auth: 'ewn_admin_supabase_session_v7',
    localAuth: 'ewn_local_admin_auth_v7'
  };
  let currentBookingId = null;
  let lastQuoteText = '';
  let currentAdmin = null;
  const statuses = ['New', 'Contacted', 'Quoted', 'Confirmed', 'Completed', 'Cancelled'];

  function hasRemote() { return backend.provider === 'supabase' && backend.supabaseUrl && backend.supabaseAnonKey; }
  function apiBase() { return backend.supabaseUrl.replace(/\/$/, ''); }
  function getStoredSession() {
    try { return JSON.parse(sessionStorage.getItem(keys.auth) || 'null'); }
    catch (error) { console.warn('Could not read secure session:', error.message); return null; }
  }
  function storeSession(session) {
    if (session && session.expires_in && !session.expires_at) session.expires_at = Math.floor(Date.now() / 1000) + Number(session.expires_in);
    sessionStorage.setItem(keys.auth, JSON.stringify(session));
  }
  function clearSession() { sessionStorage.removeItem(keys.auth); sessionStorage.removeItem(keys.localAuth); currentAdmin = null; }
  function getAccessToken() { const session = getStoredSession(); return session && session.access_token ? session.access_token : ''; }

  async function supabaseAuth(path, method = 'GET', body) {
    if (!hasRemote()) throw new Error('Supabase is not configured yet.');
    const token = getAccessToken();
    const headers = { apikey: backend.supabaseAnonKey, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${apiBase()}/auth/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(payload.error_description || payload.msg || payload.message || `Supabase Auth failed: ${response.status}`);
    return payload;
  }

  async function signInAdmin(email, password) {
    const session = await supabaseAuth('token?grant_type=password', 'POST', { email, password });
    if (!session || !session.access_token) throw new Error('Login failed. Check the admin email and password.');
    storeSession(session);
    currentAdmin = session.user || null;
  }

  async function ensureFreshSession() {
    const session = getStoredSession();
    if (!session || !session.refresh_token || !session.expires_at) return;
    const expiresSoon = Number(session.expires_at) - Math.floor(Date.now() / 1000) < 90;
    if (!expiresSoon) return;
    const refreshed = await supabaseAuth('token?grant_type=refresh_token', 'POST', { refresh_token: session.refresh_token });
    storeSession(refreshed);
    currentAdmin = refreshed.user || currentAdmin;
  }

  async function validateAdminSession() {
    if (!hasRemote()) return false;
    const token = getAccessToken();
    if (!token) return false;
    try {
      await ensureFreshSession();
      currentAdmin = await supabaseAuth('user', 'GET');
      return true;
    } catch (error) {
      console.warn('Secure session expired or invalid:', error.message);
      clearSession();
      return false;
    }
  }

  async function signOutAdmin() {
    try { if (hasRemote() && getAccessToken()) await supabaseAuth('logout', 'POST'); }
    catch (error) { console.warn('Remote logout warning:', error.message); }
    clearSession();
  }

  async function supabaseRequest(path, method = 'GET', body, prefer = 'return=representation') {
    if (!hasRemote()) return null;
    await ensureFreshSession();
    const token = getAccessToken() || backend.supabaseAnonKey;
    const headers = {
      apikey: backend.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    if (prefer) headers.Prefer = prefer;
    const response = await fetch(`${apiBase()}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${text}`);
    return text ? JSON.parse(text) : [];
  }

  async function refreshRemoteBookings() {
    if (!hasRemote()) return;
    try {
      const rows = await supabaseRequest('bookings?select=*&order=dateCreated.desc');
      if (Array.isArray(rows)) setBookings(rows);
    } catch (error) {
      console.warn('Remote booking refresh failed:', error.message);
    }
  }
  async function refreshRemoteConfig() {
    if (!hasRemote()) return;
    try {
      const siteRows = await supabaseRequest('site_settings?id=eq.main&select=settings');
      if (Array.isArray(siteRows) && siteRows[0] && siteRows[0].settings) write(keys.settings, siteRows[0].settings);
      const pricingRows = await supabaseRequest('quote_pricing?id=eq.main&select=pricing');
      if (Array.isArray(pricingRows) && pricingRows[0] && pricingRows[0].pricing) write(keys.quotePricing, pricingRows[0].pricing);
      const bankingRows = await supabaseRequest('banking_details?id=eq.main&select=banking');
      if (Array.isArray(bankingRows) && bankingRows[0] && bankingRows[0].banking) write(keys.banking, bankingRows[0].banking);
      const galleryRows = await supabaseRequest('gallery_items?select=id,title,category,image&order=created_at.desc');
      if (Array.isArray(galleryRows) && galleryRows.length) write(keys.gallery, galleryRows);
    } catch (error) {
      console.warn('Remote config refresh skipped or failed:', error.message);
    }
  }
  async function upsertRemote(table, body) {
    if (!hasRemote()) return;
    try {
      await supabaseRequest(table, 'POST', body, 'resolution=merge-duplicates,return=representation');
    } catch (error) {
      console.warn(`Remote ${table} save failed:`, error.message);
    }
  }

  function sanitize(text) { return String(text || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c])); }
  function money(value) { return 'R' + Number(value || 0).toLocaleString('en-ZA'); }
  function dateShort(value) { return value ? new Date(value).toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: '2-digit' }) : 'Not set'; }
  function initDefaults() {
    if (!localStorage.getItem(keys.settings)) write(keys.settings, defaults.business || {});
    if (!localStorage.getItem(keys.services)) write(keys.services, defaults.services || []);
    if (!localStorage.getItem(keys.gallery)) write(keys.gallery, defaults.gallery || []);
    if (!localStorage.getItem(keys.packages)) write(keys.packages, defaults.packages || []);
    if (!localStorage.getItem(keys.quotePricing)) write(keys.quotePricing, defaults.quotePricing || {});
    if (!localStorage.getItem(keys.banking)) write(keys.banking, defaults.banking || {});
    if (!localStorage.getItem(keys.bookings)) write(keys.bookings, defaults.sampleBookings || []);
  }
  function getBookings() { return read(keys.bookings, []); }
  function setBookings(bookings) { write(keys.bookings, bookings); }
  function getPricing() { return read(keys.quotePricing, defaults.quotePricing || {}); }
  function setPricing(pricing) { write(keys.quotePricing, pricing); }
  function getBanking() { return read(keys.banking, defaults.banking || {}); }
  function setBanking(banking) { write(keys.banking, banking); }

  function setLoginModeText() {
    const note = document.getElementById('loginModeNote');
    const emailField = document.getElementById('emailField');
    const submitBtn = document.getElementById('loginSubmitBtn');
    if (!note || !emailField || !submitBtn) return;
    if (hasRemote()) {
      emailField.classList.remove('hidden');
      submitBtn.textContent = 'Open Secure Portal';
      note.innerHTML = 'Secure live mode: log in using the Supabase Auth admin email and password.';
    } else {
      emailField.classList.add('hidden');
      submitBtn.textContent = 'Open Local Demo Portal';
      note.innerHTML = 'Local presentation mode: use the presentation password only for offline testing.';
    }
  }
  async function checkAuth() {
    setLoginModeText();
    if (hasRemote()) {
      if (await validateAdminSession()) await showDashboard();
      return;
    }
    if (sessionStorage.getItem(keys.localAuth) === 'yes') showDashboard();
  }
  async function showDashboard() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    const status = document.getElementById('connectionStatus');
    if (status) status.textContent = hasRemote() ? `Secure database connected${currentAdmin && currentAdmin.email ? ': ' + currentAdmin.email : ''}` : 'Presentation mode (local only)';
    await refreshRemoteConfig();
    await refreshRemoteBookings();
    renderAll();
  }
  function initLogin() {
    setLoginModeText();
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const errorEl = document.getElementById('loginError');
      const button = document.getElementById('loginSubmitBtn');
      errorEl.textContent = '';
      button.disabled = true;
      button.textContent = hasRemote() ? 'Checking secure login...' : 'Checking password...';
      try {
        const password = document.getElementById('passwordInput').value.trim();
        if (hasRemote()) {
          const email = document.getElementById('emailInput').value.trim();
          if (!email || !password) throw new Error('Enter the admin email and password.');
          await signInAdmin(email, password);
          await showDashboard();
        } else if (password === (defaults.adminPassword || 'nick2026')) {
          sessionStorage.setItem(keys.localAuth, 'yes');
          showDashboard();
        } else {
          throw new Error('Incorrect password. Try again.');
        }
      } catch (error) {
        errorEl.textContent = error.message;
      } finally {
        button.disabled = false;
        button.textContent = hasRemote() ? 'Open Secure Portal' : 'Open Local Demo Portal';
      }
    });
    document.getElementById('logoutBtn').addEventListener('click', async () => { await signOutAdmin(); location.reload(); });
  }
  function initTabs() {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.addEventListener('click', () => openTab(btn.dataset.tab)));
    document.querySelectorAll('[data-tab-jump]').forEach(btn => btn.addEventListener('click', () => openTab(btn.dataset.tabJump)));
  }
  function openTab(id) {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === id));
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.toggle('active', panel.id === id));
    const nav = document.querySelector(`.nav-btn[data-tab="${id}"]`);
    document.getElementById('panelTitle').textContent = nav ? nav.textContent : 'Dashboard';
    if (id === 'quote') populateQuoteSelects();
    if (id === 'pricing') renderPricingForm();
    if (id === 'banking') renderBankingForm();
    if (id === 'content') renderSettingsForm();
  }

  function renderMetrics() {
    const bookings = getBookings();
    const upcoming = bookings.filter(b => b.eventDate && new Date(b.eventDate) >= new Date(new Date().toDateString())).length;
    const confirmed = bookings.filter(b => b.status === 'Confirmed').length;
    const quotedValue = bookings.reduce((sum, b) => sum + Number(b.quoteAmount || 0), 0);
    const newLeads = bookings.filter(b => b.status === 'New').length;
    const metrics = [['Total bookings', bookings.length], ['New leads', newLeads], ['Upcoming events', upcoming], ['Confirmed', confirmed], ['Quoted value', money(quotedValue)]];
    document.getElementById('metrics').innerHTML = metrics.map(([label, value]) => `<div class="metric"><strong>${sanitize(value)}</strong><span>${sanitize(label)}</span></div>`).join('');
  }
  function renderRecent() {
    const bookings = getBookings().slice(0, 5);
    const box = document.getElementById('recentBookings');
    box.innerHTML = bookings.length ? bookings.map(b => `<div class="booking-item"><div><strong>${sanitize(b.name)}</strong><br><span>${sanitize(b.eventType)} • ${dateShort(b.eventDate)} • ${sanitize(b.location)}</span></div><span class="status ${sanitize(b.status)}">${sanitize(b.status)}</span></div>`).join('') : '<p>No bookings yet.</p>';
  }
  function renderPipeline() {
    const bookings = getBookings();
    const max = Math.max(1, ...statuses.map(status => bookings.filter(b => b.status === status).length));
    document.getElementById('pipeline').innerHTML = statuses.map(status => {
      const count = bookings.filter(b => b.status === status).length;
      const percent = Math.max(5, (count / max) * 100);
      return `<div class="pipe-row"><span>${status}</span><div class="pipe-bar"><div class="pipe-fill" style="width:${percent}%"></div></div><strong>${count}</strong></div>`;
    }).join('');
  }
  function renderBookings() {
    const search = (document.getElementById('bookingSearch').value || '').toLowerCase();
    const filter = document.getElementById('statusFilter').value;
    let bookings = getBookings();
    if (filter !== 'All') bookings = bookings.filter(b => b.status === filter);
    if (search) bookings = bookings.filter(b => [b.name, b.phone, b.email, b.preferredCommunication, b.eventType, b.location, b.package].join(' ').toLowerCase().includes(search));
    document.getElementById('bookingTable').innerHTML = bookings.map(b => `
      <tr>
        <td><strong>${sanitize(b.name)}</strong><br><small>${sanitize(b.phone)}<br>${sanitize(b.email)}<br>${sanitize(b.preferredCommunication || 'WhatsApp')}</small></td>
        <td>${sanitize(b.eventType)}<br><small>${sanitize(b.package)} • ${sanitize(b.location)}</small></td>
        <td>${dateShort(b.eventDate)}<br><small>${dateShort(b.dateCreated)}</small></td>
        <td>${sanitize(b.guests)}</td>
        <td><select class="status-select" data-action="status" data-id="${sanitize(b.id)}">${statuses.map(s => `<option ${b.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td><input class="quote-input" data-action="quote" data-id="${sanitize(b.id)}" value="${sanitize(b.quoteAmount)}" placeholder="Amount" /></td>
        <td><div class="row-actions"><button class="icon-btn" data-action="view" data-id="${sanitize(b.id)}">View</button><button class="icon-btn" data-action="whatsapp" data-id="${sanitize(b.id)}">WhatsApp</button><button class="icon-btn" data-action="delete" data-id="${sanitize(b.id)}">Delete</button></div></td>
      </tr>`).join('') || '<tr><td colspan="7">No matching bookings found.</td></tr>';
    populateQuoteSelects();
  }
  function updateBooking(id, changes) {
    setBookings(getBookings().map(b => b.id === id ? { ...b, ...changes } : b));
    if (hasRemote()) supabaseRequest(`bookings?id=eq.${encodeURIComponent(id)}`, 'PATCH', changes).catch(error => console.warn('Remote update failed:', error.message));
    renderAll();
  }
  function showBooking(id) {
    const b = getBookings().find(item => item.id === id); if (!b) return; currentBookingId = id;
    document.getElementById('modalContent').innerHTML = `
      <p class="eyebrow">Booking reference ${sanitize(b.id)}</p><h1>${sanitize(b.name)}</h1>
      <div class="detail-grid">
        <div class="detail"><span>Status</span><strong>${sanitize(b.status)}</strong></div><div class="detail"><span>Priority</span><strong>${sanitize(b.priority || 'Normal')}</strong></div>
        <div class="detail"><span>Phone</span><strong>${sanitize(b.phone)}</strong></div><div class="detail"><span>Email</span><strong>${sanitize(b.email)}</strong></div>
        <div class="detail"><span>Preferred Communication</span><strong>${sanitize(b.preferredCommunication || 'WhatsApp')}</strong></div><div class="detail"><span>Alternative Contact</span><strong>${sanitize(b.altContact || 'Not supplied')}</strong></div>
        <div class="detail"><span>Event Type</span><strong>${sanitize(b.eventType)}</strong></div><div class="detail"><span>Event Date</span><strong>${dateShort(b.eventDate)}</strong></div>
        <div class="detail"><span>Guests</span><strong>${sanitize(b.guests)}</strong></div><div class="detail"><span>Location</span><strong>${sanitize(b.location)}</strong></div>
        <div class="detail"><span>Package</span><strong>${sanitize(b.package)}</strong></div><div class="detail"><span>Budget</span><strong>${sanitize(b.budget)}</strong></div>
        <div class="detail"><span>Quote</span><strong>${b.quoteAmount ? money(b.quoteAmount) : 'Not quoted'}</strong></div>
        <div class="detail full"><span>Client Message</span><strong>${sanitize(b.message)}</strong></div>
      </div>
      <label style="margin-top:18px">Admin notes<textarea id="modalNotes" rows="4">${sanitize(b.notes)}</textarea></label>
      <div class="row-actions" style="margin-top:14px"><button class="btn btn-gold" id="saveNotesBtn">Save Notes</button><button class="btn btn-outline" id="modalWhatsappBtn">WhatsApp Client</button></div>`;
    document.getElementById('bookingModal').classList.remove('hidden');
  }
  function bookingWhatsapp(b) {
    const quoteLine = b.quoteAmount ? ` Your current estimated quote is ${money(b.quoteAmount)}.` : '';
    const msg = encodeURIComponent(`Hello ${b.name}, thank you for contacting Events with Nick regarding your ${b.eventType}. We received your request for ${dateShort(b.eventDate)}.${quoteLine} Your reference is ${b.id}.`);
    const phone = String(b.phone || '').replace(/\D/g, '').replace(/^0/, '27');
    return `https://wa.me/${phone}?text=${msg}`;
  }
  function initBookingControls() {
    document.getElementById('bookingSearch').addEventListener('input', renderBookings);
    document.getElementById('statusFilter').addEventListener('change', renderBookings);
    document.getElementById('bookingTable').addEventListener('change', e => { const id = e.target.dataset.id; if (e.target.dataset.action === 'status') updateBooking(id, { status: e.target.value }); if (e.target.dataset.action === 'quote') { const amount = e.target.value === '' ? null : e.target.value; updateBooking(id, { quoteAmount: amount }); } });
    document.getElementById('bookingTable').addEventListener('blur', e => { if (e.target.dataset.action === 'quote') { const amount = e.target.value === '' ? null : e.target.value; updateBooking(e.target.dataset.id, { quoteAmount: amount }); } }, true);
    document.getElementById('bookingTable').addEventListener('click', e => { const action = e.target.dataset.action; const id = e.target.dataset.id; if (!action) return; const bookings = getBookings(); const booking = bookings.find(b => b.id === id); if (action === 'view') showBooking(id); if (action === 'delete' && confirm('Delete this booking?')) { setBookings(bookings.filter(b => b.id !== id)); if (hasRemote()) supabaseRequest(`bookings?id=eq.${encodeURIComponent(id)}`, 'DELETE').catch(error => console.warn('Remote delete failed:', error.message)); renderAll(); } if (action === 'whatsapp' && booking) window.open(bookingWhatsapp(booking), '_blank'); });
    document.getElementById('addSampleBtn').addEventListener('click', () => { const sample = { id: `EWN-${Date.now().toString().slice(-6)}`, dateCreated: new Date().toISOString(), name: 'New Client', phone: '076 000 0000', email: 'client@example.com', preferredCommunication: 'WhatsApp', altContact: '', eventType: 'Wedding', eventDate: '2026-09-20', location: 'Tzaneen', guests: '120', package: 'Signature Experience', budget: 'R25 000 - R40 000', message: 'I need decor and coordination support.', status: 'New', priority: 'Normal', notes: '', quoteAmount: null, assignedTo: 'Nick' }; setBookings([sample, ...getBookings()]); if (hasRemote()) supabaseRequest('bookings', 'POST', sample).catch(error => console.warn('Remote insert failed:', error.message)); renderAll(); });
  }
  function initModal() {
    document.getElementById('closeModal').addEventListener('click', () => document.getElementById('bookingModal').classList.add('hidden'));
    document.getElementById('bookingModal').addEventListener('click', e => { if (e.target.id === 'bookingModal') e.currentTarget.classList.add('hidden'); });
    document.getElementById('bookingModal').addEventListener('click', e => { if (e.target.id === 'saveNotesBtn') { updateBooking(currentBookingId, { notes: document.getElementById('modalNotes').value }); document.getElementById('bookingModal').classList.add('hidden'); } if (e.target.id === 'modalWhatsappBtn') { const b = getBookings().find(item => item.id === currentBookingId); if (b) window.open(bookingWhatsapp(b), '_blank'); } });
  }

  function getPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert('The PDF tool is still loading. Please check your internet connection and try again.');
      return null;
    }
    return new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
  }
  function addWrappedText(doc, text, x, y, width, lineHeight = 6) {
    const lines = doc.splitTextToSize(String(text || ''), width);
    doc.text(lines, x, y);
    return y + (lines.length * lineHeight);
  }
  let logoDataUrlPromise = null;
  function getLogoDataUrl() {
    if (logoDataUrlPromise) return logoDataUrlPromise;
    logoDataUrlPromise = new Promise(resolve => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || 420;
          canvas.height = img.naturalHeight || 420;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/png'));
        } catch (error) {
          console.warn('Could not prepare PDF logo:', error.message);
          resolve('');
        }
      };
      img.onerror = () => resolve('');
      img.src = 'assets/img/logo.png';
    });
    return logoDataUrlPromise;
  }
  function pdfSafe(value, fallback = '') { return String(value || fallback || ''); }
  function quoteReference(data) {
    const base = data.bookingId || `EWN-${Date.now().toString().slice(-6)}`;
    return `QT-${base.replace(/^QT-/i, '')}`;
  }
  function addLogoWatermark(doc, logoDataUrl) {
    try {
      if (logoDataUrl && doc.GState && doc.setGState) {
        doc.setGState(new doc.GState({ opacity: 0.055 }));
        doc.addImage(logoDataUrl, 'PNG', 58, 86, 94, 94);
        doc.setGState(new doc.GState({ opacity: 1 }));
        return;
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(32);
      doc.setTextColor(244, 238, 224);
      doc.text('EVENTS WITH NICK', 105, 148, { align: 'center', angle: 35 });
      doc.setTextColor(0, 0, 0);
    } catch (error) {
      console.warn('Watermark skipped:', error.message);
      doc.setTextColor(0, 0, 0);
    }
  }
  function addPdfFooter(doc, business, pageNo = 1) {
    doc.setDrawColor(216, 177, 90);
    doc.setLineWidth(0.15);
    doc.line(14, 282, 196, 282);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(80, 72, 57);
    const legal = [business.legal || business.name || 'Events with Nick Pty (Ltd)', business.registrationNumber ? `Reg: ${business.registrationNumber}` : '', business.vatNumber ? `VAT: ${business.vatNumber}` : ''].filter(Boolean).join(' • ');
    const contact = [business.phone1, business.phone2, business.email].filter(Boolean).join(' | ');
    doc.text(legal, 14, 287);
    doc.text(contact, 14, 291);
    doc.text(`Page ${pageNo}`, 196, 291, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  async function pdfHeader(doc, title, meta = {}) {
    const business = read(keys.settings, defaults.business || {});
    const logoDataUrl = await getLogoDataUrl();
    addLogoWatermark(doc, logoDataUrl);
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, 'PNG', 14, 10, 24, 24); } catch (error) { console.warn('Header logo skipped:', error.message); }
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(pdfSafe(business.name, 'Events with Nick'), 42, 15);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(pdfSafe(business.legal, 'Events with Nick Pty (Ltd)'), 42, 21);
    const legalLine = [business.registrationNumber ? `Reg: ${business.registrationNumber}` : '', business.vatNumber ? `VAT: ${business.vatNumber}` : ''].filter(Boolean).join(' • ');
    if (legalLine) doc.text(legalLine, 42, 26);
    const contactLine = [business.phone1, business.phone2, business.email].filter(Boolean).join(' | ');
    doc.text(contactLine, 42, legalLine ? 31 : 27);
    doc.text(pdfSafe(business.businessAddress || business.location), 42, legalLine ? 36 : 32);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title, 196, 17, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (meta.ref) doc.text(`Reference: ${meta.ref}`, 196, 25, { align: 'right' });
    if (meta.generatedAt) doc.text(`Generated: ${meta.generatedAt}`, 196, 31, { align: 'right' });
    doc.setDrawColor(216, 177, 90);
    doc.setLineWidth(0.35);
    doc.line(14, 43, 196, 43);
    addPdfFooter(doc, business, 1);
    return { business, logoDataUrl };
  }
  function ensurePdfSpace(doc, y, needed, headerInfo) {
    if (y + needed <= 270) return y;
    doc.addPage();
    addLogoWatermark(doc, headerInfo.logoDataUrl);
    addPdfFooter(doc, headerInfo.business, doc.getNumberOfPages());
    return 20;
  }
  function addInfoBox(doc, title, rows, x, y, w) {
    doc.setDrawColor(216, 177, 90);
    doc.setFillColor(250, 246, 235);
    doc.roundedRect(x, y, w, 10 + rows.length * 6, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(35, 28, 17);
    doc.text(title, x + 4, y + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    rows.forEach((row, index) => doc.text(row, x + 4, y + 14 + (index * 6)));
    doc.setTextColor(0, 0, 0);
    return y + 12 + rows.length * 6;
  }

  function optionTag(item, selected) { return `<option value="${sanitize(item.id)}" ${selected ? 'selected' : ''}>${sanitize(item.label)} — ${money(item.amount)}</option>`; }
  function getItem(list, id) { return (list || []).find(item => item.id === id) || (list || [])[0] || { label: 'Not set', amount: 0 }; }
  function populateQuoteSelects() {
    const pricing = getPricing();
    const serviceSelect = document.getElementById('serviceLevelSelect');
    const decorSelect = document.getElementById('decorLevelSelect');
    const cateringSelect = document.getElementById('cateringSelect');
    const bookingSelect = document.getElementById('quoteBookingSelect');
    if (serviceSelect) serviceSelect.innerHTML = (pricing.serviceLevels || []).map((item, i) => optionTag(item, i === 1)).join('');
    if (decorSelect) decorSelect.innerHTML = (pricing.decorLevels || []).map((item, i) => optionTag(item, i === 1)).join('');
    if (cateringSelect) cateringSelect.innerHTML = (pricing.cateringOptions || []).map((item, i) => optionTag(item, i === 0)).join('');
    if (bookingSelect) {
      const current = bookingSelect.value;
      bookingSelect.innerHTML = '<option value="">Do not attach to a booking</option>' + getBookings().map(b => `<option value="${sanitize(b.id)}">${sanitize(b.name)} • ${sanitize(b.eventType)} • ${dateShort(b.eventDate)}</option>`).join('');
      bookingSelect.value = current;
    }
  }
  function initQuoteBuilder() {
    populateQuoteSelects();
    document.getElementById('quoteBookingSelect').addEventListener('change', e => {
      const b = getBookings().find(item => item.id === e.target.value); if (!b) return;
      const form = document.getElementById('quoteForm');
      form.client.value = b.name || '';
      form.phone.value = b.phone || '';
      form.email.value = b.email || '';
      form.preferredCommunication.value = b.preferredCommunication || 'WhatsApp';
      form.eventDate.value = b.eventDate || '';
      form.eventType.value = b.eventType || 'Wedding';
      form.location.value = b.location || '';
      form.package.value = b.package || '';
      form.guests.value = b.guests || 100;
      form.budget.value = b.budget || '';
      form.clientMessage.value = b.message || '';
      form.notes.value = `Booking ref: ${b.id}. ${b.message || ''}`;
    });
    document.getElementById('quoteForm').addEventListener('submit', event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      data.generatedAt = new Date().toLocaleString('en-ZA');
      data.quoteRef = quoteReference(data);
      const pricing = getPricing();
      const service = getItem(pricing.serviceLevels, data.level);
      const decor = getItem(pricing.decorLevels, data.decor);
      const catering = getItem(pricing.cateringOptions, data.catering);
      const guests = Number(data.guests || 0);
      const guestCoordination = Math.round(guests * Number(pricing.perGuestCoordination || 0));
      const extras = (pricing.extras || []).filter(item => item.enabled !== false);
      const extrasTotal = extras.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      const adjustment = Number(data.adjustment || 0);
      const deposit = Number(data.deposit || 0);
      const total = Number(service.amount || 0) + Number(decor.amount || 0) + Number(catering.amount || 0) + guestCoordination + extrasTotal + adjustment;
      const banking = getBanking();
      const business = read(keys.settings, defaults.business || {});
      const hasBanking = banking.bankName || banking.accountNumber || banking.accountName;
      lastQuoteText = [
        `${business.legal || business.name || 'Events with Nick Pty (Ltd)'} — Official quotation`,
        business.registrationNumber ? `Registration number: ${business.registrationNumber}` : '',
        business.vatNumber ? `VAT number: ${business.vatNumber}` : '',
        `Quotation ref: ${data.quoteRef}`,
        `Generated: ${data.generatedAt}`,
        '',
        'CLIENT DETAILS',
        `Client: ${data.client}`,
        `Phone: ${data.phone || 'Not supplied'}`,
        `Email: ${data.email || 'Not supplied'}`,
        `Preferred communication: ${data.preferredCommunication || 'WhatsApp'}`,
        '',
        'BOOKING DETAILS',
        data.bookingId ? `Booking ref: ${data.bookingId}` : '',
        `Event: ${data.eventType}`,
        `Event date: ${data.eventDate || 'To be confirmed'}`,
        `Location: ${data.location || 'To be confirmed'}`,
        `Guests: ${guests}`,
        `Package: ${data.package || 'Custom quote'}`,
        `Budget range: ${data.budget || 'Not supplied'}`,
        data.clientMessage ? `Client request: ${data.clientMessage}` : '',
        '',
        'QUOTE BREAKDOWN',
        `Service: ${service.label} - ${money(service.amount)}`,
        `Decor: ${decor.label} - ${money(decor.amount)}`,
        `Catering: ${catering.label} - ${money(catering.amount)}`,
        `Guest coordination: ${money(guestCoordination)}`,
        ...extras.map(item => `${item.label}: ${money(item.amount)}`),
        adjustment ? `Adjustment: ${money(adjustment)}` : '',
        `Estimated total: ${money(total)}`,
        deposit ? `Deposit required: ${money(deposit)}` : '',
        data.notes ? `Admin notes: ${data.notes}` : '',
        hasBanking ? '' : '',
        hasBanking ? 'PAYMENT DETAILS' : '',
        hasBanking && banking.accountName ? `Account holder: ${banking.accountName}` : '',
        hasBanking && banking.bankName ? `Bank: ${banking.bankName}` : '',
        hasBanking && banking.accountNumber ? `Account number: ${banking.accountNumber}` : '',
        hasBanking && banking.accountType ? `Account type: ${banking.accountType}` : '',
        hasBanking && banking.branchCode ? `Branch code: ${banking.branchCode}` : '',
        hasBanking && banking.referenceFormat ? `Reference: ${banking.referenceFormat}` : '',
        hasBanking && banking.paymentNote ? `Note: ${banking.paymentNote}` : '',
        '',
        'This quotation is prepared for consultation and confirmation by Events with Nick.'
      ].filter(Boolean).join('\n');
      const whatsappReady = data.phone ? '' : '<p class="danger-note">Client phone number is missing. Add it before sending by WhatsApp.</p>';
      const emailReady = data.email ? '' : '<p class="danger-note">Client email is missing. Add it before opening an email draft.</p>';
      document.getElementById('quotePreview').innerHTML = `
        <h2>Official quote preview</h2>
        <p><strong>${sanitize(data.client)}</strong> • ${sanitize(data.eventType)} • ${guests} guests</p>
        <p class="quote-meta"><span>${sanitize(data.quoteRef)} • Generated ${sanitize(data.generatedAt)}</span></p>
        <div class="client-summary">
          <span><strong>Phone:</strong> ${sanitize(data.phone || 'Not supplied')}</span>
          <span><strong>Email:</strong> ${sanitize(data.email || 'Not supplied')}</span>
          <span><strong>Preferred:</strong> ${sanitize(data.preferredCommunication || 'WhatsApp')}</span>
          <span><strong>Date:</strong> ${sanitize(data.eventDate || 'To be confirmed')}</span>
          <span><strong>Location:</strong> ${sanitize(data.location || 'To be confirmed')}</span>
          <span><strong>Package:</strong> ${sanitize(data.package || 'Custom quote')}</span>
        </div>
        <div class="quote-total">${money(total)}</div>
        <div class="quote-lines">
          <div><span>${sanitize(service.label)}</span><strong>${money(service.amount)}</strong></div>
          <div><span>${sanitize(decor.label)}</span><strong>${money(decor.amount)}</strong></div>
          <div><span>${sanitize(catering.label)}</span><strong>${money(catering.amount)}</strong></div>
          <div><span>Guest coordination estimate</span><strong>${money(guestCoordination)}</strong></div>
          ${extras.map(item => `<div><span>${sanitize(item.label)}</span><strong>${money(item.amount)}</strong></div>`).join('')}
          ${adjustment ? `<div><span>Adjustment</span><strong>${money(adjustment)}</strong></div>` : ''}
          ${deposit ? `<div><span>Deposit required</span><strong>${money(deposit)}</strong></div>` : ''}
        </div>
        <p>${sanitize(data.notes || 'No extra notes added.')}</p>
        ${hasBanking ? `<div class="quote-meta"><strong>Payment details included on quote:</strong><span>${sanitize(banking.bankName || 'Bank not set')} • ${sanitize(banking.accountNumber || 'Account number not set')}</span><span>${sanitize(banking.referenceFormat || '')}</span></div>` : '<p class="danger-note">Banking details are not completed yet. Add them under Banking Details before sending official quotations.</p>'}
        ${whatsappReady}${emailReady}
        <div class="row-actions"><button class="btn btn-outline" id="copyQuoteBtn" type="button">Copy Quote Text</button><button class="btn btn-outline" id="downloadQuotePdfBtn" type="button">Download Official PDF</button><button class="btn btn-outline" id="sendQuoteWhatsappBtn" type="button">Send via WhatsApp</button><button class="btn btn-outline" id="sendQuoteEmailBtn" type="button">Open Email Draft</button>${data.bookingId ? '<button class="btn btn-gold" id="saveQuoteToBookingBtn" type="button">Save to Booking</button>' : ''}</div>
        <p class="backup-note">For WhatsApp or email, download the PDF first and attach it manually unless automatic email/WhatsApp integration is added later.</p>`;
      if (data.bookingId) {
        document.getElementById('saveQuoteToBookingBtn').addEventListener('click', () => { updateBooking(data.bookingId, { quoteAmount: total, status: 'Quoted' }); alert('Quote saved to booking and status changed to Quoted.'); });
      }
      document.getElementById('copyQuoteBtn').addEventListener('click', () => navigator.clipboard.writeText(lastQuoteText));
      document.getElementById('downloadQuotePdfBtn').addEventListener('click', () => downloadQuotePdf({ data, service, decor, catering, guestCoordination, extras, adjustment, deposit, total, banking }));
      document.getElementById('sendQuoteWhatsappBtn').addEventListener('click', () => {
        if (!data.phone) return alert('Add the client phone number first.');
        const phone = String(data.phone || '').replace(/\D/g, '').replace(/^0/, '27');
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(lastQuoteText)}`, '_blank');
      });
      document.getElementById('sendQuoteEmailBtn').addEventListener('click', () => {
        if (!data.email) return alert('Add the client email address first.');
        const subject = encodeURIComponent(`Events with Nick Quotation ${data.quoteRef}`);
        const body = encodeURIComponent(lastQuoteText + '\n\nPlease find the quotation details above. The official PDF can be attached after download.');
        window.location.href = `mailto:${data.email}?subject=${subject}&body=${body}`;
      });
    });
  }

  async function downloadQuotePdf(payload) {
    const doc = getPdf(); if (!doc) return;
    const { data, service, decor, catering, guestCoordination, extras, adjustment, deposit, total, banking } = payload;
    const headerInfo = await pdfHeader(doc, 'OFFICIAL QUOTATION', { ref: data.quoteRef, generatedAt: data.generatedAt });
    let y = 52;
    const clientRows = [
      `Name: ${data.client || 'Not supplied'}`,
      `Phone: ${data.phone || 'Not supplied'}`,
      `Email: ${data.email || 'Not supplied'}`,
      `Preferred communication: ${data.preferredCommunication || 'WhatsApp'}`
    ];
    const bookingRows = [
      `Booking ref: ${data.bookingId || 'Manual quote'}`,
      `Event: ${data.eventType || 'Not supplied'}`,
      `Date: ${data.eventDate || 'To be confirmed'}`,
      `Location: ${data.location || 'To be confirmed'}`,
      `Guests: ${data.guests || 'Not supplied'}`,
      `Package: ${data.package || 'Custom quote'}`,
      `Budget: ${data.budget || 'Not supplied'}`
    ];
    addInfoBox(doc, 'Client details', clientRows, 14, y, 86);
    addInfoBox(doc, 'Booking details', bookingRows, 106, y, 90);
    y += 64;
    if (data.clientMessage) {
      y = ensurePdfSpace(doc, y, 24, headerInfo);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Client request', 14, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      y = addWrappedText(doc, data.clientMessage, 14, y, 178, 5) + 4;
    }
    y = ensurePdfSpace(doc, y, 80, headerInfo);
    doc.setFillColor(16, 12, 7); doc.setDrawColor(216, 177, 90);
    doc.roundedRect(14, y, 182, 12, 3, 3, 'FD');
    doc.setTextColor(255, 247, 231); doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('Quotation breakdown', 18, y + 8);
    y += 18;
    doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    const lines = [
      [service.label, service.amount],
      [decor.label, decor.amount],
      [catering.label, catering.amount],
      ['Guest coordination estimate', guestCoordination],
      ...extras.map(item => [item.label, item.amount])
    ];
    if (adjustment) lines.push(['Adjustment', adjustment]);
    lines.forEach(([label, amount]) => {
      y = ensurePdfSpace(doc, y, 8, headerInfo);
      doc.text(String(label || ''), 18, y);
      doc.text(money(amount), 188, y, { align: 'right' });
      y += 7;
    });
    doc.setDrawColor(216, 177, 90); doc.line(14, y, 196, y); y += 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
    doc.text('Estimated Total', 14, y);
    doc.text(money(total), 188, y, { align: 'right' }); y += 10;
    if (deposit) { doc.setFontSize(11); doc.text(`Deposit required: ${money(deposit)}`, 14, y); y += 9; }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    if (data.notes) { y = ensurePdfSpace(doc, y, 24, headerInfo); y = addWrappedText(doc, `Notes: ${data.notes}`, 14, y, 178, 5) + 5; }
    if (banking && (banking.bankName || banking.accountNumber || banking.accountName)) {
      y = ensurePdfSpace(doc, y, 48, headerInfo);
      doc.setFillColor(250, 246, 235); doc.setDrawColor(216, 177, 90);
      doc.roundedRect(14, y, 182, 38, 3, 3, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Payment details', 18, y + 7);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
      const bankLines = [
        banking.accountName ? `Account holder: ${banking.accountName}` : '',
        banking.bankName ? `Bank: ${banking.bankName}` : '',
        banking.accountNumber ? `Account number: ${banking.accountNumber}` : '',
        banking.accountType ? `Account type: ${banking.accountType}` : '',
        banking.branchCode ? `Branch code: ${banking.branchCode}` : '',
        banking.referenceFormat ? `Reference: ${banking.referenceFormat}` : '',
        banking.paymentNote ? `Note: ${banking.paymentNote}` : ''
      ].filter(Boolean);
      let by = y + 14;
      bankLines.forEach(line => { by = addWrappedText(doc, line, 18, by, 170, 4.5) + 1; });
      y += 44;
    }
    y = ensurePdfSpace(doc, y, 28, headerInfo);
    doc.setFont('helvetica', 'italic'); doc.setFontSize(8.5);
    y = addWrappedText(doc, 'This quotation is prepared for consultation and confirmation by Events with Nick. Final pricing may change after venue inspection, supplier confirmation, transport/logistics and final client requirements.', 14, y, 178, 4.5);
    doc.save(`events-with-nick-quotation-${String(data.quoteRef || data.client || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`);
  }

  function renderPricingForm() {
    const pricing = getPricing();
    const form = document.getElementById('pricingForm');
    form.innerHTML = `
      <h3>Service levels</h3>${(pricing.serviceLevels || []).map((item, i) => priceRow('serviceLevels', item, i)).join('')}
      <h3>Decor levels</h3>${(pricing.decorLevels || []).map((item, i) => priceRow('decorLevels', item, i)).join('')}
      <h3>Catering support</h3>${(pricing.cateringOptions || []).map((item, i) => priceRow('cateringOptions', item, i)).join('')}
      <h3>Extra charges</h3>${(pricing.extras || []).map((item, i) => priceRow('extras', item, i, true)).join('')}
      <h3>Guest calculation</h3><div class="price-row single"><label>Per guest coordination amount<input data-price-field="perGuestCoordination" type="number" value="${Number(pricing.perGuestCoordination || 0)}" /></label></div>`;
  }
  function priceRow(group, item, index, hasEnabled) {
    return `<div class="price-row"><label>Label<input data-price-group="${group}" data-price-index="${index}" data-price-prop="label" value="${sanitize(item.label)}" /></label><label>Amount<input data-price-group="${group}" data-price-index="${index}" data-price-prop="amount" type="number" value="${Number(item.amount || 0)}" /></label>${hasEnabled ? `<label>Use in quotes<select data-price-group="${group}" data-price-index="${index}" data-price-prop="enabled"><option value="true" ${item.enabled !== false ? 'selected' : ''}>Yes</option><option value="false" ${item.enabled === false ? 'selected' : ''}>No</option></select></label>` : ''}</div>`;
  }
  function initPricing() {
    renderPricingForm();
    document.getElementById('savePricingBtn').addEventListener('click', () => {
      const pricing = getPricing();
      document.querySelectorAll('[data-price-group]').forEach(input => {
        const group = input.dataset.priceGroup; const index = Number(input.dataset.priceIndex); const prop = input.dataset.priceProp;
        if (!pricing[group] || !pricing[group][index]) return;
        if (prop === 'amount') pricing[group][index][prop] = Number(input.value || 0);
        else if (prop === 'enabled') pricing[group][index][prop] = input.value === 'true';
        else pricing[group][index][prop] = input.value;
      });
      const perGuest = document.querySelector('[data-price-field="perGuestCoordination"]');
      pricing.perGuestCoordination = Number(perGuest.value || 0);
      setPricing(pricing); populateQuoteSelects();
      upsertRemote('quote_pricing', { id: 'main', pricing, updated_at: new Date().toISOString() });
      document.getElementById('pricingSaved').textContent = 'Price settings saved. Quote builder will now use the updated prices.';
    });
    document.getElementById('resetPricingBtn').addEventListener('click', () => { if (!confirm('Reset prices to default?')) return; setPricing(defaults.quotePricing || {}); renderPricingForm(); populateQuoteSelects(); document.getElementById('pricingSaved').textContent = 'Default prices restored.'; });
  }

  function renderSettingsForm() {
    const form = document.getElementById('settingsForm');
    if (!form) return;
    const settings = read(keys.settings, defaults.business || {});
    [...form.elements].forEach(el => { if (el.name && settings[el.name] !== undefined) el.value = settings[el.name]; });
  }
  function initSettings() {
    const form = document.getElementById('settingsForm');
    renderSettingsForm();
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      write(keys.settings, data);
      upsertRemote('site_settings', { id: 'main', settings: data, updated_at: new Date().toISOString() });
      document.getElementById('settingsSaved').textContent = hasRemote() ? 'Website details saved locally and to Supabase.' : 'Website details saved. Refresh the public website to see changes.';
    });
  }
  function renderBankingForm() {
    const form = document.getElementById('bankingForm');
    if (!form) return;
    const banking = getBanking();
    [...form.elements].forEach(el => { if (el.name && banking[el.name] !== undefined) el.value = banking[el.name]; });
  }
  function initBanking() {
    renderBankingForm();
    const form = document.getElementById('bankingForm');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      setBanking(data);
      upsertRemote('banking_details', { id: 'main', banking: data, updated_at: new Date().toISOString() });
      document.getElementById('bankingSaved').textContent = hasRemote() ? 'Banking details saved locally and to Supabase.' : 'Banking details saved. Quote PDF and quote text will use these details.';
    });
  }
  function renderGallery() {
    const gallery = read(keys.gallery, defaults.gallery || []);
    document.getElementById('adminGallery').innerHTML = gallery.map((item, index) => `<article class="gallery-admin-card"><div class="thumb" style="background-image:url('${sanitize(item.image)}')"></div><div><h3>${sanitize(item.title)}</h3><p>${sanitize(item.category)}</p><button class="icon-btn" data-gallery-delete="${index}">Remove</button></div></article>`).join('');
  }
  function initGallery() {
    document.getElementById('galleryForm').addEventListener('submit', event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      const gallery = read(keys.gallery, defaults.gallery || []);
      gallery.unshift(data); write(keys.gallery, gallery);
      if (hasRemote()) supabaseRequest('gallery_items', 'POST', data).catch(error => console.warn('Remote gallery insert failed:', error.message));
      event.currentTarget.reset(); renderGallery();
    });
    document.getElementById('adminGallery').addEventListener('click', e => {
      const index = e.target.dataset.galleryDelete; if (index === undefined) return;
      const gallery = read(keys.gallery, defaults.gallery || []);
      const item = gallery[Number(index)];
      gallery.splice(Number(index), 1); write(keys.gallery, gallery);
      if (hasRemote() && item && item.id) supabaseRequest(`gallery_items?id=eq.${encodeURIComponent(item.id)}`, 'DELETE').catch(error => console.warn('Remote gallery delete failed:', error.message));
      renderGallery();
    });
  }
  function exportCsv() {
    const bookings = getBookings(); const headers = ['id','dateCreated','name','phone','email','preferredCommunication','altContact','eventType','eventDate','location','guests','package','budget','message','status','priority','notes','quoteAmount'];
    const rows = [headers.join(',')].concat(bookings.map(b => headers.map(h => `"${String(b[h] || '').replace(/"/g, '""')}"`).join(',')));
    downloadFile(rows.join('\n'), 'events-with-nick-bookings.csv', 'text/csv');
  }
  async function exportBookingsPdf() {
    const doc = getPdf(); if (!doc) return;
    const bookings = getBookings();
    const generatedAt = new Date().toLocaleString('en-ZA');
    const headerInfo = await pdfHeader(doc, 'BOOKING RECORDS', { ref: `REPORT-${Date.now().toString().slice(-6)}`, generatedAt });
    let y = 54;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(`Exported: ${generatedAt}`, 14, y); y += 8;
    if (!bookings.length) { doc.text('No booking records available.', 14, y); doc.save('events-with-nick-bookings-report.pdf'); return; }
    bookings.forEach((b, index) => {
      y = ensurePdfSpace(doc, y, 34, headerInfo);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
      doc.text(`${index + 1}. ${b.id || ''} - ${b.name || ''}`, 14, y); y += 6;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9.2);
      const line = `${b.eventType || ''} | ${dateShort(b.eventDate)} | Guests: ${b.guests || ''} | Status: ${b.status || ''} | Quote: ${b.quoteAmount ? money(b.quoteAmount) : 'Not quoted'}`;
      y = addWrappedText(doc, line, 16, y, 175, 4.8) + 1;
      y = addWrappedText(doc, `Phone: ${b.phone || ''} | Email: ${b.email || ''} | Preferred: ${b.preferredCommunication || 'WhatsApp'} | Location: ${b.location || ''}`, 16, y, 175, 4.8) + 1;
      y = addWrappedText(doc, `Package: ${b.package || ''} | Budget: ${b.budget || ''}`, 16, y, 175, 4.8) + 1;
      if (b.message) y = addWrappedText(doc, `Client request: ${b.message}`, 16, y, 175, 4.8) + 1;
      if (b.notes) y = addWrappedText(doc, `Admin notes: ${b.notes}`, 16, y, 175, 4.8) + 2;
      y += 3;
      doc.setDrawColor(216, 177, 90); doc.setLineWidth(0.1); doc.line(14, y, 196, y); y += 5;
    });
    doc.save('events-with-nick-bookings-report.pdf');
  }
  function downloadFile(content, filename, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
  function initBackup() {
    document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);
    document.getElementById('downloadBookingsPdfBtn').addEventListener('click', () => exportBookingsPdf());
    document.getElementById('downloadJsonBtn').addEventListener('click', () => { const backup = { exportedAt: new Date().toISOString(), settings: read(keys.settings, defaults.business || {}), services: read(keys.services, defaults.services || []), packages: read(keys.packages, defaults.packages || []), quotePricing: getPricing(), banking: getBanking(), gallery: read(keys.gallery, defaults.gallery || []), bookings: getBookings() }; downloadFile(JSON.stringify(backup, null, 2), 'events-with-nick-full-backup.json', 'application/json'); });
    document.getElementById('resetDemoBtn').addEventListener('click', () => { if (!confirm('Reset all presentation data to default?')) return; write(keys.settings, defaults.business || {}); write(keys.services, defaults.services || []); write(keys.gallery, defaults.gallery || []); write(keys.packages, defaults.packages || []); write(keys.quotePricing, defaults.quotePricing || {}); write(keys.banking, defaults.banking || {}); write(keys.bookings, defaults.sampleBookings || []); location.reload(); });
  }
  function renderAll() { renderMetrics(); renderRecent(); renderPipeline(); renderBookings(); renderGallery(); renderPricingForm(); renderSettingsForm(); renderBankingForm(); populateQuoteSelects(); }

  initDefaults(); initLogin(); initTabs(); initBookingControls(); initModal(); initQuoteBuilder(); initPricing(); initSettings(); initBanking(); initGallery(); initBackup(); checkAuth();
})();
