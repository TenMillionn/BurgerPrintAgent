import { useEffect, useState } from 'react';
import {
  X,
  Upload,
  Trash2,
  RefreshCw,
  FileText,
  Plus,
  ChevronLeft,
  Save,
  Pencil,
} from 'lucide-react';

// Admin-only knowledge base: list, view, edit, upload and delete Markdown guides.
export default function KnowledgePanel({ apiFetch, t, onClose }) {
  const [guides, setGuides] = useState([]);
  const [mode, setMode] = useState('list'); // 'list' | 'new' | 'detail'
  const [selected, setSelected] = useState(null); // full guide in detail mode
  const [busy, setBusy] = useState(false);

  // form fields (shared by 'new' and 'detail')
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [file, setFile] = useState(null);

  async function load() {
    try {
      const r = await apiFetch('/knowledge');
      if (r.ok) setGuides((await r.json()).guides || []);
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openNew() {
    setTitle('');
    setContent('');
    setFile(null);
    setMode('new');
  }

  async function openDetail(id) {
    try {
      const r = await apiFetch(`/knowledge/${id}`);
      if (!r.ok) return;
      const g = await r.json();
      setSelected(g);
      setTitle(g.title || '');
      setContent(g.content || '');
      setFile(null);
      setMode('detail');
    } catch {
      /* ignore */
    }
  }

  function backToList() {
    setSelected(null);
    setMode('list');
    load();
  }

  async function createGuide() {
    if (busy || (!file && !content.trim())) return;
    setBusy(true);
    try {
      let opts;
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        if (title.trim()) fd.append('title', title.trim());
        opts = { method: 'POST', body: fd };
      } else {
        opts = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: title.trim() || undefined, content }),
        };
      }
      const r = await apiFetch('/knowledge', opts);
      if (r.ok) backToList();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit() {
    if (busy || !selected || !content.trim()) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/knowledge/${selected.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || undefined, content }),
      });
      if (r.ok) setSelected(await r.json());
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    if (!window.confirm(t('knowledge.deleteConfirm'))) return;
    await apiFetch(`/knowledge/${id}`, { method: 'DELETE' }).catch(() => {});
    backToList();
  }

  async function reprocess(id) {
    setBusy(true);
    try {
      const r = await apiFetch(`/knowledge/${id}/reprocess`, { method: 'POST' });
      if (r.ok && mode === 'detail') setSelected(await r.json());
    } finally {
      setBusy(false);
    }
  }

  const dirty =
    mode === 'detail' &&
    selected &&
    (title.trim() !== (selected.title || '') || content !== (selected.content || ''));

  return (
    <div className="kb-overlay" onClick={onClose}>
      <div className="kb-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="kb-head">
          <div className="kb-head-left">
            {mode !== 'list' && (
              <button className="kb-back" onClick={backToList} title={t('knowledge.back')}>
                <ChevronLeft size={18} />
              </button>
            )}
            <div>
              <h3>
                {mode === 'new'
                  ? t('knowledge.add')
                  : mode === 'detail'
                    ? t('knowledge.editTitle')
                    : t('knowledge.title')}
              </h3>
              {mode === 'list' && <p className="kb-sub">{t('knowledge.subtitle')}</p>}
            </div>
          </div>
          <button className="kb-x" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* LIST */}
        {mode === 'list' && (
          <>
            <button className="kb-new" onClick={openNew}>
              <Plus size={16} /> {t('knowledge.new')}
            </button>
            <div className="kb-list">
              {guides.length === 0 && <div className="kb-empty">{t('knowledge.empty')}</div>}
              {guides.map((g) => (
                <button className="kb-item kb-item-btn" key={g.id} onClick={() => openDetail(g.id)}>
                  <div className="kb-item-main">
                    <div className="kb-item-title">{g.title}</div>
                    {g.summary && <div className="kb-item-sum">{g.summary}</div>}
                    {g.metadataStatus === 'pending' && (
                      <span className="kb-pending">{t('knowledge.pending')}</span>
                    )}
                  </div>
                  <Pencil size={15} className="kb-item-edit" />
                </button>
              ))}
            </div>
          </>
        )}

        {/* NEW or DETAIL form */}
        {(mode === 'new' || mode === 'detail') && (
          <div className="kb-form">
            <label className="kb-label">{t('knowledge.titleLabel')}</label>
            <input
              className="kb-input"
              placeholder={t('knowledge.titleLabel')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <label className="kb-label">{t('knowledge.contentLabel')}</label>
            <textarea
              className="kb-textarea"
              placeholder={t('knowledge.pastePlaceholder')}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={mode === 'detail' ? 12 : 7}
              disabled={mode === 'new' && !!file}
            />

            {mode === 'new' && (
              <div className="kb-actions">
                <label className="kb-file">
                  <FileText size={15} />
                  {file ? file.name : t('knowledge.uploadFile')}
                  <input
                    type="file"
                    accept=".md,text/markdown"
                    hidden
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
                {file && (
                  <button className="kb-clear" onClick={() => setFile(null)}>
                    <X size={14} />
                  </button>
                )}
                <button
                  className="kb-add"
                  onClick={createGuide}
                  disabled={busy || (!file && !content.trim())}
                >
                  <Upload size={15} />
                  {busy ? t('knowledge.adding') : t('knowledge.add')}
                </button>
              </div>
            )}

            {mode === 'detail' && selected && (
              <>
                {/* metadata preview */}
                <div className="kb-meta">
                  {selected.summary && <p className="kb-meta-sum">{selected.summary}</p>}
                  <Chips label={t('knowledge.intents')} items={selected.intents} />
                  <Chips label={t('knowledge.keywords')} items={selected.keywords} />
                  <Chips label={t('knowledge.questions')} items={selected.sampleQuestions} />
                  {selected.metadataStatus === 'pending' && (
                    <span className="kb-pending">{t('knowledge.pending')}</span>
                  )}
                </div>

                <div className="kb-actions">
                  <button
                    className="kb-icon-btn"
                    onClick={() => reprocess(selected.id)}
                    disabled={busy}
                    title={t('knowledge.reprocess')}
                  >
                    <RefreshCw size={15} /> {t('knowledge.reprocess')}
                  </button>
                  <button
                    className="kb-icon-btn kb-danger"
                    onClick={() => remove(selected.id)}
                    title={t('knowledge.delete')}
                  >
                    <Trash2 size={15} /> {t('knowledge.delete')}
                  </button>
                  <button
                    className="kb-add"
                    onClick={saveEdit}
                    disabled={busy || !dirty || !content.trim()}
                  >
                    <Save size={15} />
                    {busy ? t('knowledge.saving') : t('knowledge.save')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Chips({ label, items }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="kb-chips-row">
      <span className="kb-chips-label">{label}</span>
      <div className="kb-chips">
        {items.map((it, i) => (
          <span className="kb-chip" key={i}>
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}
