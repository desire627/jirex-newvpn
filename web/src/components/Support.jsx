import { Copy, LifeBuoy, Mail, Phone } from 'lucide-react';
import { createContext, useCallback, useContext, useState } from 'react';
import { BRAND, SUPPORT, phoneDigits } from '../brand.js';
import { useI18n } from '../i18n/index.jsx';
import { Modal, useToast } from '../ui.jsx';

// Simple brand marks for the chat apps (lucide has no brand icons).
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2a9.9 9.9 0 0 0-8.5 15l-1.4 5.1 5.2-1.4A9.9 9.9 0 1 0 12.04 2Zm0 18.1a8.2 8.2 0 0 1-4.2-1.15l-.3-.18-3.1.82.83-3-.2-.31a8.2 8.2 0 1 1 6.97 3.82Zm4.5-6.14c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.16.25-.63.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 0 1-3.32-2.9c-.25-.43.25-.4.71-1.33.08-.16.04-.3-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 0 0-.65.3 2.73 2.73 0 0 0-.85 2.03 4.74 4.74 0 0 0 1 2.52 10.86 10.86 0 0 0 4.16 3.68c1.55.67 2.16.73 2.93.61.47-.07 1.46-.6 1.66-1.17.21-.58.21-1.07.15-1.17-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}
function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.94 4.3a1.2 1.2 0 0 0-1.62-1.36L2.9 9.72c-1.16.46-1.15 1.1-.2 1.4l4.47 1.39 1.73 5.3c.21.58.1.81.71.81.47 0 .68-.21.94-.47l2.26-2.2 4.7 3.47c.86.48 1.49.23 1.7-.8l3.08-14.5-.35.18ZM17.3 7.6l-8.1 7.3-.32 3.4-1.38-4.43 9.27-5.84c.42-.26.81-.12.53.12Z" />
    </svg>
  );
}

const SupportContext = createContext(() => {});
export const useSupport = () => useContext(SupportContext);

function ContactRow({ icon: Icon, label, value, href }) {
  const toast = useToast();
  const { t } = useI18n();
  return (
    <div className="contact-row">
      <span className="icon-tile neutral">
        <Icon />
      </span>
      <div className="grow" style={{ minWidth: 0 }}>
        <span className="muted tiny">{label}</span>
        <a className="contact-value" href={href}>
          {value}
        </a>
      </div>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        title={t('common.copy')}
        aria-label={`${t('common.copy')} ${value}`}
        onClick={() => navigator.clipboard.writeText(value).then(() => toast(t('common.copied'), { body: value }))}
      >
        <Copy />
      </button>
    </div>
  );
}

function SupportModal({ onClose }) {
  const { t } = useI18n();
  const digits = SUPPORT.phone ? phoneDigits(SUPPORT.phone) : '';
  const channels = [
    SUPPORT.whatsapp && digits && {
      id: 'whatsapp',
      label: 'WhatsApp',
      icon: WhatsAppIcon,
      href: `https://wa.me/${digits.replace('+', '')}`,
    },
    SUPPORT.telegram && { id: 'telegram', label: 'Telegram', icon: TelegramIcon },
    SUPPORT.emails[0] && {
      id: 'email',
      label: t('support.email'),
      icon: Mail,
      href: `mailto:${SUPPORT.emails[0]}?subject=${encodeURIComponent(`${BRAND.name} support`)}`,
    },
    digits && { id: 'call', label: t('support.call'), icon: Phone, href: `tel:${digits}` },
  ].filter(Boolean);

  return (
    <Modal
      className="support-drawer"
      title={t('support.title')}
      description={t('support.desc')}
      icon={
        <span className="icon-tile">
          <LifeBuoy />
        </span>
      }
      onClose={onClose}
    >
      <div className="stack gap-20">
        <div className="social-grid">
          {channels.map(({ id, label, icon: Icon, href }) => {
            const content = (
              <>
                <span className="social-icon">
                  <Icon />
                </span>
                {label}
              </>
            );
            return href ? (
              <a
                key={id}
                className={`social-btn ${id}`}
                href={href}
                target={href.startsWith('http') ? '_blank' : undefined}
                rel="noreferrer"
              >
                {content}
              </a>
            ) : (
              <div key={id} className={`social-btn ${id}`} aria-disabled="true">
                {content}
              </div>
            );
          })}
        </div>

        <div className="stack gap-8">
          {SUPPORT.emails.map((email) => (
            <ContactRow key={email} icon={Mail} label={t('support.email')} value={email} href={`mailto:${email}`} />
          ))}
          {digits && <ContactRow icon={Phone} label={t('support.phone')} value={SUPPORT.phone} href={`tel:${digits}`} />}
        </div>

        <p className="tiny muted center">{t('support.hours')}</p>
      </div>
    </Modal>
  );
}

export function SupportProvider({ children }) {
  const [open, setOpen] = useState(false);
  const openSupport = useCallback(() => setOpen(true), []);
  return (
    <SupportContext.Provider value={openSupport}>
      {children}
      {open && <SupportModal onClose={() => setOpen(false)} />}
    </SupportContext.Provider>
  );
}

// The "Support" button in the top bars.
export function SupportButton() {
  const { t } = useI18n();
  const openSupport = useSupport();
  return (
    <button type="button" className="btn btn-ghost support-btn" onClick={openSupport} aria-label={t('support.button')}>
      <LifeBuoy />
      <span>{t('support.button')}</span>
    </button>
  );
}
