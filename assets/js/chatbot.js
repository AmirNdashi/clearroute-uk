/* ============================================================
   CLEARROUTE UK — ROUTEBOT CHATBOT
   Powered by Groq (via Supabase Edge Function) + Supabase
   ============================================================ */

// ── Supabase Edge Function URL ───────────────────────────────
// This uses a secure edge function to hide the Groq API key
let WORKER_URL = null;
// ────────────────────────────────────────────────────────────

/* ── Session Storage Keys ── */
const SS = {
  sessionId:      'cr_session_id',
  visitorName:    'cr_visitor_name',
  isAdminMode:    'cr_is_admin_mode',
  history:        'cr_history',
  messages:       'cr_messages',
  replyMark:      'cr_reply_mark',
  deliveredIds:   'cr_delivered_ids',
};

/* ── Session ID ── */
let sessionId = sessionStorage.getItem(SS.sessionId);
if (!sessionId) {
  sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  sessionStorage.setItem(SS.sessionId, sessionId);
}

/* ── State ── */
let isOpen             = false;
let isAdminMode        = false;
let hasRequestedHuman  = false;
let conversationHistory = [];
let sessionMessages    = [];
let replyChannel       = null;
let db                 = null;
let visitorName        = '';
let replyStartMs       = 0;
let deliveredReplyIds  = new Set();
let unreadCount        = 0;

/* ── Security: Rate Limiting ── */
let messageTimestamps = [];
const MAX_MESSAGES_PER_MINUTE = 10;
const MAX_MESSAGE_LENGTH = 1000;

/* ── System Prompt ── */
const SYSTEM_PROMPT = `You are RouteBot, the helpful AI assistant for ClearRoute UK — a professional UK documentation consultancy that helps international clients navigate UK driving licences, NI numbers, BRP/eVisa, theory and practical tests, address proof, and bank account setup.

Your role:
- Answer questions about ClearRoute UK's services warmly and professionally
- Explain processes clearly — driving licence conversion, NI numbers, BRP, eVisa, theory and practical tests, address proof, bank accounts
- Never provide legal advice or guarantee application outcomes
- Always remind users that all services go through official UK government channels only — DVLA, DVSA, HMRC, Home Office
- Keep responses concise — 2 to 4 sentences unless detail is clearly needed
- If asked about pricing, explain that fees are discussed directly with the team and there are no hidden costs

Personality: Professional, warm, knowledgeable, clear. Never robotic.

IMPORTANT: Only trigger human handoff when the user EXPLICITLY asks to speak to a human, says "I want to talk to a person", "connect me to human", "real person", or similar phrases. Do not suggest human support unless the user clearly requests it. If the user asks to speak to a human or requests live support — respond helpfully and end your message with exactly: [REQUEST_HUMAN]`;

/* ── Session Persistence ── */
function persistState() {
  try {
    sessionStorage.setItem(SS.visitorName, visitorName || '');
    sessionStorage.setItem(SS.isAdminMode, isAdminMode ? '1' : '0');
    sessionStorage.setItem(SS.history, JSON.stringify(conversationHistory));
    sessionStorage.setItem(SS.messages, JSON.stringify(sessionMessages));
    sessionStorage.setItem(SS.replyMark, String(replyStartMs));
    sessionStorage.setItem(SS.deliveredIds, JSON.stringify([...deliveredReplyIds]));
  } catch (e) {}
}

function restoreState() {
  try {
    visitorName  = sessionStorage.getItem(SS.visitorName) || '';
    isAdminMode  = sessionStorage.getItem(SS.isAdminMode) === '1';
    replyStartMs = parseInt(sessionStorage.getItem(SS.replyMark) || '0');

    const h  = sessionStorage.getItem(SS.history);
    const m  = sessionStorage.getItem(SS.messages);
    const di = sessionStorage.getItem(SS.deliveredIds);

    conversationHistory = h  ? JSON.parse(h)  : [];
    sessionMessages     = m  ? JSON.parse(m)  : [];
    deliveredReplyIds   = di ? new Set(JSON.parse(di)) : new Set();

    return sessionMessages.length > 0;
  } catch (e) { return false; }
}

function clearState() {
  Object.values(SS).forEach(k => sessionStorage.removeItem(k));
  conversationHistory = [];
  sessionMessages     = [];
  visitorName         = '';
  isAdminMode         = false;
  replyStartMs        = 0;
  deliveredReplyIds   = new Set();
  unreadCount         = 0;
}

/* ── Security: Rate Limiting Check ── */
function checkRateLimit() {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  messageTimestamps = messageTimestamps.filter(ts => ts > oneMinuteAgo);

  if (messageTimestamps.length >= MAX_MESSAGES_PER_MINUTE) {
    return false;
  }

  messageTimestamps.push(now);
  return true;
}

/* ── Security: Message Validation ── */
function validateMessage(text) {
  if (text.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: 'Message too long. Please keep it under 1000 characters.' };
  }

  if (!text.trim()) {
    return { valid: false, error: 'Message cannot be empty.' };
  }

  const repeatedCharPattern = /(.)\1{10,}/;
  if (repeatedCharPattern.test(text)) {
    return { valid: false, error: 'Invalid message format.' };
  }

  const suspiciousPatterns = [
    /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi,
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
    /\+?[0-9]{10,}/g,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(text) && !text.toLowerCase().includes('clearroute')) {
      return { valid: false, error: 'Please contact us directly for this request.' };
    }
  }

  const nonEnglishPattern = /[\u0600-\u06FF\u0750-\u077F\u0590-\u05FF\u0400-\u04FF]/;
  if (nonEnglishPattern.test(text)) {
    return { valid: false, error: 'Please use English characters only.' };
  }

  return { valid: true };
}

/* ════════════════════════════════════════
   BUILD UI
════════════════════════════════════════ */
function buildChatbot() {
  const css = `
  .routebot-btn {
    position: fixed; bottom: 28px; left: 28px;
    width: 58px; height: 58px; border-radius: 50%;
    background: var(--copper); color: var(--teal-dark);
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.4rem;
    box-shadow: 0 6px 24px rgba(212,115,94,0.45);
    z-index: 9000; transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
  }
  .routebot-btn:hover { transform: scale(1.08); box-shadow: 0 10px 32px rgba(212,115,94,0.55); }
  .routebot-btn .rb-icon-close { display: none; }
  .routebot-btn.open .rb-icon-open  { display: none; }
  .routebot-btn.open .rb-icon-close { display: flex; }

  .routebot-badge {
    position: absolute; top: -4px; right: -4px;
    width: 20px; height: 20px;
    background: #EF4444; border-radius: 50%; border: 2px solid white;
    display: none; align-items: center; justify-content: center;
    font-size: 0.65rem; font-weight: 700; color: white;
    font-family: var(--font-heading);
  }
  .routebot-badge.show { display: flex; }

  .routebot-window {
    position: fixed; bottom: 100px; left: 28px;
    width: 380px; max-height: 580px;
    border-radius: var(--radius-lg);
    background: var(--white);
    box-shadow: 0 24px 80px rgba(13,79,79,0.22);
    display: flex; flex-direction: column; overflow: hidden;
    z-index: 8999;
    opacity: 0; transform: translateY(20px) scale(0.96);
    pointer-events: none;
    transition: all 0.35s cubic-bezier(0.4,0,0.2,1);
    border: 1px solid var(--border);
  }
  .routebot-window.open {
    opacity: 1; transform: translateY(0) scale(1); pointer-events: all;
  }

  .routebot-header {
    background: linear-gradient(135deg, var(--teal-dark) 0%, var(--teal) 100%);
    padding: 18px 20px; display: flex; align-items: center;
    gap: 12px; flex-shrink: 0;
  }
  .routebot-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    background: rgba(212,115,94,0.2); border: 2px solid var(--copper);
    display: flex; align-items: center; justify-content: center;
    color: var(--copper); font-size: 1rem; flex-shrink: 0;
  }
  .routebot-header-text { flex: 1; }
  .routebot-header-actions {
    display:flex;
    gap:8px;
  }
  .routebot-header-btn {
    width:28px;
    height:28px;
    border-radius:50%;
    background:rgba(255,255,255,0.1);
    border:none;
    color:rgba(255,255,255,0.7);
    cursor:pointer;
    display:flex;
    align-items:center;
    justify-content:center;
    transition:all 0.2s;
  }
  .routebot-header-btn:hover {
    background:rgba(255,255,255,0.2);
    color:white;
  }
  .routebot-header-name {
    font-family: var(--font-heading); font-size: 0.95rem;
    font-weight: 700; color: var(--white);
  }
  .routebot-header-status {
    display: flex; align-items: center; gap: 5px;
    font-size: 0.75rem; color: rgba(255,255,255,0.55); margin-top: 2px;
  }
  .routebot-header-status .dot {
    width: 6px; height: 6px; border-radius: 50%; background: #2E9F6E;
    animation: pulse-dot 2s infinite;
  }
  @keyframes pulse-dot { 0%,100%{opacity:1;} 50%{opacity:0.4;} }

  .routebot-messages {
    flex: 1; overflow-y: auto; padding: 16px;
    display: flex; flex-direction: column; gap: 12px;
    background: var(--off-white);
  }
  .routebot-messages::-webkit-scrollbar { width: 4px; }
  .routebot-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .rb-msg {
    display: flex; gap: 8px; align-items: flex-end;
    max-width: 90%; animation: rb-fade-in 0.3s ease;
  }
  @keyframes rb-fade-in { from{opacity:0;transform:translateY(8px);} to{opacity:1;transform:translateY(0);} }
  .rb-msg.user { margin-left: auto; flex-direction: row-reverse; }

  .rb-msg-avatar {
    width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    font-size: 0.75rem; font-weight: 700; font-family: var(--font-heading);
  }
  .rb-msg.bot   .rb-msg-avatar { background: var(--teal); color: var(--copper); }
  .rb-msg.admin .rb-msg-avatar { background: #7C3AED; color: white; }
  .rb-msg.user  .rb-msg-avatar { background: var(--copper); color: var(--teal-dark); }

  .rb-msg-bubble {
    padding: 10px 14px; border-radius: 16px;
    font-size: 0.88rem; line-height: 1.6;
    max-width: 100%; word-break: break-word;
  }
  .rb-msg.bot   .rb-msg-bubble { background:var(--white); color:var(--text-dark); border-bottom-left-radius:4px; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
  .rb-msg.admin .rb-msg-bubble { background:#EDE9FE; color:#5B21B6; border-bottom-left-radius:4px; }
  .rb-msg.user  .rb-msg-bubble { background:var(--teal); color:var(--white); border-bottom-right-radius:4px; }

  .rb-typing {
    display:flex; gap:4px; padding:12px 14px;
    background:var(--white); border-radius:16px; border-bottom-left-radius:4px;
    width:fit-content; box-shadow:0 1px 4px rgba(0,0,0,0.06);
  }
  .rb-typing span {
    width:7px; height:7px; border-radius:50%;
    background:var(--text-light); animation:rb-bounce 1.3s infinite ease-in-out;
  }
  .rb-typing span:nth-child(2){animation-delay:0.15s;}
  .rb-typing span:nth-child(3){animation-delay:0.30s;}
  @keyframes rb-bounce { 0%,80%,100%{transform:scale(0.7);opacity:0.4;} 40%{transform:scale(1);opacity:1;} }

  .rb-quick-replies {
    display:flex; flex-wrap:wrap; gap:6px;
    padding:0 16px 12px; background:var(--off-white);
  }
  .rb-quick-reply {
    padding:6px 12px; border:1px solid var(--border);
    border-radius:100px; background:var(--white);
    font-family:var(--font-heading); font-size:0.78rem;
    font-weight:600; color:var(--teal); cursor:pointer; transition:all 0.2s;
  }
  .rb-quick-reply:hover { background:var(--teal); color:var(--white); border-color:var(--teal); }

  .routebot-footer {
    padding:12px 16px; background:var(--white);
    border-top:1px solid var(--border);
    display:flex; gap:10px; align-items:center; flex-shrink:0;
  }
  .routebot-input {
    flex:1; padding:10px 14px;
    border:1.5px solid var(--border); border-radius:var(--radius-md);
    font-family:var(--font-body); font-size:0.88rem;
    color:var(--text-dark); background:var(--off-white);
    outline:none; resize:none; transition:border-color 0.2s;
    line-height:1.5; max-height:100px; overflow-y:auto;
  }
  .routebot-input:focus { border-color:var(--teal); background:var(--white); }
  .routebot-input::placeholder { color:var(--text-light); }
  .routebot-send {
    width:38px; height:38px; border-radius:50%;
    background:var(--copper); color:var(--teal-dark);
    border:none; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    font-size:0.9rem; transition:all 0.2s; flex-shrink:0;
  }
  .routebot-send:hover { background:var(--copper-dark); transform:scale(1.05); }
  .routebot-send:disabled { opacity:0.5; cursor:not-allowed; }

  .rb-admin-banner {
    padding:8px 16px; background:#EDE9FE; text-align:center;
    font-family:var(--font-heading); font-size:0.78rem;
    font-weight:600; color:#5B21B6; display:none;
  }
  .rb-admin-banner.show { display:block; }

  .rb-handoff-bar {
    padding:10px 16px;
    background:linear-gradient(135deg,#0D4F4F,#1A6B6B);
    display:flex;
    align-items:center;
    justify-content:space-between;
    flex-shrink:0;
  }
  .rb-handoff-label {
    font-size:0.78rem;
    color:rgba(255,255,255,0.7);
    display:flex;
    align-items:center;
    gap:6px;
  }
  .rb-handoff-btn {
    padding:6px 12px;
    background:var(--copper);
    color:var(--teal-dark);
    border:none;
    border-radius:20px;
    font-family:var(--font-heading);
    font-size:0.75rem;
    font-weight:700;
    cursor:pointer;
    transition:all 0.2s;
    display:flex;
    align-items:center;
    gap:6px;
  }
  .rb-handoff-btn:hover {
    background:var(--copper-dark);
    transform:scale(1.05);
  }
  .rb-handoff-btn--ai {
    background:#2E9F6E;
    color:white;
  }
  .rb-handoff-btn--ai:hover {
    background:#059669;
  }

  @media (max-width:480px) {
    .routebot-window { width:calc(100vw - 24px); left:12px; bottom:90px; }
    .routebot-btn { left:16px; bottom:20px; }
  }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  document.body.insertAdjacentHTML('beforeend', `
    <button class="routebot-btn" id="routebotBtn" aria-label="Open RouteBot chat">
      <i class="fas fa-comments rb-icon-open"></i>
      <i class="fas fa-times rb-icon-close"></i>
      <div class="routebot-badge" id="routebotBadge">1</div>
    </button>

    <div class="routebot-window" id="routebotWindow" role="dialog" aria-label="RouteBot chat">
      <div class="routebot-header">
        <div class="routebot-avatar"><i class="fas fa-route"></i></div>
        <div class="routebot-header-text">
          <div class="routebot-header-name">RouteBot</div>
          <div class="routebot-header-status">
            <span class="dot"></span>
            <span id="rbStatusText">ClearRoute UK Assistant</span>
          </div>
        </div>
        <div class="routebot-header-actions">
          <button class="routebot-header-btn" id="rbClearBtn" title="Clear chat">
            <i class="fas fa-rotate-left"></i>
          </button>
        </div>
      </div>

      <div class="rb-admin-banner" id="rbAdminBanner">
        <i class="fas fa-headset"></i> You are now chatting with a <strong>human agent</strong>
      </div>

      <div class="routebot-messages" id="rbMessages"></div>

      <div class="rb-handoff-bar" id="rbHandoffBar">
        <span class="rb-handoff-label">
          <i class="fas fa-route"></i> Chatting with AI
        </span>
        <button class="rb-handoff-btn" id="rbHandoffBtn">
          <i class="fas fa-headset"></i> Talk to a Human
        </button>
      </div>

      <div class="rb-quick-replies" id="rbQuickReplies">
        <button class="rb-quick-reply" data-msg="How do I convert my driving licence?">Licence conversion</button>
        <button class="rb-quick-reply" data-msg="How do I apply for a NI number?">NI Number</button>
        <button class="rb-quick-reply" data-msg="What is BRP / eVisa guidance?">BRP / eVisa</button>
        <button class="rb-quick-reply" data-msg="How does the process work?">How it works</button>
      </div>

      <div class="routebot-footer">
        <textarea class="routebot-input" id="rbInput"
          placeholder="Ask RouteBot anything..." rows="1"
          aria-label="Chat message"></textarea>
        <button class="routebot-send" id="rbSend" aria-label="Send message">
          <i class="fas fa-paper-plane"></i>
        </button>
      </div>
    </div>
  `);
}

/* ════════════════════════════════════════
   TOGGLE
════════════════════════════════════════ */
function toggleChat() {
  isOpen = !isOpen;
  document.getElementById('routebotBtn').classList.toggle('open', isOpen);
  document.getElementById('routebotWindow').classList.toggle('open', isOpen);
  if (isOpen) {
    document.getElementById('routebotBadge').classList.remove('show');
    document.getElementById('rbInput').focus();
  }
}

/* ════════════════════════════════════════
   MESSAGES
════════════════════════════════════════ */
function addMessage(text, sender = 'bot', skipSave = false) {
  const container = document.getElementById('rbMessages');
  const avatars = {
    bot:   '<i class="fas fa-route"></i>',
    user:  'You',
    admin: '<i class="fas fa-headset"></i>'
  };
  const div = document.createElement('div');
  div.className = `rb-msg ${sender}`;
  div.innerHTML = `
    <div class="rb-msg-avatar">${avatars[sender]}</div>
    <div class="rb-msg-bubble">${window.escapeHtml(text).replace(/\n/g, '<br/>')}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  if (!skipSave) {
    sessionMessages.push({ role: sender, content: text, time: getTime(), id: Date.now() + Math.random() });
    persistState();
    saveMessage(text, sender);
  }

  // Unread badge when window is closed
  if (sender !== 'user') {
    if (!isOpen) {
      unreadCount++;
      const badge = document.getElementById('routebotBadge');
      if (badge) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.classList.add('show');
      }
    }
  }
}

function getTime() {
  return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function showTyping() {
  const container = document.getElementById('rbMessages');
  const div = document.createElement('div');
  div.className = 'rb-msg bot';
  div.id = 'rbTyping';
  div.innerHTML = `
    <div class="rb-msg-avatar"><i class="fas fa-route"></i></div>
    <div class="rb-typing"><span></span><span></span><span></span></div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeTyping() {
  document.getElementById('rbTyping')?.remove();
}

/* ════════════════════════════════════════
   SUPABASE — SAVE MESSAGE
════════════════════════════════════════ */
async function saveMessage(text, sender) {
  if (!db) return;
  try {
    const sessionData = {
      id: sessionId,
      last_message: text,
      last_sender: sender,
      page: window.location.pathname,
      is_admin_mode: isAdminMode,
      last_active: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (visitorName) {
      sessionData.visitor_name = visitorName;
    }

    if (isAdminMode) {
      sessionData.status = 'active';
    } else if (hasRequestedHuman) {
      sessionData.status = 'waiting';
    } else {
      sessionData.status = 'ai';
    }

    await db.from('chat_sessions').upsert(sessionData, { onConflict: 'id' });

    // Only save to chat_messages if in admin mode or after handoff request
    // Bot messages before handoff should not be saved to database
    if (!isAdminMode && !hasRequestedHuman && sender === 'bot') {
      console.log('[RouteBot] Skipping bot message save (before handoff)');
      return;
    }

    // Check for duplicate message (same text and sender in last minute)
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { data: recentMessages } = await db
      .from('chat_messages')
      .select('text, sender, created_at')
      .eq('session_id', sessionId)
      .eq('sender', sender)
      .eq('text', text)
      .gte('created_at', oneMinuteAgo)
      .limit(1);

    // Only insert if no duplicate found in last minute
    if (!recentMessages || recentMessages.length === 0) {
      await db.from('chat_messages').insert({
        session_id: sessionId,
        text,
        sender,
      });
    } else {
      console.log('[RouteBot] Duplicate message detected, skipping save');
    }
  } catch (e) {
    console.warn('Supabase save error:', e);
  }
}

/* ════════════════════════════════════════
   SUPABASE — ADMIN HANDOFF
════════════════════════════════════════ */
async function requestHuman() {
  if (!db || hasRequestedHuman) return;

  const name = prompt('Please enter your name so our agent can assist you:');
  if (!name?.trim()) return;

  visitorName = name.trim();
  hasRequestedHuman = true;
  replyStartMs = Date.now();

  console.log('[RouteBot] Requesting human support for session:', sessionId);
  console.log('[RouteBot] Visitor name:', visitorName);

  setHumanUI();

  try {
    // Add to admin queue
    console.log('[RouteBot] Adding to admin queue...');
    await db.from('admin_queue').insert({
      session_id: sessionId,
      status: 'pending',
      page: window.location.pathname,
    });
    console.log('[RouteBot] Added to admin queue successfully');

    // Update session with visitor info
    console.log('[RouteBot] Updating session with visitor info...');
    const { error: updateError } = await db.from('chat_sessions')
      .update({
        visitor_name: visitorName,
        status: 'waiting',
        requested_human: true,
        start_time: new Date().toISOString(),
        last_active: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) {
      console.error('[RouteBot] Session update error:', updateError);
      // Try upsert as fallback
      await db.from('chat_sessions').upsert({
        id: sessionId,
        visitor_name: visitorName,
        status: 'waiting',
        requested_human: true,
        start_time: new Date().toISOString(),
        last_active: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' });
    }
    console.log('[RouteBot] Session updated successfully');

    // Save conversation history to database
    // Only save user messages from before handoff - bot messages are not relevant for admin
    const historyMsgs = sessionMessages.filter(m => m.role === 'user');

    // Check which messages already exist to avoid duplicates
    const { data: existingMessages } = await db
      .from('chat_messages')
      .select('text, sender')
      .eq('session_id', sessionId);

    const existingSet = new Set(
      (existingMessages || []).map(m => `${m.sender}:${m.text}`)
    );

    // Insert only new historical messages into chat_messages table
    for (const msg of historyMsgs) {
      const msgKey = `${msg.role}:${msg.content}`;
      if (existingSet.has(msgKey)) {
        console.log('[RouteBot] Message already exists, skipping:', msgKey);
        continue;
      }

      try {
        await db.from('chat_messages').insert({
          session_id: sessionId,
          text: msg.content,
          sender: msg.role,
          created_at: new Date().toISOString(), // Use current time for history
        });
      } catch (err) {
        // Ignore duplicate errors (messages might already exist)
        console.warn('Could not save historical message:', err);
      }
    }

    listenForAdminReplies();

    // Add bot message to user view only (NOT saved to database)
    addMessage(
      `✅ **You're now connected to human support!**\n\nHi **${visitorName}**! A member of our team will be with you shortly. You can also reach us at **info@clearrouteuk.co.uk** 📧`,
      'bot',
      true // Skip database save - this is user-facing only
    );

    persistState();
  } catch (e) {
    console.error('[RouteBot] Handoff error:', e);
    hasRequestedHuman = false;
  }
}

function setHumanUI() {
  const avatar = document.querySelector('.routebot-avatar');
  if (avatar) {
    avatar.innerHTML = '<i class="fas fa-headset"></i>';
    avatar.style.cssText =
      'background:rgba(46,159,110,0.2);border-color:#2E9F6E;color:#2E9F6E;';
  }

  const name = document.querySelector('.routebot-header-name');
  if (name) name.textContent = 'Human Support';

  const status = document.getElementById('rbStatusText');
  if (status) status.textContent = 'Connected — Human Support';

  const banner = document.getElementById('rbAdminBanner');
  if (banner) banner.classList.add('show');

  const handoffBar = document.getElementById('rbHandoffBar');
  if (handoffBar) {
    handoffBar.innerHTML = `
      <span class="rb-handoff-label" style="color:#2E9F6E;">
        <i class="fas fa-headset"></i> Connected to Human Support
      </span>
      <button class="rb-handoff-btn rb-handoff-btn--ai" id="rbBackToAI">
        <i class="fas fa-route"></i> Back to AI
      </button>
    `;

    document.getElementById('rbBackToAI')?.addEventListener('click', switchBackToAI);
  }

  const input = document.getElementById('rbInput');
  if (input) input.placeholder = 'Type your message to our agent…';
}

function switchBackToAI() {
  isAdminMode = false;
  hasRequestedHuman = false;
  stopReplyListener();
  clearState();

  const avatar = document.querySelector('.routebot-avatar');
  if (avatar) {
    avatar.innerHTML = '<i class="fas fa-route"></i>';
    avatar.style.cssText = '';
  }

  const name = document.querySelector('.routebot-header-name');
  if (name) name.textContent = 'RouteBot';

  const status = document.getElementById('rbStatusText');
  if (status) status.textContent = 'ClearRoute UK Assistant';

  const banner = document.getElementById('rbAdminBanner');
  if (banner) banner.classList.remove('show');

  const handoffBar = document.getElementById('rbHandoffBar');
  if (handoffBar) {
    handoffBar.innerHTML = `
      <span class="rb-handoff-label">
        <i class="fas fa-route"></i> Chatting with AI
      </span>
      <button class="rb-handoff-btn" id="rbHandoffBtn">
        <i class="fas fa-headset"></i> Talk to a Human
      </button>
    `;

    document.getElementById('rbHandoffBtn')?.addEventListener('click', requestHuman);
  }

  const input = document.getElementById('rbInput');
  if (input) input.placeholder = 'Ask RouteBot anything...';

  addMessage(
    '🤖 You\'ve been switched back to **RouteBot AI**. How can I help you?',
    'bot',
    true
  );
}

/* ════════════════════════════════════════
   SUPABASE — LISTEN FOR ADMIN REPLIES
════════════════════════════════════════ */
function listenForAdminReplies() {
  if (replyChannel || !db) return;

  replyChannel = db
    .channel('admin-replies-' + sessionId)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'admin_replies',
        filter: `session_id=eq.${sessionId}`,
      },
      (payload) => {
        // Skip if already delivered
        if (!payload.new.id || deliveredReplyIds.has(payload.new.id)) return;
        if (!payload.new.text) return;

        deliveredReplyIds.add(payload.new.id);

        // Update watermark
        if ((payload.new.timestamp_ms || 0) > replyStartMs) {
          replyStartMs = payload.new.timestamp_ms;
        }

        if (!isAdminMode) {
          isAdminMode = true;
          setHumanUI();
        }

        addMessage(payload.new.text, 'admin');
        persistState();

        if (!isOpen) {
          unreadCount++;
          const badge = document.getElementById('routebotBadge');
          if (badge) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.classList.add('show');
          }
        }
      }
    )
    .subscribe();
}

function stopReplyListener() {
  if (replyChannel) {
    db.removeChannel(replyChannel);
    replyChannel = null;
  }
}

/* ════════════════════════════════════════
   SUPABASE EDGE FUNCTION — GROQ API CALL
════════════════════════════════════════ */
async function callWorker(userMessage) {
  // Build messages array for Groq
  const messages = conversationHistory.map(entry => ({
    role: entry.role === 'model' ? 'assistant' : entry.role,
    content: entry.content,
  }));

  // Add current user message
  messages.push({ role: 'user', content: userMessage });

  if (!WORKER_URL) {
    console.warn('[RouteBot] WORKER_URL not configured');
    appendMessage('assistant', 'The AI service is not available right now. Please try again later.');
    return null;
  }

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${window._supabase?.supabaseKey || ''}`
      },
      body: JSON.stringify({
        systemPrompt: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
      console.error(`Edge function error: ${res.status}`, errorData);
      console.error('Full error details:', JSON.stringify(errorData, null, 2));
      throw new Error(`Edge function error: ${res.status} - ${errorData.error || 'Unknown'}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      throw new Error('No reply from edge function');
    }

    // Save to history
    conversationHistory.push({ role: 'user',      content: userMessage });
    conversationHistory.push({ role: 'assistant', content: reply });

    // Keep history manageable — last 20 messages
    if (conversationHistory.length > 20) {
      conversationHistory = conversationHistory.slice(-20);
    }

    return reply;
  } catch (error) {
    // Check if it's a CORS error or network error
    if (error.message.includes('Failed to fetch') || error.message.includes('CORS') || error.message.includes('NetworkError')) {
      console.warn('Network/CORS error detected - using fallback responses');
    } else {
      console.error('Edge function error:', error);
    }
    // Provide helpful fallback responses based on common questions
    const lowerMsg = userMessage.toLowerCase();
    
    if (lowerMsg.includes('licence') || lowerMsg.includes('license') || lowerMsg.includes('driving')) {
      return "For driving licence conversion, ClearRoute UK helps international clients exchange their foreign licences for UK ones. The process depends on your country of origin. Please contact us at info@clearrouteuk.co.uk for personalized guidance.";
    }
    if (lowerMsg.includes('ni') || lowerMsg.includes('national insurance')) {
      return "To apply for a National Insurance number, you'll need to apply through the UK government. ClearRoute UK can guide you through the process and help with document preparation. Email us at info@clearrouteuk.co.uk for assistance.";
    }
    if (lowerMsg.includes('brp') || lowerMsg.includes('evisa') || lowerMsg.includes('biometric')) {
      return "BRP (Biometric Residence Permit) and eVisa guidance is one of our specialties. We help you understand the requirements and process for your specific situation. Contact info@clearrouteuk.co.uk for expert help.";
    }
    if (lowerMsg.includes('theory') || lowerMsg.includes('practical') || lowerMsg.includes('test')) {
      return "ClearRoute UK can help you book and prepare for both theory and practical driving tests. We provide guidance on requirements, booking process, and preparation. Reach out to info@clearrouteuk.co.uk for support.";
    }
    if (lowerMsg.includes('bank') || lowerMsg.includes('account')) {
      return "Opening a UK bank account as an international resident can be complex. ClearRoute UK helps you understand the requirements and guides you through the process. Email info@clearrouteuk.co.uk for assistance.";
    }
    if (lowerMsg.includes('address') || lowerMsg.includes('proof')) {
      return "Address proof is essential for many UK applications. ClearRoute UK helps you understand acceptable documents and how to obtain them if needed. Contact us at info@clearrouteuk.co.uk.";
    }
    
    // Generic fallback
    return "I'm currently experiencing technical difficulties with my AI service. For immediate assistance, please email us at info@clearrouteuk.co.uk or message us on WhatsApp. Our team is ready to help with driving licences, NI numbers, BRP/eVisa, and more.";
  }
}

/* ════════════════════════════════════════
   HANDLE SEND
════════════════════════════════════════ */
async function handleSend() {
  const input   = document.getElementById('rbInput');
  const sendBtn = document.getElementById('rbSend');
  const text    = input.value.trim();
  if (!text) return;

  // Security: Rate limiting check
  if (!checkRateLimit()) {
    addMessage('⚠️ You\'re sending messages too quickly. Please wait a moment before trying again.', 'bot', true);
    return;
  }

  // Security: Message validation
  const validation = validateMessage(text);
  if (!validation.valid) {
    addMessage(`⚠️ ${validation.error}`, 'bot', true);
    return;
  }

  document.getElementById('rbQuickReplies').style.display = 'none';
  addMessage(text, 'user');
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  // If admin has taken over OR human has been requested — just save message, admin sees it in panel
  if (isAdminMode || hasRequestedHuman) {
    try {
      await db.from('chat_messages').insert({
        session_id: sessionId,
        text,
        sender: 'user',
      });

      // Get current unread count and increment
      const { data: currentSession } = await db
        .from('chat_sessions')
        .select('unread')
        .eq('id', sessionId)
        .single();

      // Only increment unread count if not in admin mode (admin sees messages in real-time)
      const newUnread = isAdminMode ? 0 : (currentSession?.unread || 0) + 1;

      await db.from('chat_sessions')
        .update({
          last_message: text,
          last_sender: 'user',
          unread: newUnread,
          last_active: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);

      persistState();
    } catch (err) {
      console.warn('Could not save message:', err);
    }

    sendBtn.disabled = false;
    return;
  }

  showTyping();

  try {
    const reply = await callWorker(text);
    removeTyping();

    if (reply.includes('[REQUEST_HUMAN]')) {
      const clean = reply.replace('[REQUEST_HUMAN]', '').trim();
      if (clean) addMessage(clean, 'bot', true); // Skip database save
      if (!hasRequestedHuman) {
        await requestHuman();
      }
    } else {
      addMessage(reply, 'bot');
    }
  } catch (err) {
    removeTyping();
    addMessage(
      "Sorry, I had a moment there. You can reach us at <a href='mailto:info@clearrouteuk.co.uk' style='color:var(--copper);'>info@clearrouteuk.co.uk</a> or via WhatsApp.",
      'bot'
    );
    console.error('Worker error:', err);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

/* ════════════════════════════════════════
   RESTORE CONVERSATION
════════════════════════════════════════ */
function restoreConversation() {
  if (!sessionMessages.length) return;

  const container = document.getElementById('rbMessages');
  if (!container) return;

  sessionMessages.forEach(m => {
    const avatars = {
      bot:   '<i class="fas fa-route"></i>',
      user:  'You',
      admin: '<i class="fas fa-headset"></i>'
    };

    const div = document.createElement('div');
    div.className = `rb-msg ${m.role}`;
    div.innerHTML = `
      <div class="rb-msg-avatar">${avatars[m.role]}</div>
      <div class="rb-msg-bubble">${window.escapeHtml(m.content).replace(/\n/g, '<br/>')}</div>
    `;
    container.appendChild(div);
  });

  if (isAdminMode) setHumanUI();
  container.scrollTop = container.scrollHeight;
}

function restoreAndReconnect() {
  if (!isAdminMode || !sessionId) return;

  if (db) {
    listenForAdminReplies();
  } else {
    const interval = setInterval(() => {
      if (db) {
        clearInterval(interval);
        listenForAdminReplies();
      }
    }, 100);
    setTimeout(() => clearInterval(interval), 5000);
  }
}

/* ════════════════════════════════════════
   WELCOME MESSAGE
════════════════════════════════════════ */
function showWelcomeMessage() {
  setTimeout(() => {
    addMessage(
      "👋 Hi! I'm RouteBot, ClearRoute UK's assistant. I can help with driving licence conversion, NI numbers, BRP/eVisa, test bookings, and more. How can I help you today?",
      'bot',
      true
    );
    if (!isOpen) document.getElementById('routebotBadge').classList.add('show');
  }, 600);
}

/* ════════════════════════════════════════
   CLEAR CHAT
════════════════════════════════════════ */
function clearChat() {
  stopReplyListener();
  clearState();

  const container = document.getElementById('rbMessages');
  if (container) container.innerHTML = '';

  const avatar = document.querySelector('.routebot-avatar');
  if (avatar) {
    avatar.innerHTML = '<i class="fas fa-route"></i>';
    avatar.style.cssText = '';
  }

  const name = document.querySelector('.routebot-header-name');
  if (name) name.textContent = 'RouteBot';

  const status = document.getElementById('rbStatusText');
  if (status) status.textContent = 'ClearRoute UK Assistant';

  const banner = document.getElementById('rbAdminBanner');
  if (banner) banner.classList.remove('show');

  const handoffBar = document.getElementById('rbHandoffBar');
  if (handoffBar) {
    handoffBar.innerHTML = `
      <span class="rb-handoff-label">
        <i class="fas fa-route"></i> Chatting with AI
      </span>
      <button class="rb-handoff-btn" id="rbHandoffBtn">
        <i class="fas fa-headset"></i> Talk to a Human
      </button>
    `;

    document.getElementById('rbHandoffBtn')?.addEventListener('click', requestHuman);
  }

  const input = document.getElementById('rbInput');
  if (input) input.placeholder = 'Ask RouteBot anything...';

  showWelcomeMessage();
}

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
async function initRouteBot() {
  buildChatbot();

  const hasHistory = restoreState();
  restoreAndReconnect();

  // Wait for Supabase
  try {
    db = await window.getSupabase();
  } catch {
    console.warn('[RouteBot] Supabase unavailable — running without persistence');
    db = null;
  }

  // Set up Edge Function URL dynamically
  const supabaseUrl = window._supabase?.supabaseUrl || 'https://lxbsdgvzdqptdatluxlg.supabase.co';
  WORKER_URL = `${supabaseUrl}/functions/v1/chatbot`;

  document.getElementById('routebotBtn').addEventListener('click', toggleChat);
  document.getElementById('rbSend').addEventListener('click', handleSend);
  document.getElementById('rbHandoffBtn')?.addEventListener('click', requestHuman);
  document.getElementById('rbClearBtn')?.addEventListener('click', clearChat);

  document.getElementById('rbInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  document.getElementById('rbInput').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';

    // Update visitor typing indicator
    if (isAdminMode && sessionId && db) {
      db.from('chat_sessions')
        .update({ visitor_typing: new Date().toISOString() })
        .eq('id', sessionId)
        .catch(() => {});
    }
  });

  document.querySelectorAll('.rb-quick-reply').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('rbInput').value = btn.dataset.msg;
      handleSend();
    });
  });

  // Show welcome or restore conversation on open
  const originalToggle = toggleChat;
  window.toggleChat = function() {
    originalToggle();
    if (isOpen) {
      unreadCount = 0;
      const badge = document.getElementById('routebotBadge');
      if (badge) badge.classList.remove('show');

      const container = document.getElementById('rbMessages');
      if (container && !container.children.length) {
        if (hasHistory) {
          restoreConversation();
        } else {
          showWelcomeMessage();
        }
      }
      setTimeout(() => document.getElementById('rbInput')?.focus(), 300);
    }
  };

  // Auto unread badge after 15s
  setTimeout(() => {
    const windowEl = document.getElementById('routebotWindow');
    const badge = document.getElementById('routebotBadge');
    if (windowEl && !windowEl.classList.contains('open') && badge && unreadCount === 0) {
      unreadCount = 1;
      badge.textContent = '1';
      badge.classList.add('show');
    }
  }, 15000);
}

document.addEventListener('DOMContentLoaded', initRouteBot);