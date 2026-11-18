import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, UserRound, X } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { BRAND } from './brand.js';
import { useI18n } from './i18n/index.jsx';

// The JIREX "JD" shield monogram. Same artwork as web/public/logo-mark.svg.
export function LogoMark({ size = 34 }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className="logo-mark" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}f`} x1="10" y1="3" x2="40" y2="45" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5ef7c2" />
          <stop offset="0.55" stopColor="#34e3a4" />
          <stop offset="1" stopColor="#14b57c" />
        </linearGradient>
        <linearGradient id={`${id}s`} x1="24" y1="3" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M24 2.5 42 8.8v13.4c0 11.4-7.6 20.4-18 24.3C13.6 42.6 6 33.6 6 22.2V8.8L24 2.5Z" fill={`url(#${id}f)`} />
      <path d="M24 2.5 42 8.8v6.7C35.5 18 29.8 19 24 19S12.5 18 6 15.5V8.8L24 2.5Z" fill={`url(#${id}s)`} />
      <path
        d="M14.6 13.6h6.6v12.6c0 4-2.4 6.2-5.6 6.2-2.5 0-4.3-1.4-4.9-3.6"
        fill="none"
        stroke="#05170f"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M26.2 13.6v18.8h2.6c5.3 0 8.6-3.6 8.6-9.4s-3.3-9.4-8.6-9.4h-2.6Z"
        fill="none"
        stroke="#05170f"
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ to = '/' }) {
  return (
    <Link to={to} className="logo" aria-label={`${BRAND.name} home`}>
      <LogoMark />
      <span className="logo-word">{BRAND.name}</span>
    </Link>
  );
}

export function Button({ variant = 'primary', size, block, loading, icon: Icon, children, className = '', ...props }) {
  const cls = [
    'btn',
    variant !== 'primary' && `btn-${variant}`,
    size && `btn-${size}`,
    block && 'btn-block',
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button className={cls} disabled={loading || props.disabled} {...props}>
      {loading ? <Loader2 className="spin" /> : Icon && <Icon />}
      {children}
    </button>
  );
}

export function Modal({ title, description, icon, onClose, children, footer, wide, className = '' }) {
  const ref = useRef(null);
  const { t } = useI18n();
  const backdropClass = className ? `${className}-backdrop` : '';
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector('input, select, textarea, button:not(.modal-close)')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Rendered at the end of <body>: inside the top bar (which has a blur effect) a fixed
  // backdrop would be trapped in the bar's area and the dialog pushed off screen.
  return createPortal(
    <div className={`modal-backdrop ${backdropClass}`} onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          {icon}
          <div className="grow">
            <h3>{title}</h3>
            {description && <p>{description}</p>}
          </div>
          {onClose && (
            <button className="btn btn-ghost btn-icon modal-close" onClick={onClose} aria-label={t('common.close')}>
              <X />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Toasts ----------
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

const TOAST_ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((title, { type = 'success', body } = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, title, body, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3800);
  }, []);
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => {
          const Icon = TOAST_ICONS[t.type];
          return (
            <div key={t.id} className={`toast ${t.type}`}>
              <Icon />
              <div className="grow">
                <strong>{t.title}</strong>
                {t.body && <span>{t.body}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

// ---------- Confirm dialog (replaces window.confirm) ----------
const ConfirmContext = createContext(async () => false);
export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const { t } = useI18n();
  const confirm = useCallback(
    (opts) => new Promise((resolve) => setState({ ...opts, resolve })),
    [],
  );
  const close = (answer) => {
    state?.resolve(answer);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <Modal
          title={state.title}
          description={state.body}
          onClose={() => close(false)}
          icon={
            <div className={`icon-tile ${state.danger ? 'danger' : 'blue'}`}>
              {state.danger ? <AlertTriangle /> : <Info />}
            </div>
          }
          footer={
            <>
              <Button variant="secondary" onClick={() => close(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant={state.danger ? 'danger-solid' : 'primary'} onClick={() => close(true)}>
                {state.confirmLabel || t('common.confirm')}
              </Button>
            </>
          }
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return (
    <div className="form-error" role="alert">
      <AlertTriangle />
      <span>{children}</span>
    </div>
  );
}

export function Avatar({ email, first, last, large }) {
  const cls = large ? 'avatar avatar-lg' : 'avatar';
  // No name and no email (anonymous key accounts): a person icon instead of letters.
  if (!first && !last && !(email || '').includes('@')) {
    return (
      <span className={`${cls} anon`}>
        <UserRound />
      </span>
    );
  }
  const initials = first || last ? `${(first || '')[0] || ''}${(last || '')[0] || ''}` : email.slice(0, 2);
  return <span className={cls}>{initials}</span>;
}

// ---------- Pagination ----------
// Page numbers with "…" gaps: 1 … 4 5 6 … 12
function pageList(page, pages) {
  const want = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...want].sort((a, b) => a - b);
  const out = [];
  sorted.forEach((n, i) => {
    if (i && n - sorted[i - 1] > 1) out.push(`gap${n}`);
    out.push(n);
  });
  return out;
}

export function Pagination({ page, pageSize, total, onChange }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (!total || pages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pager" aria-label={t('common.pagination')}>
      <span className="muted small">{t('common.pageRange', { from, to, total })}</span>
      <div className="pager-buttons">
        <button type="button" className="btn btn-ghost btn-sm btn-icon" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('common.prevPage')} title={t('common.prevPage')}>
          <ChevronLeft />
        </button>
        {pageList(page, pages).map((n) =>
          typeof n === 'string' ? (
            <span key={n} className="pager-gap">…</span>
          ) : (
            <button
              key={n}
              type="button"
              className={`pager-num ${n === page ? 'active' : ''}`}
              aria-current={n === page ? 'page' : undefined}
              onClick={() => onChange(n)}
            >
              {n}
            </button>
          ),
        )}
        <button type="button" className="btn btn-ghost btn-sm btn-icon" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label={t('common.nextPage')} title={t('common.nextPage')}>
          <ChevronRight />
        </button>
      </div>
    </nav>
  );
}
