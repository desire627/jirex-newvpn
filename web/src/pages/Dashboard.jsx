import {
  AlertTriangle,
  CalendarClock,
  Check,
  Globe,
  Hourglass,
  LifeBuoy,
  Loader2,
  Plus,
  RefreshCw,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, connectionState, daysUntil, formatDate, formatMoney } from '../api.js';
import { useAuth } from '../App.jsx';
import { BRAND } from '../brand.js';
import AddDeviceModal, { kindIcon } from '../components/AddDeviceModal.jsx';
import DeviceSetup from '../components/DeviceSetup.jsx';
import PlanPicker from '../components/PlanPicker.jsx';
import { useSupport } from '../components/Support.jsx';
import { useI18n } from '../i18n/index.jsx';
import { usePlanText } from '../plans.js';
import { Button, Modal, useConfirm, useToast } from '../ui.jsx';

export function StatusCard({ user, pending, onExtend }) {
  const { t, tr } = useI18n();
  const pt = usePlanText();
  const days = daysUntil(user.accessUntil);
  const total = days > 31 ? 365 : days > 7 ? 30 : 7;
  const pct = Math.min(100, Math.round((days / total) * 100));
  const low = user.active && days <= 2;

  if (!user.active) {
    return (
      <div className="card status-card inactive">
        <div className="status-top">
          <div className="shield-orb">{pending ? <Hourglass /> : <ShieldAlert />}</div>
          <div>
            <h2>{pending ? t('dash.reviewTitle') : t('dash.notProtected')}</h2>
            <p>
              {pending
                ? t('dash.reviewText', { plan: pt.name(pending.plan) })
                : user.accessUntil
                  ? t('dash.endedOn', { date: formatDate(user.accessUntil) })
                  : t('dash.choosePlanHint')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card status-card">
      <div className="status-top">
        <div className="shield-orb">
          <ShieldCheck />
        </div>
        <div>
          <div className="row gap-8 wrap">
            <h2>{t('dash.activeTitle')}</h2>
            <span className="badge ok">
              <span className="dot ok pulse" /> {t('dash.activeBadge')}
            </span>
          </div>
          <p>{tr('dash.coveredUntil', { date: formatDate(user.accessUntil) })}</p>
        </div>
      </div>

      <div className="meter">
        <div className="meter-row">
          <span className="muted">{t('dash.remaining')}</span>
          <strong>{t('common.days', { count: days })}</strong>
        </div>
        <div className="meter-track">
          <div className={`meter-fill ${low ? 'warn' : ''}`} style={{ width: `${Math.max(pct, 3)}%` }} />
        </div>
      </div>

      <div className="status-actions">
        <Button variant={low ? 'primary' : 'secondary'} icon={RefreshCw} onClick={onExtend}>
          {low ? t('dash.renewNow') : t('dash.addTime')}
        </Button>
      </div>
    </div>
  );
}

function PaymentBanner({ user, payments, onRetry }) {
  const { t } = useI18n();
  const pt = usePlanText();
  const latest = payments[0];
  if (!latest || latest.provider !== 'transfer') return null;
  // For customers without a plan, the status card already explains the review.
  if (latest.status === 'pending' && user.active) {
    return (
      <div className="pay-banner pending">
        <span className="icon-tile blue">
          <Hourglass />
        </span>
        <div className="grow">
          <strong>{t('dash.pendingTitle')}</strong>
          <p>
            {t('dash.pendingText', {
              plan: pt.name(latest.plan),
              amount: formatMoney(latest.amount, latest.currency),
              date: formatDate(latest.created_at),
            })}
          </p>
        </div>
      </div>
    );
  }
  const recent = Date.now() - new Date(latest.created_at) < 14 * 86_400_000;
  if (latest.status === 'rejected' && recent) {
    return (
      <div className="pay-banner rejected">
        <span className="icon-tile danger">
          <AlertTriangle />
        </span>
        <div className="grow">
          <strong>{t('dash.rejectedTitle')}</strong>
          <p>
            {latest.review_note || t('dash.rejectedFallback')}{' '}
            {t('dash.rejectedContact', { email: BRAND.supportEmail })}
          </p>
        </div>
        <Button size="sm" onClick={onRetry}>
          {t('dash.sendAgain')}
        </Button>
      </div>
    );
  }
  return null;
}

function HelpFoot() {
  const { t } = useI18n();
  const openSupport = useSupport();
  return (
    <div className="side-foot">
      <LifeBuoy />
      <span>
        {t('dash.troubleConnecting')}{' '}
        <button type="button" className="link-btn" onClick={openSupport}>
          {t('dash.contactSupport')}
        </button>
      </span>
    </div>
  );
}

function SetupChecklist({ user, devices, pending }) {
  const { t } = useI18n();
  const items = [
    { done: true, title: t('dash.stepAccount'), text: t('dash.customerCode', { code: user.customerCode || '' }) },
    {
      done: user.active,
      title: t('dash.stepPlan'),
      text: pending && !user.active ? t('dash.stepPlanWaiting') : t('dash.stepPlanHint'),
    },
    { done: devices.length > 0, title: t('dash.stepDevice'), text: t('dash.stepDeviceHint') },
    { done: devices.some((d) => d.lastSeen), title: t('dash.stepConnect'), text: t('dash.stepConnectHint') },
  ];
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="card side-card">
      <div className="row between">
        <h3>{t('dash.checklistTitle')}</h3>
        <span className="muted small">{t('dash.progress', { done: doneCount, total: items.length })}</span>
      </div>
      <ul className="checklist">
        {items.map((it, i) => (
          <li key={it.title} className={it.done ? 'done' : ''}>
            <span className="num">{it.done ? <Check /> : i + 1}</span>
            <span className="label">
              <strong>{it.title}</strong>
              {it.text}
            </span>
          </li>
        ))}
      </ul>
      <HelpFoot />
    </div>
  );
}

function UsageCard({ devices, maxDevices }) {
  const { t } = useI18n();
  const online = devices.filter((d) => connectionState(d.lastSeen).tone === 'ok').length;
  const left = maxDevices - devices.length;
  return (
    <div className="card side-card">
      <h3>{t('dash.usageTitle')}</h3>
      <div className="stat-pair">
        <div className="mini-stat">
          <span>{t('dash.devicesUsed')}</span>
          <strong>
            {devices.length} <span className="of">/ {maxDevices}</span>
          </strong>
        </div>
        <div className="mini-stat">
          <span>{t('dash.connectedNow')}</span>
          <strong>{online}</strong>
        </div>
      </div>
      <div className="meter">
        <div className="meter-row">
          <span className="muted">{left > 0 ? t('dash.moreAvailable', { count: left }) : t('dash.allUsed')}</span>
        </div>
        <div className="meter-track">
          <div className="meter-fill" style={{ width: `${(devices.length / maxDevices) * 100}%` }} />
        </div>
      </div>
      <HelpFoot />
    </div>
  );
}

function DeviceCard({ device, onShow, onRemove }) {
  const { t } = useI18n();
  const Icon = kindIcon(device.kind);
  const conn = connectionState(device.lastSeen);
  return (
    <div className="card device-card">
      <div className="device-head">
        <span className={`icon-tile ${conn.tone === 'ok' ? '' : 'neutral'}`}>
          <Icon />
        </span>
        <div className="grow">
          <h4 className="truncate">{device.name}</h4>
          <div className="row gap-8 small" style={{ marginTop: 3 }}>
            <span className={`dot ${conn.tone}`} />
            <span className={conn.tone === 'ok' ? '' : 'muted'}>{conn.label}</span>
          </div>
        </div>
      </div>
      <div className="device-meta">
        <div>
          <Globe />
          {device.server}
          {device.country ? ` · ${device.country}` : ''}
        </div>
        <div>
          <Signal />
          <span className="mono small">{device.address}</span>
        </div>
        <div>
          <CalendarClock />
          {t('dash.added', { date: formatDate(device.createdAt) })}
        </div>
      </div>
      <div className="device-actions">
        <Button variant="secondary" size="sm" icon={Settings2} onClick={onShow}>
          {t('dash.setupButton')}
        </Button>
        <Button
          variant="danger"
          size="sm"
          className="btn-icon"
          onClick={onRemove}
          aria-label={t('dash.removeAria', { name: device.name })}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();

  const [billing, setBilling] = useState(null);
  const [servers, setServers] = useState([]);
  const [devices, setDevices] = useState(null);
  const [payments, setPayments] = useState([]);
  const [adding, setAdding] = useState(false);
  const [showing, setShowing] = useState(null);
  const [extending, setExtending] = useState(false);

  const load = useCallback(async () => {
    const [b, s, d, p] = await Promise.all([
      api('/billing/plans'),
      api('/servers'),
      api('/devices'),
      api('/billing/payments'),
    ]);
    setBilling(b);
    setServers(s.servers);
    setDevices(d.devices);
    setPayments(p.payments);
  }, []);

  useEffect(() => {
    const refresh = () => {
      load().catch((e) => toast(t('dash.loadFail'), { type: 'error', body: e.message }));
      refreshUser();
    };
    refresh();
    window.addEventListener('jirex:android-account-updated', refresh);
    return () => window.removeEventListener('jirex:android-account-updated', refresh);
  }, []);

  function receiptSent() {
    setExtending(false);
    load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function showDevice(id) {
    try {
      setShowing(await api(`/devices/${id}/config`));
    } catch (err) {
      toast(t('dash.openFail'), { type: 'error', body: err.message });
    }
  }

  async function removeDevice(device) {
    const ok = await confirm({
      title: t('dash.removeTitle', { name: device.name }),
      body: t('dash.removeBody'),
      confirmLabel: t('dash.removeConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/devices/${device.id}`, { method: 'DELETE' });
      toast(t('dash.removed'));
      load();
    } catch (err) {
      toast(t('dash.removeFail'), { type: 'error', body: err.message });
    }
  }

  if (!devices || !billing) {
    return (
      <div className="result" style={{ minHeight: 300 }}>
        <Loader2 className="spin" size={26} color="var(--muted)" />
      </div>
    );
  }

  const maxDevices = billing.maxDevices;
  const atLimit = devices.length >= maxDevices;
  const canAdd = user.active && !atLimit && servers.length > 0;
  const firstName = user.firstName || user.email?.split('@')[0] || t('auth.keyAccount');
  const pending = payments.find((p) => p.status === 'pending');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('dash.hi', { name: firstName })} 👋</h1>
          <p>{user.active ? t('dash.subActive') : t('dash.subInactive')}</p>
        </div>
      </div>

      <PaymentBanner user={user} payments={payments} onRetry={() => setExtending(true)} />

      <div className="dash-grid">
        <div className="stack gap-16">
          <StatusCard user={user} pending={pending} onExtend={() => setExtending(true)} />
          {!user.active && !pending && (
            <div className="card card-pad">
              <div className="section-title" style={{ marginBottom: 20 }}>
                <div>
                  <h2>{t('dash.choosePlanTitle')}</h2>
                  <p>{t('dash.choosePlanSub', { max: maxDevices })}</p>
                </div>
              </div>
              <PlanPicker billing={billing} onSubmitted={receiptSent} />
            </div>
          )}
        </div>
        {devices.length > 0 && user.active ? (
          <UsageCard devices={devices} maxDevices={maxDevices} />
        ) : (
          <SetupChecklist user={user} devices={devices} pending={pending} />
        )}
      </div>

      <section>
        <div className="section-title">
          <div>
            <h2>{t('dash.devicesTitle')}</h2>
            <p>{atLimit ? t('dash.devicesAtLimit', { max: maxDevices }) : t('dash.devicesHint')}</p>
          </div>
          {devices.length > 0 && (
            <Button icon={Plus} onClick={() => setAdding(true)} disabled={!canAdd}>
              {t('dash.addDevice')}
            </Button>
          )}
        </div>

        {devices.length === 0 ? (
          <div className="empty">
            <div className="empty-art">
              <span className="icon-tile lg">
                <Settings2 />
              </span>
            </div>
            <h3>{t('dash.emptyTitle')}</h3>
            <p>
              {user.active
                ? servers.length
                  ? t('dash.emptyActive')
                  : t('dash.emptyNoServers')
                : t('dash.emptyInactive', { max: maxDevices })}
            </p>
            {user.active && servers.length > 0 && (
              <Button icon={Plus} size="lg" onClick={() => setAdding(true)}>
                {t('dash.addFirst')}
              </Button>
            )}
          </div>
        ) : (
          <div className="device-grid">
            {devices.map((d) => (
              <DeviceCard key={d.id} device={d} onShow={() => showDevice(d.id)} onRemove={() => removeDevice(d)} />
            ))}
          </div>
        )}
      </section>

      {adding && <AddDeviceModal servers={servers} onClose={() => setAdding(false)} onAdded={load} />}

      {showing && (
        <Modal
          wide
          title={t('dash.setupTitle', { name: showing.name })}
          description={t('dash.setupDesc')}
          icon={
            <span className="icon-tile">
              <Settings2 />
            </span>
          }
          onClose={() => setShowing(null)}
        >
          <DeviceSetup device={showing} />
        </Modal>
      )}

      {extending && (
        <Modal
          wide
          title={user.active ? t('dash.extendTitle') : t('dash.choosePlanTitle')}
          description={user.active ? t('dash.extendDesc') : t('dash.chooseDesc')}
          icon={
            <span className="icon-tile">
              <RefreshCw />
            </span>
          }
          onClose={() => setExtending(false)}
        >
          <PlanPicker billing={billing} onSubmitted={receiptSent} />
        </Modal>
      )}
    </>
  );
}
