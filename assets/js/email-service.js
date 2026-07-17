/* ============================================================
   CLEARROUTE UK — EMAIL SERVICE (EmailJS)
   Shared utility for sending emails from the browser.
   ============================================================ */

const EMAILJS_PUBLIC_KEY  = 'QR-TTFj2f6_BZOxKX';
const EMAILJS_SERVICE_ID  = 'service_1ni6j9l';

// Template IDs — update these once you create templates in EmailJS dashboard
// For now uses the contact template as fallback
const TEMPLATES = {
  ADMIN_COMPOSE: 'template_f8ef8le',
  APPLICATION_RECEIPT: 'template_j8x9fvq',
};

window.EmailService = {
  initialized: false,

  async init() {
    if (this.initialized) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
      s.onload = () => { emailjs.init(EMAILJS_PUBLIC_KEY); this.initialized = true; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  },

  async sendAdminCompose({ to_email, to_name, subject, message }) {
    await this.init();
    return emailjs.send(EMAILJS_SERVICE_ID, TEMPLATES.ADMIN_COMPOSE, {
      to_email,
      to_name,
      from_name: 'ClearRoute UK',
      subject,
      message,
      reply_to: 'info@clearrouteuk.co.uk',
    });
  },

  async sendApplicationReceipt({ to_email, to_name, service_name, application_id, submission_date, message }) {
    await this.init();
    return emailjs.send(EMAILJS_SERVICE_ID, TEMPLATES.APPLICATION_RECEIPT, {
      to_email,
      to_name,
      from_name: 'ClearRoute UK',
      subject: `Application Received - ${service_name}`,
      service_name,
      application_id,
      submission_date,
      message,
      reply_to: 'info@clearrouteuk.co.uk',
    });
  },
};
