/* ============================================================
   CLEARROUTE UK — MAIN JS
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {

  // --- Navbar scroll effect ---
  const navbar = document.querySelector('.navbar');
  const handleScroll = () => {
    if (window.scrollY > 60) {
      navbar?.classList.add('scrolled');
    } else {
      navbar?.classList.remove('scrolled');
    }
  };
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // --- Active nav link ---
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.navbar-nav a').forEach(link => {
    const href = link.getAttribute('href')?.split('/').pop();
    if (href === currentPath) link.classList.add('active');
  });

  // --- Hamburger / Mobile nav ---
  const hamburger = document.querySelector('.hamburger');
  const mobileNav = document.querySelector('.mobile-nav');

  hamburger?.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileNav?.classList.toggle('open');
    document.body.style.overflow = mobileNav?.classList.contains('open') ? 'hidden' : '';
  });

  mobileNav?.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger?.classList.remove('open');
      mobileNav?.classList.remove('open');
      document.body.style.overflow = '';
    });
  });

  // --- Scroll reveal ---
  const revealEls = document.querySelectorAll(
    '.reveal, .reveal-left, .reveal-right, .reveal-scale'
  );

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

  revealEls.forEach(el => revealObserver.observe(el));

  // --- Counter animation ---
  const counters = document.querySelectorAll('.counter-num');

  const countUp = (el) => {
    const target = parseInt(el.dataset.target, 10);
    const suffix = el.dataset.suffix || '';
    const duration = 2000;
    const step = target / (duration / 16);
    let current = 0;

    const timer = setInterval(() => {
      current += step;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      el.textContent = Math.floor(current).toLocaleString() + suffix;
    }, 16);
  };

  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !entry.target.dataset.counted) {
        entry.target.dataset.counted = 'true';
        countUp(entry.target);
        counterObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(counter => counterObserver.observe(counter));

  // --- Back to top ---
  const backToTop = document.querySelector('.back-to-top');

  window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
      backToTop?.classList.add('visible');
    } else {
      backToTop?.classList.remove('visible');
    }
  }, { passive: true });

  backToTop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // --- Toast notification system ---
  window.showToast = (message, type = 'default', duration = 4000) => {
    const container = document.querySelector('.toast-container')
      || (() => {
        const c = document.createElement('div');
        c.className = 'toast-container';
        document.body.appendChild(c);
        return c;
      })();

    const icons = {
      success: '✓',
      error:   '✕',
      default: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `<span>${icons[type] || icons.default}</span><span>${message}</span>`;
    container.appendChild(toast);

    const timeout = setTimeout(() => {
      toast.style.animation = 'slideInRight 0.4s cubic-bezier(0.4,0,0.2,1) reverse';
      setTimeout(() => toast.remove(), 400);
    }, duration);

    return {
      undo(label = 'Undo', onUndo) {
        if (typeof onUndo !== 'function') return;
        const undoBtn = document.createElement('button');
        undoBtn.textContent = label;
        undoBtn.style.cssText = 'margin-left:12px;padding:4px 12px;border-radius:6px;border:1px solid currentColor;background:transparent;color:inherit;font-weight:700;cursor:pointer;font-size:0.8rem;flex-shrink:0;';
        undoBtn.addEventListener('click', () => {
          clearTimeout(timeout);
          toast.remove();
          onUndo();
        });
        toast.appendChild(undoBtn);
      }
    };
  };

  // --- Smooth page transitions ---
  document.querySelectorAll('a[href]').forEach(link => {
    const href = link.getAttribute('href');
    if (
      href.startsWith('#') ||
      href.startsWith('mailto:') ||
      href.startsWith('tel:') ||
      href.startsWith('http') ||
      link.target === '_blank'
    ) return;

    link.addEventListener('click', (e) => {
      e.preventDefault();
      const overlay = document.querySelector('.page-transition');
      if (overlay) {
        overlay.classList.add('active');
        setTimeout(() => { window.location.href = href; }, 300);
      } else {
        window.location.href = href;
      }
    });
  });

  // Mark page as loaded (fade in)
  const overlay = document.querySelector('.page-transition');
  if (overlay) {
    setTimeout(() => overlay.classList.remove('active'), 50);
  }

  // --- Auto-update footer year ---
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});