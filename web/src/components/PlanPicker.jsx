import { Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { formatMoney, savingsVs } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { usePlanText } from '../plans.js';
import { Button } from '../ui.jsx';
import TransferForm from './TransferForm.jsx';

// Pick a plan, then pay by bank transfer and upload the receipt (the only payment method).
export default function PlanPicker({ billing, onSubmitted }) {
  const { plans, currency, paymentsOpen } = billing;
  const { t } = useI18n();
  const pt = usePlanText();
  const [planId, setPlanId] = useState(plans.find((p) => p.id === 'monthly')?.id || plans.find((p) => p.featured)?.id || plans[0]?.id);
  const [step, setStep] = useState('choose');
  const plan = plans.find((p) => p.id === planId);

  if (step === 'transfer') {
    return <TransferForm plan={plan} currency={currency} onBack={() => setStep('choose')} onDone={onSubmitted} />;
  }

  return (
    <div className="plan-picker">
      <div className="plan-options" role="radiogroup">
        {plans.map((p) => {
          const save = savingsVs(plans, p);
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={planId === p.id}
              className={`plan-option ${planId === p.id ? 'selected' : ''}`}
              onClick={() => setPlanId(p.id)}
            >
              {save > 0 && <span className="badge save">−{save}%</span>}
              <span className="name">{pt.name(p)}</span>
              <span className="amount">{formatMoney(p.price, currency)}</span>
              <span className="per">{t('picker.per', { unit: pt.unit(p) })}</span>
            </button>
          );
        })}
      </div>

      {!paymentsOpen ? (
        <div className="callout info">
          <Lock />
          <span>{t('picker.closed')}</span>
        </div>
      ) : (
        <>
          <div className="pay-summary">
            <div>
              <div className="muted small">
                {t('picker.summary', { plan: pt.name(plan), days: t('common.days', { count: plan.days }) })}
              </div>
              <strong style={{ fontSize: 22 }}>{formatMoney(plan.price, currency)}</strong>
            </div>
            <Button size="lg" onClick={() => setStep('transfer')}>
              {t('picker.continue')}
            </Button>
          </div>
          <div className="secure-note">
            <ShieldCheck />
            {t('picker.note')}
          </div>
        </>
      )}
    </div>
  );
}
