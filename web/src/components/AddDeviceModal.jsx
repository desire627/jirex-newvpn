import { Check, Globe, Laptop, Monitor, Plus, Smartphone, Tablet } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n/index.jsx';
import { Button, FormError, Modal } from '../ui.jsx';
import DeviceSetup from './DeviceSetup.jsx';

export const DEVICE_KINDS = [
  { id: 'phone', icon: Smartphone },
  { id: 'tablet', icon: Tablet },
  { id: 'laptop', icon: Laptop },
  { id: 'desktop', icon: Monitor },
];
export const kindIcon = (kind) => (DEVICE_KINDS.find((k) => k.id === kind) || DEVICE_KINDS[0]).icon;

export default function AddDeviceModal({ servers, onClose, onAdded }) {
  const { t } = useI18n();
  const [kind, setKind] = useState('phone');
  const [name, setName] = useState('');
  const [serverId, setServerId] = useState(servers[0]?.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const defaultName = t(`addDevice.defaultNames.${kind}`);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const device = await api('/devices', {
        method: 'POST',
        body: { kind, name: name.trim() || defaultName, serverId },
      });
      setCreated(device);
      onAdded();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Modal
        wide
        title={t('addDevice.connectTitle', { name: created.name })}
        description={t('addDevice.connectDesc')}
        icon={
          <span className="icon-tile">
            <Check />
          </span>
        }
        onClose={onClose}
        footer={<Button onClick={onClose}>{t('addDevice.done')}</Button>}
      >
        <DeviceSetup device={created} />
      </Modal>
    );
  }

  return (
    <Modal
      title={t('addDevice.title')}
      description={t('addDevice.desc')}
      icon={
        <span className="icon-tile">
          <Plus />
        </span>
      }
      onClose={onClose}
    >
      <form className="stack gap-24" onSubmit={submit}>
        <div className="field">
          <span>{t('addDevice.kindLabel')}</span>
          <div className="choice-grid kinds">
            {DEVICE_KINDS.map(({ id, icon: Icon }) => (
              <button
                key={id}
                type="button"
                className={`choice choice-vertical ${kind === id ? 'selected' : ''}`}
                onClick={() => setKind(id)}
                aria-pressed={kind === id}
              >
                <Icon />
                {t(`addDevice.kinds.${id}`)}
              </button>
            ))}
          </div>
        </div>

        <label className="field">
          <span>
            {t('addDevice.name')} <span className="hint">· {t('addDevice.nameHint')}</span>
          </span>
          <input
            className="input"
            maxLength={40}
            placeholder={defaultName}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="field">
          <span>{t('addDevice.location')}</span>
          <div className="choice-grid">
            {servers.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`choice ${serverId === s.id ? 'selected' : ''}`}
                onClick={() => setServerId(s.id)}
                aria-pressed={serverId === s.id}
              >
                <span className="icon-tile neutral" style={{ width: 36, height: 36 }}>
                  <Globe size={17} />
                </span>
                <span className="grow">
                  <strong style={{ display: 'block', fontSize: 14.5 }}>{s.name}</strong>
                  {s.country && <span className="muted small">{s.country}</span>}
                </span>
                <span className="check">
                  <Check />
                </span>
              </button>
            ))}
          </div>
        </div>

        <FormError>{error}</FormError>

        <div className="row gap-8 wrap" style={{ justifyContent: 'flex-end' }}>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy}>
            {t('addDevice.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
