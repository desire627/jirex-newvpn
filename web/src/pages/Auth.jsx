import { Copy,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  MailCheck,
  ShieldCheck,
  ShieldHalf,
  Zap,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../App.jsx';
import OtpInput from '../components/OtpInput.jsx';
import PhoneMockup from '../components/PhoneMockup.jsx';
import { SupportButton } from '../components/Support.jsx';
import { LangSwitch, useI18n } from '../i18n/index.jsx';
import { Button, FormError, Logo, useToast } from '../ui.jsx';

const PERK_ICONS = [ShieldHalf, Zap, CalendarDays, Download];
const RESEND_SECONDS = 60;

// Scales the phone illustration to fit the space it has, on any window size.
function useFitArt() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const art = ref.current;
    const stage = art?.querySelector('.phone-stage');
    if (!art || !stage) return;
    const fit = () => {
      const scale = Math.min(art.clientWidth / stage.offsetWidth, art.clientHeight / stage.offsetHeight, 0.9);
      art.style.setProperty('--art-scale', Math.max(scale, 0.25).toFixed(3));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(art);
    return () => ro.disconnect();
  }, []);
  return ref;
}

function PasswordField({ label, value, onChange, placeholder, autoComplete }) {
  const { t } = useI18n();
  const [show, setShow] = useState(false);
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <Lock />
        <input
          className="input"
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          style={{ paddingRight: 48 }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-icon input-action"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? t('auth.hidePassword') : t('auth.showPassword')}
        >
          {show ? <EyeOff /> : <Eye />}
        </button>
      </div>
    </label>
  );
}

// Countdown before another code can be requested.
function useCooldown() {
  const [until, setUntil] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (until <= Date.now()) return;
    const id = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, [until]);
  const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
  return [left, (seconds = RESEND_SECONDS) => setUntil(Date.now() + seconds * 1000)];
}

export default function Auth({ mode }) {
  const signup = mode === 'signup';
  const adminLogin = mode === 'adminLogin';
  const adminSetup = mode === 'adminSetup';
  const { user, setUser } = useAuth();
  const { t, tr, lang } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const artRef = useFitArt();

  // step: 'form' → 'code' (sign-up / sign-in), or 'forgot' → 'reset'
  const [step, setStep] = useState('form');
  const [form, setForm] = useState({ email: '', password: '', firstName: '', lastName: '' });
  const [key, setKey] = useState('');
  const [generatedKey, setGeneratedKey] = useState('');
  const [customerCode, setCustomerCode] = useState(null);
  const [bootstrapAvailable, setBootstrapAvailable] = useState(false);
  const [challenge, setChallenge] = useState(null); // { challenge, purpose, email }
  const [code, setCode] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [cooldown, startCooldown] = useCooldown();

  useEffect(() => {
    if (!adminLogin) return;
    api('/auth/admin/bootstrap-status')
      .then((res) => setBootstrapAvailable(res.available))
      .catch((err) => setError(err.message));
  }, [adminLogin]);

  const home = (u) => (u.isAdmin ? '/admin' : '/dashboard');
  const returnTo = (u) => {
    const from = location.state?.from;
    const path = from?.pathname;
    if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return home(u);
    const isAdminPath = path === '/admin' || path.startsWith('/admin/');
    if (isAdminPath !== Boolean(u.isAdmin)) return home(u);
    return { pathname: path, search: from.search || '', hash: from.hash || '' };
  };
  if (user) return <Navigate to={returnTo(user)} replace />;
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  function go(nextStep) {
    setError('');
    setCode('');
    setStep(nextStep);
  }

  function signedIn(u, { firstTime } = {}) {
    setUser(u);
    if (firstTime) toast(t('auth.welcomeNew', { name: u.firstName }), { body: t('auth.welcomeNewBody') });
    else toast(u.firstName ? t('auth.welcomeBackName', { name: u.firstName }) : t('auth.welcomeBack'));
    navigate(returnTo(u), { replace: true });
  }

  async function copyGeneratedKey() {
    try {
      await navigator.clipboard.writeText(generatedKey);
      toast(t('auth.keyCopied'));
    } catch {
      setError(t('auth.copyFailed'));
    }
  }

  async function generateKey() {
    setError('');
    setBusy(true);
    try {
      const res = await api('/auth/register', { method: 'POST', body: {} });
      setGeneratedKey(res.accessKey);
      setCustomerCode(res.user.customerCode);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitForm(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (adminSetup) {
        if (!form.firstName.trim() || !form.lastName.trim()) return setError(t('auth.errNames'));
        if (!form.email.trim()) return setError(t('auth.errEmail'));
        if (form.password.length < 8) return setError(t('auth.errPassword'));
        if (form.password !== passwordConfirm) return setError(t('auth.errMismatch'));
        const res = await api('/auth/admin/bootstrap', {
          method: 'POST',
          body: { firstName: form.firstName, lastName: form.lastName, email: form.email, password: form.password, passwordConfirm, lang },
        });
        setChallenge(res);
        startCooldown();
        go('code');
      } else if (adminLogin) {
        if (!form.email.trim()) return setError(t('auth.errEmail'));
        const res = await api('/auth/admin/login', {
          method: 'POST',
          body: { email: form.email, password: form.password, lang },
        });
        setChallenge(res);
        startCooldown();
        go('code');
      } else {
        if (!key.trim()) return setError(t('auth.errKey'));
        const res = await api('/auth/login', { method: 'POST', body: { key } });
        signedIn(res.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Step 2: the emailed code
  async function submitCode(value = code) {
    setError('');
    if (value.length !== 6) return setError(t('auth.errCode'));
    setBusy(true);
    try {
      const res = await api('/auth/otp', { method: 'POST', body: { challenge: challenge.challenge, code: value } });
      if (res.requiresSignIn) {
        toast(t('auth.verified'));
        go('form');
        setBusy(false);
        navigate('/admin/login', { replace: true });
        return;
      }
      if (res.firstTime) toast(t('auth.verified'));
      signedIn(res.user, { firstTime: res.firstTime });
    } catch (err) {
      setError(err.message);
      setCode('');
      setBusy(false);
    }
  }

  async function resend() {
    setError('');
    try {
      await api('/auth/resend', { method: 'POST', body: { challenge: challenge.challenge, lang } });
      startCooldown();
      toast(t('auth.resent'), { body: t('auth.resentBody') });
    } catch (err) {
      if (err.code === 'resend_wait') startCooldown(Number(err.params?.seconds) || RESEND_SECONDS);
      setError(err.message);
    }
  }

  // Forgot password: email → code + new password
  async function submitForgot(e) {
    e.preventDefault();
    setError('');
    if (!form.email.trim()) return setError(t('auth.errEmail'));
    setBusy(true);
    try {
      setChallenge(await api('/auth/forgot', { method: 'POST', body: { email: form.email, lang } }));
      startCooldown();
      go('reset');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitReset(e) {
    e.preventDefault();
    setError('');
    if (code.length !== 6) return setError(t('auth.errCode'));
    if (newPassword.length < 8) return setError(t('auth.errPassword'));
    if (newPassword !== newPasswordConfirm) return setError(t('auth.errMismatch'));
    setBusy(true);
    try {
      const res = await api('/auth/reset', {
        method: 'POST',
        body: { challenge: challenge.challenge, code, password: newPassword, passwordConfirm: newPasswordConfirm },
      });
      setUser(res.user);
      toast(t('auth.resetDone'), { body: t('auth.resetDoneBody') });
      navigate(returnTo(res.user), { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const resendButton = (
    <p className="center small muted">
      {t('auth.noCode')}{' '}
      <button type="button" className="link-btn" onClick={resend} disabled={cooldown > 0}>
        {cooldown > 0 ? t('auth.resendIn', { s: cooldown }) : t('auth.resend')}
      </button>
    </p>
  );

  let content;
  if (step === 'code') {
    content = (
      <>
        <div className="step-icon">
          <MailCheck />
        </div>
        <div>
          <h1>{t(`auth.codeTitle.${challenge.purpose}`)}</h1>
          <p className="sub">{tr('auth.codeSub', { email: challenge.email })}</p>
        </div>
        <form
          className="stack gap-16"
          onSubmit={(e) => {
            e.preventDefault();
            submitCode();
          }}
        >
          <OtpInput value={code} onChange={setCode} onComplete={submitCode} disabled={busy} label={t('auth.codeLabel')} />
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" block loading={busy}>
            {challenge.purpose === 'verify' ? t('auth.verifyButton') : t('auth.signIn')}
            {!busy && <ArrowRight />}
          </Button>
        </form>
        {resendButton}
        <p className="center tiny muted">{t('auth.spamHint')}</p>
        <button type="button" className="link-btn center-link" onClick={() => go('form')}>
          <ArrowLeft size={15} /> {t('auth.differentEmail')}
        </button>
      </>
    );
  } else if (step === 'forgot') {
    content = (
      <>
        <div className="step-icon">
          <KeyRound />
        </div>
        <div>
          <h1>{t('auth.forgotTitle')}</h1>
          <p className="sub">{t('auth.forgotSub')}</p>
        </div>
        <form className="stack gap-16" onSubmit={submitForgot} noValidate>
          <label className="field">
            <span>{t('auth.email')}</span>
            <div className="input-wrap">
              <Mail />
              <input
                className="input"
                type="email"
                autoComplete="email"
                placeholder={t('auth.emailPh')}
                value={form.email}
                onChange={set('email')}
                autoFocus
              />
            </div>
          </label>
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" block loading={busy}>
            {t('auth.sendCode')}
            {!busy && <ArrowRight />}
          </Button>
        </form>
        <button type="button" className="link-btn center-link" onClick={() => go('form')}>
          <ArrowLeft size={15} /> {t('auth.backToSignIn')}
        </button>
      </>
    );
  } else if (step === 'reset') {
    content = (
      <>
        <div className="step-icon">
          <KeyRound />
        </div>
        <div>
          <h1>{t('auth.codeTitle.reset')}</h1>
          <p className="sub">{tr('auth.resetSub', { email: challenge.email })}</p>
        </div>
        <form className="stack gap-16" onSubmit={submitReset} noValidate>
          <div className="field">
            <span>{t('auth.codeLabel')}</span>
            <OtpInput value={code} onChange={setCode} disabled={busy} label={t('auth.codeLabel')} />
          </div>
          <PasswordField
            label={t('auth.newPassword')}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder={t('auth.passwordNewPh')}
            autoComplete="new-password"
          />
          <PasswordField
            label={t('auth.confirmPassword')}
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
            placeholder={t('auth.confirmPasswordPh')}
            autoComplete="new-password"
          />
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" block loading={busy}>
            {t('auth.resetButton')}
            {!busy && <ArrowRight />}
          </Button>
        </form>
        {resendButton}
        <button type="button" className="link-btn center-link" onClick={() => go('form')}>
          <ArrowLeft size={15} /> {t('auth.backToSignIn')}
        </button>
      </>
    );
  } else if (signup) {
    content = (
      <>
        <div>
          <h1>{t('auth.signupTitle')}</h1>
          <p className="sub">{t('auth.signupSub')}</p>
        </div>
        {generatedKey ? (
          <div className="stack gap-16">
            <p className="muted">{t('auth.keyCreatedHint')}</p>
            <div className="field">
              <span>{t('auth.accessKey')}</span>
              <div className="key-view">
                <input className="mono" value={generatedKey} readOnly onFocus={(e) => e.target.select()} aria-label={t('auth.accessKey')} />
                <button
                  type="button"
                  className="btn btn-ghost btn-icon"
                  onClick={copyGeneratedKey}
                  title={t('auth.copyKey')}
                  aria-label={t('auth.copyKey')}
                >
                  <Copy />
                </button>
              </div>
            </div>
            {customerCode && (
              <div className="code-note">
                <p>{tr('auth.customerCode', { code: customerCode })}</p>
                <p className="tiny muted">{t('auth.customerCodeHint')}</p>
              </div>
            )}
            <Link to="/login" className="btn btn-block">
              {t('auth.signInWithKey')} <ArrowRight />
            </Link>
          </div>
        ) : (
          <div className="stack gap-16">
            <p className="muted">{t('auth.keySignupHint')}</p>
            <FormError>{error}</FormError>
            <Button type="button" size="lg" block loading={busy} onClick={generateKey}>
              {t('auth.generateKey')} {!busy && <ArrowRight />}
            </Button>
          </div>
        )}
        {generatedKey && <FormError>{error}</FormError>}
        <p className="center muted">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="link-btn">
            {t('auth.signIn')}
          </Link>
        </p>
      </>
    );
  } else if (adminSetup) {
    content = (
      <>
        <div>
          <h1>{t('auth.bootstrapTitle')}</h1>
          <p className="sub">{t('auth.bootstrapSub')}</p>
        </div>
        <form className="stack gap-16" onSubmit={submitForm} noValidate>
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
            <span>{t('auth.email')}</span>
            <div className="input-wrap">
              <Mail />
              <input
                className="input"
                type="email"
                autoComplete="email"
                placeholder={t('auth.emailPh')}
                value={form.email}
                onChange={set('email')}
              />
            </div>
          </label>
          <PasswordField
            label={t('auth.password')}
            value={form.password}
            onChange={set('password')}
            placeholder={t('auth.passwordNewPh')}
            autoComplete="new-password"
          />
          <PasswordField
            label={t('auth.confirmPassword')}
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder={t('auth.confirmPasswordPh')}
            autoComplete="new-password"
          />
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" block loading={busy}>
            {t('auth.bootstrapButton')} {!busy && <ArrowRight />}
          </Button>
        </form>
        <p className="center muted">
          <Link to="/admin/login" className="link-btn">{t('auth.backToSignIn')}</Link>
        </p>
      </>
    );
  } else {
    content = (
      <>
        <div>
          <h1>{adminLogin ? t('auth.adminLoginTitle') : t('auth.loginTitle')}</h1>
          <p className="sub">{adminLogin ? t('auth.adminLoginSub') : t('auth.loginSub')}</p>
        </div>

        <form className="stack gap-16" onSubmit={submitForm} noValidate>
          {adminLogin ? (
            <>
              <label className="field">
                <span>{t('auth.email')}</span>
                <div className="input-wrap">
                  <Mail />
                  <input
                    className="input"
                    type="email"
                    autoComplete="username"
                    placeholder={t('auth.emailPh')}
                    value={form.email}
                    onChange={set('email')}
                  />
                </div>
              </label>
              <PasswordField
                label={t('auth.password')}
                value={form.password}
                onChange={set('password')}
                placeholder={t('auth.passwordPh')}
                autoComplete="current-password"
              />
              <button type="button" className="link-btn forgot-link" onClick={() => go('forgot')}>
                {t('auth.forgotLink')}
              </button>
            </>
          ) : (
            <label className="field">
              <span>{t('auth.accessKey')}</span>
              <div className="input-wrap">
                <KeyRound />
                <input
                  className="input"
                  autoComplete="current-password"
                  placeholder={t('auth.accessKeyPh')}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                />
              </div>
            </label>
          )}

          <FormError>{error}</FormError>

          <Button type="submit" size="lg" block loading={busy}>
            {adminLogin ? t('auth.continue') : t('auth.signIn')}
            {!busy && <ArrowRight />}
          </Button>
        </form>

        <p className="center muted">
          {adminLogin ? t('auth.customerSignInPrompt') : t('auth.newHere')}{' '}
          <Link to={adminLogin ? '/login' : '/signup'} className="link-btn">
            {adminLogin ? t('auth.customerSignIn') : t('auth.createLink')}
          </Link>
        </p>
        {adminLogin && bootstrapAvailable && (
          <p className="center tiny muted">
            {t('auth.bootstrapPrompt')}{' '}
            <Link to="/admin/setup" className="link-btn">
              {t('auth.bootstrapLink')}
            </Link>
          </p>
        )}
        {!adminLogin && <p className="center tiny muted">{t('auth.keyLostHelp')}</p>}
      </>
    );
  }

  return (
    <div className="auth">
      <aside className="auth-aside">
        <div className="grid-bg" />
        <Logo />
        <div className="auth-art" ref={artRef}>
          <PhoneMockup compact />
        </div>
        <div className="auth-copy">
          <h2>{signup ? t('auth.asideSignup') : t('auth.asideLogin')}</h2>
          <ul className="auth-perks">
            {t('auth.perks').map((text, i) => {
              const Icon = PERK_ICONS[i];
              return (
                <li key={text}>
                  <Icon />
                  {text}
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <main className="auth-main">
        <div className="auth-top">
          <SupportButton />
          <LangSwitch />
        </div>
        <div className="auth-box">{content}</div>
        {/* Discreet way in for admins: just a shield icon in the bottom-right corner */}
        {!adminLogin && !adminSetup && (
          <Link
            to="/admin/login"
            className="admin-corner"
            aria-label={t('auth.adminSignIn')}
            title={t('auth.adminSignIn')}
          >
            <ShieldCheck />
          </Link>
        )}
      </main>
    </div>
  );
}
