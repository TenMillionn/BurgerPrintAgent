import { useRef, useState } from 'react';
import { Upload, Check, ImageUp } from 'lucide-react';

/**
 * In-chat print-file upload card (rendered from an `upload_card` stream chunk).
 * Pick a file → upload to /api/uploads/design (with side, conversationId, ref) →
 * loading → success; then notifies the parent so it can tell the agent.
 */
export default function UploadCard({ apiFetch, t, side, refId, conversationId, onUploaded }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const title = side === 'back' ? t('design.uploadBack') : t('design.uploadFront');

  async function upload() {
    if (!file) {
      fileRef.current?.click();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('side', side);
      fd.append('conversationId', conversationId || '');
      if (refId) fd.append('ref', refId);
      const r = await apiFetch('/uploads/design', { method: 'POST', body: fd });
      if (!r.ok) throw new Error('upload failed');
      setDone(true);
      onUploaded?.(side);
    } catch {
      setError(t('design.error'));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-medium)] bg-[var(--bg-sidebar)] px-3 py-1.5 text-[13px] text-[var(--text-primary)]">
        <Check size={15} strokeWidth={2.2} className="text-green-500" />
        {t('design.uploaded')} · {side}
      </div>
    );
  }

  return (
    <div className="mt-2 max-w-sm rounded-2xl border border-[var(--border-medium)] bg-[var(--bg-composer)] p-4">
      <div className="mb-2 flex items-center gap-2">
        <ImageUp size={18} strokeWidth={1.8} className="text-[var(--accent)]" />
        <span className="font-semibold text-[var(--text-primary)]">{title}</span>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="mb-2 w-full truncate rounded-xl border border-dashed border-[var(--border-medium)] bg-[var(--bg-sidebar)] px-3 py-2.5 text-left text-sm text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
      >
        {file ? file.name : t('design.choose')}
      </button>
      {error && <div className="mb-2 text-[13px] text-red-500">{error}</div>}
      <button
        type="button"
        onClick={upload}
        disabled={busy || !file}
        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
      >
        <Upload size={15} strokeWidth={2} />
        {busy ? t('design.uploading') : t('design.upload')}
      </button>
    </div>
  );
}
