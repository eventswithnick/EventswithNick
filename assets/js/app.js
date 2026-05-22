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
    bookings: 'ewn_bookings_v7'
  };

  function read(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn('Storage read failed:', key, error);
      return fallback;
    }
  }
  function write(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function initDefaults() {
    if (!localStorage.getItem(keys.settings)) write(keys.settings, defaults.business || {});
    if (!localStorage.getItem(keys.services)) write(keys.services, defaults.services || []);
    if (!localStorage.getItem(keys.gallery)) write(keys.gallery, defaults.gallery || []);
    if (!localStorage.getItem(keys.packages)) write(keys.packages, defaults.packages || []);
    if (!localStorage.getItem(keys.quotePricing)) write(keys.quotePricing, defaults.quotePricing || {});
    if (!localStorage.getItem(keys.banking)) write(keys.banking, defaults.banking || {});
    if (!localStorage.getItem(keys.bookings)) write(keys.bookings, defaults.sampleBookings || []);
  }
  function sanitize(text) { return String(text || '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char])); }
  function waNumber(settings) { return String(settings.whatsapp || settings.phone1 || '').replace(/\D/g, '').replace(/^0/, '27'); }
  function createBookingId() { return `EWN-${Date.now().toString().slice(-6)}`; }

  async function supabaseRequest(path, method = 'GET', body, prefer = 'return=representation') {
    if (backend.provider !== 'supabase' || !backend.supabaseUrl || !backend.supabaseAnonKey) return null;
    const headers = {
      apikey: backend.supabaseAnonKey,
      Authorization: `Bearer ${backend.supabaseAnonKey}`,
      'Content-Type': 'application/json'
    };
    if (prefer) headers.Prefer = prefer;
    const response = await fetch(`${backend.supabaseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`Supabase request failed: ${response.status} ${text}`);
    return text ? JSON.parse(text) : [];
  }

  function hasRemote() { return backend.provider === 'supabase' && backend.supabaseUrl && backend.supabaseAnonKey; }
  async function saveBooking(booking) {
    const bookings = read(keys.bookings, []);
    write(keys.bookings, [booking, ...bookings]);
    if (!hasRemote()) return true;
    try {
      await supabaseRequest('bookings', 'POST', booking, 'return=minimal');
      return true;
    } catch (error) {
      console.warn('Remote booking save failed:', error.message);
      return false;
    }
  }
  async function refreshRemotePublicConfig() {
    if (backend.provider !== 'supabase' || !backend.supabaseUrl || !backend.supabaseAnonKey) return;
    try {
      const siteRows = await supabaseRequest('site_settings?id=eq.main&select=settings');
      if (Array.isArray(siteRows) && siteRows[0] && siteRows[0].settings) write(keys.settings, siteRows[0].settings);
      const galleryRows = await supabaseRequest('gallery_items?select=id,title,category,image&order=created_at.desc');
      if (Array.isArray(galleryRows) && galleryRows.length) write(keys.gallery, galleryRows);
    } catch (error) {
      console.warn('Remote public config skipped or failed:', error.message);
    }
  }

  function setBusinessDetails(settings) {
    const items = {
      heroTitle: settings.heroTitle || defaults.business.heroTitle,
      heroText: settings.heroText || defaults.business.heroText,
      businessSlogan: settings.slogan || defaults.business.slogan,
      aboutText: settings.aboutText || defaults.business.aboutText,
      footerTagline: settings.tagline || defaults.business.tagline,
      footerContact: `${settings.phone1 || ''} | ${settings.phone2 || ''}`,
      footerEmail: settings.email || '',
      footerLocation: settings.location || '',
      footerFacebook: `Facebook: ${settings.facebook || ''}`,
      footerInstagram: `Instagram: ${settings.instagram || ''}`
    };
    Object.entries(items).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });

    const msg = encodeURIComponent('Hello Events with Nick, I would like to enquire about an event booking.');
    const wa = `https://wa.me/${waNumber(settings)}?text=${msg}`;
    const call = `tel:${String(settings.phone1 || '').replace(/\s/g, '')}`;
    const mail = `mailto:${settings.email || ''}?subject=${encodeURIComponent('Event booking enquiry')}`;

    ['heroWhatsApp', 'floatingWhatsApp', 'topWhatsApp', 'waLink'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.href = wa;
    });
    const callLink = document.getElementById('callLink');
    if (callLink) callLink.href = call;
    const mailLink = document.getElementById('mailLink');
    if (mailLink) mailLink.href = mail;
  }

  function renderServices(services) {
    const container = document.getElementById('serviceGrid');
    if (!container) return;
    container.innerHTML = services.map((service, index) => `
      <article class="service-card reveal tilt-card" style="--i:${index}">
        <div class="photo" style="background-image: linear-gradient(rgba(0,0,0,.04), rgba(0,0,0,.55)), url('${sanitize(service.image)}')"></div>
        <div class="service-body">
          <span class="tile-number">0${index + 1}</span>
          <h3>${sanitize(service.title)}</h3>
          <p>${sanitize(service.short)}</p>
          <ul>${(service.items || []).map(item => `<li>${sanitize(item)}</li>`).join('')}</ul>
        </div>
        <div class="service-back"><p>${sanitize(service.description || service.short)}</p><a href="#booking">Enquire now</a></div>
      </article>
    `).join('');
  }

  function renderGallery(gallery) {
    const container = document.getElementById('galleryGrid');
    if (!container) return;
    container.innerHTML = gallery.map((item, index) => `
      <article class="gallery-card reveal tilt-card" style="--i:${index}; background-image: linear-gradient(rgba(0,0,0,.08), rgba(0,0,0,.42)), url('${sanitize(item.image)}')">
        <div><h3>${sanitize(item.title)}</h3><p>${sanitize(item.category)}</p></div>
      </article>
    `).join('');
  }

  function renderPackages(packages) {
    const container = document.getElementById('packageGrid');
    const select = document.getElementById('packageSelect');
    if (container) {
      container.innerHTML = packages.map(pack => `
        <article class="package-card ${pack.featured ? 'featured' : ''} reveal tilt-card">
          <h3>${sanitize(pack.name)}</h3>
          <p>${sanitize(pack.bestFor)}</p>
          <div class="price">${sanitize(pack.price || 'Custom quote')}</div>
          <ul>${(pack.features || []).map(feature => `<li>${sanitize(feature)}</li>`).join('')}</ul>
          <a href="#booking" class="package-cta">Request this package</a>
        </article>
      `).join('');
    }
    if (select) {
      select.innerHTML = packages.map(pack => `<option ${pack.featured ? 'selected' : ''}>${sanitize(pack.name)}</option>`).join('');
    }
  }

  function renderTestimonials(testimonials) {
    const container = document.getElementById('testimonialGrid');
    if (!container) return;
    container.innerHTML = testimonials.map(item => `
      <article class="testimonial-card reveal tilt-card"><p>“${sanitize(item.text)}”</p><strong>${sanitize(item.name)}</strong></article>
    `).join('');
  }

  function bookingMessage(booking) {
    return [
      'Hello Events with Nick, I submitted a booking request:',
      `Name: ${booking.name}`,
      `Phone: ${booking.phone}`,
      `Email: ${booking.email || 'Not supplied'}`,
      `Preferred communication: ${booking.preferredCommunication || 'WhatsApp'}`,
      `Event Type: ${booking.eventType}`,
      `Event Date: ${booking.eventDate}`,
      `Guests: ${booking.guests}`,
      `Location: ${booking.location}`,
      `Package: ${booking.package}`,
      `Budget: ${booking.budget}`,
      booking.altContact ? `Alternative contact / notes: ${booking.altContact}` : '',
      `Message: ${booking.message}`,
      `Booking Ref: ${booking.id}`
    ].filter(Boolean).join('\n');
  }

  function handleBooking(settings) {
    const form = document.getElementById('bookingForm');
    const note = document.getElementById('formNote');
    if (!form) return;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const booking = {
        id: createBookingId(),
        dateCreated: new Date().toISOString(),
        name: data.name,
        phone: data.phone,
        email: data.email,
        preferredCommunication: data.preferredCommunication || 'WhatsApp',
        altContact: data.altContact || '',
        eventType: data.eventType,
        eventDate: data.eventDate,
        guests: data.guests,
        location: data.location,
        package: data.package,
        budget: data.budget,
        message: data.message,
        status: 'New',
        priority: 'Normal',
        notes: '',
        quoteAmount: null,
        assignedTo: 'Nick'
      };
      const savedOnline = await saveBooking(booking);
      const whatsappLink = `https://wa.me/${waNumber(settings)}?text=${encodeURIComponent(bookingMessage(booking))}`;
      if (note) {
        if (hasRemote() && !savedOnline) {
          note.innerHTML = `Your request could not be saved online right now. Please <a href="${whatsappLink}" target="_blank" rel="noopener">send it on WhatsApp</a> or try again in a few minutes.`;
          return;
        }
        note.innerHTML = `Thank you. Your booking reference is <strong>${sanitize(booking.id)}</strong>. <a href="${whatsappLink}" target="_blank" rel="noopener">Send it on WhatsApp now</a>.`;
      }
      form.reset();
    });
  }

  function revealOnScroll() {
    const items = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          animateCount(entry.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach(item => observer.observe(item));
  }

  function animateCount(scope) {
    scope.querySelectorAll('[data-count]').forEach(el => {
      if (el.dataset.done) return;
      el.dataset.done = 'yes';
      const target = Number(el.dataset.count || 0);
      let current = 0;
      const step = Math.max(1, Math.ceil(target / 40));
      const timer = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(timer); }
        el.textContent = current + (target === 100 ? '%' : '');
      }, 22);
    });
  }

  function initMenu() {
    const toggle = document.getElementById('menuToggle');
    const links = document.getElementById('navLinks');
    if (!toggle || !links) return;
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(link => link.addEventListener('click', () => links.classList.remove('open')));
  }

  function initTilt() {
    const cards = document.querySelectorAll('.tilt-card');
    cards.forEach(card => {
      card.addEventListener('mousemove', e => {
        const rect = card.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        card.style.setProperty('--rx', `${(-y * 5).toFixed(2)}deg`);
        card.style.setProperty('--ry', `${(x * 5).toFixed(2)}deg`);
      });
      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  }

  async function boot() {
    initDefaults();
    await refreshRemotePublicConfig();
    const settings = read(keys.settings, defaults.business || {});
    const services = read(keys.services, defaults.services || []);
    const gallery = read(keys.gallery, defaults.gallery || []);
    const packages = read(keys.packages, defaults.packages || []);

    setBusinessDetails(settings);
    renderServices(services);
    renderGallery(gallery);
    renderPackages(packages);
    renderTestimonials(defaults.testimonials || []);
    initMenu();
    handleBooking(settings);
    revealOnScroll();
    initTilt();
  }
  boot();
})();
