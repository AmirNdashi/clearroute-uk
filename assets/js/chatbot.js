/* ============================================================
   CLEARROUTE UK — ROUTEBOT CHATBOT
   Powered by Groq (via Cloudflare Worker) + Supabase
   ============================================================ */

// ── Cloudflare Worker URL (reused from SwiftGlobal) ─────────
const WORKER_URL = 'https://swiftglobal-ai.swiftglobal.workers.dev';
// ────────────────────────────────────────────────────────────

/* ── Session ID ── */
let sessionId = sessionStorage.getItem('cr_session_id');
if (!sessionId) {
  sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
  sessionStorage.setItem('cr_session_id', sessionId);
}

/* ── State ── */
let isOpen             = false;
let isAdminMode        = false;
let conversationHistory = [];
let replyChannel       = null;
let db                 = null;

/* ── System Prompt ── */
const SYSTEM_PROMPT = `You are RouteBot, the helpful AI assistant for ClearRoute UK — a professional UK documentation consultancy that helps international clients navigate UK driving licences, NI numbers, BRP/eVisa, theory and practical tests, address proof, and bank account setup.

Your role:
- Answer questions about ClearRoute UK's services warmly and professionally
- Explain processes clearly — driving licence conversion, NI numbers, BRP, eVisa, theory and practical tests, address proof, bank accounts
- Encourage users to contact ClearRoute UK for a free consultation for complex or personal situations
- Never provide legal advice or guarantee application outcomes
- Always remind users that all services go through official UK government channels only — DVLA, DVSA, HMRC, Home Office
- Keep responses concise — 2 to 4 sentences unless detail is clearly needed
- If asked about pricing, explain that fees are discussed directly with the team and there are no hidden costs
- If the user seems ready to proceed or has a complex case, suggest they speak to a human

Personality: Professional, warm, knowledgeable, clear. Never robotic.

If the user asks to speak to a human or requests live support — respond helpfully and end your message with exactly: [REQUEST_HUMAN]`;

/* ════════════════════════════════════════
   BUILD UI
════════════════════════════════════════ */
function buildChatbot() {
  const css = `
  .routebot-btn {
    position: fixed; bottom: 28px; right: 28px;
    width: 58px; height: 58px; border-radius: 50%;
    background: var(--gold); color: var(--navy-dark);
    border: none; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    font-size: 1.4rem;
    box-shadow: 0 6px 24px rgba(201,168,76,0.45);
    z-index: 9000; transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
  }
  .routebot-btn:hover { transform: scale(1.08); box-shadow: 0 10px 32px rgba(201,168,76,0.55); }
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
    position: fixed; bottom: 100px; right: 28px;
    width: 380px; max-height: 580px;
    border-radius: var(--radius-lg);
    background: var(--white);
    box-shadow: 0 24px 80px rgba(11,31,58,0.22);
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
    background: linear-gradient(135deg, var(--navy-dark) 0%, var(--navy) 100%);
    padding: 18px 20px; display: flex; align-items: center;
    gap: 12px; flex-shrink: 0;
  }
  .routebot-avatar {
    width: 40px; height: 40px; border-radius: 50%;
    background: rgba(201,168,76,0.2); border: 2px solid var(--gold);
    display: flex; align-items: center; justify-content: center;
    color: var(--gold); font-size: 1rem; flex-shrink: 0;
  }
  .routebot-header-text { flex: 1; }
  .routebot-header-name {
    font-family: var(--font-heading); font-size: 0.95rem;
    font-weight: 700; color: var(--white);
  }
  .routebot-header-status {
    display: flex; align-items: center; gap: 5px;
    font-size: 0.75rem; color: rgba(255,255,255,0.55); margin-top: 2px;
  }
  .routebot-header-status .dot {
    width: 6px; height: 6px; border-radius: 50%; background: #10B981;
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
  .rb-msg.bot   .rb-msg-avatar { background: var(--navy); color: var(--gold); }
  .rb-msg.admin .rb-msg-avatar { background: #7C3AED; color: white; }
  .rb-msg.user  .rb-msg-avatar { background: var(--gold); color: var(--navy-dark); }

  .rb-msg-bubble {
    padding: 10px 14px; border-radius: 16px;
    font-size: 0.88rem; line-height: 1.6;
    max-width: 100%; word-break: break-word;
  }
  .rb-msg.bot   .rb-msg-bubble { background:var(--white); color:var(--text-dark); border-bottom-left-radius:4px; box-shadow:0 1px 4px rgba(0,0,0,0.06); }
  .rb-msg.admin .rb-msg-bubble { background:#EDE9FE; color:#5B21B6; border-bottom-left-radius:4px; }
  .rb-msg.user  .rb-msg-bubble { background:var(--navy); color:var(--white); border-bottom-right-radius:4px; }

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
    font-weight:600; color:var(--navy); cursor:pointer; transition:all 0.2s;
  }
  .rb-quick-reply:hover { background:var(--navy); color:var(--white); border-color:var(--navy); }

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
  .routebot-input:focus { border-color:var(--navy); background:var(--white); }
  .routebot-input::placeholder { color:var(--text-light); }
  .routebot-send {
    width:38px; height:38px; border-radius:50%;
    background:var(--gold); color:var(--navy-dark);
    border:none; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    font-size:0.9rem; transition:all 0.2s; flex-shrink:0;
  }
  .routebot-send:hover { background:var(--gold-dark); transform:scale(1.05); }
  .routebot-send:disabled { opacity:0.5; cursor:not-allowed; }

  .rb-admin-banner {
    padding:8px 16px; background:#EDE9FE; text-align:center;
    font-family:var(--font-heading); font-size:0.78rem;
    font-weight:600; color:#5B21B6; display:none;
  }
  .rb-admin-banner.show { display:block; }

  @media (max-width:480px) {
    .routebot-window { width:calc(100vw - 24px); right:12px; bottom:90px; }
    .routebot-btn { right:16px; bottom:20px; }
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
      </div>

      <div class="rb-admin-banner" id="rbAdminBanner">
        <i class="fas fa-headset"></i> You're now connected with a ClearRoute UK team member
      </div>

      <div class="routebot-messages" id="rbMessages"></div>

      <div class="rb-quick-replies" id="rbQuickReplies">
        <button class="rb-quick-reply" data-msg="How do I convert my driving licence?">Licence conversion</button>
        <button class="rb-quick-reply" data-msg="How do I apply for a NI number?">NI Number</button>
        <button class="rb-quick-reply" data-msg="What is BRP / eVisa guidance?">BRP / eVisa</button>
        <button class="rb-quick-reply" data-msg="How does the process work?">How it works</button>
        <button class="rb-quick-reply" data-msg="I'd like to speak to a real person">Speak to a human</button>
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
function addMessage(text, sender = 'bot') {
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
    <div class="rb-msg-bubble">${text.replace(/\n/g, '<br/>')}</div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  saveMessage(text, sender);
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
    await db.from('chat_sessions').upsert({
      id: sessionId,
      last_message: text,
      last_sender: sender,
      page: window.location.pathname,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    await db.from('chat_messages').insert({
      session_id: sessionId,
      text,
      sender,
    });
  } catch (e) {
    console.warn('Supabase save error:', e);
  }
}

/* ════════════════════════════════════════
   SUPABASE — ADMIN HANDOFF
════════════════════════════════════════ */
async function requestHuman() {
  if (!db) return;
  try {
    await db.from('admin_queue').insert({
      session_id: sessionId,
      status: 'pending',
      page: window.location.pathname,
    });
    listenForAdminReplies();
    addMessage(
      "I've notified the ClearRoute UK team that you'd like to speak with someone. A team member will be with you shortly. Feel free to keep chatting or check our <a href='services.html' style='color:var(--gold);text-decoration:underline;'>services page</a>.",
      'bot'
    );
  } catch (e) {
    console.warn('Handoff error:', e);
  }
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
        if (!isAdminMode) {
          isAdminMode = true;
          document.getElementById('rbAdminBanner').classList.add('show');
          document.getElementById('rbStatusText').textContent = 'Live — ClearRoute UK Team';
        }
        addMessage(payload.new.text, 'admin');
        if (!isOpen) {
          document.getElementById('routebotBadge').classList.add('show');
        }
      }
    )
    .subscribe();
}

/* ════════════════════════════════════════
   CLOUDFLARE WORKER — GROQ API CALL
════════════════════════════════════════ */
async function callWorker(userMessage) {
  // Build messages array for Groq
  const messages = conversationHistory.map(entry => ({
    role: entry.role === 'model' ? 'assistant' : entry.role,
    content: entry.content,
  }));

  // Add current user message
  messages.push({ role: 'user', content: userMessage });

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemPrompt: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!res.ok) {
      console.error(`Worker returned status: ${res.status}`);
      throw new Error(`Worker error: ${res.status}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content;

    if (!reply) {
      throw new Error('No reply from worker');
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
    console.error('Cloudflare Worker error:', error);
    // Provide helpful fallback responses based on common questions
    const lowerMsg = userMessage.toLowerCase();
    
    if (lowerMsg.includes('licence') || lowerMsg.includes('license') || lowerMsg.includes('driving')) {
      return "For driving licence conversion, ClearRoute UK helps international clients exchange their foreign licences for UK ones. The process depends on your country of origin. Please contact us at hello@clearrouteuk.co.uk for personalized guidance.";
    }
    if (lowerMsg.includes('ni') || lowerMsg.includes('national insurance')) {
      return "To apply for a National Insurance number, you'll need to apply through the UK government. ClearRoute UK can guide you through the process and help with document preparation. Email us at hello@clearrouteuk.co.uk for assistance.";
    }
    if (lowerMsg.includes('brp') || lowerMsg.includes('evisa') || lowerMsg.includes('biometric')) {
      return "BRP (Biometric Residence Permit) and eVisa guidance is one of our specialties. We help you understand the requirements and process for your specific situation. Contact hello@clearrouteuk.co.uk for expert help.";
    }
    if (lowerMsg.includes('theory') || lowerMsg.includes('practical') || lowerMsg.includes('test')) {
      return "ClearRoute UK can help you book and prepare for both theory and practical driving tests. We provide guidance on requirements, booking process, and preparation. Reach out to hello@clearrouteuk.co.uk for support.";
    }
    if (lowerMsg.includes('bank') || lowerMsg.includes('account')) {
      return "Opening a UK bank account as an international resident can be complex. ClearRoute UK helps you understand the requirements and guides you through the process. Email hello@clearrouteuk.co.uk for assistance.";
    }
    if (lowerMsg.includes('address') || lowerMsg.includes('proof')) {
      return "Address proof is essential for many UK applications. ClearRoute UK helps you understand acceptable documents and how to obtain them if needed. Contact us at hello@clearrouteuk.co.uk.";
    }
    
    // Generic fallback
    return "I'm currently experiencing technical difficulties with my AI service. For immediate assistance, please email us at hello@clearrouteuk.co.uk or message us on WhatsApp. Our team is ready to help with driving licences, NI numbers, BRP/eVisa, and more.";
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

  document.getElementById('rbQuickReplies').style.display = 'none';
  addMessage(text, 'user');
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  // If admin has taken over — just save message, admin sees it in panel
  if (isAdminMode) {
    sendBtn.disabled = false;
    return;
  }

  showTyping();

  try {
    const reply = await callWorker(text);
    removeTyping();

    if (reply.includes('[REQUEST_HUMAN]')) {
      const clean = reply.replace('[REQUEST_HUMAN]', '').trim();
      if (clean) addMessage(clean, 'bot');
      await requestHuman();
    } else {
      addMessage(reply, 'bot');
    }
  } catch (err) {
    removeTyping();
    addMessage(
      "Sorry, I had a moment there. You can reach us at <a href='mailto:hello@clearrouteuk.co.uk' style='color:var(--gold);'>hello@clearrouteuk.co.uk</a> or via WhatsApp.",
      'bot'
    );
    console.error('Worker error:', err);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
async function initRouteBot() {
  buildChatbot();

  // Wait for Supabase
  db = await window.getSupabase();

  document.getElementById('routebotBtn').addEventListener('click', toggleChat);
  document.getElementById('rbSend').addEventListener('click', handleSend);

  document.getElementById('rbInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  });

  document.getElementById('rbInput').addEventListener('input', (e) => {
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
  });

  document.querySelectorAll('.rb-quick-reply').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('rbInput').value = btn.dataset.msg;
      handleSend();
    });
  });

  // Welcome message
  setTimeout(() => {
    addMessage(
      "👋 Hi! I'm RouteBot, ClearRoute UK's assistant. I can help with driving licence conversion, NI numbers, BRP/eVisa, test bookings, and more. How can I help you today?",
      'bot'
    );
    if (!isOpen) document.getElementById('routebotBadge').classList.add('show');
  }, 1500);

  listenForAdminReplies();
}

document.addEventListener('DOMContentLoaded', initRouteBot);