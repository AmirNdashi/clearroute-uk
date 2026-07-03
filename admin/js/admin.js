/* ============================================================
   CLEARROUTE UK — ADMIN PANEL (Supabase)
   ============================================================ */

let db           = null;
let currentSess  = null;
let msgChannel   = null;
let queueChannel = null;

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
  db.auth.getSession().then(({ data }) => {
    if (data.session) {
      showDashboard(data.session.user);
    } else {
      showLogin();
    }
  });

  // Listen for auth changes
  db.auth.onAuthStateChange((event, session) => {
    if (session) {
      showDashboard(session.user);
    } else {
      showLogin();
    }
  });
}

function showLogin() {
  document.getElementById('adminAuth').style.display   = 'flex';
  document.getElementById('adminLayout').classList.remove('visible');
}

function showDashboard(user) {
  document.getElementById('adminAuth').style.display = 'none';
  document.getElementById('adminLayout').classList.add('visible');
  document.getElementById('sidebarUserEmail').textContent = user.email;
  loadDashboardStats();
  loadSessions();
  listenForHandoffs();
}

/* ── Login button ── */
document.getElementById('authBtn').addEventListener('click', async () => {
  const email    = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl    = document.getElementById('authError');
  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = 'Please enter your email and password.';
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
  await db.auth.signOut();
});

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
    const titles = { dashboard: 'Dashboard', chat: 'Live Chat Inbox', enquiries: 'Enquiries' };
    document.getElementById('topbarTitle').textContent = titles[page] || 'Dashboard';
  });
});

/* ════════════════════════════════════════
   DASHBOARD STATS
════════════════════════════════════════ */
async function loadDashboardStats() {
  const activityEl = document.getElementById('dashboardActivity');

  try {
    const { data: sessions, error } = await db
      .from('chat_sessions')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    document.getElementById('statSessions').textContent = sessions?.length || 0;

    const { count: queueCount } = await db
      .from('admin_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    document.getElementById('statHandoffs').textContent  = queueCount || 0;
    document.getElementById('statResolved').textContent  = '—';

    const { count: msgCount } = await db
      .from('chat_messages')
      .select('*', { count: 'exact', head: true });

    document.getElementById('statMessages').textContent = msgCount || 0;

    // Activity feed
    if (!sessions || sessions.length === 0) {
      activityEl.innerHTML = '<p style="color:#9CA3AF;font-size:0.88rem;text-align:center;padding:24px 0;">No activity yet.</p>';
      return;
    }

    activityEl.innerHTML = sessions.map(s => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid #EEF1F6;">
        <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#0B1F3A,#132B52);color:#C9A84C;display:flex;align-items:center;justify-content:center;font-size:0.8rem;font-weight:700;flex-shrink:0;">
          <i class="fas fa-user"></i>
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:0.82rem;font-weight:700;color:#1A1A2E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
            ${s.id}
          </div>
          <div style="font-size:0.75rem;color:#6B7280;">
            ${(s.last_message || 'No messages').slice(0, 50)} · ${s.page || '/'}
          </div>
        </div>
        ${s.is_admin_mode
          ? '<span style="background:#7C3AED;color:white;font-size:0.65rem;font-weight:800;padding:2px 8px;border-radius:100px;">Live</span>'
          : ''}
        <button onclick="goToSession('${s.id}')"
          style="padding:5px 12px;background:#0B1F3A;color:white;border:none;border-radius:6px;font-size:0.75rem;font-weight:600;cursor:pointer;flex-shrink:0;">
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

  const { data: sessions, error } = await db
    .from('chat_sessions')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error || !sessions?.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#9CA3AF;font-size:0.85rem;">No sessions yet.</div>';
    return;
  }

  list.innerHTML = '';
  sessions.forEach(s => {
    const div = document.createElement('div');
    div.className = `chat-session-item ${s.id === currentSess ? 'active' : ''}`;
    div.dataset.sessionId = s.id;
    div.innerHTML = `
      <div class="session-avatar"><i class="fas fa-user"></i></div>
      <div class="session-info">
        <div class="session-id">${s.id.slice(0, 22)}...</div>
        <div class="session-preview">${(s.last_message || 'No messages').slice(0, 38)}</div>
      </div>
      ${s.is_admin_mode ? '<span class="session-badge admin-active">Live</span>' : ''}
    `;
    div.addEventListener('click', () => openSession(s.id));
    list.appendChild(div);
  });
};

/* ════════════════════════════════════════
   OPEN SESSION
════════════════════════════════════════ */
async function openSession(sessionId) {
  currentSess = sessionId;

  document.querySelectorAll('.chat-session-item').forEach(el => {
    el.classList.toggle('active', el.dataset.sessionId === sessionId);
  });

  const panel = document.getElementById('chatViewPanel');
  panel.innerHTML = `
    <div class="chat-view-header">
      <div>
        <div class="chat-view-session-id">${sessionId}</div>
        <div class="chat-view-meta">Live session — updates in real time</div>
      </div>
      <button class="admin-btn admin-btn-small admin-btn-success" id="takeOverBtn">
        <i class="fas fa-headset"></i> Take Over Chat
      </button>
    </div>
    <div class="chat-view-messages" id="adminMsgContainer"></div>
    <div class="chat-view-footer" id="adminReplyArea" style="display:none;">
      <textarea class="admin-reply-input" id="adminReplyInput"
        placeholder="Type your reply to the client..." rows="2"></textarea>
      <button class="admin-reply-send" id="adminReplySend">
        <i class="fas fa-paper-plane"></i> Send
      </button>
    </div>
  `;

  document.getElementById('takeOverBtn').addEventListener('click', async () => {
    document.getElementById('adminReplyArea').style.display = 'flex';
    const btn = document.getElementById('takeOverBtn');
    btn.innerHTML = '<i class="fas fa-check"></i> You\'re handling this';
    btn.style.background = '#10B981';

    // Mark session as admin-handled
    await db.from('chat_sessions')
      .update({ is_admin_mode: true })
      .eq('id', sessionId);
  });

  document.getElementById('adminReplySend').addEventListener('click', sendReply);
  document.getElementById('adminReplyInput').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); }
  });

  // Load existing messages
  const { data: messages } = await db
    .from('chat_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  renderMessages(messages || []);

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

/* ── Send admin reply ── */
async function sendReply() {
  const input = document.getElementById('adminReplyInput');
  const text  = input?.value.trim();
  if (!text || !currentSess) return;
  input.value = '';

  try {
    // Save to admin_replies (client listens here)
    await db.from('admin_replies').insert({
      session_id: currentSess,
      text,
    });

    // Save to chat_messages (for full history view)
    await db.from('chat_messages').insert({
      session_id: currentSess,
      text,
      sender: 'admin',
    });

    // Update session
    await db.from('chat_sessions')
      .update({ last_message: text, last_sender: 'admin', is_admin_mode: true, updated_at: new Date().toISOString() })
      .eq('id', currentSess);

  } catch (e) {
    console.error('Reply error:', e);
  }
}

/* ════════════════════════════════════════
   LISTEN FOR HANDOFF REQUESTS (badge)
════════════════════════════════════════ */
function listenForHandoffs() {
  queueChannel = db
    .channel('admin-queue-watch')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'admin_queue' },
      () => {
        const badge = document.getElementById('sidebarChatBadge');
        badge.style.display = 'flex';

        // Flash the sessions list
        loadSessions();
        loadDashboardStats();
      }
    )
    .subscribe();
}