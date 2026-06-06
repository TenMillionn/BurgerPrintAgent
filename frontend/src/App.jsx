import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, ChevronDown, CircleCheck, Clock, Globe, PanelLeftOpen, Plus, Sparkles } from 'lucide-react';
import WelcomeModal from './components/WelcomeModal';
import Sidebar from './components/Sidebar';
import KnowledgePanel from './components/KnowledgePanel';
import UserAdminPanel from './components/UserAdminPanel';
import { useTranslation } from './i18n';
import { OrderProvider } from './components/ManualOrderWizard/OrderContext';
import WizardLayout from './components/ManualOrderWizard/WizardLayout';

// Web (Vite dev) dùng proxy '/api'. Extension chạy origin chrome-extension:// nên gọi
// thẳng backend (mặc định cổng 3001 — đổi trong ô "Backend URL" nếu cần).
const isExtension =
  typeof location !== 'undefined' && location.protocol === 'chrome-extension:';
// Web build talks to the backend through the dev/nginx proxy ('/api').
// The Chrome extension runs on a chrome-extension:// origin (no proxy) so it
// calls the backend directly — point this at wherever the backend runs.
const DEFAULT_API = isExtension ? 'http://localhost:3001' : '/api';

// Chuẩn hoá LaTeX: \[ \] và \( \) → $$ $$ để remark-math (đã tắt single-$) render được.
// KHÔNG đụng tới '$' đơn (tiền tệ $25) → tránh nuốt chữ thành công thức.
function normalizeMath(text) {
  if (!text) return text;
  return text
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `\n\n$$${m.trim()}$$\n\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$$${m.trim()}$$`);
}

// Custom markdown components: link mở tab mới
const MARKDOWN_COMPONENTS = {
  a: ({ children, href }) =>
    href ? (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  // Wrap wide tables so they scroll horizontally instead of breaking the layout.
  table: ({ children }) => (
    <div className="md-table-scroll">
      <table>{children}</table>
    </div>
  ),
};

export default function App() {
  const { t } = useTranslation();

  // ── Theme ──
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('bp_theme') || 'light'; } catch { return 'light'; }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('bp_theme', theme); } catch { /* noop */ }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  // ── Auth ──
  const savedAuth = (() => {
    try { return JSON.parse(localStorage.getItem('bp_auth') || 'null'); } catch { return null; }
  })();
  // Guest sessions (random UUIDs) are deprecated now that data is per-user;
  // drop any stale one so we never query the backend with an invalid id.
  try {
    localStorage.removeItem('bp_guest_session');
  } catch {
    /* noop */
  }

  const [apiBase] = useState(DEFAULT_API);
  const [email, setEmail] = useState('seller@test.com');
  const [password, setPassword] = useState('Password123');
  const [auth, setAuth] = useState(savedAuth || null);
  const [token, setToken] = useState(savedAuth?.token || '');
  const [refreshToken, setRefreshToken] = useState(savedAuth?.refreshToken || '');
  const [sessionId, setSessionId] = useState('');

  // Always-current auth for fetch closures (avoids stale tokens after refresh).
  const authRef = useRef({ token: savedAuth?.token || '', refreshToken: savedAuth?.refreshToken || '' });
  useEffect(() => {
    authRef.current = { token, refreshToken };
  }, [token, refreshToken]);
  const [status, setStatus] = useState(t('status.disconnected'));
  const [connecting, setConnecting] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Keep the user signed in across reloads: only show the login modal when there
  // is no saved access token.
  const [showModal, setShowModal] = useState(!savedAuth?.token);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [orderWizardConfig, setOrderWizardConfig] = useState(null);
  const [conversations, setConversations] = useState([]);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const stick = useRef(true);

  // Tool label lookup via i18n
  const toolLabel = (n) => {
    const key = `tools.${n}`;
    const val = t(key);
    return val !== key ? val : n;
  };

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  useEffect(() => {
    if (stick.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  // Responsive: auto-collapse sidebar on small screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    if (mq.matches) setSidebarCollapsed(true);
    const handler = (e) => setSidebarCollapsed(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  async function login() {
    try {
      const r = await fetch(`${apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      return { accessToken: d.accessToken || '', refreshToken: d.refreshToken || '' };
    } catch {
      return null;
    }
  }

  // Exchange the refresh token for a fresh access token (rotation). Returns the
  // new access token, or null if the refresh token is invalid/expired.
  const doRefresh = useCallback(async () => {
    const rt = authRef.current.refreshToken;
    if (!rt) return null;
    try {
      const r = await fetch(`${apiBase}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      if (!r.ok) return null;
      const d = await r.json();
      authRef.current = { token: d.accessToken, refreshToken: d.refreshToken };
      setToken(d.accessToken);
      setRefreshToken(d.refreshToken);
      try {
        const saved = JSON.parse(localStorage.getItem('bp_auth') || '{}');
        localStorage.setItem(
          'bp_auth',
          JSON.stringify({ ...saved, token: d.accessToken, refreshToken: d.refreshToken }),
        );
      } catch {
        /* noop */
      }
      return d.accessToken;
    } catch {
      return null;
    }
  }, [apiBase]);

  const handleSessionExpired = useCallback(() => {
    try {
      localStorage.removeItem('bp_auth');
    } catch {
      /* noop */
    }
    authRef.current = { token: '', refreshToken: '' };
    setAuth(null);
    setToken('');
    setRefreshToken('');
    setSessionId('');
    setShowModal(true);
  }, []);

  // Authenticated fetch: attaches the access token and, on 401, transparently
  // refreshes once and retries. If refresh fails, the session is ended.
  const apiFetch = useCallback(
    async (path, opts = {}, _retried = false) => {
      const headers = {
        ...(opts.headers || {}),
        Authorization: `Bearer ${authRef.current.token}`,
      };
      const res = await fetch(`${apiBase}${path}`, { ...opts, headers });
      if (res.status === 401 && !_retried) {
        const fresh = await doRefresh();
        if (fresh) return apiFetch(path, opts, true);
        handleSessionExpired();
      }
      return res;
    },
    [apiBase, doRefresh, handleSessionExpired],
  );

  // Start the real Google OAuth flow in a popup window so the current page (or
  // the extension side panel) is not navigated away. The popup lands back on the
  // web app with tokens, relays them via BroadcastChannel, then closes itself.
  function handleGoogleLogin() {
    // Chrome extension: use the identity API so tokens come straight back to the
    // extension (the redirect-to-web-origin trick can't reach chrome-extension://).
    const ident =
      isExtension && window.chrome?.identity?.launchWebAuthFlow
        ? window.chrome.identity
        : null;
    if (ident) {
      const redirectUri = ident.getRedirectURL(); // https://<id>.chromiumapp.org/
      const authUrl = `${apiBase}/auth/google?ext_redirect=${encodeURIComponent(redirectUri)}`;
      ident.launchWebAuthFlow({ url: authUrl, interactive: true }, (responseUrl) => {
        if (!responseUrl || window.chrome?.runtime?.lastError) return;
        try {
          const u = new URL(responseUrl);
          const at = u.searchParams.get('access_token');
          if (at) finishSignIn(at, u.searchParams.get('refresh_token') || '');
        } catch {
          /* ignore */
        }
      });
      return;
    }
    // Web: popup flow (tokens relayed via BroadcastChannel).
    const url = `${apiBase}/auth/google`;
    const popup = window.open(url, 'bp_google_login', 'width=480,height=660');
    if (!popup) {
      window.location.href = url; // popup blocked → same-tab redirect
    }
  }


  // Finish a signed-in session given the token pair: store both + fetch profile.
  const finishSignIn = useCallback(
    async (accessToken, refreshTok = '') => {
      authRef.current = { token: accessToken, refreshToken: refreshTok };
      setToken(accessToken);
      setRefreshToken(refreshTok);
      try {
        const r = await fetch(`${apiBase}/auth/me`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const user = r.ok ? await r.json() : null;
        const authData = { token: accessToken, refreshToken: refreshTok, user: user || {} };
        localStorage.setItem('bp_auth', JSON.stringify(authData));
        setAuth(authData);
      } catch {
        /* ignore */
      }
      setShowModal(false);
    },
    [apiBase],
  );

  // On load, complete a Google OAuth redirect (tokens in the query string).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get('access_token');
    if (!accessToken) return;
    const refreshTok = params.get('refresh_token') || '';
    // If we are the OAuth popup, relay the tokens to the opener and close.
    if (window.opener && window.opener !== window) {
      try {
        const ch = new BroadcastChannel('bp_oauth');
        ch.postMessage({ accessToken, refreshToken: refreshTok });
        ch.close();
      } catch {
        /* noop */
      }
      window.close();
      return;
    }
    // Otherwise this tab itself was redirected → sign in here.
    finishSignIn(accessToken, refreshTok);
    window.history.replaceState({}, document.title, window.location.pathname);
  }, [finishSignIn]);

  // Receive tokens relayed from the OAuth popup (same-origin web app).
  useEffect(() => {
    let ch;
    try {
      ch = new BroadcastChannel('bp_oauth');
      ch.onmessage = (e) => {
        if (e.data?.accessToken) {
          finishSignIn(e.data.accessToken, e.data.refreshToken || '');
        }
      };
    } catch {
      /* BroadcastChannel unsupported */
    }
    return () => {
      try {
        ch && ch.close();
      } catch {
        /* noop */
      }
    };
  }, [finishSignIn]);

  async function handleEmailLogin() {
    setConnecting(true);
    try {
      let creds = await login();
      if (!creds?.accessToken) {
        await register();
        creds = await login();
      }
      if (!creds?.accessToken) {
        setStatus(`${t('status.error')}: ${t('status.errorNoToken')}`);
        return;
      }
      await finishSignIn(creds.accessToken, creds.refreshToken);
    } finally {
      setConnecting(false);
    }
  }

  // "Continue as guest" signs in with the default demo account (per-user data
  // isolation now requires a real account).
  function handleGuestChat() {
    handleEmailLogin();
  }

  async function register() {
    try {
      await fetch(`${apiBase}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch { /* ignore */ }
  }

  function patchLast(fn) {
    setMessages((m) => {
      const copy = [...m];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'assistant') {
          copy[i] = fn({ ...copy[i] });
          break;
        }
      }
      return copy;
    });
  }

  // Load the user's conversations (newest-updated first).
  const loadConversations = useCallback(async () => {
    if (!authRef.current.token) return;
    try {
      const r = await apiFetch('/conversations'); // refreshes the token on 401
      if (r.ok) {
        const d = await r.json();
        setConversations(d.conversations || []);
      }
    } catch {
      /* ignore */
    }
  }, [apiFetch]);

  useEffect(() => {
    loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadConversations, token]);

  // Open a saved conversation and load its full history into the chat.
  async function selectConversation(id) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/conversations/${id}`);
      if (!r.ok) {
        // Conversation gone (deleted/expired) → drop the saved active id.
        try {
          localStorage.removeItem('bp_active');
        } catch {
          /* noop */
        }
        setSessionId('');
        setMessages([]);
        return;
      }
      const d = await r.json();
      const msgs = (d.messages || [])
        .filter((m) => m.content || (m.toolSteps && m.toolSteps.length))
        .map((m) => ({
          role: m.role,
          text: m.content || '',
          steps: (m.toolSteps || []).map((s) => ({ name: s.name, status: 'done' })),
          thinking: '',
        }));
      setSessionId(id);
      setMessages(msgs);
      stick.current = true;
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  }

  // Persist the open conversation so a reload reopens it (no router → works in
  // the Chrome extension side panel).
  useEffect(() => {
    try {
      if (sessionId) localStorage.setItem('bp_active', sessionId);
      else localStorage.removeItem('bp_active');
    } catch {
      /* noop */
    }
  }, [sessionId]);

  // On load, reopen the last active conversation once a token is available.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !token || sessionId) return;
    let active = null;
    try {
      active = localStorage.getItem('bp_active');
    } catch {
      /* noop */
    }
    if (active) {
      restoredRef.current = true;
      selectConversation(active);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, sessionId]);

  async function renameConversation(id, title) {
    if (!title || !title.trim()) return;
    await apiFetch(`/conversations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim().slice(0, 120) }),
    }).catch(() => {});
    loadConversations();
  }

  async function deleteConversation(id) {
    await apiFetch(`/conversations/${id}`, { method: 'DELETE' }).catch(() => {});
    if (id === sessionId) {
      setSessionId('');
      setMessages([]);
    }
    loadConversations();
  }

  async function send() {
    const msg = input.trim();
    if (!msg || busy) return;

    // Create a real persisted conversation lazily on the first message.
    let sid = sessionId;
    if (!sid) {
      try {
        const r = await apiFetch('/conversations', { method: 'POST' });
        const d = await r.json();
        sid = d.sessionId;
        setSessionId(sid);
      } catch (e) {
        return;
      }
    }

    setInput('');
    setBusy(true);
    stick.current = true;
    setMessages((m) => [
      ...m,
      { role: 'user', text: msg },
      { role: 'assistant', text: '', steps: [], thinking: '' },
    ]);

    try {
      const res = await apiFetch(
        `/conversations/${sid}/stream?message=${encodeURIComponent(msg)}`,
        { headers: { Accept: 'text/event-stream' } },
      );
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const blocks = buf.split('\n\n');
        buf = blocks.pop() || '';
        for (const block of blocks) handleEvent(block);
      }
    } catch (e) {
      patchLast((a) => ({ ...a, text: a.text + `\n[${t('chat.connectionError')}: ${e.message}]` }));
    } finally {
      setBusy(false);
      loadConversations(); // refresh titles/order after the turn
    }
  }

  function handleEvent(block) {
    let event = 'message';
    let dataLine = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
    }
    if (!dataLine) return;
    let d;
    try { d = JSON.parse(dataLine); } catch { return; }

    if (event === 'token') {
      patchLast((a) => ({ ...a, text: a.text + (d.text || '') }));
    } else if (event === 'thinking') {
      patchLast((a) => ({ ...a, thinking: a.thinking + (d.text || '') }));
    } else if (event === 'tool') {
      patchLast((a) => {
        const steps = [...a.steps];
        const key = d.id || d.name;
        const idx = steps.findIndex((s) => (s.id || s.name) === key && s.status === 'running');
        if (d.status === 'done' && idx >= 0) {
          steps[idx] = { ...steps[idx], status: 'done', endedAt: Date.now(), count: d.count, results: d.results };
        } else if (d.status === 'running') {
          steps.push({ id: d.id, name: d.name, status: 'running', startedAt: Date.now() });
        }
        return { ...a, steps };
      });
    } else if (event === 'error') {
      patchLast((a) => ({ ...a, text: a.text + `\n\n⚠️ ${d.message || t('status.error')}` }));
    }
  }

  function handleNewChat() {
    setMessages([]);
    setSessionId(''); // a real conversation is created lazily on the first message
  }

  function handleLogout() {
    localStorage.removeItem('bp_auth');
    localStorage.removeItem('bp_guest_session');
    setAuth(null);
    setToken('');
    setSessionId('');
    setMessages([]);
    setShowModal(true);
  }

  const ready = !!token || !!sessionId;
  const userName = auth?.user?.displayName || auth?.user?.email || '';
  const userEmail = auth?.user?.email || '';
  const isAdmin = auth?.user?.role === 'admin';

  return (
    <div className="app">
      {/* Sidebar */}
      {!showModal && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((v) => !v)}
          onNewChat={handleNewChat}
          onLogout={auth ? handleLogout : undefined}
          userName={userName}
          userEmail={userEmail}
          theme={theme}
          onToggleTheme={toggleTheme}
          conversations={conversations}
          activeId={sessionId}
          onSelect={selectConversation}
          onRename={renameConversation}
          onDelete={deleteConversation}
          isAdmin={isAdmin}
          onOpenKnowledge={() => setShowKnowledge(true)}
          onOpenUsers={() => setShowUsers(true)}
          onCreateOrder={(initialData = {}) => setOrderWizardConfig(initialData)}
        />
      )}

      {showKnowledge && (
        <KnowledgePanel apiFetch={apiFetch} t={t} onClose={() => setShowKnowledge(false)} />
      )}

      {showUsers && (
        <UserAdminPanel
          apiFetch={apiFetch}
          t={t}
          currentUserId={auth?.user?.id}
          onClose={() => setShowUsers(false)}
        />
      )}

      {orderWizardConfig && (
        <OrderProvider initialData={orderWizardConfig}>
          <WizardLayout onClose={() => setOrderWizardConfig(null)} />
        </OrderProvider>
      )}

      {/* Mobile overlay when sidebar is open */}
      <AnimatePresence>
        {!showModal && !sidebarCollapsed && window.innerWidth <= 768 && (
          <motion.div
            className="sidebar-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSidebarCollapsed(true)}
          />
        )}
      </AnimatePresence>

      {/* Main Area */}
      <div className="main-area">
        {/* Top bar — visible when sidebar is hidden */}
        {!showModal && sidebarCollapsed && (
          <div className="main-header">
            <button
              className="main-header-toggle"
              onClick={() => setSidebarCollapsed(false)}
              title={t('sidebar.expand')}
            >
              <PanelLeftOpen size={20} strokeWidth={1.8} />
            </button>
            <img src="./favicon.png" alt="" style={{ width: 20, height: 20, borderRadius: 4 }} />
            <span className="main-header-title">BurgerPrint Agent</span>
          </div>
        )}

        <AnimatePresence>
          {showModal && (
            <WelcomeModal
              onGoogleLogin={handleGoogleLogin}
              onEmailLogin={handleEmailLogin}
              onGuestChat={handleGuestChat}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
            />
          )}
        </AnimatePresence>

        {/* Chat Messages */}
        <div className="chat" ref={scrollRef} onScroll={onScroll}>
          {messages.length === 0 && ready && (
            <div className="greeting">
              <motion.div
                className="greeting-text"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              >
                {t('chat.greeting')}
              </motion.div>
              <motion.div
                className="greeting-sub"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                {t('chat.greetingSub')}
              </motion.div>
              <div className="suggestion-chips">
                {(t('chat.suggestions') || []).map?.((text, i) => (
                  <motion.button
                    key={i}
                    className="suggestion-chip"
                    onClick={() => { setInput(text); taRef.current?.focus(); }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.3 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {text}
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {messages.length > 0 && (
            <div className="text-center text-xs font-medium mt-1 mb-1" style={{ color: 'var(--text-muted)' }}>
              {t('chat.today')}
            </div>
          )}

          {messages.map((m, i) =>
            m.role === 'user' ? (
              <div key={i} className="flex justify-end">
                <div
                  className="max-w-[82%] rounded-[22px] px-[18px] py-[11px] text-[14.5px] whitespace-pre-wrap break-words"
                  style={{ background: 'var(--bg-user-bubble)', color: 'var(--text-primary)' }}
                >
                  {m.text}
                </div>
              </div>
            ) : (
              <AssistantMessage
                key={i}
                msg={m}
                streaming={busy && i === messages.length - 1}
                toolLabel={toolLabel}
                t={t}
              />
            ),
          )}
        </div>

        {/* Composer */}
        <div className="composer">
          <div className="composer-box">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={ready ? t('composer.placeholder') : t('composer.placeholderDisabled')}
              disabled={!ready || busy}
              rows={1}
            />
            <div className="composer-row">
              <button className="composer-plus" type="button" title={t('composer.attach')} disabled>
                <Plus size={18} strokeWidth={2} />
              </button>
              <span className="composer-pill">{t('composer.model')}</span>
              <div className="composer-spacer" />
              <button
                className="composer-send"
                onClick={send}
                disabled={!ready || busy || !input.trim()}
                title={t('composer.send')}
              >
                <ArrowUp size={18} strokeWidth={2.4} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Assistant Message ─── */
function AssistantMessage({ msg, streaming, toolLabel, t }) {
  const entries = useMemo(() => {
    const list = [];
    if (msg.thinking) {
      list.push({ kind: 'think', label: msg.thinking, ts: msg.steps[0]?.startedAt ?? 0 });
    }
    const byName = new Map();
    for (const s of msg.steps) {
      const cur = byName.get(s.name);
      if (!cur) {
        byName.set(s.name, {
          kind: 'tool', name: s.name, label: toolLabel(s.name),
          status: s.status, calls: 1, ts: s.startedAt,
          count: s.count, results: s.results,
        });
      } else {
        cur.calls += 1;
        if (s.status === 'running') cur.status = 'running';
        else if (cur.status !== 'running') cur.status = 'done';
        if (s.results) { cur.results = s.results; cur.count = s.count; }
      }
    }
    return [...list, ...byName.values()];
  }, [msg.steps, msg.thinking]);

  const runningStep = msg.steps.find((s) => s.status === 'running');
  const thinkingLabel = runningStep
    ? `${t('chat.thinking').split(' ')[0]} ${toolLabel(runningStep.name).toLowerCase()}`
    : t('chat.thinking');

  return (
    <div className="group flex flex-col gap-1.5 max-w-[92%]">
      {entries.length > 0 && <Trace entries={entries} streaming={streaming} toolLabel={toolLabel} t={t} />}
      {streaming && !msg.text && entries.length === 0 && (
        <span className="shimmer">{thinkingLabel}…</span>
      )}
      {msg.text && (
        <div className="chat-markdown max-w-full break-words">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
            rehypePlugins={[rehypeKatex]}
            components={MARKDOWN_COMPONENTS}
          >
            {normalizeMath(msg.text)}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function itemIcon(kind) {
  if (kind === 'think')
    return <Clock className="w-[17px] h-[17px]" style={{ color: 'var(--text-muted)' }} strokeWidth={1.75} />;
  return <Globe className="w-[16px] h-[16px]" style={{ color: 'var(--text-muted)' }} strokeWidth={1.75} />;
}

const TRACE_COLLAPSED_MAX = 172; // px — height limit before "Show more"

function Trace({ entries, streaming, toolLabel, t }) {
  const [userOpen, setUserOpen] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const open = userOpen ?? false; // default: closed (even while streaming)
  const scrollRef = useRef(null);
  const [overflows, setOverflows] = useState(false);

  const running = entries.find((e) => e.status === 'running');
  const title = streaming
    ? running ? running.label : t('chat.thinking')
    : entries.some((e) => e.kind === 'think')
      ? t('chat.thought')
      : `${t('chat.catalogSteps')} · ${entries.length} ${t('chat.steps')}`;

  // Measure whether the content is taller than the collapsed limit.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) setOverflows(el.scrollHeight > TRACE_COLLAPSED_MAX + 4);
  }, [entries, open, expanded]);

  // While running (and height-limited), keep the latest step in view.
  useEffect(() => {
    if (open && streaming && !expanded && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries, open, streaming, expanded]);

  return (
    <div className="text-[15px] leading-relaxed">
      <button
        type="button"
        onClick={() => setUserOpen((v) => (v == null ? !open : !v))}
        className="group cursor-pointer inline-flex items-center gap-1.5 max-w-full px-1 py-0.5 rounded text-left transition-colors"
        style={{ color: 'var(--text-muted)' }}
        aria-expanded={open}
      >
        <Sparkles className="w-[14px] h-[14px] flex-none" strokeWidth={1.75} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={'truncate max-w-[440px] text-[14px] leading-[24px] font-normal ' + (streaming ? 'shimmer' : '')}
          >
            {title}
          </motion.span>
        </AnimatePresence>
        <ChevronDown
          className={'w-4 h-4 flex-none transition-transform duration-200 ' + (!open ? '-rotate-90' : '')}
          style={{ color: 'var(--text-muted)' }}
          strokeWidth={2}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="relative">
              <div
                ref={scrollRef}
                className="trace-scroll"
                style={{
                  maxHeight: expanded ? 'none' : TRACE_COLLAPSED_MAX,
                  overflowY: expanded ? 'visible' : 'auto',
                }}
              >
                <div className="relative pt-2.5 pb-1 pl-[30px] pr-1">
              <span aria-hidden className="absolute left-[12px] top-[18px] bottom-[18px] w-px" style={{ background: 'var(--border-medium)' }} />
              <div className="flex flex-col gap-4 text-[14px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {entries.map((e, idx) => (
                  <div key={idx} className="relative -ml-[30px] pl-[30px]">
                    <span aria-hidden className="absolute left-0 top-0 w-[24px] h-[24px] flex items-center justify-center rounded-full" style={{ background: 'var(--icon-circle-bg)' }}>
                      {itemIcon(e.kind)}
                    </span>
                    <div style={e.kind === 'think' ? { color: 'var(--text-primary)' } : {}}>
                      <div className="flex items-baseline">
                        <span>{e.label}</span>
                        {e.kind === 'tool' && e.calls > 1 && <span className="ml-1.5" style={{ color: 'var(--text-muted)' }}>×{e.calls}</span>}
                        {e.kind === 'tool' && e.count != null && <span className="ml-2 text-[13px]" style={{ color: 'var(--text-muted)' }}>{e.count} {t('chat.results')}</span>}
                        {e.kind === 'tool' && e.status === 'running' && <span className="ml-2 text-[13px]" style={{ color: 'var(--text-muted)' }}>{t('chat.running')}</span>}
                      </div>
                      {e.results?.length > 0 && (
                        <div className="mt-1.5 rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border-medium)', background: 'var(--bg-sidebar-hover)' }}>
                          {e.results.map((r, ri) => (
                            <div key={ri} className="flex items-center gap-2 px-3 py-1.5 text-[13px]" style={{ borderBottom: ri < e.results.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                              <span className="w-1.5 h-1.5 rounded-full flex-none" style={{ background: 'var(--accent)' }} />
                              <span className="truncate flex-1" style={{ color: 'var(--text-primary)' }}>{r.title}</span>
                              {r.meta && <span className="flex-none" style={{ color: 'var(--text-muted)' }}>{r.meta}</span>}
                            </div>
                          ))}
                          {e.count > e.results.length && (
                            <div className="px-3 py-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>+{e.count - e.results.length} {t('chat.more')}</div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {!streaming && (
                <div className="relative mt-4 -ml-[30px] pl-[30px] flex items-center gap-2 text-[15px]" style={{ color: 'var(--text-secondary)' }}>
                  <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 w-[24px] h-[24px] flex items-center justify-center rounded-full" style={{ background: 'var(--icon-circle-bg)' }}>
                    <CircleCheck className="w-[19px] h-[19px]" style={{ color: 'var(--text-muted)' }} strokeWidth={1.75} />
                  </span>
                  <span>{t('chat.done')}</span>
                </div>
              )}
              </div>
              </div>
              {!expanded && overflows && (
                <div aria-hidden className="trace-fade-bottom" />
              )}
            </div>
            {overflows && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="trace-show-more mt-1 ml-[30px] text-[13px] font-medium cursor-pointer transition-colors"
                style={{ color: 'var(--text-muted)' }}
              >
                {expanded ? t('chat.showLess') : t('chat.showMore')}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
