import { CheckCircle2, Hourglass, Receipt, Wallet, XCircle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, formatDate, formatMoney } from '../api.js';
import { useAuth } from '../App.jsx';
import PlanPicker from '../components/PlanPicker.jsx';
import { useI18n } from '../i18n/index.jsx';
import { usePlanText } from '../plans.js';
import { useToast } from '../ui.jsx';
import { StatusCard } from './Dashboard.jsx';

const STATUS = {
  successful: { tone: 'ok', icon: CheckCircle2 },
  pending: { tone: 'blue', icon: Hourglass },
  rejected: { tone: 'bad', icon: XCircle },
  failed: { tone: 'bad', icon: XCircle },
};

export default function Billing() {
  const { user, refreshUser } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const pt = usePlanText();
  const [billing, setBilling] = useState(null);
  const [payments, setPayments] = useState(null);
  const pickerRef = useRef(null);

  const load = useCallback(async () => {
    const [b, p] = await Promise.all([api('/billing/plans'), api('/billing/payments')]);
    setBilling(b);
    setPayments(p.payments);
  }, []);

  useEffect(() => {
    load().catch((e) => toast(t('dash.loadFail'), { type: 'error', body: e.message }));
    refreshUser();
  }, []);

  const pending = payments?.find((p) => p.status === 'pending');

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('billing.title')}</h1>
          <p>{t('billing.sub')}</p>
        </div>
      </div>

      <div className="billing-grid">
        <div className="stack gap-16" style={{ minWidth: 0 }}>
          <StatusCard
            user={user}
            pending={pending}
            onExtend={() => pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />
          <div className="card card-pad stack gap-16" ref={pickerRef}>
            <div className="row gap-12">
              <span className="icon-tile">
                <Wallet />
              </span>
              <div>
                <h3>{t('billing.addTitle')}</h3>
                <p className="muted small">{t('billing.addSub')}</p>
              </div>
            </div>
            {billing ? (
              <PlanPicker
                billing={billing}
                onSubmitted={() => {
                  load();
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            ) : (
              <div className="skeleton" style={{ height: 220 }} />
            )}
          </div>
        </div>

        <div className="card card-pad stack gap-16 pay-history">
          <div className="row gap-12">
            <span className="icon-tile neutral">
              <Receipt />
            </span>
            <div>
              <h3>{t('billing.historyTitle')}</h3>
              <p className="muted small">{t('billing.historySub')}</p>
            </div>
          </div>
          {payments === null ? (
            <div className="skeleton" style={{ height: 120 }} />
          ) : payments.length === 0 ? (
            <p className="muted small pay-empty">{t('billing.empty')}</p>
          ) : (
            <ul className="pay-list">
              {payments.map((p) => {
                const s = STATUS[p.status] || STATUS.failed;
                return (
                  <li key={p.id}>
                    <span className={`pay-ico ${s.tone}`}>
                      <s.icon />
                    </span>
                    <div className="grow">
                      <div className="row gap-8 wrap" style={{ justifyContent: 'space-between' }}>
                        <strong>{pt.name(p.plan)}</strong>
                        <strong>{formatMoney(p.amount, p.currency)}</strong>
                      </div>
                      <div className="row gap-8 wrap" style={{ justifyContent: 'space-between' }}>
                        <span className="muted small">{t('billing.sent', { date: formatDate(p.created_at) })}</span>
                        <span className={`badge ${s.tone}`}>{t(`billing.statuses.${p.status}`)}</span>
                      </div>
                      {p.review_note && (
                        <p className="pay-note small">
                          <span className="muted">{t('billing.note')}:</span> {p.review_note}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
