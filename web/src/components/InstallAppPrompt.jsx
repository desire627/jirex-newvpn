import { Download, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.jsx';

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function isAppleMobile() {
  return /iPad|iPhone|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export default function InstallAppPrompt() {
  const { t } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(isStandalone);
  const [appleMobile] = useState(isAppleMobile);
  const [dismissed, setDismissed] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (installed || dismissed) return null;

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
      if (choice.outcome === 'accepted') setInstalled(true);
      else setShowInstructions(true);
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
          onClick={() => setDismissed(true)}
        >
          <X />
        </button>
      </div>
    </aside>
  );
}
