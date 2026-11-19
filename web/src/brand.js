// Brand settings. The logo artwork lives in web/public/logo-mark.svg and the
// LogoMark component in ui.jsx; ready-made image files are in /brand.
export const BRAND = {
  name: 'JIREX',
  // Main support address (used in links across the site)
  supportEmail: 'desireasiimwe24@gmail.com',
};

// Shown in the Support window (top bar → Support). Edit freely; empty entries are hidden.
export const SUPPORT = {
  emails: ['desireasiimwe24@gmail.com', 'bwambalejim221@gmail.com'],
  phone: '+7 977 603-02-22',
  // Chat apps open a conversation with the phone number above.
  whatsapp: true,
  telegram: true,
};

export const phoneDigits = (phone) => phone.replace(/[^\d+]/g, '');
