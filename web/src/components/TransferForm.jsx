import { ArrowLeft, Copy, FileText, ImageIcon, Landmark, Send, UploadCloud, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, formatBytes, formatMoney } from '../api.js';
import { useAuth } from '../App.jsx';
import { useI18n } from '../i18n/index.jsx';
import { usePlanText } from '../plans.js';
import { Button, FormError, useToast } from '../ui.jsx';

const ACCEPT = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 4 * 1024 * 1024;
const today = () => new Date().toISOString().slice(0, 10);

function CopyValue({ label, value }) {
  const toast = useToast();
  const { t } = useI18n();
  return (
    <div className="copy-row">
      <div className="grow">
        <span className="muted tiny">{label}</span>
        <strong className="mono">{value}</strong>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => navigator.clipboard.writeText(String(value)).then(() => toast(t('common.copied')))}
      >
        <Copy /> {t('common.copy')}
      </button>
    </div>
  );
}

function ReceiptPicker({ file, onChange, onError }) {
  const { t } = useI18n();
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function pick(f) {
    if (!f) return;
    if (!ACCEPT.includes(f.type)) return onError(t('transfer.errFileType'));
    if (f.size > MAX_BYTES) return onError(t('transfer.errFileSize'));
    onError('');
    onChange(f);
  }

  if (file) {
    return (
      <div className="receipt-chosen">
        {preview ? (
          <img src={preview} alt="" />
        ) : (
          <span className="icon-tile blue">
            <FileText />
          </span>
        )}
        <div className="grow" style={{ minWidth: 0 }}>
          <strong className="truncate" style={{ display: 'block' }}>
            {file.name}
          </strong>
          <span className="muted small">
            {file.type === 'application/pdf' ? t('transfer.pdf') : t('transfer.image')} · {formatBytes(file.size)}
          </span>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => onChange(null)}
          aria-label={t('transfer.removeFile')}
        >
          <X />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={`dropzone ${drag ? 'drag' : ''}`}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        pick(e.dataTransfer.files?.[0]);
      }}
    >
      <span className="icon-tile">
        <UploadCloud />
      </span>
      <strong>{t('transfer.attach')}</strong>
      <span className="muted small">
        <ImageIcon size={13} style={{ display: 'inline', verticalAlign: -2 }} /> {t('transfer.attachHint')}
      </span>
      <input
        ref={input}
        type="file"
        accept={ACCEPT.join(',')}
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </button>
  );
}

// Paying by bank transfer: show where to send the money, then collect the receipt.
export default function TransferForm({ plan, currency, onBack, onDone }) {
  const { user } = useAuth();
  const { t, tr } = useI18n();
  const toast = useToast();
  const [details, setDetails] = useState(null);
  const [payerName, setPayerName] = useState(`${user.firstName || ''} ${user.lastName || ''}`.trim());
  const [paidOn, setPaidOn] = useState(today());
  const [note, setNote] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const planName = usePlanText().name(plan);
  const amount = formatMoney(plan.price, currency);

  useEffect(() => {
    api('/billing/transfer')
      .then(setDetails)
      .catch((e) => setError(e.message));
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!file) return setError(t('transfer.errNoFile'));
    if (!payerName.trim()) return setError(t('transfer.errPayer'));
    const body = new FormData();
    body.append('plan', plan.id);
    body.append('payerName', payerName.trim());
    body.append('paidOn', paidOn);
    body.append('note', note.trim());
    body.append('receipt', file);
    setBusy(true);
    try {
      await api('/billing/transfer', { method: 'POST', body });
      toast(t('transfer.sentTitle'), { body: t('transfer.sentBody') });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form className="stack gap-20" onSubmit={submit}>
      <div className="transfer-box">
        <div className="row gap-12">
          <span className="icon-tile">
            <Landmark />
          </span>
          <div className="grow">
            <strong>{t('transfer.step1')}</strong>
            <div className="muted small">{t('transfer.step1Sub')}</div>
          </div>
        </div>
        {details ? (
          <>
            <pre className="bank-details">{details.instructions}</pre>
            <div className="copy-grid">
              <CopyValue label={t('transfer.amount')} value={amount} />
              <CopyValue label={t('transfer.reference')} value={details.reference} />
            </div>
            <p className="tiny muted">{tr('transfer.refHint', { ref: details.reference })}</p>
          </>
        ) : (
          <div className="skeleton" style={{ height: 110 }} />
        )}
      </div>

      <div className="stack gap-16">
        <div className="row gap-12">
          <span className="icon-tile">
            <Send />
          </span>
          <div className="grow">
            <strong>{t('transfer.step2')}</strong>
            <div className="muted small">{t('transfer.planLine', { plan: planName, amount })}</div>
          </div>
        </div>
        <div className="name-row">
          <label className="field">
            <span>{t('transfer.paidFrom')}</span>
            <input
              className="input"
              value={payerName}
              maxLength={100}
              onChange={(e) => setPayerName(e.target.value)}
              placeholder={t('transfer.paidFromPh')}
            />
          </label>
          <label className="field">
            <span>{t('transfer.datePaid')}</span>
            <input className="input" type="date" max={today()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </label>
        </div>
        <div className="field">
          <span>{t('transfer.receipt')}</span>
          <ReceiptPicker file={file} onChange={setFile} onError={setError} />
        </div>
        <label className="field">
          <span>
            {t('transfer.note')} <span className="hint">· {t('transfer.optional')}</span>
          </span>
          <input
            className="input"
            value={note}
            maxLength={500}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('transfer.notePh')}
          />
        </label>
      </div>

      <FormError>{error}</FormError>

      <div className="row between wrap gap-8">
        <Button type="button" variant="ghost" icon={ArrowLeft} onClick={onBack}>
          {t('common.back')}
        </Button>
        <Button type="submit" size="lg" loading={busy} icon={Send}>
          {t('transfer.submit')}
        </Button>
      </div>
    </form>
  );
}
