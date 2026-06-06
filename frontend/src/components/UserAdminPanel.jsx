import { useEffect, useState } from 'react';
import { X, Shield, ShieldOff, Ban, CheckCircle, Trash2, User } from 'lucide-react';

// Admin-only user management: list users, change role, enable/disable, delete.
export default function UserAdminPanel({ apiFetch, t, onClose, currentUserId }) {
  const [users, setUsers] = useState([]);
  const [busyId, setBusyId] = useState(null);

  async function load() {
    try {
      const r = await apiFetch('/admin/users');
      if (r.ok) setUsers((await r.json()).users || []);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(id, fn) {
    setBusyId(id);
    try {
      await fn();
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const toggleRole = (u) =>
    act(u.id, () =>
      apiFetch(`/admin/users/${u.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: u.role === 'admin' ? 'user' : 'admin' }),
      }),
    );

  const toggleActive = (u) =>
    act(u.id, () =>
      apiFetch(`/admin/users/${u.id}/active`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !u.isActive }),
      }),
    );

  const remove = (u) => {
    if (!window.confirm(t('users.deleteConfirm').replace('{email}', u.email))) return;
    act(u.id, () => apiFetch(`/admin/users/${u.id}`, { method: 'DELETE' }));
  };

  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

  return (
    <div className="kb-overlay" onClick={onClose}>
      <div className="kb-modal um-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kb-head">
          <div>
            <h3>{t('users.title')}</h3>
            <p className="kb-sub">{t('users.subtitle')}</p>
          </div>
          <button className="kb-x" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="um-list">
          {users.length === 0 && <div className="kb-empty">{t('users.empty')}</div>}
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            const busy = busyId === u.id;
            return (
              <div className={`um-item${u.isActive ? '' : ' um-disabled'}`} key={u.id}>
                <div className="um-avatar">
                  <User size={16} />
                </div>
                <div className="um-main">
                  <div className="um-email">
                    {u.email}
                    {isSelf && <span className="um-you">{t('users.you')}</span>}
                  </div>
                  <div className="um-meta">
                    <span className={`um-badge um-${u.role}`}>{u.role}</span>
                    {!u.isActive && <span className="um-badge um-off">{t('users.disabled')}</span>}
                    <span className="um-dim">{u.authProvider}</span>
                    <span className="um-dim">· {u.conversationCount ?? 0} chats</span>
                    <span className="um-dim">· {t('users.lastLogin')}: {fmtDate(u.lastLoginAt)}</span>
                  </div>
                </div>
                <div className="um-actions">
                  <button
                    title={u.role === 'admin' ? t('users.demote') : t('users.promote')}
                    onClick={() => toggleRole(u)}
                    disabled={busy || (isSelf && u.role === 'admin')}
                  >
                    {u.role === 'admin' ? <ShieldOff size={16} /> : <Shield size={16} />}
                  </button>
                  <button
                    title={u.isActive ? t('users.disable') : t('users.enable')}
                    onClick={() => toggleActive(u)}
                    disabled={busy || isSelf}
                  >
                    {u.isActive ? <Ban size={16} /> : <CheckCircle size={16} />}
                  </button>
                  <button
                    className="um-danger"
                    title={t('users.delete')}
                    onClick={() => remove(u)}
                    disabled={busy || isSelf}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
