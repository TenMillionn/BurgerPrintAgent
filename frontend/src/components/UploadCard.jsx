import { useRef, useState } from 'react';
import { Upload, ImageUp } from 'lucide-react';

/**
 * One in-chat print-file upload card with a slot per side (front / back).
 * Pick a file for each side, then a single Save uploads them all to
 * /api/uploads/design (with side, conversationId, ref). On success notifies the
 * parent with the uploaded sides so it can tell the agent and hide the card.
 */
export default function UploadCard({ apiFetch, t, sides, refId, conversationId, onDone }) {
  const list = Array.isArray(sides) && sides.length ? sides : ['front'];
  const [files, setFiles] = useState({}); // side -> File
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputs = useRef({});

  const sideLabel = (s) => (s === 'back' ? t('design.back') : t('design.front'));
  const chosenCount = list.filter((s) => files[s]).length;

  async function save() {
    setBusy(true);
    setError('');
    const uploaded = [];
    try {
      for (const s of list) {
        const file = files[s];
        if (!file) continue;
        const fd = new FormData();
        fd.append('file', file);
        fd.append('side', s);
        fd.append('conversationId', conversationId || '');
        if (refId) fd.append('ref', refId);
        const r = await apiFetch('/uploads/design', { method: 'POST', body: fd });
        if (!r.ok) throw new Error(s);
        uploaded.push(s);
      }
      if (uploaded.length === 0) {
        setError(t('design.pickFirst'));
        return;
      }
      onDone?.(uploaded);
    } catch {
      setError(t('design.error'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 max-w-sm rounded-2xl border border-[var(--border-medium)] bg-[var(--bg-composer)] p-4">
      <div className="mb-3 flex items-center gap-2">
        <ImageUp size={18} strokeWidth={1.8} className="text-[var(--accent)]" />
        <span className="font-semibold text-[var(--text-primary)]">{t('design.title')}</span>
      </div>

      <div className="space-y-2">
        {list.map((s) => (
          <div key={s}>
            <input
              ref={(el) => (inputs.current[s] = el)}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) =>
                setFiles((f) => ({ ...f, [s]: e.target.files?.[0] || null }))
              }
            />
            <button
              type="button"
              onClick={() => inputs.current[s]?.click()}
              className="flex w-full items-center gap-2 rounded-xl border border-dashed border-[var(--border-medium)] bg-[var(--bg-sidebar)] px-3 py-2.5 text-left text-sm text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
            >
              <span className="min-w-[44px] text-[12px] font-semibold uppercase text-[var(--text-muted)]">
                {sideLabel(s)}
              </span>
              <span className="truncate">{files[s] ? files[s].name : t('design.choose')}</span>
            </button>
          </div>
        ))}
      </div>

      {error && <div className="mt-2 text-[13px] text-red-500">{error}</div>}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={save}
          disabled={busy || chosenCount === 0}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          <Upload size={15} strokeWidth={2} />
          {busy ? t('design.uploading') : t('design.upload')}
        </button>
      </div>
    </div>
  );
}
