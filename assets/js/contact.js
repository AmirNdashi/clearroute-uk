/* ============================================================
   CLEARROUTE UK — CONTACT FORM (EmailJS)
   ============================================================ */

// Load EmailJS SDK — uses shared config from email-service.js
(function () {
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js';
  script.onload = () => emailjs.init('QR-TTFj2f6_BZOxKX');
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
      'pco-licence':                'PCO Licence Application Support',
      'theory-test-booking':        'Theory Test Booking & Study Support',
      'practical-test-booking':     'Practical Test Booking Assistance',
      'ni-number-application':      'NI Number Application Support',
      'brp-evisa-guidance':         'BRP / eVisa Guidance',
      'address-proof-setup':        'Address Proof Setup',
      'uk-bank-account-setup':      'UK Bank Account Setup Guidance',
      'multiple':                   'Multiple Services / Not Sure Yet',
    };

    const fullName = `${firstName.trim()} ${lastName.trim()}`;
    const serviceLabel = serviceLabels[service] || service;

    try {
      // Send via EmailJS — reuses existing ADMIN_COMPOSE template
      await emailjs.send('service_1ni6j9l', 'template_f8ef8le', {
        to_email:  'info@clearrouteuk.co.uk',
        to_name:   'ClearRoute UK Team',
        from_name: fullName,
        subject:   `New Enquiry from ${fullName} — ${serviceLabel}`,
        message:   `Phone: ${phone.trim() || 'Not provided'}\nNationality: ${nationality.trim()}\nService: ${serviceLabel}\n\nMessage:\n${message.trim()}`,
        reply_to:  email.trim(),
      });

      // Also save to Supabase for admin panel
      if (window._supabase) {
        try {
          await window._supabase
            .from('enquiries')
            .insert([{
              first_name: firstName.trim(),
              last_name: lastName.trim(),
              email: email.trim(),
              phone: phone.trim() || null,
              nationality: nationality.trim(),
              service: serviceLabel,
              message: message.trim(),
              status: 'new',
              created_at: new Date().toISOString()
            }]);
        } catch (supabaseError) {
          console.error('Supabase save error:', supabaseError);
          // Don't fail the form submission if Supabase fails
          // This might happen if the enquiries table doesn't exist yet
          if (supabaseError.code === '42P01') {
            console.warn('Enquiries table does not exist yet - please run the database schema');
          }
        }
      }

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