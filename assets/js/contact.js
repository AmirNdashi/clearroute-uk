/* ============================================================
   CLEARROUTE UK — CONTACT FORM (EmailJS)
   ============================================================ */

// ----- REPLACE THESE WITH YOUR EMAILJS CREDENTIALS -----
const EMAILJS_SERVICE_ID  = 'YOUR_EMAILJS_SERVICE_ID';
const EMAILJS_TEMPLATE_ID = 'YOUR_EMAILJS_TEMPLATE_ID';
const EMAILJS_PUBLIC_KEY  = 'YOUR_EMAILJS_PUBLIC_KEY';
// --------------------------------------------------------

// Load EmailJS SDK
(function () {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  script.onload = () => emailjs.init(EMAILJS_PUBLIC_KEY);
  document.head.appendChild(script);
})();

document.addEventListener('DOMContentLoaded', () => {

  const form     = document.getElementById('contactForm');
  const submitBtn = document.getElementById('submitBtn');
  if (!form) return;

  // --- Validation helpers ---
  const validate = {
    required: (val) => val.trim().length > 0,
    email:    (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim()),
  };

  const showError = (groupId) => {
    document.getElementById(groupId)?.classList.add('has-error');
  };

  const clearError = (groupId) => {
    document.getElementById(groupId)?.classList.remove('has-error');
  };

  // Clear error on input
  form.querySelectorAll('.form-control').forEach(input => {
    input.addEventListener('input', () => {
      const group = input.closest('.form-group');
      if (group) group.classList.remove('has-error');
    });
  });

  // --- Form submit ---
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Gather values
    const firstName   = document.getElementById('firstName')?.value || '';
    const lastName    = document.getElementById('lastName')?.value  || '';
    const email       = document.getElementById('email')?.value     || '';
    const phone       = document.getElementById('phone')?.value     || '';
    const nationality = document.getElementById('nationality')?.value || '';
    const service     = document.getElementById('service')?.value   || '';
    const message     = document.getElementById('message')?.value   || '';
    const privacy     = document.getElementById('privacyCheck')?.checked;

    // Validate
    let hasError = false;

    if (!validate.required(firstName)) { showError('group-firstName'); hasError = true; }
    else clearError('group-firstName');

    if (!validate.required(lastName)) { showError('group-lastName'); hasError = true; }
    else clearError('group-lastName');

    if (!validate.email(email)) { showError('group-email'); hasError = true; }
    else clearError('group-email');

    if (!validate.required(nationality)) { showError('group-nationality'); hasError = true; }
    else clearError('group-nationality');

    if (!validate.required(service)) { showError('group-service'); hasError = true; }
    else clearError('group-service');

    if (!validate.required(message)) { showError('group-message'); hasError = true; }
    else clearError('group-message');

    if (!privacy) {
      window.showToast?.('Please agree to the Privacy Policy to proceed.', 'error');
      hasError = true;
    }

    if (hasError) return;

    // Loading state
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    const serviceLabels = {
      'driving-licence-conversion': 'Driving Licence Conversion',
      'theory-test-booking':        'Theory Test Booking & Study Support',
      'practical-test-booking':     'Practical Test Booking Assistance',
      'ni-number-application':      'NI Number Application Support',
      'brp-evisa-guidance':         'BRP / eVisa Guidance',
      'address-proof-setup':        'Address Proof Setup',
      'uk-bank-account-setup':      'UK Bank Account Setup Guidance',
      'multiple':                   'Multiple Services / Not Sure Yet',
    };

    const templateParams = {
      from_name:    `${firstName.trim()} ${lastName.trim()}`,
      from_email:   email.trim(),
      phone:        phone.trim() || 'Not provided',
      nationality:  nationality.trim(),
      service:      serviceLabels[service] || service,
      message:      message.trim(),
      to_name:      'ClearRoute UK Team',
      reply_to:     email.trim(),
    };

    try {
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams);

      window.showToast?.('Message sent! We\'ll be in touch within 24 hours.', 'success', 6000);
      form.reset();

    } catch (err) {
      console.error('EmailJS error:', err);
      window.showToast?.('Something went wrong. Please try WhatsApp or email us directly.', 'error', 6000);
    } finally {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
  });
});