import { AlertTriangle, Copy, Download, ExternalLink, Laptop, Monitor, QrCode, Smartphone, Tablet } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useI18n } from '../i18n/index.jsx';
import { Button, useToast } from '../ui.jsx';

// Official AmneziaWG app links (from docs.amnezia.org). One App Store listing covers iPhone, iPad and Mac.
const PLATFORMS = {
  android: { icon: Smartphone, phone: true, store: 'https://play.google.com/store/apps/details?id=org.amnezia.awg' },
  ios: { icon: Tablet, phone: true, store: 'https://apps.apple.com/app/amneziawg/id6478942365' },
  windows: { icon: Monitor, phone: false, store: 'https://github.com/amnezia-vpn/amneziawg-windows-client/releases/latest' },
  mac: { icon: Laptop, phone: false, store: 'https://apps.apple.com/app/amneziawg/id6478942365' },
};

function guessPlatform(kind) {
  const ua = navigator.userAgent;
  if (kind === 'laptop' || kind === 'desktop') return /Mac/.test(ua) && !/iPhone|iPad/.test(ua) ? 'mac' : 'windows';
  return /iPhone|iPad|Macintosh/.test(ua) ? 'ios' : 'android';
}

const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function fileName(name) {
  // Tunnel names are limited to 15 characters of letters, numbers, _ = + . -
  const latin = [...(name || '')].map((ch) => {
    const lower = ch.toLowerCase();
    return lower in CYRILLIC ? CYRILLIC[lower] : ch;
  }).join('');
  const ascii = latin.normalize('NFKD').replace(/[^a-zA-Z0-9_=+.-]+/g, '-').replace(/^-+|-+$/g, '');
  return `${ascii.slice(0, 15) || 'jirex'}.conf`;
}

export default function DeviceSetup({ device }) {
  const { t, tr } = useI18n();
  const [platform, setPlatform] = useState(() => guessPlatform(device.kind));
  const toast = useToast();
  const p = PLATFORMS[platform];

  function download() {
    if (navigator.userAgent.includes('JirexAndroid/')) {
      const a = Object.assign(document.createElement('a'), {
        href: `/api/devices/${device.id}/config?download=1&name=${encodeURIComponent(fileName(device.name))}`,
        download: fileName(device.name),
      });
      a.click();
      return;
    }
    const url = URL.createObjectURL(new Blob([device.config], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: fileName(device.name) });
    a.click();
    URL.revokeObjectURL(url);
    toast(t('setup.downloaded'), { body: t('setup.downloadedBody') });
  }

  async function copy() {
    await navigator.clipboard.writeText(device.config);
    toast(t('common.copied'));
  }

  return (
    <div className="stack gap-16">
      <div className="setup-tabs">
        <div className="segmented full" role="tablist">
          {Object.entries(PLATFORMS).map(([id, { icon: Icon }]) => (
            <button
              key={id}
              role="tab"
              aria-selected={platform === id}
              className={platform === id ? 'active' : ''}
              onClick={() => setPlatform(id)}
            >
              <Icon /> {t(`setup.platforms.${id}`)}
            </button>
          ))}
        </div>
      </div>

      <ol className="steps">
        {t(`setup.steps.${platform}`).map((s, i) => (
          <li key={i}>
            <span>{tr(`setup.steps.${platform}.${i}`)}</span>
          </li>
        ))}
      </ol>

      <div className="row wrap gap-8">
        <Button icon={Download} onClick={download}>
          {t('setup.download')}
        </Button>
        <a className="btn btn-secondary" href={p.store} target="_blank" rel="noreferrer">
          <ExternalLink /> {t(`setup.store.${platform}`)}
        </a>
        <Button variant="ghost" icon={Copy} onClick={copy}>
          {t('common.copy')}
        </Button>
      </div>

      {p.phone && (
        <div className="qr-panel">
          <div className="qr-frame">
            <QRCodeSVG value={device.config} size={168} level="M" />
          </div>
          <div className="stack gap-8">
            <strong className="row gap-8">
              <QrCode size={17} color="var(--accent)" /> {t('setup.qrTitle')}
            </strong>
            <span className="muted small">{tr('setup.qrHint')}</span>
          </div>
        </div>
      )}

      <div className="callout">
        <AlertTriangle />
        <span>{t('setup.warning')}</span>
      </div>
    </div>
  );
}
