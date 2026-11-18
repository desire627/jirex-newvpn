import { AlertTriangle, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';

const MAX_PAGES = 5;

// Shows a receipt inside the admin panel. PDFs are drawn page by page with pdf.js (Mozilla's
// PDF renderer), so they don't depend on the browser's own PDF viewer, which is often missing
// on phones and was blocked by the site's security policy.
export default function ReceiptViewer({ url, mime }) {
  const { t } = useI18n();
  const box = useRef(null);
  const [state, setState] = useState('loading'); // loading | ready | error
  const [pages, setPages] = useState(0);

  useEffect(() => {
    if (mime !== 'application/pdf') return;
    let cancelled = false;
    (async () => {
      try {
        // Loaded only when a PDF receipt is opened, to keep the rest of the site light.
        const [pdfjs, worker] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        // Fetched as a download: some browsers (seen with Edge on Windows) silently replace
        // inline file responses with an empty reply, which is what showed as a blank page.
        const res = await fetch(`${url}?download=1`, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(String(res.status));
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await res.arrayBuffer()) }).promise;
        if (cancelled) return;
        const count = Math.min(doc.numPages, MAX_PAGES);
        const width = box.current?.clientWidth || 600;
        box.current.replaceChildren();
        for (let n = 1; n <= count; n++) {
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const ratio = window.devicePixelRatio || 1;
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.className = 'receipt-page';
          canvas.setAttribute('aria-label', `${t('admin.receiptAlt')} ${n}`);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          if (cancelled) return;
          box.current.appendChild(canvas);
        }
        setPages(doc.numPages);
        setState('ready');
      } catch (err) {
        console.error(`PDF preview failed: ${err?.name || ''} ${err?.message || err}`);
        if (!cancelled) setState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, mime]);

  if (mime !== 'application/pdf') {
    return (
      <img
        className="receipt-viewer-img"
        src={url}
        alt={t('admin.receiptAlt')}
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
      />
    );
  }

  return (
    <div className="receipt-pdf">
      {state === 'loading' && (
        <div className="receipt-status">
          <Loader2 className="spin" /> {t('admin.receiptLoading')}
        </div>
      )}
      {state === 'error' && (
        <div className="callout">
          <AlertTriangle />
          <span>{t('admin.receiptPreviewFail')}</span>
        </div>
      )}
      <div ref={box} className="receipt-pages" />
      {state === 'ready' && pages > MAX_PAGES && (
        <p className="tiny muted center">{t('admin.receiptMorePages', { shown: MAX_PAGES, total: pages })}</p>
      )}
    </div>
  );
}
