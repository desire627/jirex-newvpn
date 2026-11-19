import { CreditCard, Download, Laptop, LogOut, Monitor, Power, Smartphone, Tablet, UserRound } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.jsx';
import { LogoMark } from '../ui.jsx';

const appStore = 'https://apps.apple.com/ru/app/amneziawg/id6478942365';
const help = 'https://docs.amnezia.org/documentation/instructions/use-amneziawg-app/';
const guideShots = import.meta.glob('../assets/setup/amnezia-*.{png,jpg,jpeg,webp}', {
  eager: true, query: '?url', import: 'default',
});

function screenshot(platform, step) {
  const base = `../assets/setup/amnezia-${platform}-${step}.`;
  return guideShots[base + 'png'] || guideShots[base + 'jpg'] || guideShots[base + 'jpeg'] || guideShots[base + 'webp'];
}

function AmneziaShots({ source, t }) {
  return (
    <div className="setup-guide-shots">
      {['import', 'connect'].map((step) => {
        const src = screenshot(source, step);
        const caption = t(`guide.shots.${step}`);
        return src && (
          <figure key={step} className="setup-figure">
            <img src={src} alt={caption} loading="lazy" />
            <figcaption>{caption}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}

const platforms = [
  { id: 'android', icon: Smartphone },
  { id: 'ios', icon: Tablet, download: appStore },
  {
    id: 'windows', icon: Monitor,
    download: 'https://github.com/amnezia-vpn/amnezia-client/releases/latest',
  },
  {
    id: 'mac', icon: Laptop, download: appStore, section: 'macos',
    image: 'en_macos_use_amneziawg_app4-8d5c7badd022508c70e1e7378eee625e.png',
  },
];

function AndroidPreview({ t }) {
  const items = [
    [Power, 'vpn'], [Smartphone, 'devices'], [CreditCard, 'payments'], [UserRound, 'account'], [LogOut, 'signOut'],
  ];
  return (
    <figure className="setup-figure">
      <div className="setup-phone" aria-hidden="true">
        <div className="setup-phone-brand"><LogoMark size={23} /> JIREX</div>
        <div className="setup-phone-power"><Power size={37} strokeWidth={2.5} /></div>
        <strong>{t('guide.disconnected')}</strong>
        <span className="muted small">{t('guide.tapConnect')}</span>
        <div className="setup-phone-location"><Smartphone size={15} /> {t('guide.location')}</div>
        <div className="setup-phone-nav">
          {items.map(([Icon, key]) => (
            <span key={key}><Icon size={14} />{t(`guide.nav.${key}`)}</span>
          ))}
        </div>
      </div>
      <figcaption>{t('guide.androidPreview')}</figcaption>
    </figure>
  );
}

export default function SetupGuide({ androidDownload }) {
  const { t } = useI18n();
  const [selected, setSelected] = useState(0);
  const tabs = useRef([]);
  const platform = platforms[selected];
  const prefix = `guide.platforms.${platform.id}`;
  const steps = t(`${prefix}.steps`);

  function moveTab(event) {
    const keys = { ArrowLeft: selected - 1, ArrowRight: selected + 1, Home: 0, End: platforms.length - 1 };
    if (!Object.hasOwn(keys, event.key)) return;
    event.preventDefault();
    const next = (keys[event.key] + platforms.length) % platforms.length;
    setSelected(next);
    tabs.current[next]?.focus();
  }

  return (
    <section className="section setup-guide" id="setup">
      <div className="container">
        <div className="section-head">
          <h2 id="setup-guide-heading">{t('guide.title')}</h2>
          <p>{t('guide.subtitle')}</p>
        </div>
        <div className="setup-guide-tabs" role="tablist" aria-labelledby="setup-guide-heading">
          {platforms.map(({ id, icon: Icon }, index) => (
            <button key={id} ref={(node) => { tabs.current[index] = node; }} type="button"
              id={`setup-tab-${id}`} role="tab" tabIndex={selected === index ? 0 : -1}
              aria-selected={selected === index} aria-controls={`setup-panel-${id}`}
              onClick={() => setSelected(index)} onKeyDown={moveTab}>
              <Icon size={19} /> {t(`guide.platforms.${id}.label`)}
            </button>
          ))}
        </div>
        <div className="setup-guide-panel" key={platform.id} id={`setup-panel-${platform.id}`} role="tabpanel"
          aria-labelledby={`setup-tab-${platform.id}`} tabIndex={0}>
          <div className="setup-guide-content">
            <h3>{t(`${prefix}.title`)}</h3>
            <ol className="setup-guide-steps">
              {steps.map(({ title, body }) => (
                <li key={title}><strong>{title}</strong><p>{body}</p></li>
              ))}
            </ol>
            <div className="row wrap gap-8">
              <a href={platform.download || androidDownload} className="btn">
                <Download /> {t(platform.id === 'windows' ? 'guide.downloadWindows' : platform.download ? 'guide.downloadClient' : 'common.downloadAndroid')}
              </a>
              {platform.download && <Link to="/dashboard" className="btn btn-secondary">{t('guide.openDashboard')}</Link>}
            </div>
          </div>
          {platform.image ? (
            <figure className={`setup-figure setup-figure-${platform.id}`}>
              <img loading="lazy" src={`https://docs.amnezia.org/assets/images/${platform.image}`} alt={t(`${prefix}.alt`)} />
              <figcaption><a href={`${help}#${platform.section}`}>{t('guide.screenshotSource')}</a></figcaption>
            </figure>
          ) : platform.id === 'ios' ? (
            <div className="setup-guide-reference">
              <AmneziaShots source="android" t={t} />
              <p className="muted small">{t('guide.iosReference')}</p>
            </div>
          ) : platform.id === 'windows' ? (
            <div className="setup-guide-reference"><AmneziaShots source="windows" t={t} /></div>
          ) : <AndroidPreview t={t} />}
        </div>
      </div>
    </section>
  );
}
