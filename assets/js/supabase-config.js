/* ============================================================
   CLEARROUTE UK — SUPABASE CONFIG
   ============================================================ */

// ─── REPLACE WITH YOUR SUPABASE CREDENTIALS ──────────────────
const SUPABASE_URL      = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
// ─────────────────────────────────────────────────────────────

// Load Supabase via CDN (no npm needed)
const supabaseScript = document.createElement('script');
supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
supabaseScript.onload = () => {
  window._supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.dispatchEvent(new Event('supabase-ready'));
};
document.head.appendChild(supabaseScript);

// Helper to wait for Supabase to be ready
window.getSupabase = () => new Promise((resolve) => {
  if (window._supabase) return resolve(window._supabase);
  window.addEventListener('supabase-ready', () => resolve(window._supabase), { once: true });
});