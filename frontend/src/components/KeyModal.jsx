import { useEffect, useState } from 'react';
import { X, KeyRound } from 'lucide-react';

/**
 * Settings modal for the seller's own BurgerPrints API key.
 * Shows configured status + last4 only; the full key is never returned by the API.
 * Tailwind-first, theme via CSS vars.
 */
export default function KeyModal({ apiFetch, t, onClose }) {
  const [status, setStatus] = useState(null); // { configured, last4 }
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadStatus() {
    try {
      const r = await apiFetch('/me/burgerprints-key');
      if (r.ok) setStatus(await r.json());
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save() {
    const apiKey = value.trim();
    if (apiKey.length < 8) {
      setError(t('apiKey.invalid'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await apiFetch('/me/burgerprints-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey }),
      });
      if (!r.ok) throw new Error('save failed');
      setStatus(await r.json());
      setValue('');
    } catch {
      setError(t('apiKey.saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    setError('');
    try {
      const r = await apiFetch('/me/burgerprints-key', { method: 'DELETE' });
      if (r.ok) setStatus(await r.json());
    } catch {
      setError(t('apiKey.saveError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[var(--border-medium)] bg-[var(--bg-composer)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <KeyRound size={20} strokeWidth={1.8} className="text-[var(--accent)]" />
          <h2 className="flex-1 text-lg font-semibold text-[var(--text-primary)]">
            {t('apiKey.title')}
          </h2>
          <button
            className="rounded-lg p-1 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-sidebar-hover)]"
            onClick={onClose}
            title={t('common.close')}
          >
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <p className="mb-4 text-[13px] leading-[1.5] text-[var(--text-muted)]">
          {t('apiKey.desc')}
        </p>

        <div className="mb-3 text-[13px] text-[var(--text-primary)]">
          {status?.configured ? (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              {t('apiKey.configured')} ····{status.last4}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[var(--text-muted)]" />
              {t('apiKey.notConfigured')}
            </span>
          )}
        </div>

        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t('apiKey.placeholder')}
          className="mb-2 w-full rounded-xl border border-[var(--border-medium)] bg-[var(--bg-sidebar)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        />
        {error && <div className="mb-2 text-[13px] text-red-500">{error}</div>}

        <div className="mt-2 flex items-center justify-end gap-2">
          {status?.configured && (
            <button
              className="rounded-full border border-[var(--border-medium)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-sidebar-hover)] disabled:opacity-50"
              onClick={clear}
              disabled={busy}
            >
              {t('apiKey.clear')}
            </button>
          )}
          <button
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
            onClick={save}
            disabled={busy || !value.trim()}
          >
            {t('apiKey.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
