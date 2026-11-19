import {
  ArrowRight,
  Check,
  ChevronDown,
  EyeOff,
  FileCheck2,
  Landmark,
  Laptop,
  Monitor,
  ShieldCheck,
  ShieldHalf,
  Smartphone,
  Tablet,
  UserPlus,
  Wallet,
  Wifi,
  Zap,
  Download,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatMoney, savingsVs } from '../api.js';
import { useAuth } from '../App.jsx';
import { BRAND } from '../brand.js';
import PhoneMockup from '../components/PhoneMockup.jsx';
import { SupportButton, useSupport } from '../components/Support.jsx';
import { LangSwitch, useI18n } from '../i18n/index.jsx';
import { usePlanText, usePlans } from '../plans.js';
import { Logo } from '../ui.jsx';

function SupportLink({ children }) {
  const openSupport = useSupport();
  return (
    <button type="button" className="footer-link" onClick={openSupport}>
      {children}
    </button>
  );
}

function MarketingNav() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`mk-nav ${scrolled ? 'scrolled' : ''}`}>
      <div className="container mk-nav-inner">
        <Logo />
        <nav className="mk-links">
          <a href="#how">{t('nav.how')}</a>
          <a href="#features">{t('nav.features')}</a>
          <a href="#pricing">{t('nav.pricing')}</a>
          <a href="#faq">{t('nav.faq')}</a>
        </nav>
        <div className="mk-nav-cta">
          <SupportButton />
          <LangSwitch />
          {user ? (
            <Link to={user.isAdmin ? '/admin' : '/dashboard'} className="btn">
              {user.isAdmin ? t('common.admin') : t('common.myVpn')} <ArrowRight />
            </Link>
          ) : (
            <>
              <Link to="/login" className="btn btn-ghost">
                {t('nav.signIn')}
              </Link>
              <Link to="/signup" className="btn">
                {t('nav.getStarted')}
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

const STEP_ICONS = [UserPlus, Wallet, Download];
const FEATURE_ICONS = [ShieldHalf, Zap, EyeOff, Wifi, Smartphone, Wallet];
const PAY_ICONS = [Landmark, FileCheck2, ShieldCheck];
const androidDownload = import.meta.env.VITE_JIREX_ANDROID_URL
  || 'https://github.com/desire627/jirex-newvpn/releases/download/android-v0.2.0/jirex-vpn-0.2.0.apk';
const iosDownload = import.meta.env.VITE_JIREX_IOS_URL;

// Cards per row: all in one row up to 4; 5 → 3 + 2, 6 → 3 + 3, 7+ → rows of 4.
const priceColumns = (n) => (n <= 4 ? n : n <= 6 ? 3 : 4);

function Pricing() {
  const { t } = useI18n();
  const pt = usePlanText();
  const billing = usePlans();

  if (!billing) return <div className="pricing" style={{ minHeight: 460 }} />;
  const { plans, currency, maxDevices } = billing;

  return (
    <>
      <div className="pricing" style={{ '--cols': priceColumns(plans.length) }}>
        {plans.map((p) => {
          const featured = p.featured;
          const save = savingsVs(plans, p);
          const perMonth = formatMoney(Math.round((p.price / p.days) * 30), currency);
          return (
            <div key={p.id} className={`card price-card ${featured ? 'featured' : ''}`}>
              {featured && <span className="badge featured-tag">{t('home.bestValue')}</span>}
              <div>
                <div className="row between" style={{ minHeight: 26 }}>
                  <h3>{pt.name(p)}</h3>
                  {save > 0 && <span className="badge ok">{t('home.save', { pct: save })}</span>}
                </div>
                <div className="price-main" style={{ marginTop: 14 }}>
                  <strong>{formatMoney(p.price, currency)}</strong>
                  <span>/ {pt.unit(p)}</span>
                </div>
                <p className="price-alt">{pt.isOriginal(p) ? t(`home.tagline.${p.id}`, { price: perMonth }) : t('home.taglineAny', { price: perMonth })}</p>
              </div>
              <ul className="price-list">
                <li>
                  <Check /> {t('home.planFeatures.devices', { max: maxDevices })}
                </li>
                <li>
                  <Check /> {t('home.planFeatures.locations')}
                </li>
                <li>
                  <Check /> {t('home.planFeatures.noLogs')}
                </li>
                <li>
                  <Check /> {featured ? t('home.planFeatures.priority') : t('home.planFeatures.email')}
                </li>
              </ul>
              <Link to="/signup" className={`btn btn-lg btn-block ${featured ? '' : 'btn-secondary'}`}>
                {pt.isOriginal(p) ? t(`home.cta.${p.id}`) : t('home.ctaAny', { plan: pt.name(p) })}
              </Link>
            </div>
          );
        })}
      </div>
      <div className="pay-methods">
        {t('home.payMethods').map((label, i) => {
          const Icon = PAY_ICONS[i];
          return (
            <span key={label}>
              <Icon /> {label}
            </span>
          );
        })}
      </div>
    </>
  );
}

export default function Home() {
  const { t } = useI18n();
  const brand = BRAND.name;

  return (
    <>
      <MarketingNav />

      <section className="hero">
        <div className="grid-bg" />
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">
              <span className="badge ok">{t('home.eyebrowBadge')}</span> {t('home.eyebrow')}
            </span>
            <h1>
              {t('home.titleA')} <span className="hl">{t('home.titleB')}</span>
            </h1>
            <p className="lead">{t('home.lead', { brand })}</p>
            <div className="hero-cta">
              <Link to="/signup" className="btn btn-lg">
                {t('home.ctaPrimary')} <ArrowRight />
              </Link>
              <a href="#pricing" className="btn btn-lg btn-secondary">
                {t('home.ctaSecondary')}
              </a>
            </div>
            <div className="hero-cta">
              <a href={androidDownload} className="btn btn-secondary">
                <Download /> {t('common.downloadAndroid')}
              </a>
              {iosDownload ? (
                <a href={iosDownload} className="btn btn-secondary">
                  <Tablet /> {t('common.downloadIos')}
                </a>
              ) : (
                <a href="#iphone-setup" className="btn btn-ghost">
                  <Tablet /> {t('common.iphoneSetup')}
                </a>
              )}
            </div>
            <div className="hero-proof">
              {t('home.proof').map((p) => (
                <span key={p}>
                  <Check /> {p}
                </span>
              ))}
            </div>
          </div>
          <PhoneMockup />
        </div>
      </section>

      <div className="platforms">
        <div className="platforms-inner">
          <span>{t('home.worksOn')}</span>
          <span>
            <Smartphone /> Android
          </span>
          <span>
            <Tablet /> {t('home.iphone')}
          </span>
          <span>
            <Monitor /> Windows
          </span>
          <span>
            <Laptop /> macOS
          </span>
        </div>
      </div>

      {!iosDownload && (
        <section id="iphone-setup" className="section">
          <div className="container">
            <div className="section-head">
              <h2>{t('common.iphoneSetup')}</h2>
              <p>{t('common.iphoneSetupHelp')}</p>
              <a href="https://apps.apple.com/ru/app/amneziawg/id6478942365" className="btn btn-secondary">
                <Download /> {t('common.downloadAmnezia')}
              </a>
            </div>
          </div>
        </section>
      )}

      <section className="section" id="how">
        <div className="container">
          <div className="section-head">
            <span className="kicker">{t('home.howKicker')}</span>
            <h2>{t('home.howTitle')}</h2>
            <p>{t('home.howSub', { brand })}</p>
          </div>
          <div className="steps-3">
            {t('home.steps').map(({ title, text }, i) => {
              const Icon = STEP_ICONS[i];
              return (
                <div key={title} className="card step-card">
                  <span className="step-num">0{i + 1}</span>
                  <span className="icon-tile lg">
                    <Icon />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section" id="features" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <span className="kicker">{t('home.featuresKicker', { brand })}</span>
            <h2>{t('home.featuresTitle')}</h2>
          </div>
          <div className="features">
            {t('home.features').map(({ title, text }, i) => {
              const Icon = FEATURE_ICONS[i];
              return (
                <div key={title} className="feature">
                  <span className="icon-tile">
                    <Icon />
                  </span>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="section" id="pricing" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="section-head">
            <span className="kicker">{t('home.pricingKicker')}</span>
            <h2>{t('home.pricingTitle')}</h2>
            <p>{t('home.pricingSub')}</p>
          </div>
          <Pricing />
        </div>
      </section>

      <section className="section" id="faq" style={{ paddingTop: 0 }}>
        <div className="container container-sm">
          <div className="section-head">
            <span className="kicker">{t('home.faqKicker')}</span>
            <h2>{t('home.faqTitle')}</h2>
          </div>
          <div className="faq">
            {t('home.faq').map(({ q, a }) => (
              <details key={q}>
                <summary>
                  {q}
                  <ChevronDown />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 40 }}>
        <div className="cta-band">
          <h2>{t('home.ctaTitle')}</h2>
          <p>{t('home.ctaSub')}</p>
          <Link to="/signup" className="btn btn-lg">
            {t('home.ctaButton')} <ArrowRight />
          </Link>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container">
          <div className="row gap-12">
            <Logo />
            <span>© {new Date().getFullYear()}</span>
          </div>
          <nav>
            <a href="#pricing">{t('nav.pricing')}</a>
            <a href="#faq">{t('nav.faq')}</a>
            <Link to="/privacy">{t('common.privacy')}</Link>
            <SupportLink>{t('home.footerSupport')}</SupportLink>
          </nav>
          <span className="tiny">{t('home.trademark')}</span>
        </div>
      </footer>
    </>
  );
}
