import { ExternalLink } from 'lucide-react';

/**
 * Inline clickable buttons attached to an agent turn (rendered from a `buttons`
 * stream chunk). General-purpose UX: quick replies and links.
 * - action 'message' → clicking sends `value` back as a chat message.
 * - action 'link'    → opens `value` in a new tab.
 */
export default function ChatButtons({ buttons, onMessage }) {
  if (!Array.isArray(buttons) || buttons.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {buttons.map((b, i) =>
        b.action === 'link' ? (
          <a
            key={i}
            href={b.value}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-white transition hover:brightness-110"
          >
            {b.label}
            <ExternalLink size={14} strokeWidth={2} />
          </a>
        ) : (
          <button
            key={i}
            type="button"
            onClick={() => onMessage(b.value)}
            className="rounded-full border border-[var(--border-medium)] bg-[var(--bg-composer)] px-4 py-2 text-[13px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-sidebar-hover)] hover:border-[var(--accent)]"
          >
            {b.label}
          </button>
        ),
      )}
    </div>
  );
}
