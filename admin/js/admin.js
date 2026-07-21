/* ============================================================
   CLEARROUTE UK — ADMIN PANEL (Supabase)
   ============================================================ */

let db           = null;
let currentSess  = null;
let msgChannel   = null;
let queueChannel = null;
let notifySound  = null;
let prevSessionIds = new Set();

const ADMIN_LOGIN_RATE_LIMIT = 5;
const ADMIN_LOGIN_RATE_WINDOW = 60000;
let adminLoginAttempts = [];

function isAdminLoginRateLimited() {
  const now = Date.now();
  adminLoginAttempts = adminLoginAttempts.filter(t => t > now - ADMIN_LOGIN_RATE_WINDOW);
  if (adminLoginAttempts.length >= ADMIN_LOGIN_RATE_LIMIT) return true;
  adminLoginAttempts.push(now);
  return false;
}

/* ════════════════════════════════════════
   BOOT — wait for Supabase
════════════════════════════════════════ */
window.addEventListener('supabase-ready', () => {
  db = window._supabase;
  initAuth();
});

// Also handle case where Supabase loads before this script runs
if (window._supabase) {
  db = window._supabase;
  initAuth();
}

/* ════════════════════════════════════════
   AUTH
════════════════════════════════════════ */
function initAuth() {
  // Check existing session
  db.auth.getSession().then(async ({ data }) => {
    if (data?.session) {
      if (await enforceAdminAccess(data.session.user)) {
        showDashboard(data.session.user);
      }
    } else {
      showLogin();
    }
  });

  // Listen for auth changes
  db.auth.onAuthStateChange(async (event, session) => {
    if (session) {
      if (await enforceAdminAccess(session.user)) {
        showDashboard(session.user);
      }
    } else {
      showLogin();
    }
  });
}

function showLogin(errorMessage) {
  document.getElementById('adminAuth').style.display   = 'flex';
  document.getElementById('adminLayout').classList.remove('visible');
  const errEl = document.getElementById('authError');
  if (errorMessage) {
    errEl.textContent = errorMessage;
    errEl.style.display = 'block';
  }
}

function isAllowedAdmin(user) {
  return window.isAdminEmail?.(user?.email);
}

async function enforceAdminAccess(user) {
  if (!isAllowedAdmin(user)) {
    await db.auth.signOut();
    showLogin('Access denied. Only the authorised admin account can sign in here.');
    return false;
  }
  return true;
}

function showDashboard(user) {
  document.getElementById('adminAuth').style.display = 'none';
  document.getElementById('adminLayout').classList.add('visible');
  document.getElementById('sidebarUserEmail').textContent = user.email;
  initSidebarToggle();
  initNotificationSound();
  // Ensure admin profile exists with is_admin = TRUE for RLS
  ensureAdminProfile(user);
  loadDashboardStats();
  loadSessions();
  listenForHandoffs();
}

async function ensureAdminProfile(user) {
  try {
    const { data: profile } = await db
      .from('profiles')
      .select('id, is_admin')
      .eq('id', user.id)
      .single();

    if (!profile) {
      // Profile doesn't exist yet — create it
      await db.from('profiles').insert({
        id: user.id,
        email: user.email,
        first_name: user.user_metadata?.first_name || 'Admin',
        last_name: user.user_metadata?.last_name || '',
        full_name: user.user_metadata?.full_name || 'Admin',
        is_admin: true,
        created_at: new Date().toISOString()
      });
    } else if (!profile.is_admin) {
      // Profile exists but is_admin is not set — update it
      await db.from('profiles')
        .update({ is_admin: true })
        .eq('id', user.id);
    }
  } catch (e) {
    console.error('Admin profile setup error:', e);
  }
}

/* ── Login button ── */
document.getElementById('authBtn').addEventListener('click', async () => {
  if (!db) {
    const errEl = document.getElementById('authError');
    if (errEl) {
      errEl.textContent = 'Database not initialized. Please wait a moment and try again.';
      errEl.style.display = 'block';
    }
    return;
  }

  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl    = document.getElementById('authError');
  if (errEl) errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = 'Please enter your email and password.';
    errEl.style.display = 'block';
    return;
  }

  if (!window.isAdminEmail?.(email)) {
    errEl.textContent = 'Access denied. Only the authorised admin account can sign in here.';
    errEl.style.display = 'block';
    return;
  }

  if (isAdminLoginRateLimited()) {
    errEl.textContent = 'Too many login attempts. Please wait before trying again.';
    errEl.style.display = 'block';
    return;
  }

  document.getElementById('authBtn').textContent = 'Signing in...';

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    errEl.textContent = 'Invalid email or password. Please try again.';
    errEl.style.display = 'block';
    document.getElementById('authBtn').innerHTML = '<i class="fas fa-lock"></i> Sign In to Dashboard';
  }
});

document.getElementById('authEmail').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('authPassword').focus();
});
document.getElementById('authPassword').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('authBtn').click();
});

/* ── Logout ── */
document.getElementById('logoutBtn').addEventListener('click', async () => {
  if (!db) return;
  await db.auth.signOut();
});

/* ════════════════════════════════════════
   NOTIFICATION SOUND
════════════════════════════════════════ */
function initNotificationSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) notifySound = new Ctx();
  } catch (e) {}
}

function initSidebarToggle() {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.querySelector('.admin-sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const icon = document.getElementById('sidebarToggleIcon');
  if (!toggle || !sidebar || !overlay) return;
  const updateIcon = () => {
    if (!icon) return;
    icon.className = sidebar.classList.contains('open') ? 'fas fa-times' : 'fas fa-bars';
  };
  const close = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    updateIcon();
  };
  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
    updateIcon();
  });
  overlay.addEventListener('click', close);
  sidebar.querySelectorAll('.admin-nav-item').forEach(el => {
    el.addEventListener('click', close);
  });
  // Close sidebar on page load for mobile
  close();
}

function playNotificationSound() {
  try {
    if (!notifySound) return;
    const osc  = notifySound.createOscillator();
    const gain = notifySound.createGain();
    osc.connect(gain);
    gain.connect(notifySound.destination);
    osc.frequency.setValueAtTime(800, notifySound.currentTime);
    osc.frequency.setValueAtTime(600, notifySound.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, notifySound.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, notifySound.currentTime + 0.4);
    osc.start(notifySound.currentTime);
    osc.stop(notifySound.currentTime  + 0.4);
  } catch (e) {}
}

function showNotifyToast(msg) {
  document.querySelector('.chat-notify-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'chat-notify-toast';
  toast.innerHTML = `<i class="fas fa-comment-dots"></i> ${msg}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateX(100%)';
    toast.style.transition = 'all 0.4s ease';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

/* ════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════ */
document.querySelectorAll('.admin-nav-item[data-page]').forEach(item => {
  item.addEventListener('click', () => {
    const page = item.dataset.page;
    document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`)?.classList.add('active');
    const titles = { dashboard: 'Dashboard', chat: 'Live Chat Inbox', 'email-inbox': 'Email Inbox', 'email-detail': 'Email Details', applications: 'User Applications', 'application-detail': 'Application Details', enquiries: 'Enquiries', 'enquiry-detail': 'Enquiry Details', users: 'Users', 'user-detail': 'User Details', settings: 'Settings' };
    document.getElementById('topbarTitle').textContent = titles[page] || 'Dashboard';
    
    // Load page-specific data
    if (page === 'applications') {
      loadApplications();
    } else if (page === 'enquiries') {
      loadEnquiries();
    } else if (page === 'users') {
      loadUsers();
    } else if (page === 'email-inbox') {
      loadEmailInbox();
    } else if (page === 'settings') {
      loadSettings();
    }
  });
});

/* ════════════════════════════════════════
   EMAIL INBOX MANAGEMENT
════════════════════════════════════════ */
let _allEmails = [];
let _emailPage = 0;
const _emailPageSize = 20;

const _emailStatusClasses = {
  'unread': 'background:#FEF3C7;color:#B45309',
  'read': 'background:#DBEAFE;color:#1E40AF',
  'replied': 'background:#D1FAE5;color:#047857'
};

function _renderEmailCard(email) {
  return `
    <div style="display:flex;align-items:center;gap:16px;padding:16px;background:${email.status === 'unread' ? '#FEF3C7' : '#F9FAFB'};border-radius:8px;margin-bottom:12px;cursor:pointer;transition:all 0.2s ease;border-left:4px solid ${email.status === 'unread' ? '#D4735E' : 'transparent'};" onclick="viewEmail('${email.id}')">
      <div style="width:48px;height:48px;border-radius:8px;background:linear-gradient(135deg,#0D4F4F,#1A6B6B);color:#D4735E;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">
        <i class="fas fa-envelope"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.95rem;font-weight:700;color:#1A1A2E;margin-bottom:4px;">
          ${window.escapeHtml(email.sender_name)}
        </div>
        <div style="font-size:0.82rem;color:#6B7280;">
          ${window.escapeHtml(email.sender_email)}
        </div>
        <div style="font-size:0.85rem;color:#374151;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${window.escapeHtml(email.subject)}
        </div>
      </div>
      <div style="text-align:right;">
        <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;${_emailStatusClasses[email.status] || _emailStatusClasses['unread']}">
          ${email.status.toUpperCase()}
        </span>
        <div style="font-size:0.75rem;color:#9CA3AF;margin-top:4px;">
          ${new Date(email.created_at).toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  `;
}

function _getFilteredEmails() {
  const search = (document.getElementById('emailSearch').value || '').toLowerCase().trim();
  const status = document.getElementById('emailStatusFilter').value;
  return _allEmails.filter(e => {
    if (search && !`${e.sender_name} ${e.sender_email} ${e.subject}`.toLowerCase().includes(search)) return false;
    if (status && e.status !== status) return false;
    return true;
  });
}

function _renderEmailsPage() {
  const list = document.getElementById('emailInboxList');
  const filtered = _getFilteredEmails();
  const start = 0;
  const end = (_emailPage + 1) * _emailPageSize;
  const page = filtered.slice(start, end);
  const countEl = document.getElementById('emailCount');
  countEl.textContent = `${filtered.length} email${filtered.length !== 1 ? 's' : ''}`;
  if (page.length === 0) {
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#9CA3AF;"><i class="fas fa-inbox" style="font-size:2rem;margin-bottom:12px;"></i><p>No emails match your filters</p></div>';
    document.getElementById('emailLoadMoreWrap').style.display = 'none';
    return;
  }
  list.innerHTML = page.map(e => _renderEmailCard(e)).join('');
  document.getElementById('emailLoadMoreWrap').style.display = end >= filtered.length ? 'none' : 'block';
}

window.loadEmailInbox = async function() {
  _emailPage = 0;
  const list = document.getElementById('emailInboxList');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;font-size:0.85rem;">Loading emails...</div>';

  try {
    const { data: emails, error } = await db
      .from('applicant_emails')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Emails load error:', error);
      list.innerHTML = `
        <div style="padding:40px;text-align:center;color:#EF4444;">
          <i class="fas fa-exclamation-circle" style="font-size:2rem;margin-bottom:12px;"></i>
          <p style="font-size:0.9rem;margin-bottom:12px;">Error loading emails</p>
          <p style="font-size:0.8rem;color:#6B7280;">${error.message || 'Unknown error'}</p>
        </div>
      `;
      return;
    }

    _allEmails = emails || [];
    _renderEmailsPage();

  } catch (e) {
    console.error('Emails error:', e);
    list.innerHTML = `
      <div style="padding:40px;text-align:center;color:#EF4444;">
        <i class="fas fa-exclamation-circle" style="font-size:2rem;margin-bottom:12px;"></i>
        <p style="font-size:0.9rem;margin-bottom:12px;">Error loading emails</p>
        <p style="font-size:0.8rem;color:#6B7280;">${e.message || 'Unknown error'}</p>
      </div>
    `;
  }
};

window.filterEmails = function() {
  _emailPage = 0;
  _renderEmailsPage();
};

window.loadMoreEmails = function() {
  _emailPage++;
  _renderEmailsPage();
};

window.viewEmail = async function(emailId) {
  try {
    // Mark as read
    await db.from('applicant_emails').update({ status: 'read' }).eq('id', emailId);

    const { data: email, error } = await db
      .from('applicant_emails')
      .select('*')
      .eq('id', emailId)
      .single();

    if (error) throw error;

    const detailHTML = `
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;">
        <div>
          <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Email Information</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.9rem;">
              <div><strong>From:</strong> ${email.sender_name}</div>
              <div><strong>Email:</strong> ${email.sender_email}</div>
              <div><strong>Subject:</strong> ${email.subject}</div>
              <div><strong>Status:</strong> ${email.status.toUpperCase()}</div>
              <div><strong>Received:</strong> ${new Date(email.created_at).toLocaleDateString('en-GB')}</div>
              <div><strong>Email ID:</strong> ${email.id.slice(0, 12)}...</div>
            </div>
          </div>

          <div style="background:#F9FAFB;border-radius:8px;padding:20px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Message</h4>
            <p style="font-size:0.9rem;color:#374151;line-height:1.6;white-space:pre-wrap;">${window.escapeHtml(email.message)}</p>
          </div>
        </div>

        <div>
          <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Update Status</h4>
            <select id="emailStatusUpdate" style="width:100%;padding:10px;border:1px solid #D1D5DB;border-radius:6px;margin-bottom:12px;">
              <option value="unread" ${email.status === 'unread' ? 'selected' : ''}>Unread</option>
              <option value="read" ${email.status === 'read' ? 'selected' : ''}>Read</option>
              <option value="replied" ${email.status === 'replied' ? 'selected' : ''}>Replied</option>
            </select>
            <button onclick="updateEmailStatus('${email.id}')" class="admin-btn admin-btn-primary" style="width:100%;">
              <i class="fas fa-save"></i> Update Status
            </button>
          </div>

          <div style="background:#F9FAFB;border-radius:8px;padding:20px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Quick Actions</h4>
            <button onclick='openEmailModal({recipientId:"${email.id}",recipientType:"applicant_email",email:"${window.escapeHtml(email.sender_email)}",name:"${window.escapeHtml(email.sender_name)}",subject:"Re: ${window.escapeHtml(email.subject)}"})' class="admin-btn admin-btn-outline" style="width:100%;display:block;text-align:center;margin-bottom:8px;">
              <i class="fas fa-reply"></i> Reply via Email
            </button>
          </div>

          <div style="margin-top:16px;">
            <button onclick="deleteEmail('${email.id}')" class="admin-btn admin-btn-danger" style="width:100%;">
              <i class="fas fa-trash"></i> Delete Email
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('emailDetail').innerHTML = detailHTML;
    showPage('email-detail');
    loadEmailInbox(); // Refresh list to update status

  } catch (e) {
    console.error('View email error:', e);
    alert('Error loading email details');
  }
};

window.updateEmailStatus = async function(emailId) {
  const newStatus = document.getElementById('emailStatusUpdate').value;

  try {
    const { data, error } = await db
      .from('applicant_emails')
      .update({ status: newStatus })
      .eq('id', emailId)
      .select();

    if (error) throw error;

    _logAudit('email_status_change', {
      email_id: emailId,
      to: newStatus
    });

    alert('Status updated successfully');
    viewEmail(emailId);

  } catch (e) {
    console.error('Update status error:', e);
    alert(e.message || 'Error updating status');
  }
};

window.deleteEmail = async function(emailId) {
  if (!confirm('Delete this email?')) return;

  const { data, error } = await db.from('applicant_emails').delete().eq('id', emailId).select();
  if (error) {
    console.error('Delete email error:', error);
    window.showToast('Error deleting email: ' + error.message, 'error', 4000);
    return;
  }
  _logAudit('email_deleted', { email_id: emailId });
  const toast = window.showToast('Email deleted', 'success', 6000);
  toast.undo('Undo', async () => {
    try {
      if (data?.[0]) await db.from('applicant_emails').insert(data[0]);
      window.showToast('Email restored', 'success', 3000);
    } catch {
      window.showToast('Could not restore email', 'error', 4000);
    }
  });
  loadEmailInbox();
  showPage('email-inbox');
};

/* ════════════════════════════════════════
   ENQUIRIES MANAGEMENT
════════════════════════════════════════ */
let _allEnqs = [];
let _enqPage = 0;
const _enqPageSize = 20;

const _enqStatusClasses = {
  'new': 'background:#FEF3C7;color:#B45309',
  'contacted': 'background:#DBEAFE;color:#1E40AF',
  'resolved': 'background:#D1FAE5;color:#047857',
  'closed': 'background:#FEE2E2;color:#B91C1C'
};

function _renderEnqCard(enq) {
  return `
    <div style="display:flex;align-items:center;gap:16px;padding:16px;background:#F9FAFB;border-radius:8px;margin-bottom:12px;cursor:pointer;transition:all 0.2s ease;" onclick="viewEnquiry('${enq.id}')">
      <div style="width:48px;height:48px;border-radius:8px;background:linear-gradient(135deg,#0D4F4F,#1A6B6B);color:#D4735E;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">
        <i class="fas fa-envelope"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.95rem;font-weight:700;color:#1A1A2E;margin-bottom:4px;">
          ${window.escapeHtml(enq.first_name)} ${window.escapeHtml(enq.last_name)}
        </div>
        <div style="font-size:0.82rem;color:#6B7280;">
          ${window.escapeHtml(enq.email)} · ${window.escapeHtml(enq.service)}
        </div>
      </div>
      <div style="text-align:right;">
        <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;${_enqStatusClasses[enq.status] || _enqStatusClasses['new']}">
          ${enq.status.toUpperCase()}
        </span>
        <div style="font-size:0.75rem;color:#9CA3AF;margin-top:4px;">
          ${new Date(enq.created_at).toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  `;
}

function _getFilteredEnqs() {
  const search = (document.getElementById('enqSearch').value || '').toLowerCase().trim();
  const status = document.getElementById('enqStatusFilter').value;
  return _allEnqs.filter(e => {
    if (search && !`${e.first_name} ${e.last_name} ${e.email}`.toLowerCase().includes(search)) return false;
    if (status && e.status !== status) return false;
    return true;
  });
}

function _renderEnqsPage() {
  const list = document.getElementById('enquiriesList');
  const filtered = _getFilteredEnqs();
  const start = 0;
  const end = (_enqPage + 1) * _enqPageSize;
  const page = filtered.slice(start, end);
  const countEl = document.getElementById('enqCount');
  countEl.textContent = `${filtered.length} enquir${filtered.length !== 1 ? 'ies' : 'y'}`;
  if (page.length === 0) {
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#9CA3AF;"><i class="fas fa-inbox" style="font-size:2rem;margin-bottom:12px;"></i><p>No enquiries match your filters</p></div>';
    document.getElementById('enqLoadMoreWrap').style.display = 'none';
    return;
  }
  list.innerHTML = page.map(e => _renderEnqCard(e)).join('');
  document.getElementById('enqLoadMoreWrap').style.display = end >= filtered.length ? 'none' : 'block';
}

window.loadEnquiries = async function() {
  _enqPage = 0;
  const list = document.getElementById('enquiriesList');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;font-size:0.85rem;">Loading enquiries...</div>';

  try {
    const { data: enquiries, error } = await db
      .from('enquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Enquiries load error:', error);
      if (error.code === '42P01') {
        list.innerHTML = `
          <div style="padding:40px;text-align:center;color:#D4735E;">
            <i class="fas fa-database" style="font-size:2rem;margin-bottom:12px;"></i>
            <p style="font-size:0.9rem;margin-bottom:12px;">Database setup required</p>
            <p style="font-size:0.8rem;color:#6B7280;margin-bottom:16px;">The enquiries table hasn't been created yet.</p>
            <div style="padding:12px;background:#FEF3C7;border-radius:6px;text-align:left;">
              <p style="font-size:0.8rem;color:#B45309;margin-bottom:8px;"><strong>To enable this feature:</strong></p>
              <ol style="font-size:0.8rem;color:#B45309;padding-left:20px;margin:0;">
                <li>Open Supabase SQL Editor</li>
                <li>Run the schema from supabase-schema.sql</li>
                <li>Refresh this page</li>
              </ol>
            </div>
            <p style="font-size:0.8rem;color:#6B7280;margin-top:16px;">
              <i class="fas fa-info-circle"></i> In the meantime, check <strong>info@clearrouteuk.co.uk</strong> for enquiries
            </p>
          </div>
        `;
        return;
      }
      if (error.code === '42501') {
        list.innerHTML = `
          <div style="padding:40px;text-align:center;color:#EF4444;">
            <i class="fas fa-lock" style="font-size:2rem;margin-bottom:12px;"></i>
            <p style="font-size:0.9rem;margin-bottom:12px;">Permission denied accessing enquiries</p>
            <p style="font-size:0.8rem;color:#6B7280;">Check RLS policies in Supabase dashboard</p>
          </div>
        `;
        return;
      }
      throw error;
    }

    _allEnqs = enquiries || [];
    _renderEnqsPage();

  } catch (e) {
    console.error('Enquiries error:', e);
    list.innerHTML = `
      <div style="padding:40px;text-align:center;color:#EF4444;">
        <i class="fas fa-exclamation-circle" style="font-size:2rem;margin-bottom:12px;"></i>
        <p style="font-size:0.9rem;margin-bottom:12px;">Error loading enquiries</p>
        <p style="font-size:0.8rem;color:#6B7280;">${e.message || 'Unknown error'}</p>
        <div style="margin-top:16px;padding:12px;background:#FEF3C7;border-radius:6px;text-align:left;">
          <p style="font-size:0.8rem;color:#B45309;margin-bottom:8px;"><strong>To fix this issue:</strong></p>
          <ol style="font-size:0.8rem;color:#B45309;padding-left:20px;margin:0;">
            <li>Open Supabase SQL Editor</li>
            <li>Run the schema from supabase-schema.sql</li>
            <li>Refresh this page</li>
          </ol>
        </div>
      </div>
    `;
  }
};

window.filterEnquiries = function() {
  _enqPage = 0;
  _renderEnqsPage();
};

window.loadMoreEnquiries = function() {
  _enqPage++;
  _renderEnqsPage();
};

window.exportEnquiriesCSV = function() {
  const filtered = _getFilteredEnqs();
  if (filtered.length === 0) { alert('No enquiries to export'); return; }
  const header = 'Name,Email,Service,Status,Date,Message\n';
  const rows = filtered.map(e =>
    `"${e.first_name} ${e.last_name}","${e.email}","${e.service || ''}","${e.status}","${new Date(e.created_at).toLocaleDateString('en-GB')}","${(e.message || '').replace(/"/g,'""')}"`
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'enquiries.csv'; a.click();
  URL.revokeObjectURL(url);
};

window.viewEnquiry = async function(enquiryId) {
  try {
    const { data: enquiry, error } = await db
      .from('enquiries')
      .select('*')
      .eq('id', enquiryId)
      .single();

    if (error) throw error;

    const detailHTML = `
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;">
        <div>
          <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Enquiry Information</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.9rem;">
              <div><strong>Name:</strong> ${window.escapeHtml(enquiry.first_name)} ${window.escapeHtml(enquiry.last_name)}</div>
              <div><strong>Email:</strong> ${window.escapeHtml(enquiry.email)}</div>
              <div><strong>Phone:</strong> ${window.escapeHtml(enquiry.phone || 'Not provided')}</div>
              <div><strong>Nationality:</strong> ${window.escapeHtml(enquiry.nationality)}</div>
              <div><strong>Service:</strong> ${window.escapeHtml(enquiry.service)}</div>
              <div><strong>Status:</strong> ${window.escapeHtml(enquiry.status.toUpperCase())}</div>
              <div><strong>Submitted:</strong> ${new Date(enquiry.created_at).toLocaleDateString('en-GB')}</div>
              <div><strong>Enquiry ID:</strong> ${window.escapeHtml(enquiry.id.slice(0, 12))}...</div>
            </div>
          </div>

          <div style="background:#F9FAFB;border-radius:8px;padding:20px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Message</h4>
            <p style="font-size:0.9rem;color:#374151;line-height:1.6;white-space:pre-wrap;">${window.escapeHtml(enquiry.message)}</p>
          </div>
        </div>

        <div>
          <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Update Status</h4>
            <select id="enquiryStatusUpdate" style="width:100%;padding:10px;border:1px solid #D1D5DB;border-radius:6px;margin-bottom:12px;">
              <option value="new" ${enquiry.status === 'new' ? 'selected' : ''}>New</option>
              <option value="contacted" ${enquiry.status === 'contacted' ? 'selected' : ''}>Contacted</option>
              <option value="resolved" ${enquiry.status === 'resolved' ? 'selected' : ''}>Resolved</option>
              <option value="closed" ${enquiry.status === 'closed' ? 'selected' : ''}>Closed</option>
            </select>
            <button onclick="updateEnquiryStatus('${enquiry.id}')" class="admin-btn admin-btn-primary" style="width:100%;">
              <i class="fas fa-save"></i> Update Status
            </button>
          </div>

          <div style="background:#F9FAFB;border-radius:8px;padding:20px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Add Admin Note</h4>
            <textarea id="enquiryAdminNote" rows="3" placeholder="Enter your note..." style="width:100%;padding:10px;border:1px solid #D1D5DB;border-radius:6px;margin-bottom:12px;resize:vertical;">${enquiry.admin_notes || ''}</textarea>
            <button onclick="updateEnquiryNote('${enquiry.id}')" class="admin-btn admin-btn-secondary" style="width:100%;">
              <i class="fas fa-save"></i> Save Note
            </button>
          </div>

          <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-top:16px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Quick Actions</h4>
            <button onclick='openEmailModal({recipientId:"${enquiry.id}",recipientType:"enquiry",email:"${window.escapeHtml(enquiry.email)}",name:"${window.escapeHtml(enquiry.first_name)} ${window.escapeHtml(enquiry.last_name)}",subject:"Re: ${window.escapeHtml(enquiry.service)}"})' class="admin-btn admin-btn-outline" style="width:100%;display:block;text-align:center;margin-bottom:8px;">
              <i class="fas fa-envelope"></i> Reply via Email
            </button>
            ${enquiry.phone ? `
              <a href="tel:${enquiry.phone}" class="admin-btn admin-btn-outline" style="width:100%;display:block;text-align:center;text-decoration:none;">
                <i class="fas fa-phone"></i> Call
              </a>
            ` : ''}
          </div>

          <div style="margin-top:16px;">
            <button onclick="deleteEnquiry('${enquiry.id}')" class="admin-btn admin-btn-danger" style="width:100%;">
              <i class="fas fa-trash"></i> Delete Enquiry
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('enquiryDetail').innerHTML = detailHTML;
    showPage('enquiry-detail');

  } catch (e) {
    console.error('View enquiry error:', e);
    alert('Error loading enquiry details');
  }
};

window.deleteEnquiry = async function(enquiryId) {
  if (!confirm('Delete this enquiry?')) return;

  try {
    const { data, error } = await db.from('enquiries').delete().eq('id', enquiryId).select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Delete failed — admin RLS permission missing. Run the updated schema.');
    _logAudit('enquiry_deleted', { enquiry_id: enquiryId });
    const toast = window.showToast('Enquiry deleted', 'success', 6000);
    toast.undo('Undo', async () => {
      try {
        if (data?.[0]) await db.from('enquiries').insert(data[0]);
        window.showToast('Enquiry restored', 'success', 3000);
      } catch {
        window.showToast('Could not restore enquiry', 'error', 4000);
      }
    });
    loadEnquiries();
    showPage('enquiries');
  } catch (e) {
    console.error('Delete enquiry error:', e);
    window.showToast('Error deleting enquiry: ' + e.message, 'error', 4000);
  }
};

window.updateEnquiryStatus = async function(enquiryId) {
  const newStatus = document.getElementById('enquiryStatusUpdate').value;

  try {
    const { data, error } = await db
      .from('enquiries')
      .update({ status: newStatus })
      .eq('id', enquiryId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Update failed — admin permission required. Run the updated schema and set is_admin = TRUE on your profile.');
    }

    _logAudit('enquiry_status_change', {
      enquiry_id: enquiryId,
      to: newStatus
    });

    alert('Status updated successfully');
    loadEnquiries();
    viewEnquiry(enquiryId);

  } catch (e) {
    console.error('Update status error:', e);
    alert(e.message || 'Error updating status');
  }
};

window.updateEnquiryNote = async function(enquiryId) {
  const note = document.getElementById('enquiryAdminNote').value.trim();

  try {
    const { data, error } = await db
      .from('enquiries')
      .update({ admin_notes: note })
      .eq('id', enquiryId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Save failed — admin permission required. Run the updated schema and set is_admin = TRUE on your profile.');
    }

    alert('Note saved successfully');

  } catch (e) {
    console.error('Update note error:', e);
    alert(e.message || 'Error saving note');
  }
};

/* ════════════════════════════════════════
   USER MANAGEMENT
════════════════════════════════════════ */
window.loadUsers = async function() {
  const list = document.getElementById('usersList');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;font-size:0.85rem;">Loading users...</div>';

  try {
    const { data: users, error } = await db
      .from('profiles')
      .select('*')
      .neq('is_admin', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Users load error:', error);
      list.innerHTML = `
        <div style="padding:40px;text-align:center;color:#EF4444;">
          <i class="fas fa-exclamation-circle" style="font-size:2rem;margin-bottom:12px;"></i>
          <p style="font-size:0.9rem;margin-bottom:12px;">Error loading users</p>
          <p style="font-size:0.8rem;color:#6B7280;">${error.message || 'Permission denied or table not found'}</p>
        </div>
      `;
      return;
    }

    if (!users || users.length === 0) {
      list.innerHTML = '<div style="padding:40px;text-align:center;color:#9CA3AF;"><i class="fas fa-users" style="font-size:2rem;margin-bottom:12px;"></i><p>No users yet</p></div>';
      return;
    }

    list.innerHTML = users.map(user => `
      <div style="display:flex;align-items:center;gap:16px;padding:16px;background:#F9FAFB;border-radius:8px;margin-bottom:12px;cursor:pointer;transition:all 0.2s ease;" onclick="viewUser('${user.id}')">
        <div style="width:48px;height:48px;border-radius:8px;background:linear-gradient(135deg,#0D4F4F,#1A6B6B);color:#D4735E;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">
          <i class="fas fa-user"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.95rem;font-weight:700;color:#1A1A2E;margin-bottom:4px;">
            ${window.escapeHtml(user.first_name)} ${window.escapeHtml(user.last_name || 'User')}
          </div>
          <div style="font-size:0.82rem;color:#6B7280;">
            ${window.escapeHtml(user.email)}
          </div>
          <div style="font-size:0.78rem;color:#9CA3AF;">
            ${user.phone ? window.escapeHtml(user.phone) : ''}
          </div>
        </div>
        <div style="text-align:right;display:flex;align-items:center;gap:10px;">
          <div style="font-size:0.75rem;color:#9CA3AF;">
            ${new Date(user.created_at).toLocaleDateString('en-GB')}
          </div>
          <button onclick="event.stopPropagation();deleteUser('${user.id}')" class="admin-btn admin-btn-small admin-btn-danger" style="padding:4px 10px;font-size:0.75rem;" title="Delete user">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');

  } catch (e) {
    console.error('Users error:', e);
    list.innerHTML = `
      <div style="padding:40px;text-align:center;color:#EF4444;">
        <i class="fas fa-exclamation-circle" style="font-size:2rem;margin-bottom:12px;"></i>
        <p style="font-size:0.9rem;margin-bottom:12px;">Error loading users</p>
        <p style="font-size:0.8rem;color:#6B7280;">${e.message || 'Unknown error'}</p>
      </div>
    `;
  }
};

window.viewUser = async function(userId) {
  try {
    const { data: user, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    // Get user's applications
    const { data: applications } = await db
      .from('applications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const detailHTML = `
      <div class="admin-detail-layout">
        <div class="admin-detail-main">
          <div class="admin-detail-section">
            <h4>User Profile</h4>
            <div class="admin-detail-grid">
              <div><strong>Name:</strong> ${window.escapeHtml(user.first_name)} ${window.escapeHtml(user.last_name || 'N/A')}</div>
              <div><strong>Email:</strong> ${window.escapeHtml(user.email)}</div>
              <div><strong>Phone:</strong> ${window.escapeHtml(user.phone || 'Not provided')}</div>
              <div><strong>User ID:</strong> ${window.escapeHtml(user.id.slice(0, 12))}...</div>
              <div><strong>Joined:</strong> ${new Date(user.created_at).toLocaleDateString('en-GB')}</div>
              <div><strong>Last Updated:</strong> ${new Date(user.updated_at).toLocaleDateString('en-GB')}</div>
            </div>
          </div>

          <div class="admin-detail-section">
            <h4>User Applications (${applications?.length || 0})</h4>
            ${applications && applications.length > 0 ? `
              <div class="admin-app-list">
                ${applications.map(app => `
                  <div class="admin-app-item" onclick="viewApplication('${app.id}')">
                    <div class="admin-app-service">${window.escapeHtml(app.service_type.replace('-', ' ').toUpperCase())}</div>
                    <div class="admin-app-meta">Status: ${window.escapeHtml(app.status.toUpperCase())} · ${new Date(app.created_at).toLocaleDateString('en-GB')}</div>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="admin-empty-text">No applications yet</p>'}
          </div>
        </div>

        <div class="admin-detail-sidebar">
          <div class="admin-detail-section">
            <h4>Quick Actions</h4>
            <button onclick='openEmailModal({recipientId:"${user.id}",recipientType:"user",email:"${window.escapeHtml(user.email)}",name:"${window.escapeHtml(user.first_name)} ${window.escapeHtml(user.last_name || "")}"})' class="admin-btn admin-btn-outline admin-btn-block">
              <i class="fas fa-envelope"></i> Send Email
            </button>
            ${user.phone ? `
              <a href="tel:${user.phone}" class="admin-btn admin-btn-outline admin-btn-block">
                <i class="fas fa-phone"></i> Call
              </a>
            ` : ''}
          </div>

          <div class="admin-detail-actions">
            <button onclick="deleteUser('${user.id}')" class="admin-btn admin-btn-danger admin-btn-block">
              <i class="fas fa-user-slash"></i> Delete User & All Data
            </button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('userDetail').innerHTML = detailHTML;
    showPage('user-detail');

  } catch (e) {
    console.error('View user error:', e);
    alert('Error loading user details');
  }
};

window.deleteUser = async function(userId) {
  if (!confirm('Delete this user and ALL their data (applications, documents, notes, chat sessions, messages)?')) return;
  if (!confirm('ARE YOU SURE? This cannot be reversed. Type OK to confirm.')) return;

  try {
    const { data: userApps } = await db.from('applications').select('id').eq('user_id', userId);
    const appIds = userApps?.map(a => a.id) || [];
    for (const appId of appIds) {
      await db.from('application_notes').delete().eq('application_id', appId).select();
      await db.from('application_documents').delete().eq('application_id', appId).select();
    }
    const { data: ad, error: ae } = await db.from('applications').delete().eq('user_id', userId).select();
    if (ae) throw ae;

    const { data: sessions } = await db.from('chat_sessions').select('id').eq('user_id', userId);
    const sessIds = sessions?.map(s => s.id) || [];
    for (const sid of sessIds) {
      await db.from('chat_messages').delete().eq('session_id', sid).select();
      await db.from('admin_replies').delete().eq('session_id', sid).select();
      await db.from('admin_queue').delete().eq('session_id', sid).select();
    }
    const { data: sd, error: se } = await db.from('chat_sessions').delete().eq('user_id', userId).select();
    if (se) throw se;

    const { data: pd, error: pe } = await db.from('profiles').delete().eq('id', userId).select();
    if (pe) throw pe;
    if (!pd || pd.length === 0) throw new Error('Profile delete failed — admin RLS permission missing. Run the updated schema.');

    _logAudit('user_deleted', { user_id: userId });
    window.showToast('User and all associated data deleted', 'success', 5000);
    loadUsers();
    showPage('users');
  } catch (e) {
    console.error('Delete user error:', e);
    window.showToast('Error: ' + e.message, 'error', 6000);
  }
};

/* ════════════════════════════════════════
   APPLICATIONS MANAGEMENT
════════════════════════════════════════ */
let _allApps = [];
let _appPage = 0;
const _appPageSize = 20;

const _serviceNames = {
  'driving-licence': 'Driving Licence Conversion',
  'ni-number': 'NI Number Application',
  'brp-evisa': 'BRP / eVisa Guidance',
  'theory-test': 'Theory Test Booking',
  'practical-test': 'Practical Test Booking',
  'address-proof': 'Address Proof Setup',
  'bank-account': 'UK Bank Account Setup',
  'pco-licence': 'PCO Licence Application'
};

const _statusClasses = {
  'pending': 'background:#FEF3C7;color:#B45309',
  'submitted': 'background:#DBEAFE;color:#1E40AF',
  'in_review': 'background:#DBEAFE;color:#1E40AF',
  'processing': 'background:#E0E7FF;color:#3730A3',
  'approved': 'background:#D1FAE5;color:#047857',
  'rejected': 'background:#FEE2E2;color:#B91C1C'
};

window.toggleRejectionReason = function() {
  const sel = document.getElementById('statusUpdate');
  const wrap = document.getElementById('rejectionReasonWrap');
  if (wrap) {
    wrap.style.display = sel?.value === 'rejected' ? 'block' : 'none';
  }
};

function _renderAppCard(app) {
  const escapedService = window.escapeHtml(_serviceNames[app.service_type] || app.service_type);
  const escapedName = window.escapeHtml(`${app.first_name} ${app.last_name}`);
  const escapedEmail = window.escapeHtml(app.email || '');
  const escapedId = window.escapeHtml(app.id);
  return `
    <div style="display:flex;align-items:center;gap:16px;padding:16px;background:#F9FAFB;border-radius:8px;margin-bottom:12px;cursor:pointer;transition:all 0.2s ease;" onclick="viewApplication('${escapedId}')">
      <div style="width:48px;height:48px;border-radius:8px;background:linear-gradient(135deg,#0D4F4F,#1A6B6B);color:#D4735E;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">
        <i class="fas fa-file-alt"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.95rem;font-weight:700;color:#1A1A2E;margin-bottom:4px;">
          ${escapedService}
        </div>
        <div style="font-size:0.82rem;color:#6B7280;">
          ${escapedName} · ${escapedEmail}
        </div>
      </div>
      <div style="text-align:right;">
        <span style="display:inline-block;padding:4px 12px;border-radius:20px;font-size:0.75rem;font-weight:700;${_statusClasses[app.status] || _statusClasses['pending']}">
          ${app.status.replace('_', ' ').toUpperCase()}
        </span>
        <div style="font-size:0.75rem;color:#9CA3AF;margin-top:4px;">
          ${new Date(app.created_at).toLocaleDateString('en-GB')}
        </div>
      </div>
    </div>
  `;
}

function _getFilteredApps() {
  const search = (document.getElementById('appSearch').value || '').toLowerCase().trim();
  const status = document.getElementById('appStatusFilter').value;
  const service = document.getElementById('appServiceFilter').value;
  return _allApps.filter(a => {
    if (search && !`${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(search)) return false;
    if (status && a.status !== status) return false;
    if (service && a.service_type !== service) return false;
    return true;
  });
}

function _renderAppsPage() {
  const list = document.getElementById('applicationsList');
  const filtered = _getFilteredApps();
  const start = 0;
  const end = (_appPage + 1) * _appPageSize;
  const page = filtered.slice(start, end);
  const countEl = document.getElementById('appCount');
  countEl.textContent = `${filtered.length} application${filtered.length !== 1 ? 's' : ''}`;
  if (page.length === 0) {
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#9CA3AF;"><i class="fas fa-folder-open" style="font-size:2rem;margin-bottom:12px;"></i><p>No applications match your filters</p></div>';
    document.getElementById('appLoadMoreWrap').style.display = 'none';
    return;
  }
  list.innerHTML = page.map(a => _renderAppCard(a)).join('');
  document.getElementById('appLoadMoreWrap').style.display = end >= filtered.length ? 'none' : 'block';
}

window.loadApplications = async function() {
  _appPage = 0;
  const list = document.getElementById('applicationsList');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;font-size:0.85rem;">Loading applications...</div>';

  try {
    const { data: applications, error } = await db
      .from('applications')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    _allApps = applications || [];
    const newCount = _allApps.filter(a => a.status === 'submitted' || a.status === 'pending').length;
    const badge = document.getElementById('sidebarAppsBadge');
    if (badge) {
      if (newCount > 0) {
        badge.textContent = newCount > 99 ? '99+' : newCount;
        badge.style.display = 'inline-flex';
      } else {
        badge.style.display = 'none';
      }
    }
    _renderAppsPage();

  } catch (e) {
    console.error('Applications error:', e);
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#EF4444;"><i class="fas fa-exclamation-circle" style="font-size:2rem;margin-bottom:12px;"></i><p>Error loading applications</p></div>';
  }
};

window.filterApplications = function() {
  _appPage = 0;
  _renderAppsPage();
};

window.loadMoreApplications = function() {
  _appPage++;
  _renderAppsPage();
};

window.exportApplicationsCSV = function() {
  const filtered = _getFilteredApps();
  if (filtered.length === 0) { alert('No applications to export'); return; }
  const header = 'Name,Email,Phone,Service,Status,Date,Nationality,Address\n';
  const rows = filtered.map(a =>
    `"${a.first_name} ${a.last_name}","${a.email}","${a.phone || ''}","${_serviceNames[a.service_type] || a.service_type}","${a.status}","${new Date(a.created_at).toLocaleDateString('en-GB')}","${a.nationality}","${(a.address || '').replace(/"/g,'""')}"`
  ).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'applications.csv'; a.click();
  URL.revokeObjectURL(url);
};

window.viewApplication = async function(applicationId) {
  window._currentApplicationId = applicationId;
  try {
    const { data: application, error } = await db
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (error) throw error;

    // Load documents
    const { data: documents } = await db
      .from('application_documents')
      .select('*')
      .eq('application_id', applicationId)
      .single();

    // Load admin notes
    const { data: notes } = await db
      .from('application_notes')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });

    const serviceNames = {
      'driving-licence': 'Driving Licence Conversion',
      'ni-number': 'NI Number Application',
      'brp-evisa': 'BRP / eVisa Guidance',
      'theory-test': 'Theory Test Booking',
      'practical-test': 'Practical Test Booking',
      'address-proof': 'Address Proof Setup',
      'bank-account': 'UK Bank Account Setup',
      'pco-licence': 'PCO Licence Application'
    };

    const pricingInfo = application.pricing_info && Object.keys(application.pricing_info).length > 0 ? application.pricing_info : null;
    const paymentStatusColors = { pending: '#FEF3C7;#B45309', paid: '#D1FAE5;#047857', partial: '#FEF3C7;#B45309', refunded: '#FEE2E2;#B91C1C' };
    const psColor = paymentStatusColors[application.payment_status] || '#F3F4F6;#6B7280';
    const psParts = psColor.split(';');

    const detailHTML = `
      <div class="admin-detail-layout">
        <div class="admin-detail-main">
          <div class="admin-detail-section">
            <h4>Application Information</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.9rem;">
              <div><strong>Service:</strong> ${window.escapeHtml(serviceNames[application.service_type] || application.service_type)}</div>
              <div><strong>Status:</strong> ${window.escapeHtml(application.status.toUpperCase())}</div>
              <div><strong>Submitted:</strong> ${new Date(application.created_at).toLocaleDateString('en-GB')}</div>
              <div><strong>Application ID:</strong> ${window.escapeHtml(application.id.slice(0, 12))}...</div>
              <div><strong>Payment:</strong> <span style="display:inline-block;padding:2px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;background:${psParts[0]};color:${psParts[1]};">${(application.payment_status || 'pending').toUpperCase()}</span></div>
              ${application.estimated_completion ? `<div><strong>Est. Completion:</strong> ${new Date(application.estimated_completion).toLocaleDateString('en-GB')}</div>` : ''}
              ${application.rejection_reason ? `<div style="grid-column:1/-1;background:#FEE2E2;padding:8px 12px;border-radius:6px;color:#B91C1C;"><strong>Rejection Reason:</strong> ${window.escapeHtml(application.rejection_reason)}</div>` : ''}
            </div>
          </div>

          ${pricingInfo ? `
          <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Pricing & Payment</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;font-size:0.9rem;">
              <div style="background:#E0E7FF;border-radius:8px;padding:12px;text-align:center;">
                <div style="font-size:1.3rem;font-weight:800;color:#3730A3;">£${pricingInfo.totalCost || pricingInfo.total_cost || 0}</div>
                <div style="font-size:0.75rem;color:#6B7280;">Total Cost</div>
              </div>
              <div style="background:#FEF3C7;border-radius:8px;padding:12px;text-align:center;">
                <div style="font-size:1.3rem;font-weight:800;color:#B45309;">£${pricingInfo.upfrontPayment || pricingInfo.upfront_payment || 0}</div>
                <div style="font-size:0.75rem;color:#6B7280;">Upfront Due</div>
              </div>
              <div style="background:#F3F4F6;border-radius:8px;padding:12px;text-align:center;">
                <div style="font-size:1.3rem;font-weight:800;color:#6B7280;">£${pricingInfo.remainingBalance || pricingInfo.remaining_balance || 0}</div>
                <div style="font-size:0.75rem;color:#6B7280;">Remaining</div>
              </div>
              ${pricingInfo.packageName ? `<div style="grid-column:1/-1;text-align:center;font-size:0.85rem;color:#6B7280;">Package: ${window.escapeHtml(pricingInfo.packageName)}</div>` : ''}
            </div>
          </div>
          ` : ''}

          ${application.service_data && Object.keys(application.service_data).length > 0 ? `
          <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Service Details</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.9rem;">
              ${Object.entries(application.service_data).filter(([k]) => k !== 'drivingPackage' && k !== 'pcoPackage').map(([key, value]) => {
                const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
                return `<div${key === 'pcoAdditionalInfo' || key === 'reasonForNI' || value?.length > 60 ? ' style="grid-column:1/-1;"' : ''}><strong>${label}:</strong> ${window.escapeHtml(String(value))}</div>`;
              }).join('')}
              ${(() => {
                const sd = application.service_data;
                const pkg = sd.drivingPackage || sd.pcoPackage;
                if (!pkg) return '';
                const names = {
                  'driving-licence': { theory:'Theory Test Support', practical:'Practical Test Support', full:'Full Licence Conversion' },
                  'pco-licence': { theory:'Theory Test Package', practical:'Practical Test Package', full:'Full Licence Package', complete:'Complete PCO Licence' }
                };
                const map = names[application.service_type];
                const display = map && map[pkg] ? map[pkg] : pkg;
                return `<div style="grid-column:1/-1;"><strong>Package:</strong> ${display}</div>`;
              })()}
            </div>
          </div>
          ` : ''}

          <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Personal Information</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.9rem;">
              <div><strong>Name:</strong> ${window.escapeHtml(application.first_name)} ${window.escapeHtml(application.last_name)}</div>
              <div><strong>Email:</strong> ${window.escapeHtml(application.email)}</div>
              <div><strong>Phone:</strong> ${window.escapeHtml(application.phone)}</div>
              <div><strong>Date of Birth:</strong> ${new Date(application.date_of_birth).toLocaleDateString('en-GB')}</div>
              <div><strong>Nationality:</strong> ${window.escapeHtml(application.nationality)}</div>
              <div><strong>Address:</strong> ${window.escapeHtml(application.address)}</div>
            </div>
          </div>

          ${application.additional_info ? `
            <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
              <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Additional Information</h4>
              <p style="font-size:0.9rem;color:#374151;line-height:1.6;">${window.escapeHtml(application.additional_info)}</p>
            </div>
          ` : ''}

          <div style="background:#F9FAFB;border-radius:8px;padding:20px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Documents</h4>
            <div style="display:flex;flex-direction:column;gap:12px;font-size:0.9rem;">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <i class="fas ${documents?.passport_provided ? 'fa-check-circle' : 'fa-clock'}" style="color:${documents?.passport_provided ? '#2E9F6E' : '#D4735E'}"></i>
                  Passport / ID Document: ${documents?.passport_provided ? 'Uploaded' : 'Pending'}
                </div>
                ${documents?.passport_file_path ? `
                  <button onclick="downloadDocument('${documents.passport_file_path}')" class="admin-btn admin-btn-small admin-btn-outline">
                    <i class="fas fa-download"></i> Download
                  </button>
                ` : ''}
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <i class="fas ${documents?.address_proof_provided ? 'fa-check-circle' : 'fa-clock'}" style="color:${documents?.address_proof_provided ? '#2E9F6E' : '#D4735E'}"></i>
                  Proof of Address: ${documents?.address_proof_provided ? 'Uploaded' : 'Pending'}
                </div>
                ${documents?.address_proof_file_path ? `
                  <button onclick="downloadDocument('${documents.address_proof_file_path}')" class="admin-btn admin-btn-small admin-btn-outline">
                    <i class="fas fa-download"></i> Download
                  </button>
                ` : ''}
              </div>
              ${documents?.additional_doc_provided ? `
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                  <div style="display:flex;align-items:center;gap:8px;">
                    <i class="fas fa-check-circle" style="color:#2E9F6E"></i>
                    Additional Document: Uploaded
                  </div>
                  ${documents?.additional_doc_file_path ? `
                    <button onclick="downloadDocument('${documents.additional_doc_file_path}')" class="admin-btn admin-btn-small admin-btn-outline">
                      <i class="fas fa-download"></i> Download
                    </button>
                  ` : ''}
                </div>
              ` : ''}
            </div>
          </div>
        </div>

        <div>
          <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Update Status</h4>
            <select id="statusUpdate" onchange="toggleRejectionReason()" style="width:100%;padding:10px;border:1px solid #D1D5DB;border-radius:6px;margin-bottom:12px;">
              <option value="submitted" ${application.status === 'submitted' ? 'selected' : ''}>Submitted</option>
              <option value="in_review" ${application.status === 'in_review' ? 'selected' : ''}>In Review</option>
              <option value="processing" ${application.status === 'processing' ? 'selected' : ''}>Processing</option>
              <option value="approved" ${application.status === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="rejected" ${application.status === 'rejected' ? 'selected' : ''}>Rejected</option>
            </select>
            <div id="rejectionReasonWrap" style="${application.status === 'rejected' ? 'display:block;' : 'display:none;'}">
              <input type="text" id="rejectionReason" placeholder="Rejection reason" style="width:100%;padding:10px;border:1px solid #D1D5DB;border-radius:6px;margin-bottom:12px;" value="${application.rejection_reason || ''}">
            </div>
            <button onclick="updateApplicationStatus('${application.id}')" class="admin-btn admin-btn-primary" style="width:100%;">
              <i class="fas fa-save"></i> Update Status
            </button>
          </div>

          <div style="background:#F9FAFB;border-radius:8px;padding:20px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Add Admin Note</h4>
            <textarea id="adminNote" rows="3" placeholder="Enter your note..." style="width:100%;padding:10px;border:1px solid #D1D5DB;border-radius:6px;margin-bottom:12px;resize:vertical;"></textarea>
            <button onclick="addAdminNote('${application.id}')" class="admin-btn admin-btn-secondary" style="width:100%;">
              <i class="fas fa-plus"></i> Add Note
            </button>
          </div>

          ${notes && notes.length > 0 ? `
            <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-top:16px;">
              <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Admin Notes</h4>
              <div style="display:flex;flex-direction:column;gap:12px;">
                ${notes.map(note => `
                  <div style="display:flex;align-items:flex-start;gap:8px;background:#FEF3C7;border-left:4px solid #D4735E;padding:12px;border-radius:4px;">
                    <div style="flex:1;min-width:0;">
                      <div style="font-size:0.82rem;color:#6B7280;margin-bottom:4px;">
                        ${note.admin_name || 'Admin'} · ${new Date(note.created_at).toLocaleDateString('en-GB')}
                      </div>
                      <div style="font-size:0.9rem;color:#374151;">${window.escapeHtml(note.note)}</div>
                    </div>
                    <button onclick="deleteAdminNote('${note.id}')" style="background:none;border:none;color:#EF4444;cursor:pointer;font-size:0.85rem;padding:2px;flex-shrink:0;" title="Delete note">
                      <i class="fas fa-times"></i>
                    </button>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}

          <div style="margin-top:16px;">
            <button onclick='openEmailModal({recipientId:"${application.id}",recipientType:"application",email:"${window.escapeHtml(application.email)}",name:"${window.escapeHtml(application.first_name)} ${window.escapeHtml(application.last_name)}"})' class="admin-btn admin-btn-outline" style="width:100%;margin-bottom:8px;">
              <i class="fas fa-envelope"></i> Email Applicant
            </button>
            <button onclick="copyPaymentMail('${application.id}')" class="admin-btn admin-btn-success" style="width:100%;margin-bottom:8px;" title="Copy payment invoice text to clipboard">
              <i class="fas fa-copy"></i> Copy Payment Mail
            </button>
            <button onclick="deleteApplication('${application.id}')" class="admin-btn admin-btn-danger" style="width:100%;">
              <i class="fas fa-trash"></i> Delete Application
            </button>
          </div>
        `;

    document.getElementById('applicationDetail').innerHTML = detailHTML;
    showPage('application-detail');
  } catch (e) {
    console.error('View application error:', e);
    alert('Error loading application details');
  }
};

window.deleteApplication = async function(applicationId) {
  if (!confirm('Delete this application and all its documents & notes?')) return;

  const toast = window.showToast('Deleting application...', 'default', 6000);

  try {
    const { data: notesData, error: notesErr } = await db.from('application_notes').delete().eq('application_id', applicationId).select();
    if (notesErr) throw notesErr;
    const { data: docsData, error: docsErr } = await db.from('application_documents').delete().eq('application_id', applicationId).select();
    if (docsErr) throw docsErr;
    const { data: appData, error: appErr } = await db.from('applications').delete().eq('id', applicationId).select();
    if (appErr) throw appErr;
    if (!appData || appData.length === 0) throw new Error('Delete failed — admin RLS permission missing. Run the updated schema.');
    _logAudit('application_deleted', { application_id: applicationId });
    toast.undo('Undo', async () => {
      try {
        if (appData?.[0]) await db.from('applications').insert(appData[0]);
        if (notesData?.length) await db.from('application_notes').insert(notesData);
        if (docsData?.length) await db.from('application_documents').insert(docsData);
        window.showToast('Application restored', 'success', 3000);
      } catch {
        window.showToast('Could not restore — data may have been cleaned up', 'error', 4000);
      }
    });
    loadApplications();
    showPage('applications');
  } catch (e) {
    console.error('Delete application error:', e);
    window.showToast('Error deleting: ' + e.message, 'error', 4000);
  }
};

window.copyPaymentMail = async function(applicationId) {
  try {
    const { data: app, error } = await db.from('applications').select('*').eq('id', applicationId).single();
    if (error) throw error;

    const pricingInfo = app.pricing_info && Object.keys(app.pricing_info).length > 0 ? app.pricing_info : null;
    const serviceName = _serviceNames[app.service_type] || app.service_type;
    const invoiceDate = new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    const invoiceNumber = `INV-${app.id.slice(0, 8).toUpperCase()}`;

    // Get document information
    const { data: documents } = await db.from('application_documents').select('*').eq('application_id', applicationId).single();

    // Build service-specific details
    let serviceDetails = '';
    if (app.service_data && Object.keys(app.service_data).length > 0) {
      const serviceFields = Object.entries(app.service_data)
        .filter(([key, value]) => value && key !== 'drivingPackage' && key !== 'pcoPackage')
        .map(([key, value]) => {
          const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
          return `${label}: ${value}`;
        }).join('\n');
      
      if (serviceFields) {
        serviceDetails = `\nSERVICE DETAILS:\n${serviceFields}`;
      }
    }

    // Build document status
    let docStatus = '';
    if (documents) {
      const docItems = [];
      if (documents.passport_provided) docItems.push('✓ Passport / ID Document');
      if (documents.address_proof_provided) docItems.push('✓ Proof of Address');
      if (documents.additional_doc_provided) docItems.push('✓ Additional Document');
      
      if (docItems.length > 0) {
        docStatus = `\nDOCUMENTS SUBMITTED:\n${docItems.join('\n')}`;
      }
    }

    // Build payment text
    const paymentText = `
═══════════════════════════════════════════════════════════════
PAYMENT INVOICE - ClearRoute UK
═══════════════════════════════════════════════════════════════

INVOICE NUMBER: ${invoiceNumber}
INVOICE DATE: ${invoiceDate}

Dear ${app.first_name} ${app.last_name},

Thank you for choosing ClearRoute UK for your ${serviceName}. 
Your application has been reviewed and is ready for processing.

═══════════════════════════════════════════════════════════════
INVOICE DETAILS
═══════════════════════════════════════════════════════════════

Application ID: ${app.id}
Service: ${serviceName}
${pricingInfo?.packageName ? `Package: ${pricingInfo.packageName}` : ''}

PAYMENT SUMMARY:
${pricingInfo ? `
Total Cost: £${pricingInfo.totalCost || pricingInfo.total_cost || 0}
Upfront Payment Due: £${pricingInfo.upfrontPayment || pricingInfo.upfront_payment || 0}
Remaining Balance: £${pricingInfo.remainingBalance || pricingInfo.remaining_balance || 0}` : 'Contact us for pricing details'}

═══════════════════════════════════════════════════════════════
CLIENT INFORMATION
═══════════════════════════════════════════════════════════════

Name: ${app.first_name} ${app.last_name}
Email: ${app.email}
${app.phone ? `Phone: ${app.phone}` : ''}
${app.date_of_birth ? `Date of Birth: ${new Date(app.date_of_birth).toLocaleDateString('en-GB')}` : ''}
${app.nationality ? `Nationality: ${app.nationality}` : ''}
${app.address ? `Address: ${app.address}` : ''}
${serviceDetails}
${docStatus}

═══════════════════════════════════════════════════════════════
PAYMENT METHODS
═══════════════════════════════════════════════════════════════

BANK TRANSFER (PREFERRED):
Account Name: ClearRoute UK
Account Number: [UPDATE WITH YOUR ACCOUNT NUMBER]
Sort Code: [UPDATE WITH YOUR SORT CODE]
Reference: ${app.id}

ALTERNATIVE PAYMENT METHODS:
• Wise Transfer: Send to info@clearrouteuk.co.uk
• PayPal: Send to info@clearrouteuk.co.uk
• WhatsApp: Contact us at +447983312575 for payment link

═══════════════════════════════════════════════════════════════
IMPORTANT PAYMENT NOTES
═══════════════════════════════════════════════════════════════

• Please include Application ID (${app.id}) as your payment reference
${pricingInfo ? `• Remaining balance of £${pricingInfo.remainingBalance || pricingInfo.remaining_balance || 0} is due upon completion of key milestones` : ''}
• Work commences within 24 hours of payment confirmation
• Please send payment confirmation to info@clearrouteuk.co.uk

═══════════════════════════════════════════════════════════════

If you have any questions about this invoice or payment process, 
please contact us at info@clearrouteuk.co.uk or WhatsApp +447983312575.

© ${new Date().getFullYear()} ClearRoute UK. All rights reserved.
Registered in England & Wales
═══════════════════════════════════════════════════════════════
`.trim();

    // Copy to clipboard
    await navigator.clipboard.writeText(paymentText);
    
    _logAudit('payment_mail_copied', { application_id: applicationId });
    alert('Payment invoice text copied to clipboard! You can now paste it in your email client.');
  } catch (e) {
    console.error('Copy payment mail error:', e);
    alert('Error copying payment text: ' + e.message);
  }
};

async function _logAudit(action, details) {
  try {
    if (!db) return;
    const authRes = await db.auth.getUser();
    const user = authRes?.data?.user;
    await db.from('audit_log').insert({
      action,
      details,
      admin_email: user?.email || 'unknown',
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('Audit log failed:', e);
  }
}

window.updateApplicationStatus = async function(applicationId) {
  const newStatus = document.getElementById('statusUpdate').value;
  const rejectionReason = document.getElementById('rejectionReason')?.value;

  try {
    const { data: current } = await db.from('applications').select('status').eq('id', applicationId).single();
    const oldStatus = current?.status || 'unknown';

    const updateData = { status: newStatus };
    if (newStatus === 'rejected' && rejectionReason) {
      updateData.rejection_reason = rejectionReason;
    }

    const { data, error } = await db
      .from('applications')
      .update(updateData)
      .eq('id', applicationId)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Update failed — admin permission required. Run the updated schema and set is_admin = TRUE on your profile.');
    }

    _logAudit('application_status_change', {
      application_id: applicationId,
      from: oldStatus,
      to: newStatus,
      rejection_reason: newStatus === 'rejected' ? rejectionReason : null
    });

    alert('Status updated successfully');
    loadApplications();
    viewApplication(applicationId);

  } catch (e) {
    console.error('Update status error:', e);
    alert(e.message || 'Error updating status');
  }
};

window.addAdminNote = async function(applicationId) {
  const note = document.getElementById('adminNote').value.trim();
  if (!note) {
    alert('Please enter a note');
    return;
  }

  try {
    const authRes = await db.auth.getUser();
    const user = authRes?.data?.user;

    const { data, error } = await db
      .from('application_notes')
      .insert({
        application_id: applicationId,
        note: note,
        admin_name: user?.email || 'Admin',
        created_at: new Date().toISOString()
      })
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('Failed to add note — admin permission required.');
    }

    document.getElementById('adminNote').value = '';
    alert('Note added successfully');
    viewApplication(applicationId);

  } catch (e) {
    console.error('Add note error:', e);
    alert('Error adding note');
  }
};

window._currentApplicationId = null;

window.deleteAdminNote = async function(noteId) {
  if (!confirm('Delete this note?')) return;

  try {
    const { data, error } = await db.from('application_notes').delete().eq('id', noteId).select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Delete failed — admin RLS permission missing. Run the updated schema.');

    const toast = window.showToast('Note deleted', 'success', 6000);
    toast.undo('Undo', async () => {
      try {
        if (data?.[0]) await db.from('application_notes').insert(data[0]);
      } catch {
        window.showToast('Could not restore note', 'error', 4000);
      }
    });

    if (window._currentApplicationId) {
      viewApplication(window._currentApplicationId);
    }
  } catch (e) {
    console.error('Delete note error:', e);
    window.showToast('Error deleting note: ' + e.message, 'error', 4000);
  }
};

window.showPage = function(page) {
  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  
  if (page === 'audit-log' && !document.getElementById('auditLogList').querySelector('.admin-audit-item')) {
    loadAuditLog();
  }
  const titles = { dashboard: 'Dashboard', chat: 'Live Chat Inbox', applications: 'User Applications', 'application-detail': 'Application Details', enquiries: 'Enquiries', 'enquiry-detail': 'Enquiry Details', users: 'Users', 'user-detail': 'User Details', 'audit-log': 'Audit Log', 'email-inbox': 'Email Inbox', 'email-detail': 'Email Details' };
  document.getElementById('topbarTitle').textContent = titles[page] || 'Dashboard';
};

/* ════════════════════════════════════════
   DASHBOARD STATS
════════════════════════════════════════ */
async function loadDashboardStats() {
  const activityEl = document.getElementById('dashboardActivity');

  try {
    // Get sessions with admin mode or requested human
    const { data: sessions1, error: error1 } = await db
      .from('chat_sessions')
      .select('*')
      .or('is_admin_mode.eq.true,requested_human.eq.true')
      .order('updated_at', { ascending: false })
      .limit(20);

    // Get sessions in admin queue
    const { data: queueSessions, error: error2 } = await db
      .from('admin_queue')
      .select('session_id')
      .eq('status', 'pending')
      .limit(20);

    const queueIds = queueSessions?.map(q => q.session_id) || [];

    // Get sessions that are in the queue but not already loaded
    let sessions2 = [];
    if (queueIds.length > 0) {
      const { data: queuedSessions, error: error3 } = await db
        .from('chat_sessions')
        .select('*')
        .in('id', queueIds)
        .order('updated_at', { ascending: false })
        .limit(20);

      sessions2 = queuedSessions || [];
    }

    // Combine and deduplicate sessions
    const allSessions = [...(sessions1 || []), ...sessions2];
    const uniqueSessions = Array.from(
      new Map(allSessions.map(s => [s.id, s])).values())
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .slice(0, 20);

    const sessions = uniqueSessions;

    document.getElementById('statSessions').textContent = sessions?.length || 0;

    const { count: queueCount } = await db
      .from('admin_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    document.getElementById('statHandoffs').textContent  = queueCount || 0;

    // Count applications approved today
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { count: resolvedCount } = await db
      .from('applications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
      .gte('updated_at', todayStart.toISOString());

    document.getElementById('statResolved').textContent  = resolvedCount || 0;

    // Count only admin messages (human conversations)
    const { count: msgCount } = await db
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('sender', 'admin');

    document.getElementById('statMessages').textContent = msgCount || 0;

    // Activity feed
    if (!sessions || sessions.length === 0) {
      activityEl.innerHTML = '<p style="color:#9CA3AF;font-size:0.88rem;text-align:center;padding:24px 0;">No human conversations yet.</p>';
      return;
    }

    activityEl.innerHTML = sessions.map(s => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #EEF1F6;">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#0D4F4F,#1A6B6B);color:#D4735E;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;flex-shrink:0;">
          <i class="fas fa-user"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.82rem;font-weight:700;color:#1A1A2E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${window.escapeHtml(s.visitor_name || s.id)}
          </div>
          <div style="font-size:0.75rem;color:#6B7280;">
            ${window.escapeHtml((s.last_message || 'No messages').slice(0, 50))} · ${window.escapeHtml(s.page || '/')}
          </div>
        </div>
        ${s.is_admin_mode
          ? '<span style="background:#7C3AED;color:white;font-size:0.65rem;font-weight:800;padding:2px 8px;border-radius:100px;">Live</span>'
          : '<span style="background:#D4735E;color:white;font-size:0.65rem;font-weight:800;padding:2px 8px;border-radius:100px;">Requested</span>'}
        <button onclick="goToSession('${s.id}')"
          style="padding:5px 12px;background:#0D4F4F;color:white;border:none;border-radius:6px;font-size:0.75rem;font-weight:600;cursor:pointer;flex-shrink:0;">
          View
        </button>
      </div>
    `).join('');

  } catch (e) {
    console.error('Stats error:', e);
    activityEl.innerHTML = '<p style="color:#EF4444;font-size:0.85rem;text-align:center;padding:24px 0;">Error loading activity.</p>';
  }
}

window.goToSession = function(id) {
  const chatPage = document.querySelector('[data-page="chat"]');
  if (chatPage) chatPage.click();
  setTimeout(() => openSession(id), 100);
};

/* ════════════════════════════════════════
   SESSIONS LIST
════════════════════════════════════════ */
window.loadSessions = async function() {
  const list = document.getElementById('sessionsList');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;font-size:0.85rem;">Loading...</div>';

  console.log('[Admin] Loading sessions...');

  try {
    // Get sessions with admin mode or requested human
    const { data: sessions1, error: error1 } = await db
      .from('chat_sessions')
      .select('*')
      .or('is_admin_mode.eq.true,requested_human.eq.true')
      .order('updated_at', { ascending: false });

    // Get sessions in admin queue
    const { data: queueSessions, error: error2 } = await db
      .from('admin_queue')
      .select('session_id')
      .eq('status', 'pending');

    const queueIds = queueSessions?.map(q => q.session_id) || [];

    // Get sessions that are in the queue but not already loaded
    let sessions2 = [];
    if (queueIds.length > 0) {
      const { data: queuedSessions, error: error3 } = await db
        .from('chat_sessions')
        .select('*')
        .in('id', queueIds)
        .order('updated_at', { ascending: false });

      sessions2 = queuedSessions || [];
    }

    // Combine and deduplicate sessions
    const allSessions = [...(sessions1 || []), ...sessions2];
    const uniqueSessions = Array.from(
      new Map(allSessions.map(s => [s.id, s])).values()
    );

    // Sort by updated_at
    uniqueSessions.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

    console.log('[Admin] Sessions loaded:', uniqueSessions.length);

    if (!uniqueSessions.length) {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;font-size:0.85rem;">No active human conversations yet.</div>';
      return;
    }

    // Populate prevSessionIds for notifications
    uniqueSessions.forEach(s => prevSessionIds.add(s.id));

    list.innerHTML = '';
    uniqueSessions.forEach(s => {
      const div = document.createElement('div');
      div.className = `chat-session-item ${s.id === currentSess ? 'active' : ''}`;
      div.dataset.sessionId = s.id;

      // Show visitor name if available, otherwise show session ID
      const displayName = s.visitor_name || s.id.slice(0, 22) + '...';
      const hasUnread = (s.unread || 0) > 0;

      div.innerHTML = `
        <div class="session-avatar">${s.visitor_name ? s.visitor_name.charAt(0).toUpperCase() : '<i class="fas fa-user"></i>'}</div>
        <div class="session-info">
          <div class="session-id">${window.escapeHtml(displayName)}</div>
        <div class="session-preview">${window.escapeHtml((s.last_message || 'No messages').slice(0, 38))}</div>
      </div>
      ${hasUnread ? `<div class="session-unread">${s.unread}</div>` : ''}
      ${s.is_admin_mode ? '<span class="session-badge admin-active">Live</span>' : '<span class="session-badge">Requested</span>'}
    `;
    div.addEventListener('click', () => openSession(s.id));
    list.appendChild(div);
    });
  } catch (e) {
    console.error('[Admin] Error loading sessions:', e);
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#EF4444;font-size:0.85rem;">Error loading sessions. Please check console for details.</div>';
  }
};

/* ════════════════════════════════════════
   OPEN SESSION
════════════════════════════════════════ */
window.deleteSession = async function(sessionId) {
  if (!confirm('Delete this chat session and all its messages?')) return;

  try {
    await db.from('chat_messages').delete().eq('session_id', sessionId).select();
    await db.from('admin_replies').delete().eq('session_id', sessionId).select();
    await db.from('admin_queue').delete().eq('session_id', sessionId).select();
    const { data, error } = await db.from('chat_sessions').delete().eq('id', sessionId).select();
    if (error) throw error;
    if (!data || data.length === 0) throw new Error('Delete failed — admin permission missing. Run the updated schema.');
    _logAudit('chat_session_deleted', { session_id: sessionId });
    const toast = window.showToast('Chat session deleted', 'success', 6000);
    toast.undo('Undo', async () => {
      try {
        if (data?.[0]) await db.from('chat_sessions').insert(data[0]);
        window.showToast('Session restored', 'success', 3000);
      } catch {
        window.showToast('Could not restore session', 'error', 4000);
      }
    });
    currentSess = null;
    loadSessions();
    loadDashboardStats();
    document.getElementById('chatViewPanel').innerHTML = `
      <div class="chat-empty-state">
        <i class="fas fa-comments"></i>
        <h3>Select a conversation</h3>
        <p>Choose a session from the list to view messages</p>
      </div>
    `;
  } catch (e) {
    console.error('Delete session error:', e);
    window.showToast('Error deleting session: ' + e.message, 'error', 4000);
  }
};

async function openSession(sessionId) {
  currentSess = sessionId;

  document.querySelectorAll('.chat-session-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sessionId === sessionId);
  });

  // Get session data
  const { data: session } = await db
    .from('chat_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  const displayName = window.escapeHtml(session?.visitor_name || sessionId);
  const statusText = session?.is_admin_mode ? 'Live chat' : 'Waiting for agent';

  const panel = document.getElementById('chatViewPanel');
  panel.innerHTML = `
    <div class="chat-view-header">
      <div>
        <div class="chat-view-session-id">${displayName}</div>
        <div class="chat-view-meta">${window.escapeHtml(statusText)} · ${window.escapeHtml(session?.page || '/')}</div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="admin-btn admin-btn-small admin-btn-success" id="takeOverBtn">
          <i class="fas fa-headset"></i> Take Over
        </button>
        <button class="admin-btn admin-btn-small admin-btn-danger" onclick="deleteSession('${sessionId}')" title="Delete this chat session">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
    <div class="chat-view-messages" id="adminMsgContainer"></div>
    <div class="visitor-typing" id="visitorTypingIndicator" style="display:none;padding:0 16px 4px;">
      <i class="fas fa-ellipsis fa-beat"></i> Visitor is typing...
    </div>
    <div class="chat-view-footer" id="adminReplyArea" style="display:none;">
      <textarea class="admin-reply-input" id="adminReplyInput"
        placeholder="Type your reply..." rows="2"></textarea>
      <button class="admin-reply-send" id="adminReplySend">
        <i class="fas fa-paper-plane"></i> Send
      </button>
    </div>
  `;

  // Reset unread count
  await db.from('chat_sessions')
    .update({ unread: 0 })
    .eq('id', sessionId);

  const takeOverBtn = document.getElementById('takeOverBtn');
  if (takeOverBtn) {
    takeOverBtn.addEventListener('click', async () => {
      const replyArea = document.getElementById('adminReplyArea');
      if (replyArea) {
        replyArea.style.display = 'flex';
      }
      const btn = document.getElementById('takeOverBtn');
      btn.innerHTML = '<i class="fas fa-check"></i> You\'re handling this';
      btn.style.background = '#2E9F6E';

      // Mark session as admin-handled
      await db.from('chat_sessions')
        .update({ is_admin_mode: true, status: 'active' })
        .eq('id', sessionId);
    });
  }

  document.getElementById('adminReplySend').addEventListener('click', sendReply);
  document.getElementById('adminReplyInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); }
  });

  document.getElementById('adminReplyInput').addEventListener('input', () => {
    // Update admin typing indicator
    db.from('chat_sessions')
      .update({ admin_typing: new Date().toISOString() })
      .eq('id', sessionId)
      .catch(() => {});
  });

  // Load existing messages
  const { data: messages } = await db
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  renderMessages(messages || []);

  // Start typing indicator refresh
  refreshActiveConvo();

  // Subscribe to new messages in real time
  if (msgChannel) db.removeChannel(msgChannel);

  msgChannel = db
    .channel('admin-msgs-' + sessionId)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `session_id=eq.${sessionId}`,
      },
      payload => {
        appendMessage(payload.new);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_sessions',
        filter: `id=eq.${sessionId}`,
      },
      payload => {
        // Handle typing indicators and status changes
        const updated = payload.new;
        const typingIndicator = document.getElementById('visitorTypingIndicator');

        if (updated.visitor_typing && typingIndicator) {
          const diff = Date.now() - new Date(updated.visitor_typing).getTime();
          typingIndicator.style.display = diff < 4000 ? 'flex' : 'none';
        }

        // Update session display if visitor name changes
        if (updated.visitor_name && updated.visitor_name !== session?.visitor_name) {
          const nameEl = document.querySelector('.chat-view-session-id');
          if (nameEl) nameEl.textContent = updated.visitor_name;
        }
      }
    )
    .subscribe();
}

/* ── Render all messages ── */
function renderMessages(messages) {
  const container = document.getElementById('adminMsgContainer');
  if (!container) return;
  container.innerHTML = '';
  messages.forEach(m => appendMessage(m, false));
  container.scrollTop = container.scrollHeight;
}

/* ── Append one message ── */
function appendMessage(msg, scroll = true) {
  const container = document.getElementById('adminMsgContainer');
  if (!container) return;

  const avatars = {
    bot:   '<i class="fas fa-route"></i>',
    user:  '<i class="fas fa-user"></i>',
    admin: '<i class="fas fa-headset"></i>',
  };

  const time = msg.created_at
    ? new Date(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';

  const div = document.createElement('div');
  div.className = `admin-msg ${msg.sender}`;
  div.innerHTML = `
    <div class="admin-msg-avatar">${avatars[msg.sender] || '?'}</div>
    <div>
      <div class="admin-msg-bubble">${window.escapeHtml(msg.text)}</div>
      <div class="admin-msg-time">${time}</div>
    </div>
  `;
  container.appendChild(div);
  if (scroll) container.scrollTop = container.scrollHeight;
}

/* ════════════════════════════════════════
   REFRESH ACTIVE CONVO (typing indicators)
════════════════════════════════════════ */
let _typingInterval = null;

function refreshActiveConvo() {
  if (!currentSess) return;

  if (_typingInterval) clearInterval(_typingInterval);

  // Update typing indicator periodically
  _typingInterval = setInterval(async () => {
    if (!currentSess) return;

    const { data: session } = await db
      .from('chat_sessions')
      .select('visitor_typing, admin_typing')
      .eq('id', currentSess)
      .single();

    if (!session) return;

    const typingIndicator = document.getElementById('visitorTypingIndicator');
    if (typingIndicator && session.visitor_typing) {
      const diff = Date.now() - new Date(session.visitor_typing).getTime();
      typingIndicator.style.display = diff < 4000 ? 'flex' : 'none';
    }
  }, 2000);
}

/* ── Send admin reply ── */
async function sendReply() {
  const input = document.getElementById('adminReplyInput');
  const text  = input?.value.trim();
  if (!text || !currentSess) return;
  input.value = '';

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const timestampMs = Date.now();

  try {
    // Save to admin_replies (client listens here)
    await db.from('admin_replies').insert({
      session_id: currentSess,
      text,
      timestamp_ms: timestampMs,
    });

    // Save to chat_messages (for full history view) - check for duplicates first
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { data: recentMessages } = await db
      .from('chat_messages')
      .select('text, sender, created_at')
      .eq('session_id', currentSess)
      .eq('sender', 'admin')
      .eq('text', text)
      .gte('created_at', oneMinuteAgo)
      .limit(1);

    // Only insert if no duplicate found in last minute
    if (!recentMessages || recentMessages.length === 0) {
      await db.from('chat_messages').insert({
        session_id: currentSess,
        text,
        sender: 'admin',
      });
    }

    // Update session
    await db.from('chat_sessions')
      .update({
        last_message: text,
        last_sender: 'admin',
        is_admin_mode: true,
        status: 'active',
        admin_typing: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentSess);

    // Optimistic UI update
    const container = document.getElementById('adminMsgContainer');
    if (container) {
      const div = document.createElement('div');
      div.className = 'admin-msg admin';
      div.innerHTML = `
        <div class="admin-msg-avatar"><i class="fas fa-headset"></i></div>
        <div>
          <div class="admin-msg-bubble">${text}</div>
          <div class="admin-msg-time">${timeStr}</div>
        </div>
      `;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

  } catch (e) {
    console.error('Reply error:', e);
  }
}

/* ════════════════════════════════════════
    EMAIL COMPOSE MODAL
════════════════════════════════════════ */

let _lastFocusedEl = null;

function _focusTrap(e) {
  const overlay = document.getElementById('emailModalOverlay');
  if (overlay.style.display !== 'flex') return;

  const focusable = overlay.querySelectorAll(
    'input, textarea, select, button, [tabindex]:not([tabindex="-1"])'
  );
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last  = focusable[focusable.length - 1];

  if (e.key === 'Tab') {
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeEmailModal();
  _focusTrap(e);
});

window.openEmailModal = function({ recipientId, recipientType, email, name, subject = '' }) {
  _lastFocusedEl = document.activeElement;

  document.getElementById('emailRecipientId').value = recipientId || '';
  document.getElementById('emailRecipientType').value = recipientType || '';
  document.getElementById('emailTo').value = email || '';
  document.getElementById('emailRecipientName').value = name || '';
  document.getElementById('emailSubject').value = subject;
  document.getElementById('emailMessage').value = '';
  document.getElementById('emailSendError').style.display = 'none';

  const typeLabels = { application: 'Applicant', enquiry: 'Enquirer', user: 'User' };
  document.getElementById('emailModalTitle').textContent = `Compose Email to ${typeLabels[recipientType] || 'Recipient'}`;

  document.getElementById('emailModalOverlay').style.display = 'flex';

  const firstField = document.getElementById('emailSubject');
  if (firstField) setTimeout(() => firstField.focus(), 100);
};

window.closeEmailModal = function() {
  document.getElementById('emailModalOverlay').style.display = 'none';
  if (_lastFocusedEl && typeof _lastFocusedEl.focus === 'function') {
    _lastFocusedEl.focus();
  }
  _lastFocusedEl = null;
};

window.sendComposeEmail = async function() {
  const to = document.getElementById('emailTo').value;
  const name = document.getElementById('emailRecipientName').value;
  const subject = document.getElementById('emailSubject').value.trim();
  const message = document.getElementById('emailMessage').value.trim();
  const errorEl = document.getElementById('emailSendError');
  const btn = document.getElementById('emailSendBtn');

  errorEl.style.display = 'none';

  if (!subject || !message) {
    errorEl.textContent = 'Please fill in subject and message.';
    errorEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

  try {
    await window.EmailService.sendAdminCompose({
      to_email: to,
      to_name: name,
      subject,
      message: message.replace(/\n/g, '<br>'),
    });

    btn.innerHTML = '<i class="fas fa-check"></i> Sent!';
    setTimeout(closeEmailModal, 1000);

    _logAudit('email_sent', {
      to,
      subject,
      recipient_type: document.getElementById('emailRecipientType').value,
      recipient_id: document.getElementById('emailRecipientId').value,
    });
  } catch (err) {
    console.error('Email send error:', err);
    errorEl.textContent = 'Failed to send. Make sure you have created an EmailJS compose template (see instructions below).';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Email';
  }
};

/* ════════════════════════════════════════
    DOCUMENT DOWNLOAD
════════════════════════════════════════ */
window.downloadDocument = async function(filePath) {
  try {
    const { data, error } = await db.storage
      .from('documents')
      .createSignedUrl(filePath, 60); // 60 second expiry
    
    if (error) throw error;
    
    // Open the signed URL in a new tab
    window.open(data.signedUrl, '_blank');
    
  } catch (e) {
    console.error('Download error:', e);
    alert('Error downloading document. Please try again.');
  }
};

/* ════════════════════════════════════════
   SETTINGS MANAGEMENT
════════════════════════════════════════ */

const DEFAULT_INVOICE_TEMPLATE = `INVOICE

Invoice Number: {{invoice_number}}
Date: {{invoice_date}}

Client: {{client_name}}
Service: {{service_name}}

Amount: {{amount}}
Status: {{status}}

Thank you for your business.`;

window.loadSettings = async function() {
  try {
    // Load admin profile
    const authRes = await db.auth.getUser();
    const user = authRes?.data?.user;
    if (user) {
      const { data: profile } = await db
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', user.id)
        .single();
      
      if (profile) {
        document.getElementById('settingsFirstName').value = profile.first_name || '';
        document.getElementById('settingsLastName').value = profile.last_name || '';
        document.getElementById('settingsEmail').value = profile.email || '';
      }
    }
    
    // Load invoice template from localStorage or use default
    const savedTemplate = localStorage.getItem('invoiceTemplate');
    document.getElementById('invoiceTemplate').value = savedTemplate || DEFAULT_INVOICE_TEMPLATE;
    
    // Load system information
    document.getElementById('systemAdminEmail').textContent = user?.email || '—';
    
    const { count: userCount } = await db.from('profiles').select('*', { count: 'exact', head: true });
    document.getElementById('systemTotalUsers').textContent = userCount || 0;
    
    const { count: appCount } = await db.from('applications').select('*', { count: 'exact', head: true });
    document.getElementById('systemTotalApps').textContent = appCount || 0;
    
  } catch (e) {
    console.error('Load settings error:', e);
  }
};

window.saveProfileSettings = async function() {
  try {
    const authRes = await db.auth.getUser();
    const user = authRes?.data?.user;
    if (!user) {
      alert('No authenticated user found');
      return;
    }
    
    const firstName = document.getElementById('settingsFirstName').value.trim();
    const lastName = document.getElementById('settingsLastName').value.trim();
    
    if (!firstName || !lastName) {
      alert('Please enter both first name and last name');
      return;
    }
    
    const { error } = await db
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);
    
    if (error) throw error;
    
    // Update auth metadata
    await db.auth.updateUser({
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: `${firstName} ${lastName}`
      }
    });
    
    alert('Profile updated successfully');
    
    // Update sidebar display
    document.getElementById('sidebarUserEmail').textContent = user.email;
    
  } catch (e) {
    console.error('Save profile error:', e);
    alert('Error saving profile: ' + e.message);
  }
};

window.changeAdminPassword = async function() {
  const currentPw = document.getElementById('settingsCurrentPassword').value;
  const newPw = document.getElementById('settingsNewPassword').value;
  const confirmPw = document.getElementById('settingsConfirmPassword').value;
  const msgEl = document.getElementById('settingsPasswordMsg');

  if (!currentPw || !newPw || !confirmPw) {
    msgEl.style.display = 'block';
    msgEl.style.color = '#B91C1C';
    msgEl.textContent = 'Please fill in all password fields.';
    return;
  }

  if (newPw.length < 6) {
    msgEl.style.display = 'block';
    msgEl.style.color = '#B91C1C';
    msgEl.textContent = 'New password must be at least 6 characters.';
    return;
  }

  if (newPw !== confirmPw) {
    msgEl.style.display = 'block';
    msgEl.style.color = '#B91C1C';
    msgEl.textContent = 'New passwords do not match.';
    return;
  }

  msgEl.style.display = 'block';
  msgEl.style.color = '#6B7280';
  msgEl.textContent = 'Updating password...';

  try {
    const { error } = await db.auth.updateUser({ password: newPw });
    if (error) throw error;

    document.getElementById('settingsCurrentPassword').value = '';
    document.getElementById('settingsNewPassword').value = '';
    document.getElementById('settingsConfirmPassword').value = '';
    msgEl.style.color = '#047857';
    msgEl.textContent = 'Password updated successfully.';
    setTimeout(() => { msgEl.style.display = 'none'; }, 4000);
  } catch (e) {
    msgEl.style.display = 'block';
    msgEl.style.color = '#B91C1C';
    msgEl.textContent = 'Error: ' + e.message;
  }
};

window.saveInvoiceTemplate = function() {
  const template = document.getElementById('invoiceTemplate').value.trim();
  
  if (!template) {
    alert('Please enter an invoice template');
    return;
  }
  
  localStorage.setItem('invoiceTemplate', template);
  alert('Invoice template saved successfully');
};

window.resetInvoiceTemplate = function() {
  if (confirm('Are you sure you want to reset the invoice template to the default?')) {
    document.getElementById('invoiceTemplate').value = DEFAULT_INVOICE_TEMPLATE;
    localStorage.removeItem('invoiceTemplate');
    alert('Invoice template reset to default');
  }
};

/* ════════════════════════════════════════
   LISTEN FOR HANDOFF REQUESTS (badge)
════════════════════════════════════════ */
function listenForHandoffs() {
  // Remove existing channel if it exists to prevent duplicate subscriptions
  if (queueChannel) {
    db.removeChannel(queueChannel);
  }

  queueChannel = db
    .channel('admin-queue-watch')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'admin_queue' },
      async (payload) => {
        const badge = document.getElementById('sidebarChatBadge');
        if (badge) badge.style.display = 'flex';

        // Get session info for notification
        const { data: session } = await db
          .from('chat_sessions')
          .select('*')
          .eq('id', payload.new.session_id)
          .single();

        if (session && prevSessionIds.size > 0 && !prevSessionIds.has(session.id)) {
          playNotificationSound();
          showNotifyToast(`New chat from ${session.visitor_name || 'a visitor'}!`);
        }

        if (session) prevSessionIds.add(session.id);

        // Flash the sessions list
        loadSessions();
        loadDashboardStats();
      }
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'chat_sessions' },
      (payload) => {
        const s = payload.new;
        if (s.requested_human || s.is_admin_mode) {
          if (prevSessionIds.size > 0 && !prevSessionIds.has(s.id)) {
            playNotificationSound();
            showNotifyToast(`New chat from ${s.visitor_name || 'a visitor'}!`);
          }
          if (s) prevSessionIds.add(s.id);
          loadSessions();
          loadDashboardStats();
        }
      }
    );

  // Subscribe after adding all callbacks
  queueChannel.subscribe((status) => {
    console.log('[Admin] Realtime subscription status:', status);
  });
}

/* ════════════════════════════════════════
   AUDIT LOG
════════════════════════════════════════ */
let _allAuditEntries = [];
let _auditPage = 0;
const _auditPageSize = 30;

window.loadAuditLog = async function() {
  _auditPage = 0;
  const list = document.getElementById('auditLogList');
  list.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;font-size:0.85rem;">Loading audit log...</div>';

  try {
    const { data: entries, error } = await db
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    _allAuditEntries = entries || [];
    _renderAuditPage();

  } catch (e) {
    console.error('Audit log error:', e);
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#EF4444;"><i class="fas fa-exclamation-circle" style="font-size:2rem;margin-bottom:12px;"></i><p>Error loading audit log</p></div>';
  }
};

function _renderAuditPage() {
  const list = document.getElementById('auditLogList');
  const filtered = _getFilteredAudit();
  const start = 0;
  const end = (_auditPage + 1) * _auditPageSize;
  const page = filtered.slice(start, end);
  const countEl = document.getElementById('auditCount');
  countEl.textContent = `${filtered.length} entr${filtered.length !== 1 ? 'ies' : 'y'}`;

  if (page.length === 0) {
    list.innerHTML = '<div style="padding:40px;text-align:center;color:#9CA3AF;"><i class="fas fa-history" style="font-size:2rem;margin-bottom:12px;"></i><p>No audit entries match your filters</p></div>';
    document.getElementById('auditLoadMoreWrap').style.display = 'none';
    return;
  }

  const _actionLabels = {
    'login': 'Login',
    'application_status_change': 'Status Change',
    'application_deleted': 'App Deleted',
    'payment_mail_copied': 'Payment Mail',
    'email_sent': 'Email Sent',
    'email_status_change': 'Email Status',
    'email_deleted': 'Email Deleted',
    'enquiry_status_change': 'Enquiry Status',
    'enquiry_deleted': 'Enquiry Deleted',
    'chat_session_deleted': 'Chat Deleted',
    'user_deleted': 'User Deleted'
  };

  const _actionColors = {
    'login': '#3B82F6',
    'application_status_change': '#8B5CF6',
    'application_deleted': '#EF4444',
    'payment_mail_copied': '#F59E0B',
    'email_sent': '#2E9F6E',
    'email_status_change': '#06B6D4',
    'email_deleted': '#EF4444',
    'enquiry_status_change': '#6366F1',
    'enquiry_deleted': '#EF4444',
    'chat_session_deleted': '#EF4444',
    'user_deleted': '#DC2626'
  };

  list.innerHTML = page.map(entry => {
    const label = _actionLabels[entry.action] || entry.action;
    const color = _actionColors[entry.action] || '#6B7280';
    const details = entry.details && typeof entry.details === 'object' ? entry.details : {};
    const detailStr = Object.keys(details).length ? Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(' · ') : '';
    return `
      <div class="admin-audit-item" style="display:flex;align-items:center;gap:14px;padding:14px 16px;background:#F9FAFB;border-radius:8px;margin-bottom:8px;">
        <div style="width:36px;height:36px;border-radius:50%;background:${color}15;color:${color};display:flex;align-items:center;justify-content:center;font-size:0.9rem;flex-shrink:0;">
          <i class="fas ${entry.action === 'login' ? 'fa-sign-in-alt' : entry.action.includes('deleted') ? 'fa-trash' : entry.action === 'email_sent' ? 'fa-paper-plane' : entry.action === 'payment_mail_copied' ? 'fa-copy' : entry.action === 'application_status_change' || entry.action === 'enquiry_status_change' ? 'fa-exchange-alt' : 'fa-circle'}"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.85rem;font-weight:700;color:#1A1A2E;margin-bottom:2px;">
            ${label}
          </div>
          <div style="font-size:0.78rem;color:#6B7280;">
            ${window.escapeHtml(entry.admin_email || 'unknown')} ${detailStr ? '· ' + window.escapeHtml(detailStr) : ''}
          </div>
        </div>
        <div style="font-size:0.72rem;color:#9CA3AF;white-space:nowrap;flex-shrink:0;">
          ${new Date(entry.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('auditLoadMoreWrap').style.display = end >= filtered.length ? 'none' : 'block';
}

function _getFilteredAudit() {
  const search = (document.getElementById('auditSearch').value || '').toLowerCase().trim();
  const action = document.getElementById('auditActionFilter').value;
  return _allAuditEntries.filter(e => {
    if (search && !`${e.action} ${e.admin_email || ''} ${JSON.stringify(e.details || '')}`.toLowerCase().includes(search)) return false;
    if (action && e.action !== action) return false;
    return true;
  });
}

window.filterAuditLog = function() {
  _auditPage = 0;
  _renderAuditPage();
};

window.loadMoreAuditLog = function() {
  _auditPage++;
  _renderAuditPage();
};