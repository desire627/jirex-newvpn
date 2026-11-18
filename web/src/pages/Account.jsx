import {
  AlertTriangle,
  CalendarDays,
  Copy,
  Eye,
  EyeOff,
  Hash,
  KeyRound,
  LifeBuoy,
  Lock,
  LogOut,
  Mail,
  MailCheck,
  Save,
  ShieldCheck,
  Trash2,
  User,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, daysUntil, formatDate } from '../api.js';
import { useSupport } from '../components/Support.jsx';
import { useAuth } from '../App.jsx';
import OtpInput from '../components/OtpInput.jsx';
import { useI18n } from '../i18n/index.jsx';
import { Avatar, Button, FormError, Modal, useConfirm, useToast } from '../ui.jsx';

// ---------------------------------------------------------------- shared bits
function PasswordInput({ label, value, onChange, autoComplete = 'current-password' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input className="input" type="password" autoComplete={autoComplete} value={value} onChange={onChange} />
    </label>
  );
}

// ---------------------------------------------------------------- header
function ProfileHero() {
  const { user } = useAuth();
  const { t } = useI18n();
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const days = daysUntil(user.accessUntil);
  return (
    <div className="card profile-hero">
      <Avatar large email={user.email || String(user.id)} first={user.firstName} last={user.lastName} />
      <div className="profile-hero-main">
        <h2 className="truncate">{name || (user.isAdmin ? user.email : t('profile.anonymous'))}</h2>
        <div className="row wrap gap-8">
          {user.isAdmin ? (
            <span className="badge blue">
              <ShieldCheck /> {t('profile.roleAdmin')}
            </span>
          ) : (
            <span className="badge">
              <User /> {t('profile.roleCustomer')}
            </span>
          )}
          {user.loginType === 'key' && (
            <span className="badge">
              <KeyRound /> {t('profile.keyAccountBadge')}
            </span>
          )}
          {!user.isAdmin &&
            (user.active ? (
              <span className={`badge ${days <= 2 ? 'warn' : 'ok'}`}>
                <span className="dot ok" /> {t('profile.planActive', { date: formatDate(user.accessUntil) })}
              </span>
            ) : (
              <span className="badge warn">{t('profile.planInactive')}</span>
            ))}
        </div>
        <div className="profile-meta">
          {user.isAdmin && user.email && (
            <span>
              <Mail /> {user.email}
            </span>
          )}
          {!user.isAdmin && user.customerCode && (
            <span title={t('auth.customerCodeHint')}>
              <Hash /> {t('auth.customerCodeLabel')}: <strong className="mono">{user.customerCode}</strong>
            </span>
          )}
          {user.createdAt && (
            <span>
              <CalendarDays /> {t('profile.memberSince', { date: formatDate(user.createdAt) })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <h4 className="profile-section">{children}</h4>;
}

// ---------------------------------------------------------------- access key (customers)
// The key can be viewed any time; a new one is only issued by an admin.
function KeyCard() {
  const { t } = useI18n();
  const toast = useToast();
  const openSupport = useSupport();
  const [key, setKey] = useState(undefined); // undefined: loading · null: can't be shown
  const [shown, setShown] = useState(false);

  useEffect(() => {
    api('/account/key')
      .then((d) => setKey(d.accessKey || null))
      .catch(() => setKey(null));
  }, []);

  return (
    <div className="card card-pad stack gap-16 key-card">
      <div className="row gap-12">
        <span className="icon-tile">
          <KeyRound />
        </span>
        <div>
          <h3>{t('profile.keyTitle')}</h3>
          <p className="muted small">{t('profile.keySub')}</p>
        </div>
      </div>
      {key === undefined ? (
        <div className="skeleton" style={{ height: 50 }} />
      ) : key ? (
        <>
          <div className="key-view">
            <code className="mono" data-testid="access-key">
              {shown ? key : key.replace(/[0-9a-f]/gi, '•')}
            </code>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setShown((v) => !v)}
              title={shown ? t('profile.hideKey') : t('profile.showKey')}
              aria-label={shown ? t('profile.hideKey') : t('profile.showKey')}
            >
              {shown ? <EyeOff /> : <Eye />}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => navigator.clipboard.writeText(key).then(() => toast(t('common.copied')))}
              title={t('common.copy')}
              aria-label={t('common.copy')}
            >
              <Copy />
            </button>
          </div>
          <div className="callout info">
            <LifeBuoy />
            <span>
              {t('profile.keyWarning')}{' '}
              <button type="button" className="link-btn" onClick={openSupport}>
                {t('profile.contactSupport')}
              </button>
            </span>
          </div>
        </>
      ) : (
        <div className="callout">
          <AlertTriangle />
          <div className="stack gap-8">
            <span>{t('profile.keyMissing')}</span>
            <div>
              <Button size="sm" variant="secondary" icon={LifeBuoy} onClick={openSupport}>
                {t('profile.contactSupport')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- name (everyone)
function NameCard() {
  const { user, setUser } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const [first, setFirst] = useState(user.firstName || '');
  const [last, setLast] = useState(user.lastName || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = first !== (user.firstName || '') || last !== (user.lastName || '');

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/account/profile', { method: 'PATCH', body: { firstName: first, lastName: last } });
      setUser(res.user);
      toast(t('profile.saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card card-pad stack gap-16" onSubmit={save}>
      <div className="row gap-12">
        <span className="icon-tile">
          <User />
        </span>
        <div>
          <h3>{t('profile.nameTitle')}</h3>
          <p className="muted small">{user.isAdmin ? t('profile.nameSubAdmin') : t('profile.nameSubCustomer')}</p>
        </div>
      </div>
      <div className="name-row">
        <label className="field">
          <span>
            {t('auth.firstName')} {!user.isAdmin && <span className="hint">· {t('transfer.optional')}</span>}
          </span>
          <input className="input" maxLength={50} value={first} onChange={(e) => setFirst(e.target.value)} />
        </label>
        <label className="field">
          <span>
            {t('auth.lastName')} {!user.isAdmin && <span className="hint">· {t('transfer.optional')}</span>}
          </span>
          <input className="input" maxLength={50} value={last} onChange={(e) => setLast(e.target.value)} />
        </label>
      </div>
      <FormError>{error}</FormError>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button type="submit" icon={Save} loading={busy} disabled={!changed}>
          {t('profile.saveChanges')}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- email (admins)
function EmailModal({ onClose }) {
  const { setUser } = useAuth();
  const { t, tr, lang } = useI18n();
  const toast = useToast();
  const [step, setStep] = useState('form');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setChallenge(await api('/account/email', { method: 'POST', body: { newEmail, password, lang } }));
      setStep('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(value = code) {
    if (value.length !== 6) return setError(t('auth.errCode'));
    setBusy(true);
    setError('');
    try {
      const res = await api('/account/email/confirm', { method: 'POST', body: { challenge: challenge.challenge, code: value } });
      setUser(res.user);
      toast(t('profile.emailChanged'), { body: res.user.email });
      onClose();
    } catch (err) {
      setError(err.message);
      setCode('');
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t('profile.changeEmail')}
      description={step === 'form' ? t('profile.changeEmailDesc') : undefined}
      icon={
        <span className="icon-tile">
          {step === 'form' ? <Mail /> : <MailCheck />}
        </span>
      }
      onClose={onClose}
    >
      {step === 'form' ? (
        <form className="stack gap-16" onSubmit={start}>
          <label className="field">
            <span>{t('profile.newEmail')}</span>
            <input
              className="input"
              type="email"
              autoComplete="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </label>
          <PasswordInput label={t('profile.currentPassword')} value={password} onChange={(e) => setPassword(e.target.value)} />
          <FormError>{error}</FormError>
          <div className="row gap-8 wrap" style={{ justifyContent: 'flex-end' }}>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" loading={busy} disabled={!newEmail || !password}>
              {t('auth.sendCode')}
            </Button>
          </div>
        </form>
      ) : (
        <form
          className="stack gap-16"
          onSubmit={(e) => {
            e.preventDefault();
            confirm();
          }}
        >
          <p className="muted">{tr('auth.codeSub', { email: challenge.email })}</p>
          <OtpInput value={code} onChange={setCode} onComplete={confirm} disabled={busy} label={t('auth.codeLabel')} />
          <FormError>{error}</FormError>
          <Button type="submit" block loading={busy}>
            {t('profile.confirmEmail')}
          </Button>
        </form>
      )}
    </Modal>
  );
}

function EmailCard() {
  const { user } = useAuth();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <div className="card card-pad stack gap-16">
      <div className="row gap-12">
        <span className="icon-tile">
          <Mail />
        </span>
        <div>
          <h3>{t('profile.emailTitle')}</h3>
          <p className="muted small">{t('profile.emailSub')}</p>
        </div>
      </div>
      <div className="account-facts">
        <div>
          <Mail />
          <span>
            <span className="muted small">{t('account.email')}</span>
            <strong>{user.email}</strong>
          </span>
          <span className="badge ok">
            <ShieldCheck /> {t('account.verified')}
          </span>
        </div>
      </div>
      <div>
        <Button variant="secondary" icon={Mail} onClick={() => setOpen(true)}>
          {t('profile.changeEmail')}
        </Button>
      </div>
      {open && <EmailModal onClose={() => setOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- password (admins)
function PasswordCard() {
  const { t } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', newPasswordConfirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setError('');
    if (form.newPassword.length < 8) return setError(t('auth.errPassword'));
    if (form.newPassword !== form.newPasswordConfirm) return setError(t('auth.errMismatch'));
    setBusy(true);
    try {
      await api('/account/password', { method: 'POST', body: form });
      setForm({ currentPassword: '', newPassword: '', newPasswordConfirm: '' });
      toast(t('profile.passwordChanged'), { body: t('profile.passwordChangedBody') });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card card-pad stack gap-16" onSubmit={save}>
      <div className="row gap-12">
        <span className="icon-tile">
          <Lock />
        </span>
        <div>
          <h3>{t('profile.passwordTitle')}</h3>
          <p className="muted small">{t('profile.passwordSub')}</p>
        </div>
      </div>
      <PasswordInput label={t('profile.currentPassword')} value={form.currentPassword} onChange={set('currentPassword')} />
      <div className="name-row">
        <PasswordInput
          label={t('auth.newPassword')}
          value={form.newPassword}
          onChange={set('newPassword')}
          autoComplete="new-password"
        />
        <PasswordInput
          label={t('auth.confirmPassword')}
          value={form.newPasswordConfirm}
          onChange={set('newPasswordConfirm')}
          autoComplete="new-password"
        />
      </div>
      <FormError>{error}</FormError>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <Button type="submit" icon={Save} loading={busy} disabled={!form.currentPassword || !form.newPassword}>
          {t('profile.changePassword')}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- delete (customers)
export function DeleteModal({ onClose }) {
  const { t } = useI18n();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [credential, setCredential] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const word = t('account.deleteWord');

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/account/delete', {
        method: 'POST',
        body: user.loginType === 'key' ? { key: credential } : { password: credential },
      });
      setUser(null);
      toast(t('account.deleted'), { type: 'info', body: t('account.deletedBody') });
      navigate('/');
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={t('account.deleteTitle')}
      description={t('account.deleteDesc')}
      icon={
        <span className="icon-tile danger">
          <AlertTriangle />
        </span>
      }
      onClose={onClose}
    >
      <form className="stack gap-16" onSubmit={submit}>
        <ul className="delete-list">
          {t('account.deleteWhat').map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <label className="field">
          <span>{t('account.typeToConfirm', { word })}</span>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
        <label className="field">
          <span>{user.loginType === 'key' ? t('auth.accessKey') : t('account.password')}</span>
          <input
            className="input"
            type="password"
            autoComplete={user.loginType === 'key' ? 'off' : 'current-password'}
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
          />
        </label>
        <FormError>{error}</FormError>
        <div className="row gap-8 wrap" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="danger-solid"
            icon={Trash2}
            loading={busy}
            disabled={typed.trim().toUpperCase() !== word.toUpperCase() || !credential}
          >
            {t('account.deleteForever')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- sign out everywhere
function SessionsCard() {
  const { signOut } = useAuth();
  const { t } = useI18n();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function everywhere() {
    const ok = await confirm({
      title: t('profile.signOutAllTitle'),
      body: t('profile.signOutAllBody'),
      confirmLabel: t('profile.signOutAll'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    if (!(await signOut({ everywhere: true }))) setBusy(false);
  }

  return (
    <div className="card card-pad stack gap-12">
      <div className="row gap-12">
        <span className="icon-tile">
          <LogOut />
        </span>
        <div>
          <h3>{t('profile.sessionsTitle')}</h3>
          <p className="muted small">{t('profile.sessionsSub')}</p>
        </div>
      </div>
      <div>
        <Button variant="secondary" icon={LogOut} loading={busy} onClick={everywhere}>
          {t('profile.signOutAll')}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- pages
// Shown as the "My profile" tab of the admin panel.
export function AdminProfile() {
  const { t } = useI18n();
  return (
    <div className="stack gap-16 account">
      <ProfileHero />
      <SectionLabel>{t('profile.secDetails')}</SectionLabel>
      <NameCard />
      <EmailCard />
      <SectionLabel>{t('profile.secSecurity')}</SectionLabel>
      <PasswordCard />
      <SessionsCard />
    </div>
  );
}

export default function Account() {
  const { t } = useI18n();
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="profile-page">
      <div className="page-head">
        <div>
          <h1>{t('profile.title')}</h1>
          <p>{t('profile.subCustomer')}</p>
        </div>
      </div>

      <div className="stack gap-16 account">
        <ProfileHero />
        <SectionLabel>{t('profile.secSecurity')}</SectionLabel>
        <KeyCard />
        <SessionsCard />
        <SectionLabel>{t('profile.secDetails')}</SectionLabel>
        <NameCard />
        <div className="card card-pad danger-zone">
          <div className="row gap-12 wrap">
            <span className="icon-tile danger">
              <Trash2 />
            </span>
            <div className="grow">
              <h3>{t('account.deleteTitle')}</h3>
              <p className="muted small">
                {t('account.deleteText')}{' '}
                <Link to="/privacy" className="link-btn">
                  {t('account.privacyLink')}
                </Link>
              </p>
            </div>
            <Button variant="danger" icon={Trash2} onClick={() => setDeleting(true)}>
              {t('account.deleteButton')}
            </Button>
          </div>
        </div>
      </div>

      {deleting && <DeleteModal onClose={() => setDeleting(false)} />}
    </div>
  );
}
