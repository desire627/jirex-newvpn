import {
  Activity,
  AlertTriangle,
  Ban,
  CalendarClock,
  Check,
  Clock,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileText,
  Hourglass,
  Inbox,
  KeyRound,
  Landmark,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Save,
  Search,
  Server,
  ServerCrash,
  Settings,
  ShieldCheck,
  Smartphone,
  Star,
  Tag,
  Trash2,
  TrendingUp,
  UserCog,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminProfile } from './Account.jsx';
import { reloadPlans, usePlanText } from '../plans.js';
import ReceiptViewer from '../components/ReceiptViewer.jsx';
import { api, daysUntil, formatBytes, formatDate, formatDateTime, formatMoney, fullName } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { Avatar, Button, FormError, Modal, Pagination, useConfirm, useToast } from '../ui.jsx';

const isActive = (u) => u.access_until && new Date(u.access_until) > new Date();

function usePaymentText() {
  const { t } = useI18n();
  const plans = usePlanText();
  return {
    planName: (plan) => plans.name(plan || ''),
    amount: (p) =>
      p.currency === 'N/A'
        ? t('admin.manualDays', { count: parseInt(p.plan, 10) || 0 })
        : formatMoney(Number(p.amount), p.currency),
    who: (p) => fullName(p) || p.email || (p.customer_id ? t('admin.customerId', { code: p.customer_code || '' }) : t('admin.deletedUser')),
  };
}

function Person({ p, sub }) {
  const { t } = useI18n();
  const name = fullName(p);
  const customerId = p.customer_id || p.id;
  const label = name || p.email || (customerId ? t('admin.customerId', { code: p.customer_code || '' }) : t('admin.deletedUser'));
  return (
    <div className="person">
      <Avatar email={p.email || String(customerId || '')} first={p.first_name} last={p.last_name} />
      <div style={{ minWidth: 0 }}>
        <div className="truncate" style={{ maxWidth: 260, fontWeight: name ? 600 : 400 }}>
          {label}
        </div>
        <div className="tiny muted truncate" style={{ maxWidth: 260 }}>
          {sub ?? (name ? p.email || p.customer_code : '')}
        </div>
      </div>
    </div>
  );
}

function PaymentStatus({ status }) {
  const { t } = useI18n();
  const tone = { successful: 'ok', rejected: 'bad', failed: 'bad', pending: 'warn' }[status] || '';
  return <span className={`badge ${tone}`}>{t(`admin.statuses.${status}`)}</span>;
}

// ---------------------------------------------------------------- Overview
function Overview({ goTo, pendingCount }) {
  const { t } = useI18n();
  const pt = usePaymentText();
  const [stats, setStats] = useState(null);
  const [payments, setPayments] = useState([]);
  const [servers, setServers] = useState([]);

  useEffect(() => {
    api('/admin/stats').then(setStats);
    api('/admin/payments?pageSize=6').then((d) => setPayments(d.payments));
    api('/admin/servers').then((d) => setServers(d.servers));
  }, []);

  const revenue = stats?.revenue30d.filter((r) => r.currency !== 'N/A') || [];
  const pct = stats && stats.users.total ? Math.round((stats.users.active / stats.users.total) * 100) : 0;
  const paymentsCount = revenue.reduce((n, r) => n + r.payments, 0);

  const kpis = [
    { tone: 'green', label: t('admin.kpi.paying'), icon: Users, value: stats?.users.active, sub: t('admin.kpi.payingSub', { pct }), meter: pct },
    { tone: 'blue', label: t('admin.kpi.signups'), icon: TrendingUp, value: stats?.users.total, sub: t('admin.kpi.signupsSub') },
    { tone: 'violet', label: t('admin.kpi.devices'), icon: Smartphone, value: stats?.devices, sub: t('admin.kpi.devicesSub') },
    {
      tone: 'amber',
      label: t('admin.kpi.revenue'),
      icon: Wallet,
      value: stats ? (revenue.length ? revenue.map((r) => formatMoney(r.total, r.currency)).join(' + ') : '0') : undefined,
      sub: t('admin.kpi.revenueSub', { count: paymentsCount }),
    },
  ];

  return (
    <>
      {pendingCount > 0 && (
        <div className="pay-banner pending" style={{ alignItems: 'center' }}>
          <span className="icon-tile warn">
            <Hourglass />
          </span>
          <div className="grow">
            <strong>{t('admin.pendingBanner', { count: pendingCount })}</strong>
            <p>{t('admin.pendingBannerText')}</p>
          </div>
          <Button onClick={() => goTo('payments')}>{t('admin.reviewNow')}</Button>
        </div>
      )}

      <div className="kpis">
        {kpis.map(({ tone, label, icon: Icon, value, sub, meter }) => (
          <div key={label} className={`card kpi kpi-${tone}`}>
            <div className="kpi-head">
              <span className="kpi-icon">
                <Icon />
              </span>
              <span className="kpi-label">{label}</span>
            </div>
            {value === undefined ? (
              <div className="skeleton" style={{ height: 34, width: '55%' }} />
            ) : (
              <strong className="kpi-value truncate" title={String(value)}>
                {value}
              </strong>
            )}
            {meter !== undefined && (
              <div className="kpi-meter" aria-hidden="true">
                <span style={{ width: `${Math.min(100, meter)}%` }} />
              </div>
            )}
            <span className="kpi-sub">{sub}</span>
          </div>
        ))}
      </div>

      <div className="dash-grid" style={{ marginBottom: 0 }}>
        <div className="card">
          <div className="card-header">
            <h3>{t('admin.recentPayments')}</h3>
            <Button variant="ghost" size="sm" onClick={() => goTo('payments')}>
              {t('admin.viewAll')}
            </Button>
          </div>
          {payments.length === 0 ? (
            <div className="card-body muted">{t('admin.noPaymentsYet')}</div>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Person p={p} sub={`${formatDate(p.created_at)} · ${t(`admin.methods.${p.provider}`)}`} />
                      </td>
                      <td className="actions">
                        <div className="stack gap-4" style={{ alignItems: 'flex-end' }}>
                          <strong>{pt.amount(p)}</strong>
                          {p.status !== 'successful' && <PaymentStatus status={p.status} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <h3>{t('admin.serversCard')}</h3>
            <Button variant="ghost" size="sm" onClick={() => goTo('servers')}>
              {t('admin.manage')}
            </Button>
          </div>
          <div className="card-body stack gap-12">
            {servers.length === 0 && <p className="muted">{t('admin.noServersYet')}</p>}
            {servers.map((s) => (
              <ServerHealthRow key={s.id} server={s} />
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function useServerStatus(id) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    api(`/admin/servers/${id}/status`)
      .then(setStatus)
      .catch(() => setStatus({ online: false }));
  }, [id]);
  return status;
}

function ServerHealthRow({ server }) {
  const { t } = useI18n();
  const status = useServerStatus(server.id);
  return (
    <div className="row gap-12">
      <span className={`dot ${!status ? '' : status.online ? 'ok' : 'bad'}`} />
      <div className="grow">
        <div className="truncate" style={{ fontWeight: 600 }}>
          {server.name}
        </div>
        <div className="tiny muted">
          {server.country || t('admin.noCountry')} · {t('admin.serverDevices', { count: server.devices })}
        </div>
      </div>
      <span className="small muted">
        {!status ? '…' : status.online ? t('admin.onlineCount', { n: status.connectedNow }) : t('admin.offline')}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- Payments (review queue)
function ReceiptThumb({ payment, onOpen }) {
  const { t } = useI18n();
  const isPdf = payment.receipt_mime === 'application/pdf';
  return (
    <button type="button" className="receipt-thumb" onClick={onOpen} aria-label={t('admin.viewReceipt')}>
      {isPdf ? (
        <span className="pdf">
          <FileText />
          {t('admin.pdfReceipt')}
        </span>
      ) : (
        <img src={`/api/billing/receipts/${payment.id}`} alt={t('admin.receiptAlt')} loading="lazy" />
      )}
    </button>
  );
}

function ReceiptModal({ payment, onClose }) {
  const { t } = useI18n();
  const pt = usePaymentText();
  const url = `/api/billing/receipts/${payment.id}`;
  return (
    <Modal
      wide
      title={t('admin.receiptFrom', { name: pt.who(payment) })}
      description={t('admin.receiptDesc', {
        plan: pt.planName(payment.plan),
        amount: pt.amount(payment),
        date: payment.paid_on ? formatDate(payment.paid_on) : '—',
      })}
      icon={
        <span className="icon-tile blue">
          <Receipt />
        </span>
      }
      onClose={onClose}
      footer={
        // Receipts are shown right here; "open in new tab" was dropped because some
        // browsers show inline files as a blank page.
        <a className="btn btn-secondary" href={`${url}?download=1`}>
          <Download /> {t('admin.downloadReceipt')}
        </a>
      }
    >
      <ReceiptViewer url={url} mime={payment.receipt_mime} />
    </Modal>
  );
}

function RejectModal({ payment, onClose, onDone }) {
  const { t } = useI18n();
  const pt = usePaymentText();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/payments/${payment.id}/reject`, { method: 'POST', body: { reason } });
      toast(t('admin.rejected'), { body: t('admin.rejectedBody') });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t('admin.rejectTitle')}
      description={t('admin.rejectDesc', { name: pt.who(payment) })}
      icon={
        <span className="icon-tile danger">
          <X />
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger-solid" onClick={submit} loading={busy} disabled={!reason.trim()}>
            {t('admin.rejectConfirm')}
          </Button>
        </>
      }
    >
      <div className="stack gap-12">
        <div className="reason-chips">
          {t('admin.rejectReasons').map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)}>
              {r.split('.')[0]}
            </button>
          ))}
        </div>
        <label className="field">
          <span>{t('admin.rejectMessage')}</span>
          <textarea
            className="textarea"
            style={{ fontFamily: 'var(--font)', fontSize: 14.5 }}
            rows={3}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('admin.rejectPh')}
          />
        </label>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}

function ReviewCard({ payment, onChanged }) {
  const { t } = useI18n();
  const pt = usePaymentText();
  const [viewing, setViewing] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  async function approve() {
    const ok = await confirm({
      title: t('admin.approveTitle'),
      body: t('admin.approveBody', { amount: pt.amount(payment), name: pt.who(payment), plan: pt.planName(payment.plan) }),
      confirmLabel: t('admin.approveConfirm'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(`/admin/payments/${payment.id}/approve`, { method: 'POST', body: {} });
      toast(t('admin.approved'), { body: t('admin.approvedBody', { name: pt.who(payment) }) });
      onChanged();
    } catch (err) {
      toast(t('admin.approveFail'), { type: 'error', body: err.message });
      setBusy(false);
    }
  }

  return (
    <div className="card review-card">
      <ReceiptThumb payment={payment} onOpen={() => setViewing(true)} />
      <div style={{ minWidth: 0 }}>
        <div className="row between wrap gap-8">
          <Person p={payment} />
          <span className="tiny muted">{t('admin.sent', { date: formatDateTime(payment.created_at) })}</span>
        </div>
        <div className="review-facts">
          <div>
            <span>{t('admin.plan')}</span>
            <strong>{pt.planName(payment.plan)}</strong>
          </div>
          <div>
            <span>{t('admin.amountDue')}</span>
            <strong>{pt.amount(payment)}</strong>
          </div>
          <div>
            <span>{t('admin.paidFrom')}</span>
            <strong>{payment.payer_name || '—'}</strong>
          </div>
          <div>
            <span>{t('admin.datePaid')}</span>
            <strong>{payment.paid_on ? formatDate(payment.paid_on) : '—'}</strong>
          </div>
          <div>
            <span>{t('admin.reference')}</span>
            <strong className="mono">{payment.customer_code || '—'}</strong>
          </div>
        </div>
        {payment.note && (
          <div className="callout info" style={{ marginBottom: 14 }}>
            <Inbox />
            <span>“{payment.note}”</span>
          </div>
        )}
        <div className="row wrap gap-8">
          <Button icon={Check} onClick={approve} loading={busy}>
            {t('admin.approve')}
          </Button>
          <Button variant="danger" icon={X} onClick={() => setRejecting(true)} disabled={busy}>
            {t('admin.reject')}
          </Button>
          <Button variant="ghost" icon={FileText} onClick={() => setViewing(true)}>
            {t('admin.viewReceipt')}
          </Button>
        </div>
      </div>
      {viewing && <ReceiptModal payment={payment} onClose={() => setViewing(false)} />}
      {rejecting && (
        <RejectModal
          payment={payment}
          onClose={() => setRejecting(false)}
          onDone={() => {
            setRejecting(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function Payments({ onCountChange }) {
  const { t } = useI18n();
  const pt = usePaymentText();
  const [view, setView] = useState('pending');
  const [pending, setPending] = useState(null);
  const [all, setAll] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    const [p, a] = await Promise.all([
      api('/admin/payments?status=pending'),
      api(`/admin/payments?page=${page}&pageSize=10`),
    ]);
    setPending(p.payments);
    setAll(a.payments);
    setTotal(a.total);
    onCountChange(p.payments.length);
  }, [onCountChange, page]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="section-title">
        <div className="segmented">
          <button className={view === 'pending' ? 'active' : ''} onClick={() => setView('pending')}>
            <Hourglass /> {t('admin.needsReview')} {pending?.length ? `(${pending.length})` : ''}
          </button>
          <button className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
            <Receipt /> {t('admin.allPayments')}
          </button>
        </div>
      </div>

      {view === 'pending' &&
        (pending === null ? (
          <div className="skeleton" style={{ height: 200 }} />
        ) : pending.length === 0 ? (
          <div className="empty">
            <div className="empty-art">
              <span className="icon-tile lg">
                <Check />
              </span>
            </div>
            <h3>{t('admin.caughtUp')}</h3>
            <p>{t('admin.caughtUpText')}</p>
          </div>
        ) : (
          <div className="review-list">
            {pending.map((p) => (
              <ReviewCard key={p.id} payment={p} onChanged={load} />
            ))}
          </div>
        ))}

      {view === 'all' && (
        <div className="card">
          <div className="table-wrap">
            <table className="table stackable">
              <thead>
                <tr>
                  <th>{t('admin.col.customer')}</th>
                  <th>{t('admin.col.method')}</th>
                  <th>{t('admin.col.amount')}</th>
                  <th>{t('admin.col.status')}</th>
                  <th>{t('admin.col.date')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {all?.length === 0 && (
                  <tr>
                    <td colSpan={6} className="center muted" style={{ padding: 48 }}>
                      {t('admin.noPaymentsTable')}
                    </td>
                  </tr>
                )}
                {(all || []).map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Person p={p} />
                    </td>
                    <td className="nowrap" data-label={t('admin.col.method')}>
                      {t(`admin.methods.${p.provider}`)}
                    </td>
                    <td className="nowrap" data-label={t('admin.col.amount')}>
                      <strong>{pt.amount(p)}</strong>
                    </td>
                    <td data-label={t('admin.col.status')}>
                      <span title={p.review_note || ''}>
                        <PaymentStatus status={p.status} />
                      </span>
                    </td>
                    <td className="nowrap muted" data-label={t('admin.col.date')}>
                      {formatDateTime(p.created_at)}
                    </td>
                    <td className="actions">
                      {p.has_receipt ? (
                        <Button size="sm" variant="ghost" icon={FileText} onClick={() => setViewing(p)}>
                          {t('admin.receiptButton')}
                        </Button>
                      ) : p.receipt_deleted_at ? (
                        <span className="tiny muted" title={formatDate(p.receipt_deleted_at)}>
                          {t('admin.receiptRemoved')}
                        </span>
                      ) : (
                        <span className="btn btn-sm" style={{ visibility: 'hidden' }} aria-hidden="true" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={10} total={total} onChange={setPage} />
        </div>
      )}
      {viewing && <ReceiptModal payment={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

// ---------------------------------------------------------------- Customers
function KeyResetModal({ reset, onClose }) {
  const { t } = useI18n();
  const [error, setError] = useState('');
  const toast = useToast();

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(reset.accessKey);
      toast(t('auth.keyCopied'));
    } catch {
      setError(t('auth.copyFailed'));
    }
  }

  return (
    <Modal
      title={t('admin.keyResetTitle')}
      description={t('admin.keyResetDesc', { code: reset.customerCode || '' })}
      icon={
        <span className="icon-tile">
          <KeyRound />
        </span>
      }
      onClose={onClose}
    >
      <div className="stack gap-16">
        <p className="muted">{t('admin.keyResetOneTime')}</p>
        <div className="field">
          <span>{t('auth.accessKey')}</span>
          <div className="key-view">
            <input className="mono" value={reset.accessKey} readOnly onFocus={(e) => e.target.select()} aria-label={t('auth.accessKey')} />
            <button type="button" className="btn btn-ghost btn-icon" onClick={copyKey} title={t('auth.copyKey')} aria-label={t('auth.copyKey')}>
              <Copy />
            </button>
          </div>
        </div>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}

function GrantModal({ customer, onClose, onDone }) {
  const { t, tr } = useI18n();
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();
  const name = fullName(customer) || customer.email || t('admin.customerId', { code: customer.customer_code || '' });

  const base = isActive(customer) ? new Date(customer.access_until) : new Date();
  const newEnd = new Date(base.getTime() + (Number(days) || 0) * 86_400_000);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api(`/admin/users/${customer.id}/grant`, { method: 'POST', body: { days: Number(days) } });
      toast(t('admin.grantDone'), { body: t('admin.grantDoneBody', { name, date: formatDate(newEnd) }) });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t('admin.addTime')}
      description={t('admin.grantDesc', { name })}
      icon={
        <span className="icon-tile">
          <CalendarClock />
        </span>
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={submit} loading={busy} disabled={!(Number(days) >= 1)}>
            {t('admin.grantSubmit', { count: Number(days) || 0 })}
          </Button>
        </>
      }
    >
      <div className="stack gap-16">
        <div className="quick-chips">
          {[7, 30, 90, 365].map((d) => (
            <button key={d} type="button" className={Number(days) === d ? 'active' : ''} onClick={() => setDays(d)}>
              {t(`admin.grantQuick.${d}`)}
            </button>
          ))}
        </div>
        <label className="field">
          <span>{t('admin.grantOr')}</span>
          <input
            className="input"
            type="number"
            min="1"
            max="3650"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </label>
        <div className="callout info">
          <Clock />
          <span>{tr('admin.grantNewEnd', { date: formatDate(newEnd) })}</span>
        </div>
        <FormError>{error}</FormError>
      </div>
    </Modal>
  );
}

function Customers() {
  const { t } = useI18n();
  const [users, setUsers] = useState(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [granting, setGranting] = useState(null);
  const [issuedKey, setIssuedKey] = useState(null);
  const confirm = useConfirm();
  const toast = useToast();

  const load = useCallback(
    () =>
      api(`/admin/users?q=${encodeURIComponent(q)}&status=${filter}&page=${page}&pageSize=10`).then((d) => {
        setUsers(d.users);
        setTotal(d.total);
      }),
    [q, filter, page],
  );
  // A new search or filter starts again from page 1.
  useEffect(() => setPage(1), [q, filter]);
  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  async function revoke(u) {
    const name = fullName(u) || u.email || t('admin.customerId', { code: u.customer_code || '' });
    const ok = await confirm({
      title: t('admin.revokeTitle'),
      body: t('admin.revokeBody', { name }),
      confirmLabel: t('admin.revokeConfirm'),
      danger: true,
    });
    if (!ok) return;
    await api(`/admin/users/${u.id}/revoke`, { method: 'POST', body: {} });
    toast(t('admin.revoked'), { body: name });
    load();
  }

  async function restore(u) {
    try {
      await api(`/admin/users/${u.id}/restore`, { method: 'POST', body: {} });
      toast(t('admin.restored'), { body: t('admin.restoredBody') });
      load();
    } catch (err) {
      toast(t('admin.restored'), { type: 'error', body: err.message });
    }
  }

  async function resetKey(u) {
    const name = fullName(u) || u.email || t('admin.customerId', { code: u.customer_code || '' });
    const ok = await confirm({
      title: t('admin.keyResetConfirmTitle'),
      body: t('admin.keyResetConfirmBody', { name }),
      confirmLabel: t('admin.keyResetConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      const result = await api(`/admin/users/${u.id}/reset-key`, { method: 'POST', body: {} });
      setIssuedKey(result);
      load();
    } catch (err) {
      toast(t('admin.keyResetFail'), { type: 'error', body: err.message });
    }
  }

  const shown = users || [];

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap' }}>
        <div className="input-wrap" style={{ flex: '1 1 240px', maxWidth: 360 }}>
          <Search />
          <input
            className="input"
            placeholder={t('admin.searchPh')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ height: 40 }}
          />
        </div>
        <div className="segmented">
          {['all', 'active', 'inactive'].map((f) => (
            <button key={f} className={filter === f ? 'active' : ''} onClick={() => setFilter(f)}>
              {t(`admin.filters.${f}`)}
            </button>
          ))}
        </div>
      </div>
      <div className="table-wrap">
        <table className="table stackable">
          <thead>
            <tr>
              <th>{t('admin.col.customer')}</th>
              <th>{t('admin.col.plan')}</th>
              <th>{t('admin.col.devices')}</th>
              <th>{t('admin.col.joined')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users === null &&
              [0, 1, 2].map((i) => (
                <tr key={i}>
                  <td colSpan={5}>
                    <div className="skeleton" style={{ height: 32 }} />
                  </td>
                </tr>
              ))}
            {users && shown.length === 0 && (
              <tr>
                <td colSpan={5} className="center muted" style={{ padding: 40 }}>
                  {t('admin.noMatch')}
                </td>
              </tr>
            )}
            {shown.map((u) => {
              const active = isActive(u);
              return (
                <tr key={u.id}>
                  <td>
                    <div className="row gap-8">
                      <Person p={u} />
                      {u.is_admin && <span className="badge blue">{t('admin.adminBadge')}</span>}
                      {u.deleted_at && (
                        <span className="badge bad" title={t('admin.deletedOn', { date: formatDate(u.deleted_at) })}>
                          {t('admin.deletedBadge')}
                        </span>
                      )}
                      {u.auth_type === 'email' && !u.email_verified && (
                        <span className="badge warn">{t('admin.unverified')}</span>
                      )}
                    </div>
                  </td>
                  <td className="nowrap" data-label={t('admin.col.plan')}>
                    {active ? (
                      <span className="badge ok">{t('admin.daysLeft', { count: daysUntil(u.access_until) })}</span>
                    ) : (
                      <span className={`badge ${u.access_until ? 'bad' : ''}`}>
                        {u.access_until ? t('admin.expired', { date: formatDate(u.access_until) }) : t('admin.neverPaid')}
                      </span>
                    )}
                  </td>
                  <td data-label={t('admin.col.devices')}>{u.devices}</td>
                  <td className="nowrap muted" data-label={t('admin.col.joined')}>
                    {formatDate(u.created_at)}
                  </td>
                  <td className="actions">
                    {u.deleted_at ? (
                      <Button size="sm" variant="secondary" icon={RotateCcw} onClick={() => restore(u)}>
                        {t('admin.restore')}
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" icon={Plus} onClick={() => setGranting(u)}>
                        {t('admin.addTime')}
                      </Button>
                    )}
                    {u.auth_type === 'key' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="btn-icon"
                        onClick={() => resetKey(u)}
                        aria-label={t('admin.keyResetConfirm')}
                        title={t('admin.keyResetConfirm')}
                      >
                        <KeyRound />
                      </Button>
                    )}
                    {active ? (
                      <Button
                        size="sm"
                        variant="danger"
                        className="btn-icon"
                        onClick={() => revoke(u)}
                        aria-label={t('admin.endAccess')}
                        title={t('admin.endAccess')}
                      >
                        <Ban />
                      </Button>
                    ) : (
                      <span className="btn btn-sm btn-icon" style={{ visibility: 'hidden' }} aria-hidden="true" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={10} total={total} onChange={setPage} />
      {granting && (
        <GrantModal
          customer={granting}
          onClose={() => setGranting(null)}
          onDone={() => {
            setGranting(null);
            load();
          }}
        />
      )}
      {issuedKey && <KeyResetModal reset={issuedKey} onClose={() => setIssuedKey(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------- Servers
function AddServerModal({ onClose, onDone }) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  async function submit(e) {
    e.preventDefault();
    setError('');
    let details;
    try {
      details = JSON.parse(json);
    } catch {
      return setError(t('admin.invalidJson'));
    }
    setBusy(true);
    try {
      await api('/admin/servers', { method: 'POST', body: { ...details, name, country } });
      toast(t('admin.serverAdded'), { body: t('admin.serverAddedBody', { name }) });
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      wide
      title={t('admin.addServerTitle')}
      description={t('admin.addServerDesc')}
      icon={
        <span className="icon-tile">
          <Server />
        </span>
      }
      onClose={onClose}
    >
      <form className="stack gap-16" onSubmit={submit}>
        <div className="row gap-12 wrap">
          <label className="field grow" style={{ minWidth: 200 }}>
            <span>{t('admin.serverName')}</span>
            <input
              className="input"
              required
              placeholder={t('admin.serverNamePh')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="field grow" style={{ minWidth: 200 }}>
            <span>{t('admin.serverCountry')}</span>
            <input
              className="input"
              placeholder={t('admin.serverCountryPh')}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span>
            {t('admin.serverDetails')} <span className="hint">· {t('admin.serverDetailsHint')}</span>
          </span>
          <textarea
            className="textarea"
            rows={9}
            required
            spellCheck={false}
            placeholder={'{\n  "endpoint": "203.0.113.10:51820",\n  "publicKey": "…",\n  "obfuscation": { … },\n  …\n}'}
            value={json}
            onChange={(e) => setJson(e.target.value)}
          />
        </label>
        <FormError>{error}</FormError>
        <div className="row gap-8 wrap" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {busy ? t('admin.testing') : t('admin.testAndAdd')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ServerCard({ server, onChange }) {
  const { t } = useI18n();
  const status = useServerStatus(server.id);
  const confirm = useConfirm();
  const toast = useToast();

  async function toggle() {
    if (server.enabled) {
      const ok = await confirm({
        title: t('admin.disableTitle', { name: server.name }),
        body: t('admin.disableBody'),
        confirmLabel: t('admin.disable'),
        danger: true,
      });
      if (!ok) return;
    }
    await api(`/admin/servers/${server.id}`, { method: 'PATCH', body: { enabled: !server.enabled } });
    toast(server.enabled ? t('admin.serverDisabled') : t('admin.serverEnabled'));
    onChange();
  }

  const online = status?.online;
  return (
    <div className={`card server-card ${server.enabled ? '' : 'disabled'}`}>
      <div className="row gap-12">
        <span className={`icon-tile ${!status ? 'neutral' : online ? '' : 'danger'}`}>
          {status && !online ? <ServerCrash /> : <Server />}
        </span>
        <div className="grow">
          <h4 className="truncate" style={{ fontSize: 16 }}>
            {server.name}
          </h4>
          <div className="tiny muted mono truncate">{server.endpoint}</div>
        </div>
        {!server.enabled ? (
          <span className="badge">{t('admin.badgeDisabled')}</span>
        ) : !status ? (
          <span className="badge">{t('admin.badgeChecking')}</span>
        ) : online ? (
          <span className="badge ok">
            <span className="dot ok" /> {t('admin.badgeOnline')}
          </span>
        ) : (
          <span className="badge bad" title={status.error}>
            {t('admin.badgeOffline')}
          </span>
        )}
      </div>
      <div className="server-stats">
        <div className="mini-stat">
          <span>{t('admin.statDevices')}</span>
          <strong>{server.devices}</strong>
        </div>
        <div className="mini-stat">
          <span>{t('admin.statOnline')}</span>
          <strong>{online ? status.connectedNow : '–'}</strong>
        </div>
        <div className="mini-stat">
          <span>{t('admin.statTraffic')}</span>
          <strong>{online ? formatBytes(status.rxBytes + status.txBytes) : '–'}</strong>
        </div>
      </div>
      {status && !online && server.enabled && (
        <div className="callout">
          <ServerCrash />
          <span>{t('admin.unreachable')}</span>
        </div>
      )}
      <div className="row between">
        <span className="small muted">{server.country || t('admin.noCountry')}</span>
        <Button size="sm" variant={server.enabled ? 'ghost' : 'secondary'} onClick={toggle}>
          {server.enabled ? t('admin.disable') : t('admin.enable')}
        </Button>
      </div>
    </div>
  );
}

function Servers() {
  const { t } = useI18n();
  const [servers, setServers] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = () => api('/admin/servers').then((d) => setServers(d.servers));
  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <div className="section-title">
        <div>
          <h2>{t('admin.serversTitle')}</h2>
          <p>{t('admin.serversSub')}</p>
        </div>
        <Button icon={Plus} onClick={() => setAdding(true)}>
          {t('admin.addServer')}
        </Button>
      </div>
      {servers?.length === 0 ? (
        <div className="empty">
          <div className="empty-art">
            <span className="icon-tile lg">
              <Server />
            </span>
          </div>
          <h3>{t('admin.noServersTitle')}</h3>
          <p>{t('admin.noServersText')}</p>
          <Button icon={Plus} onClick={() => setAdding(true)}>
            {t('admin.addFirstServer')}
          </Button>
        </div>
      ) : (
        <div className="server-grid">
          {(servers || []).map((s) => (
            <ServerCard key={s.id} server={s} onChange={load} />
          ))}
        </div>
      )}
      {adding && (
        <AddServerModal
          onClose={() => setAdding(false)}
          onDone={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------- Settings
// ---------------------------------------------------------------- Settings: plans
const LENGTH_PRESETS = [7, 30, 90, 180, 365];

function PlanModal({ plan, currency, onClose, onSaved }) {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({
    nameEn: plan?.name.en || '',
    nameRu: plan?.name.ru || '',
    days: plan ? String(plan.days) : '30',
    price: plan ? String(plan.price) : '',
    featured: plan?.featured || false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = { ...form, days: Number(form.days), price: Number(form.price) };
    try {
      if (plan) await api(`/admin/plans/${plan.id}`, { method: 'PATCH', body });
      else await api('/admin/plans', { method: 'POST', body });
      toast(plan ? t('admin.plans.saved') : t('admin.plans.added'), { body: form.nameEn });
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const days = Number(form.days) || 0;
  const price = Number(form.price) || 0;
  return (
    <Modal
      title={plan ? t('admin.plans.editTitle') : t('admin.plans.addTitle')}
      description={t('admin.plans.modalDesc')}
      icon={
        <span className="icon-tile">
          <Tag />
        </span>
      }
      onClose={onClose}
    >
      <form className="stack gap-16" onSubmit={submit}>
        <div className="name-row">
          <label className="field">
            <span>{t('admin.plans.nameEn')}</span>
            <input className="input" maxLength={40} value={form.nameEn} onChange={set('nameEn')} placeholder="Quarterly" required />
          </label>
          <label className="field">
            <span>{t('admin.plans.nameRu')}</span>
            <input className="input" maxLength={40} value={form.nameRu} onChange={set('nameRu')} placeholder="3 месяца" />
          </label>
        </div>
        <div className="field">
          <span>{t('admin.plans.length')}</span>
          <div className="row wrap gap-8">
            {LENGTH_PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                className={`chip-btn ${days === d ? 'active' : ''}`}
                onClick={() => setForm((f) => ({ ...f, days: String(d) }))}
              >
                {t('common.days', { count: d })}
              </button>
            ))}
          </div>
          <div className="input-suffix">
            <input className="input" type="number" min={1} max={3650} value={form.days} onChange={set('days')} required />
            <span>{t('admin.plans.daysUnit')}</span>
          </div>
        </div>
        <label className="field">
          <span>{t('admin.plans.price')}</span>
          <div className="input-suffix">
            <input className="input" type="number" min={1} step={1} value={form.price} onChange={set('price')} placeholder="299" required />
            <span>{currency === 'RUB' ? '₽' : currency}</span>
          </div>
          {days > 0 && price > 0 && (
            <span className="hint">{t('admin.plans.perMonth', { price: formatMoney(Math.round((price / days) * 30), currency) })}</span>
          )}
        </label>
        <label className="check-row">
          <input type="checkbox" checked={form.featured} onChange={set('featured')} />
          <span>
            <strong>{t('admin.plans.featured')}</strong>
            <span className="muted small">{t('admin.plans.featuredHint')}</span>
          </span>
        </label>
        <FormError>{error}</FormError>
        <div className="row gap-8 wrap" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" icon={Save} loading={busy}>
            {plan ? t('admin.saveChanges') : t('admin.plans.add')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function PlansCard() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const pt = usePlanText();
  const [plans, setPlans] = useState(null);
  const [currency, setCurrency] = useState('RUB');
  const [editing, setEditing] = useState(null); // plan, or 'new'

  const load = useCallback(async () => {
    const [d, b] = await Promise.all([api('/admin/plans'), reloadPlans()]);
    setPlans(d.plans);
    setCurrency(b.currency);
  }, []);
  useEffect(() => {
    load().catch((e) => toast(t('admin.saveFail'), { type: 'error', body: e.message }));
  }, [load]);

  async function update(plan, body, done) {
    try {
      await api(`/admin/plans/${plan.id}`, { method: 'PATCH', body });
      toast(done, { body: pt.name(plan) });
      load();
    } catch (err) {
      toast(t('admin.saveFail'), { type: 'error', body: err.message });
    }
  }

  async function remove(plan) {
    const ok = await confirm({
      title: t('admin.plans.deleteTitle', { name: pt.name(plan) }),
      body: t('admin.plans.deleteBody'),
      confirmLabel: t('admin.plans.delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/admin/plans/${plan.id}`, { method: 'DELETE' });
      toast(t('admin.plans.deleted'), { body: pt.name(plan) });
      load();
    } catch (err) {
      toast(t('admin.saveFail'), { type: 'error', body: err.message });
    }
  }

  return (
    <div className="card">
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="row gap-12">
          <span className="icon-tile">
            <Tag />
          </span>
          <div>
            <h3>{t('admin.plans.title')}</h3>
            <p className="muted small">{t('admin.plans.sub')}</p>
          </div>
        </div>
        <Button icon={Plus} onClick={() => setEditing('new')} style={{ marginLeft: 'auto' }}>
          {t('admin.plans.add')}
        </Button>
      </div>
      <div className="table-wrap">
        <table className="table stackable">
          <thead>
            <tr>
              <th>{t('admin.plans.colPlan')}</th>
              <th>{t('admin.plans.colLength')}</th>
              <th>{t('admin.plans.colPrice')}</th>
              <th>{t('admin.plans.colStatus')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {plans === null && (
              <tr>
                <td colSpan={5}>
                  <div className="skeleton" style={{ height: 32 }} />
                </td>
              </tr>
            )}
            {(plans || []).map((p) => (
              <tr key={p.id} className={p.active ? '' : 'row-muted'}>
                <td>
                  <div className="row gap-8 wrap">
                    <strong>{p.name[lang] || p.name.en}</strong>
                    {p.featured && (
                      <span className="badge blue">
                        <Star /> {t('admin.plans.featuredBadge')}
                      </span>
                    )}
                  </div>
                  <div className="tiny muted">{lang === 'ru' ? p.name.en : p.name.ru}</div>
                </td>
                <td className="nowrap" data-label={t('admin.plans.colLength')}>
                  {t('common.days', { count: p.days })}
                </td>
                <td className="nowrap" data-label={t('admin.plans.colPrice')}>
                  <strong>{formatMoney(p.price, currency)}</strong>
                </td>
                <td data-label={t('admin.plans.colStatus')}>
                  <span className={`badge ${p.active ? 'ok' : ''}`}>{p.active ? t('admin.plans.onSale') : t('admin.plans.hidden')}</span>
                </td>
                <td className="actions">
                  <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(p)}>
                    {t('admin.plans.edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="btn-icon"
                    onClick={() => update(p, { active: !p.active }, p.active ? t('admin.plans.hiddenToast') : t('admin.plans.shownToast'))}
                    title={p.active ? t('admin.plans.hide') : t('admin.plans.show')}
                    aria-label={p.active ? t('admin.plans.hide') : t('admin.plans.show')}
                  >
                    {p.active ? <EyeOff /> : <Eye />}
                  </Button>
                  {p.payments === 0 ? (
                    <Button
                      size="sm"
                      variant="danger"
                      className="btn-icon"
                      onClick={() => remove(p)}
                      title={t('admin.plans.delete')}
                      aria-label={t('admin.plans.delete')}
                    >
                      <Trash2 />
                    </Button>
                  ) : (
                    <span className="btn btn-sm btn-icon" style={{ visibility: 'hidden' }} aria-hidden="true" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="tiny muted plans-foot">{t('admin.plans.foot')}</p>
      {editing && (
        <PlanModal
          plan={editing === 'new' ? null : editing}
          currency={currency}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function SettingsPage() {
  const { t } = useI18n();
  const [text, setText] = useState(null);
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    api('/admin/settings').then((d) => {
      setText(d.paymentInstructions);
      setSaved(d.paymentInstructions);
    });
  }, []);

  async function save() {
    setBusy(true);
    try {
      await api('/admin/settings', { method: 'PUT', body: { paymentInstructions: text } });
      setSaved(text);
      toast(t('admin.saved'), { body: text.trim() ? t('admin.savedBody') : t('admin.savedEmpty') });
    } catch (err) {
      toast(t('admin.saveFail'), { type: 'error', body: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack gap-16">
      <PlansCard />
      {text === null ? (
        <div className="skeleton" style={{ height: 300 }} />
      ) : (
    <div className="card">
      <div className="card-header">
        <div className="row gap-12">
          <span className="icon-tile">
            <Landmark />
          </span>
          <div>
            <h3>{t('admin.settingsCardTitle')}</h3>
            <p className="muted small">{t('admin.settingsCardSub')}</p>
          </div>
        </div>
      </div>
      <div className="card-body stack gap-16">
        {/TEST DETAILS/i.test(saved) && (
          <div className="callout">
            <AlertTriangle />
            <span>{t('admin.sampleWarning')}</span>
          </div>
        )}
        <div className="dash-grid" style={{ marginBottom: 0 }}>
          <label className="field">
            <span>{t('admin.paymentDetails')}</span>
            <textarea
              className="textarea"
              rows={9}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'Банк: …\nНомер карты: …\nПолучатель: …\nСБП: +7 …'}
            />
            <span className="hint">{t('admin.paymentDetailsHint')}</span>
          </label>
          <div className="field">
            <span>{t('admin.customersSee')}</span>
            <pre className="bank-details" style={{ minHeight: 140 }}>
              {text.trim() || t('admin.hiddenPreview')}
            </pre>
          </div>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Button icon={Save} onClick={save} loading={busy} disabled={text === saved}>
            {t('admin.saveChanges')}
          </Button>
        </div>
      </div>
    </div>
      )}
    </div>
  );
}

function AdminManagement() {
  const { t, lang } = useI18n();
  const [admins, setAdmins] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', passwordConfirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  async function load() {
    try {
      const data = await api(`/admin/admins?page=${page}&pageSize=10`);
      setAdmins(data.admins);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, [page]);

  const set = (field) => (e) => setForm((current) => ({ ...current, [field]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/admin/admins', { method: 'POST', body: { ...form, lang } });
      setForm({ firstName: '', lastName: '', email: '', password: '', passwordConfirm: '' });
      toast(t('admin.adminCreated'), { body: t('admin.adminCreatedBody') });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack gap-16">
      <div className="card">
        <div className="card-header">
          <div className="row gap-12">
            <span className="icon-tile">
              <ShieldCheck />
            </span>
            <div>
              <h3>{t('admin.adminsTitle')}</h3>
              <p className="muted small">{t('admin.adminsSub')}</p>
            </div>
          </div>
        </div>
        <div className="card-body">
          <form className="stack gap-16" onSubmit={submit}>
            <div className="name-row">
              <label className="field">
                <span>{t('auth.firstName')}</span>
                <input className="input" autoComplete="given-name" maxLength={50} value={form.firstName} onChange={set('firstName')} />
              </label>
              <label className="field">
                <span>{t('auth.lastName')}</span>
                <input className="input" autoComplete="family-name" maxLength={50} value={form.lastName} onChange={set('lastName')} />
              </label>
            </div>
            <label className="field">
              <span>{t('admin.adminEmail')}</span>
              <input
                className="input"
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={set('email')}
                required
              />
            </label>
            <div className="name-row">
              <label className="field">
                <span>{t('auth.password')}</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={set('password')}
                  minLength={8}
                  required
                />
              </label>
              <label className="field">
                <span>{t('auth.confirmPassword')}</span>
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  value={form.passwordConfirm}
                  onChange={set('passwordConfirm')}
                  minLength={8}
                  required
                />
              </label>
            </div>
            <FormError>{error}</FormError>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <Button type="submit" icon={Plus} loading={busy}>
                {t('admin.adminsTitle')}
              </Button>
            </div>
          </form>
        </div>
      </div>
      <div className="card">
        <div className="card-header">
          <h3>{t('admin.adminListTitle')}</h3>
        </div>
        <div className="card-body stack gap-12">
          {admins === null ? (
            <div className="skeleton" style={{ height: 48 }} />
          ) : admins.length === 0 ? (
            <p className="muted">{t('admin.noAdmins')}</p>
          ) : (
            admins.map((admin) => (
              <div key={admin.id} className="row between wrap gap-8 admin-row">
                <Person p={admin} sub={fullName(admin) ? admin.email : ''} />
                <span className={`badge ${admin.email_verified ? 'ok' : 'warn'}`}>
                  {admin.email_verified ? t('admin.adminVerified') : t('admin.adminPending')}
                </span>
              </div>
            ))
          )}
        </div>
        <Pagination page={page} pageSize={10} total={total} onChange={setPage} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Page
const TABS = [
  { id: 'overview', icon: Activity },
  { id: 'payments', icon: Receipt },
  { id: 'customers', icon: Users },
  { id: 'admins', icon: ShieldCheck },
  { id: 'servers', icon: Server },
  { id: 'settings', icon: Settings },
  { id: 'profile', icon: UserCog, divider: true },
];

export default function Admin() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((x) => x.id === params.get('tab')) ? params.get('tab') : 'overview';
  const goTo = (id) => setParams(id === 'overview' ? {} : { tab: id });
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api('/admin/stats')
      .then((s) => setPendingCount(s.pendingReviews))
      .catch(() => {});
  }, [tab]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tab === 'overview' ? t('admin.titles.overview') : t(`admin.tabs.${tab}`)}</h1>
          <p>{t(`admin.subtitles.${tab}`)}</p>
        </div>
      </div>
      <div className="admin">
        <nav className="admin-nav">
          {TABS.map(({ id, icon: Icon, divider }) => (
            <button key={id} className={`${tab === id ? 'active' : ''} ${divider ? 'nav-divider' : ''}`} onClick={() => goTo(id)}>
              <Icon /> {t(`admin.tabs.${id}`)}
              {id === 'payments' && pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}
            </button>
          ))}
        </nav>
        <div style={{ minWidth: 0 }}>
          {tab === 'overview' && <Overview goTo={goTo} pendingCount={pendingCount} />}
          {tab === 'payments' && <Payments onCountChange={setPendingCount} />}
          {tab === 'customers' && <Customers />}
          {tab === 'admins' && <AdminManagement />}
          {tab === 'servers' && <Servers />}
          {tab === 'settings' && <SettingsPage />}
          {tab === 'profile' && <AdminProfile />}
        </div>
      </div>
    </>
  );
}
