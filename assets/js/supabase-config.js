/* ============================================================
   CLEARROUTE UK — SUPABASE CONFIG
   ============================================================ */

// ─── REPLACE WITH YOUR SUPABASE CREDENTIALS ──────────────────
const SUPABASE_URL      = 'https://lxbsdgvzdqptdatluxlg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4YnNkZ3Z6ZHFwdGRhdGx1eGxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMjg0MDgsImV4cCI6MjA5ODYwNDQwOH0.7o3ZraBo-zcjgBro2K5bICoYm8YyoNvB3A0lajpeF1A';

// Admin account — only this email can access /admin; blocked from user dashboard
const ADMIN_EMAIL = 'info@clearoute.uk';

window.isAdminEmail = (email) => {
  if (!email) return false;
  return email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase();
};
// ─────────────────────────────────────────────────────────────

// Load Supabase via CDN (no npm needed)
const supabaseScript = document.createElement('script');
supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
supabaseScript.onload = () => {
  window._supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.dispatchEvent(new Event('supabase-ready'));
};
document.head.appendChild(supabaseScript);

// Helper to wait for Supabase to be ready (with timeout)
window.getSupabase = (timeoutMs = 10000) => new Promise((resolve, reject) => {
  if (window._supabase) return resolve(window._supabase);
  
  const timer = setTimeout(() => {
    reject(new Error('Supabase failed to load'));
  }, timeoutMs);
  
  window.addEventListener('supabase-ready', () => {
    clearTimeout(timer);
    resolve(window._supabase);
  }, { once: true });
});