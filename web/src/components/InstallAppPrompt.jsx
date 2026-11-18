import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';

const INSTALL_STATE_KEY = 'jirex:pwa-install-state';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function getInstallState() {
  if (isStandalone()) return 'installed';
  try {
    const state = localStorage.getItem(INSTALL_STATE_KEY);
    return state === 'installed' || state === 'dismissed' ? state : 'available';
  } catch (error) {
    console.error('[pwa] could not read install state:', error);
    return 'available';
  }
}

function saveInstallState(state) {
  try {
    localStorage.setItem(INSTALL_STATE_KEY, state);
  } catch (error) {
    console.error('[pwa] could not save install state:', error);
  }
}

function isAppleMobile() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function InstallAppPrompt() {
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installState, setInstallState] = useState(getInstallState);
  const [appleMobile] = useState(isAppleMobile);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const onAppInstalled = () => {
      setInstallState('installed');
      saveInstallState('installed');
      setDeferredPrompt(null);
    };
    const onStorage = (event) => {
      if (event.key !== INSTALL_STATE_KEY) return;
      setInstallState(event.newValue === 'installed' || event.newValue === 'dismissed' ? event.newValue : 'available');
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  if (installState !== 'available' || (!deferredPrompt && !appleMobile)) return null;

  async function install() {
    if (!deferredPrompt) {
      setShowInstructions(true);
      return;
    }

    const prompt = deferredPrompt;
    setDeferredPrompt(null);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstallState('installed');
        saveInstallState('installed');
      } else {
        setShowInstructions(true);
      }
    } catch (error) {
      console.error('[pwa] install prompt failed:', error);
      setShowInstructions(true);
    }
  }

  const instructions = appleMobile ? t('common.installIosHelp') : t('common.installBrowserHelp');

  return (
    <aside className="pwa-install" aria-label={t('common.installTitle')} aria-live="polite">
      <div className="pwa-install-copy">
        <strong>{t('common.installTitle')}</strong>
        <p>{showInstructions ? instructions : t('common.installDescription')}</p>
      </div>
      <div className="pwa-install-actions">
        <button type="button" className="btn btn-sm" onClick={install}>
          <Download />
          {t('common.installAction')}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          aria-label={t('common.close')}
          onClick={() => {
            setInstallState('dismissed');
            saveInstallState('dismissed');
          }}
        >
          <X />
        </button>
      </div>
    </aside>
  );
}
