window.EWN_DEFAULTS = {
  version: 'official-v7-secure-admin',
  adminPassword: 'nick2026',
  business: {
    name: 'Events with Nick',
    legal: 'Events with Nick Pty (Ltd)',
    registrationNumber: '',
    vatNumber: '',
    businessAddress: 'Lephaphane Village, Tzaneen',
    location: 'Lephaphane Village, Tzaneen',
    serviceArea: 'Tzaneen, Limpopo and surrounding areas',
    tagline: 'Your Vision. Our Passion. Unforgettable Events.',
    slogan: "We don’t just offer services; we help create memories and unite families.",
    heroTitle: 'Luxury Event Planning, Decor & Coordination',
    heroText: 'Premium event management for weddings, corporate gatherings, social celebrations, cultural events and special occasions.',
    aboutText: 'Events with Nick provides elegant event planning, decor styling and coordination services for clients who want their celebrations to feel organised, beautiful and memorable.',
    phone1: '076 186 4166',
    phone2: '073 408 8417',
    email: 'mmolamn@gmail.com',
    preferredCommunication: 'WhatsApp',
    facebook: 'events_with_nicks',
    instagram: 'Events_with_nicks',
    whatsapp: '2761864166',
    whatsapp2: '27734088417'
  },
  banking: {
    accountName: 'Events with Nick Pty (Ltd)',
    bankName: '',
    accountNumber: '',
    accountType: 'Business Current Account',
    branchCode: '',
    referenceFormat: 'Use your quotation number or booking reference as payment reference.',
    paymentNote: 'Banking details are supplied on official quotation. Proof of payment may be sent to Events with Nick for confirmation.'
  },
  services: [
    {
      title: 'Corporate Events',
      short: 'Professional planning and styling for business occasions.',
      description: 'From conferences to product launches, the service focuses on clean presentation, guest flow, timing and a polished atmosphere.',
      items: ['Conferences', 'Product launches', 'Gala dinners', 'Award evenings'],
      image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=88'
    },
    {
      title: 'Social Events',
      short: 'Elegant celebrations for family, friends and communities.',
      description: 'Weddings, birthdays, anniversaries and cultural celebrations are shaped around the client’s vision, colour story and guest experience.',
      items: ['Weddings', 'Anniversaries', 'Birthday celebrations', 'Cultural festivals'],
      image: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1400&q=88'
    },
    {
      title: 'Special Events',
      short: 'Meaningful events planned with care and detail.',
      description: 'Charity fundraisers, award ceremonies and private experiences are coordinated with attention to purpose, presentation and flow.',
      items: ['Charity fundraisers', 'Award ceremonies', 'VIP dinners', 'Private celebrations'],
      image: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=88'
    },
    {
      title: 'Event Support Services',
      short: 'Hands-on support that keeps the event moving smoothly.',
      description: 'Support services help clients organise suppliers, decor details, catering coordination and event-day execution.',
      items: ['Event planning', 'Decor styling', 'Catering coordination', 'Event coordination'],
      image: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1400&q=88'
    }
  ],
  gallery: [
    { title: 'Wedding Reception Styling', category: 'Wedding Decor', image: 'https://images.unsplash.com/photo-1523438885200-e635ba2c371e?auto=format&fit=crop&w=1400&q=88' },
    { title: 'Luxury Table Setting', category: 'Decor Styling', image: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1400&q=88' },
    { title: 'Corporate Event Setup', category: 'Corporate Events', image: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1400&q=88' },
    { title: 'Gala Dinner Atmosphere', category: 'Gala Dinner', image: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=1400&q=88' },
    { title: 'Birthday Celebration Detail', category: 'Social Events', image: 'https://images.unsplash.com/photo-1464349095431-e9a21285b5f3?auto=format&fit=crop&w=1400&q=88' },
    { title: 'Catering Presentation', category: 'Event Support', image: 'https://images.unsplash.com/photo-1555244162-803834f70033?auto=format&fit=crop&w=1400&q=88' },
    { title: 'Floral Centrepieces', category: 'Decor Details', image: 'https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=1400&q=88' },
    { title: 'Private Dinner Experience', category: 'Private Events', image: 'https://images.unsplash.com/photo-1482275548304-a58859dc31b7?auto=format&fit=crop&w=1400&q=88' }
  ],
  packages: [
    {
      name: 'Essential Planning',
      bestFor: 'Small social events, birthdays and intimate gatherings',
      price: 'Custom quote',
      featured: false,
      features: ['Consultation and event direction', 'Basic event plan', 'Supplier guidance', 'WhatsApp support']
    },
    {
      name: 'Signature Experience',
      bestFor: 'Weddings, anniversaries and family celebrations',
      price: 'Custom quote',
      featured: true,
      features: ['Event concept and styling direction', 'Decor coordination', 'Supplier coordination', 'Event-day support', 'Professional follow-up']
    },
    {
      name: 'Royal Full-Service',
      bestFor: 'Corporate events, gala dinners and premium occasions',
      price: 'Custom quote',
      featured: false,
      features: ['Full planning and coordination', 'Decor styling direction', 'Guest-flow planning', 'Timeline management', 'Post-event follow-up']
    }
  ],
  quotePricing: {
    serviceLevels: [
      { id: 'essential', label: 'Essential Planning', amount: 3500 },
      { id: 'signature', label: 'Signature Experience', amount: 8500 },
      { id: 'royal', label: 'Royal Full-Service', amount: 16000 }
    ],
    decorLevels: [
      { id: 'light', label: 'Light decor styling', amount: 2500 },
      { id: 'standard', label: 'Standard decor styling', amount: 6500 },
      { id: 'luxury', label: 'Luxury decor styling', amount: 14000 }
    ],
    cateringOptions: [
      { id: 'none', label: 'Not included', amount: 0 },
      { id: 'coordination', label: 'Catering coordination only', amount: 3000 },
      { id: 'full', label: 'Full catering support', amount: 7500 }
    ],
    extras: [
      { id: 'travel', label: 'Travel / logistics allowance', amount: 1200, enabled: true },
      { id: 'admin', label: 'Admin & communication fee', amount: 750, enabled: true }
    ],
    perGuestCoordination: 45
  },
  testimonials: [
    { name: 'Wedding Client', text: 'The decor was elegant, the setup was organised and the day felt beautifully coordinated.' },
    { name: 'Corporate Guest', text: 'Professional presentation, clear communication and a polished event atmosphere.' },
    { name: 'Family Celebration', text: 'Events with Nick helped us create a celebration our family will remember.' }
  ],
  sampleBookings: [
    {
      id: 'EWN-1001', dateCreated: '2026-05-12T08:20:00.000Z', name: 'Lebo M.', phone: '072 000 1111', email: 'lebo@example.com', preferredCommunication: 'WhatsApp', eventType: 'Wedding', eventDate: '2026-08-15', location: 'Tzaneen', guests: '150', package: 'Signature Experience', budget: 'R25 000 - R40 000', message: 'Need decor styling, coordination and supplier support.', status: 'New', priority: 'High', notes: 'Send quotation and request inspiration pictures.', quoteAmount: '', assignedTo: 'Nick'
    },
    {
      id: 'EWN-1002', dateCreated: '2026-05-12T10:05:00.000Z', name: 'Mpho Events Team', phone: '073 111 2222', email: 'events@example.com', preferredCommunication: 'Email', eventType: 'Corporate Event', eventDate: '2026-07-03', location: 'Polokwane', guests: '90', package: 'Royal Full-Service', budget: 'R40 000+', message: 'Product launch with VIP guests and formal table setup.', status: 'Quoted', priority: 'Medium', notes: 'Client requested itemised package.', quoteAmount: '38500', assignedTo: 'Nick'
    },
    {
      id: 'EWN-1003', dateCreated: '2026-05-11T14:25:00.000Z', name: 'Thandi N.', phone: '076 222 3333', email: 'thandi@example.com', preferredCommunication: 'WhatsApp', eventType: 'Birthday Celebration', eventDate: '2026-06-28', location: 'Lephaphane Village', guests: '45', package: 'Essential Planning', budget: 'Below R10 000', message: 'Birthday decor and catering guidance.', status: 'Contacted', priority: 'Normal', notes: 'Call again on Friday.', quoteAmount: '', assignedTo: 'Team'
    }
  ]
};
