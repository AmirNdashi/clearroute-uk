/* ============================================================
   CLEARROUTE UK — ADMIN PANEL (Supabase)
   ============================================================ */

let db           = null;
let currentSess  = null;
let msgChannel   = null;
let queueChannel = null;
let notifySound  = null;
let prevSessionIds = new Set();

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
    if (data.session) {
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
    errEl.textContent = 'Database not initialized. Please wait a moment and try again.';
    errEl.style.display = 'block';
    return;
  }

  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl    = document.getElementById('authError');
  errEl.style.display = 'none';

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
  if (!toggle || !sidebar || !overlay) return;
  const close = () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  };
  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('open');
  });
  overlay.addEventListener('click', close);
  // Close sidebar on nav click (mobile)
  sidebar.querySelectorAll('.admin-nav-item').forEach(el => {
    el.addEventListener('click', close);
  });
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
    const titles = { dashboard: 'Dashboard', chat: 'Live Chat Inbox', applications: 'User Applications', 'application-detail': 'Application Details', enquiries: 'Enquiries', 'enquiry-detail': 'Enquiry Details', users: 'Users', 'user-detail': 'User Details' };
    document.getElementById('topbarTitle').textContent = titles[page] || 'Dashboard';
    
    // Load page-specific data
    if (page === 'applications') {
      loadApplications();
    } else if (page === 'enquiries') {
      loadEnquiries();
    } else if (page === 'users') {
      loadUsers();
    }
  });
});

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
          ${enq.first_name} ${enq.last_name}
        </div>
        <div style="font-size:0.82rem;color:#6B7280;">
          ${enq.email} · ${enq.service}
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
              <i class="fas fa-info-circle"></i> In the meantime, check <strong>info@clearoute.uk</strong> for enquiries
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
              <div><strong>Name:</strong> ${enquiry.first_name} ${enquiry.last_name}</div>
              <div><strong>Email:</strong> ${enquiry.email}</div>
              <div><strong>Phone:</strong> ${enquiry.phone || 'Not provided'}</div>
              <div><strong>Nationality:</strong> ${enquiry.nationality}</div>
              <div><strong>Service:</strong> ${enquiry.service}</div>
              <div><strong>Status:</strong> ${enquiry.status.toUpperCase()}</div>
              <div><strong>Submitted:</strong> ${new Date(enquiry.created_at).toLocaleDateString('en-GB')}</div>
              <div><strong>Enquiry ID:</strong> ${enquiry.id.slice(0, 12)}...</div>
            </div>
          </div>

          <div style="background:#F9FAFB;border-radius:8px;padding:20px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Message</h4>
            <p style="font-size:0.9rem;color:#374151;line-height:1.6;white-space:pre-wrap;">${enquiry.message}</p>
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
            <a href="mailto:${enquiry.email}" class="admin-btn admin-btn-outline" style="width:100%;display:block;text-align:center;text-decoration:none;margin-bottom:8px;">
              <i class="fas fa-envelope"></i> Reply via Email
            </a>
            ${enquiry.phone ? `
              <a href="tel:${enquiry.phone}" class="admin-btn admin-btn-outline" style="width:100%;display:block;text-align:center;text-decoration:none;">
                <i class="fas fa-phone"></i> Call
              </a>
            ` : ''}
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
            ${user.first_name} ${user.last_name || 'User'}
          </div>
          <div style="font-size:0.82rem;color:#6B7280;">
            ${user.email}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.75rem;color:#9CA3AF;">
            ${new Date(user.created_at).toLocaleDateString('en-GB')}
          </div>
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
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;">
        <div>
          <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">User Profile</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.9rem;">
              <div><strong>Name:</strong> ${user.first_name} ${user.last_name || 'N/A'}</div>
              <div><strong>Email:</strong> ${user.email}</div>
              <div><strong>Phone:</strong> ${user.phone || 'Not provided'}</div>
              <div><strong>User ID:</strong> ${user.id.slice(0, 12)}...</div>
              <div><strong>Joined:</strong> ${new Date(user.created_at).toLocaleDateString('en-GB')}</div>
              <div><strong>Last Updated:</strong> ${new Date(user.updated_at).toLocaleDateString('en-GB')}</div>
            </div>
          </div>

          <div style="background:#F9FAFB;border-radius:8px;padding:20px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">User Applications (${applications?.length || 0})</h4>
            ${applications && applications.length > 0 ? `
              <div style="display:flex;flex-direction:column;gap:8px;">
                ${applications.map(app => `
                  <div style="padding:12px;background:white;border-radius:6px;border:1px solid #E5E7EB;cursor:pointer;" onclick="viewApplication('${app.id}')">
                    <div style="font-size:0.85rem;font-weight:700;color:#1A1A2E;">${app.service_type.replace('-', ' ').toUpperCase()}</div>
                    <div style="font-size:0.75rem;color:#6B7280;">Status: ${app.status.toUpperCase()} · ${new Date(app.created_at).toLocaleDateString('en-GB')}</div>
                  </div>
                `).join('')}
              </div>
            ` : '<p style="color:#9CA3AF;font-size:0.85rem;">No applications yet</p>'}
          </div>
        </div>

        <div>
          <div style="background:#F9FAFB;border-radius:8px;padding:20px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Quick Actions</h4>
            <a href="mailto:${user.email}" class="admin-btn admin-btn-outline" style="width:100%;display:block;text-align:center;text-decoration:none;margin-bottom:8px;">
              <i class="fas fa-envelope"></i> Send Email
            </a>
            ${user.phone ? `
              <a href="tel:${user.phone}" class="admin-btn admin-btn-outline" style="width:100%;display:block;text-align:center;text-decoration:none;">
                <i class="fas fa-phone"></i> Call
              </a>
            ` : ''}
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
  'bank-account': 'UK Bank Account Setup'
};

const _statusClasses = {
  'pending': 'background:#FEF3C7;color:#B45309',
  'submitted': 'background:#DBEAFE;color:#1E40AF',
  'in_review': 'background:#DBEAFE;color:#1E40AF',
  'processing': 'background:#E0E7FF;color:#3730A3',
  'approved': 'background:#D1FAE5;color:#047857',
  'rejected': 'background:#FEE2E2;color:#B91C1C'
};

function _renderAppCard(app) {
  return `
    <div style="display:flex;align-items:center;gap:16px;padding:16px;background:#F9FAFB;border-radius:8px;margin-bottom:12px;cursor:pointer;transition:all 0.2s ease;" onclick="viewApplication('${app.id}')">
      <div style="width:48px;height:48px;border-radius:8px;background:linear-gradient(135deg,#0D4F4F,#1A6B6B);color:#D4735E;display:flex;align-items:center;justify-content:center;font-size:1.2rem;flex-shrink:0;">
        <i class="fas fa-file-alt"></i>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:0.95rem;font-weight:700;color:#1A1A2E;margin-bottom:4px;">
          ${_serviceNames[app.service_type] || app.service_type}
        </div>
        <div style="font-size:0.82rem;color:#6B7280;">
          ${app.first_name} ${app.last_name} · ${app.email}
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
      'bank-account': 'UK Bank Account Setup'
    };

    const detailHTML = `
      <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;">
        <div>
          <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Application Information</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.9rem;">
              <div><strong>Service:</strong> ${serviceNames[application.service_type] || application.service_type}</div>
              <div><strong>Status:</strong> ${application.status.toUpperCase()}</div>
              <div><strong>Submitted:</strong> ${new Date(application.created_at).toLocaleDateString('en-GB')}</div>
              <div><strong>Application ID:</strong> ${application.id.slice(0, 12)}...</div>
            </div>
          </div>

          <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
            <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Personal Information</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:0.9rem;">
              <div><strong>Name:</strong> ${application.first_name} ${application.last_name}</div>
              <div><strong>Email:</strong> ${application.email}</div>
              <div><strong>Phone:</strong> ${application.phone}</div>
              <div><strong>Date of Birth:</strong> ${new Date(application.date_of_birth).toLocaleDateString('en-GB')}</div>
              <div><strong>Nationality:</strong> ${application.nationality}</div>
              <div><strong>Address:</strong> ${application.address}</div>
            </div>
          </div>

          ${application.additional_info ? `
            <div style="background:#F9FAFB;border-radius:8px;padding:20px;margin-bottom:16px;">
              <h4 style="color:#1A1A2E;font-size:1.1rem;margin-bottom:16px;">Additional Information</h4>
              <p style="font-size:0.9rem;color:#374151;line-height:1.6;">${application.additional_info}</p>
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
            <select id="statusUpdate" style="width:100%;padding:10px;border:1px solid #D1D5DB;border-radius:6px;margin-bottom:12px;">
              <option value="submitted" ${application.status === 'submitted' ? 'selected' : ''}>Submitted</option>
              <option value="in_review" ${application.status === 'in_review' ? 'selected' : ''}>In Review</option>
              <option value="processing" ${application.status === 'processing' ? 'selected' : ''}>Processing</option>
              <option value="approved" ${application.status === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="rejected" ${application.status === 'rejected' ? 'selected' : ''}>Rejected</option>
            </select>
            ${application.status === 'rejected' ? `
              <input type="text" id="rejectionReason" placeholder="Rejection reason" style="width:100%;padding:10px;border:1px solid #D1D5DB;border-radius:6px;margin-bottom:12px;" value="${application.rejection_reason || ''}">
            ` : ''}
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
                  <div style="background:#FEF3C7;border-left:4px solid #D4735E;padding:12px;border-radius:4px;">
                    <div style="font-size:0.82rem;color:#6B7280;margin-bottom:4px;">
                      ${note.admin_name || 'Admin'} · ${new Date(note.created_at).toLocaleDateString('en-GB')}
                    </div>
                    <div style="font-size:0.9rem;color:#374151;">${note.note}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    document.getElementById('applicationDetail').innerHTML = detailHTML;
    showPage('application-detail');

  } catch (e) {
    console.error('View application error:', e);
    alert('Error loading application details');
  }
};

async function _logAudit(action, details) {
  try {
    const { data: { user } } = await db.auth.getUser();
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
    const { data: { user } } = await db.auth.getUser();

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

window.showPage = function(page) {
  document.querySelectorAll('.admin-nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  
  const titles = { dashboard: 'Dashboard', chat: 'Live Chat Inbox', applications: 'User Applications', 'application-detail': 'Application Details', enquiries: 'Enquiries', 'enquiry-detail': 'Enquiry Details', users: 'Users', 'user-detail': 'User Details' };
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
    document.getElementById('statResolved').textContent  = '—';

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
            ${s.visitor_name || s.id}
          </div>
          <div style="font-size:0.75rem;color:#6B7280;">
            ${(s.last_message || 'No messages').slice(0, 50)} · ${s.page || '/'}
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
  document.querySelector('[data-page="chat"]').click();
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
          <div class="session-id">${displayName}</div>
        <div class="session-preview">${(s.last_message || 'No messages').slice(0, 38)}</div>
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

  const displayName = session?.visitor_name || sessionId;
  const statusText = session?.is_admin_mode ? 'Live chat' : 'Waiting for agent';

  const panel = document.getElementById('chatViewPanel');
  panel.innerHTML = `
    <div class="chat-view-header">
      <div>
        <div class="chat-view-session-id">${displayName}</div>
        <div class="chat-view-meta">${statusText} · ${session?.page || '/'}</div>
      </div>
      <button class="admin-btn admin-btn-small admin-btn-success" id="takeOverBtn">
        <i class="fas fa-headset"></i> Take Over Chat
      </button>
    </div>
    <div class="chat-view-messages" id="adminMsgContainer"></div>
    <div class="visitor-typing" id="visitorTypingIndicator" style="display:none;padding:0 16px 4px;">
      <i class="fas fa-ellipsis fa-beat"></i> Visitor is typing...
    </div>
    <div class="chat-view-footer" id="adminReplyArea" style="display:none;">
      <textarea class="admin-reply-input" id="adminReplyInput"
        placeholder="Type your reply to ${displayName}..." rows="2"></textarea>
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
      <div class="admin-msg-bubble">${msg.text}</div>
      <div class="admin-msg-time">${time}</div>
    </div>
  `;
  container.appendChild(div);
  if (scroll) container.scrollTop = container.scrollHeight;
}

/* ════════════════════════════════════════
   REFRESH ACTIVE CONVO (typing indicators)
════════════════════════════════════════ */
function refreshActiveConvo() {
  if (!currentSess) return;

  // Update typing indicator periodically
  setInterval(async () => {
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
        badge.style.display = 'flex';

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

        prevSessionIds.add(session.id);

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
          prevSessionIds.add(s.id);
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