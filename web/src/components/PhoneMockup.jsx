import { ArrowDown, ArrowUp, BadgeCheck, Lock, MapPin, Power } from 'lucide-react';
import { BRAND } from '../brand.js';
import { useI18n } from '../i18n/index.jsx';
import { LogoMark } from '../ui.jsx';

// The "app on a phone" illustration used on the home page and the sign-in pages.
export default function PhoneMockup({ compact = false }) {
  const { t } = useI18n();
  return (
    <div className={`phone-stage ${compact ? 'compact' : ''}`} aria-hidden="true">
      <div className="phone">
        <div className="phone-screen">
          <div className="phone-notch" />
          <div className="phone-top">
            <span className="row gap-8">
              <LogoMark size={22} />
              {BRAND.name}
            </span>
            <span className="badge ok">
              <span className="dot ok" /> {t('phone.secure')}
            </span>
          </div>
          <div className="power-wrap">
            <span className="power-ring r1" />
            <span className="power-ring r2" />
            <span className="power-ring r3" />
            <div className="power-btn">
              <Power />
            </div>
          </div>
          <div className="phone-status">
            <strong>{t('phone.protected')}</strong>
            <span>{t('phone.connectedFor')}</span>
          </div>
          <div className="phone-row">
            <MapPin />
            <span className="grow">{t('phone.location')}</span>
            <span className="muted">18 ms</span>
          </div>
          <div className="phone-stats">
            <div>
              <ArrowDown size={13} />
              <strong>412 MB</strong>
              {t('phone.downloaded')}
            </div>
            <div>
              <ArrowUp size={13} />
              <strong>38 MB</strong>
              {t('phone.uploaded')}
            </div>
          </div>
        </div>
      </div>
      <div className="float-chip c1">
        <span className="icon-tile">
          <Lock />
        </span>
        <div>
          {t('phone.chip1')}
          <small>{t('phone.chip1Sub')}</small>
        </div>
      </div>
      <div className="float-chip c2">
        <span className="icon-tile blue">
          <BadgeCheck />
        </span>
        <div>
          {t('phone.chip2')}
          <small>{t('phone.chip2Sub')}</small>
        </div>
      </div>
    </div>
  );
}
