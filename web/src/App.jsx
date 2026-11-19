import { ChevronDown, CreditCard, Loader2, LogOut, UserRound } from 'lucide-react';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { api } from './api.js';
import { registerApprovedBrowser } from './browserDevice.js';
import { SupportButton } from './components/Support.jsx';
import { LangSwitch, useI18n } from './i18n/index.jsx';
import Account from './pages/Account.jsx';
import Admin from './pages/Admin.jsx';
import Auth from './pages/Auth.jsx';
import Billing from './pages/Billing.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Home from './pages/Home.jsx';
import Privacy from './pages/Privacy.jsx';
import { Avatar, Logo, useConfirm, useToast } from './ui.jsx';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

function FullPageSpinner() {
  return (
    <div className="result">
      <Loader2 className="spin" size={28} color="var(--muted)" />
    </div>
  );
}

// Customer account dropdown: profile, billing and sign-out.
function AccountMenu({ onSignOut, busy }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || t('auth.keyAccount');

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className={`account-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('common.accountMenu')}
      >
        <span className="email truncate">{name}</span>
        <Avatar email={String(user.id)} first={user.firstName} last={user.lastName} />
        <ChevronDown className="chev" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong className="truncate">{name}</strong>
            <span className="muted small">
              {t('auth.customerCodeLabel')}: <span className="mono">{user.customerCode}</span>
            </span>
          </div>
          <Link role="menuitem" to="/account" className="menu-item">
            <UserRound /> {t('common.viewProfile')}
          </Link>
          <Link role="menuitem" to="/billing" className="menu-item">
            <CreditCard /> {t('common.billing')}
          </Link>
          <div className="menu-sep" />
          <button
            role="menuitem"
            type="button"
            className="menu-item"
            onClick={onSignOut}
            disabled={busy}
          >
            <LogOut /> {t('common.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

function AppShell({ children }) {
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);

  const confirm = useConfirm();

  // Ask first, so nobody gets signed out by a stray click.
  async function logout() {
    const ok = await confirm({
      title: t('common.signOutConfirmTitle'),
      body: user.loginType === 'key' ? t('common.signOutConfirmKey') : t('common.signOutConfirmEmail'),
      confirmLabel: t('common.signOut'),
    });
    if (!ok) return;
    setBusy(true);
    await signOut();
    setBusy(false);
  }

  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Logo to={user.isAdmin ? '/admin' : '/dashboard'} />
          <div className="user-chip">
            <SupportButton />
            <LangSwitch />
            {user.isAdmin ? (
              <>
                <span className="email truncate" title={user.email}>
                  {[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}
                </span>
                <Avatar email={user.email || String(user.id)} first={user.firstName} last={user.lastName} />
                <button
                  className="btn btn-ghost btn-icon"
                  onClick={logout}
                  disabled={busy}
                  title={t('common.signOut')}
                  aria-label={t('common.signOut')}
                >
                  <LogOut />
                </button>
              </>
            ) : (
              <AccountMenu onSignOut={logout} busy={busy} />
            )}
          </div>
        </div>
      </header>
      <main className="app-main">
        <div className="container">{children}</div>
      </main>
    </>
  );
}

// admin: admins only · default: customers only (admins are sent to adminTo)
function Protected({ children, admin, adminTo = '/admin' }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to={admin ? '/admin/login' : '/login'} state={{ from: location }} replace />;
  if (admin && !user.isAdmin) return <Navigate to="/dashboard" replace />;
  if (!admin && user.isAdmin) return <Navigate to={adminTo} replace />;
  return <AppShell>{children}</AppShell>;
}

// Other open tabs hear about a sign-out through this localStorage key.
const SIGNOUT_KEY = 'jirex-signed-out';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();
  const userRef = useRef(null);
  userRef.current = user;

  // Signs out on the server first; only if that worked is the browser treated as signed out.
  // everywhere: true signs out every device of the account.
  const signOut = useCallback(
    async ({ everywhere = false } = {}) => {
      const wasAdmin = userRef.current?.isAdmin;
      try {
        await api(everywhere ? '/auth/logout-all' : '/auth/logout', { method: 'POST' });
      } catch (err) {
        toast(t('common.signOutFailed'), { type: 'error', body: err.message });
        return false;
      }
      try {
        localStorage.setItem(SIGNOUT_KEY, String(Date.now()));
      } catch {}
      setUser(null);
      toast(everywhere ? t('common.signedOutEverywhere') : t('common.signedOut'), { type: 'info' });
      navigate(wasAdmin ? '/admin/login' : '/login', { replace: true });
      return true;
    },
    [navigate, toast, t],
  );

  useEffect(() => {
    // Signed out in another tab → sign out here too.
    const onStorage = (e) => {
      if (e.key === SIGNOUT_KEY && userRef.current) {
        const wasAdmin = userRef.current.isAdmin;
        setUser(null);
        navigate(wasAdmin ? '/admin/login' : '/login', { replace: true });
      }
    };
    // The server said this session is no longer valid (signed out elsewhere, expired…).
    const onExpired = () => {
      if (!userRef.current) return;
      const wasAdmin = userRef.current.isAdmin;
      setUser(null);
      toast(t('common.sessionEnded'), { type: 'info', body: t('common.sessionEndedBody') });
      navigate(wasAdmin ? '/admin/login' : '/login', { replace: true });
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('jirex:session-ended', onExpired);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('jirex:session-ended', onExpired);
    };
  }, [navigate, toast, t]);

  const refreshUser = useCallback(() =>
    api('/auth/me')
      .then((d) => {
        setUser(d.user);
        return d.user;
      })
      .catch(() => {
        setUser(null);
        return null;
      }), []);

  useEffect(() => {
    refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const customerId = user && !user.isAdmin ? user.id : null;
  useEffect(() => {
    if (!customerId || navigator.userAgent.includes('JirexAndroid/')) return;
    let disposed = false;
    let checking = false;
    let observed;
    const stillCurrent = () => !disposed && userRef.current?.id === customerId;

    async function checkApproval() {
      if (checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const state = await api('/billing/activation');
        if (!stillCurrent() || state.userId !== customerId) return;
        const activationChanged = observed !== undefined
          && (observed.approval !== state.approval || observed.active !== state.active);
        observed = state;
        if (activationChanged || userRef.current.active !== state.active) {
          window.dispatchEvent(new Event('jirex:browser-account-updated'));
          refreshUser();
        }
        if (!state.active || !state.approval) return;
        const id = await registerApprovedBrowser(customerId, stillCurrent);
        if (id && stillCurrent()) window.dispatchEvent(new Event('jirex:browser-account-updated'));
      } catch {
        // A manual setup is still available if the browser cannot store an installation ID.
      } finally {
        checking = false;
      }
    }

    checkApproval();
    const timer = window.setInterval(checkApproval, 15_000);
    document.addEventListener('visibilitychange', checkApproval);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkApproval);
    };
  }, [customerId, refreshUser]);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, refreshUser, signOut }}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/signup" element={<Auth mode="signup" />} />
        <Route path="/admin/login" element={<Auth mode="adminLogin" />} />
        <Route path="/admin/setup" element={<Auth mode="adminSetup" />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route
          path="/account"
          element={
            <Protected adminTo="/admin?tab=profile">
              <Account />
            </Protected>
          }
        />
        <Route
          path="/billing"
          element={
            <Protected>
              <Billing />
            </Protected>
          }
        />
        <Route
          path="/dashboard"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/admin"
          element={
            <Protected admin>
              <Admin />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthContext.Provider>
  );
}
