import { QRCodeSVG } from 'qrcode.react';
import { X, ExternalLink } from 'lucide-react';

const SITE_URL = 'https://burgerprint.vocatee.com/';

/**
 * Presentation-friendly QR modal: large, high-contrast QR (with the app logo in
 * the centre) pointing at the public site, plus the URL and an "Open" CTA.
 * Tailwind-first; theme via CSS vars.
 */
export default function QrModal({ t, onClose }) {
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-[var(--border-medium)] bg-[var(--bg-composer)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Accent header */}
        <div className="bg-gradient-to-br from-[var(--accent)] to-[#ff8a3d] px-6 pb-8 pt-6 text-center text-white">
          <button
            className="absolute right-3 top-3 rounded-full p-1.5 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            onClick={onClose}
            title={t('common.close')}
          >
            <X size={18} strokeWidth={2.2} />
          </button>
          <div className="mt-1 text-[19px] font-bold tracking-tight">
            {t('qr.title')}
          </div>
          <div className="mt-1 text-[13px] font-medium text-white/85">
            {t('qr.subtitle')}
          </div>
        </div>

        {/* QR card pulled up over the header */}
        <div className="px-6 pb-6">
          <div className="-mt-5 flex justify-center">
            <div className="rounded-2xl bg-white p-4 shadow-lg ring-1 ring-black/5">
              <QRCodeSVG
                value={SITE_URL}
                size={232}
                level="H"
                marginSize={0}
                fgColor="#1f2328"
                bgColor="#ffffff"
                imageSettings={{
                  src: './favicon.png',
                  height: 44,
                  width: 44,
                  excavate: true,
                }}
              />
            </div>
          </div>

          <a
            href={SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 truncate rounded-xl border border-[var(--border-medium)] bg-[var(--bg-sidebar)] px-3 py-2.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
          >
            burgerprint.vocatee.com
            <ExternalLink size={14} strokeWidth={2} />
          </a>

          <a
            href={SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block w-full rounded-full bg-[var(--accent)] px-4 py-2.5 text-center text-[14px] font-semibold text-white transition hover:brightness-110"
          >
            {t('qr.open')}
          </a>
        </div>
      </div>
    </div>
  );
}
