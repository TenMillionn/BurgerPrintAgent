import { useState } from 'react';
import { KeyRound, ExternalLink, Check } from 'lucide-react';

const GET_KEY_URL = 'https://dash.burgerprints.com';

/**
 * Inline "Set up BurgerPrints API key" affordance rendered inside an agent turn
 * (when the backend asks for a key). Collapsed = a button; expanded = a card with
 * a description, a link to get the key, an input, and Save. On save it stores the
 * key and notifies the parent so the agent can be told to continue.
 */
export default function KeyInlineCard({ apiFetch, t, onSaved }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

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
      setValue('');
      setSaved(true);
      onSaved?.(); // tell the agent the key is set up
    } catch {
      setError(t('apiKey.saveError'));
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-sidebar)] px-3 py-1.5 text-[13px] text-[var(--text-primary)]">
        <Check size={15} strokeWidth={2.2} className="text-green-500" />
        {t('apiKey.savedInline')}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110"
      >
        <KeyRound size={16} strokeWidth={2} />
        {t('apiKey.setupBtn')}
      </button>
    );
  }

  return (
    <div className="mt-2 max-w-md rounded-2xl border border-[var(--border-medium)] bg-[var(--bg-composer)] p-4">
      <div className="mb-1.5 flex items-center gap-2">
        <KeyRound size={18} strokeWidth={1.8} className="text-[var(--accent)]" />
        <span className="font-semibold text-[var(--text-primary)]">{t('apiKey.title')}</span>
      </div>
      <p className="mb-2 text-[13px] leading-[1.5] text-[var(--text-muted)]">
        {t('apiKey.desc')}
      </p>
      <a
        href={GET_KEY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-[var(--accent)] hover:underline"
      >
        {t('apiKey.getKeyLink')}
        <ExternalLink size={13} strokeWidth={2} />
      </a>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
        }}
        placeholder={t('apiKey.placeholder')}
        className="mb-2 w-full rounded-xl border border-[var(--border-medium)] bg-[var(--bg-sidebar)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      {error && <div className="mb-2 text-[13px] text-red-500">{error}</div>}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full border border-[var(--border-medium)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-sidebar-hover)]"
        >
          {t('common.close')}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || !value.trim()}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {t('apiKey.save')}
        </button>
      </div>
    </div>
  );
}
