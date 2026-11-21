import { useState } from 'react';
import { LockKeyIcon, ShieldKeyIcon } from '@hugeicons/core-free-icons';
import { useVault } from '../context/VaultContext';
import { DecryptError } from '../lib/crypto';
import { useI18n } from '../i18n';
import { Alert, Button, Icon, PasswordField } from './ui';

function strength(p) {
  let s = 0;
  if (p.length >= 12) s++;
  if (p.length >= 16) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p) || /\s/.test(p.trim())) s++;
  return Math.min(s, 4);
}

function SetupVault() {
  const { t, err: errText } = useI18n();
  const vault = useVault();
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const score = strength(pass);

  const submit = async (e) => {
    e.preventDefault();
    if (pass.length < 10) return setError(t('gate.tooShort'));
    if (pass !== confirm) return setError(t('gate.mismatch'));
    setBusy(true);
    setError('');
    try { await vault.create(pass); } catch (err) { setError(errText(err)); setBusy(false); }
  };

  return (
    <form className="panel form" onSubmit={submit} style={{ maxWidth: 560 }}>
      <div className="big-icon"><Icon icon={ShieldKeyIcon} size={28} /></div>
      <div>
        <h2>{t('gate.setupTitle')}</h2>
        <p className="muted" style={{ marginTop: 6 }}>{t('gate.setupBody')}</p>
      </div>
      <PasswordField label={t('gate.passphrase')} value={pass} onChange={(e) => setPass(e.target.value)}
        autoComplete="new-password" hint={pass ? t(`gate.strength.${score}`) : t('gate.passHint')} />
      <PasswordField label={t('gate.confirm')} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
      <label className={`check${ack ? ' on' : ''}`}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span className="small">{t('gate.ack')}</span>
      </label>
      {error && <Alert tone="error">{error}</Alert>}
      <div><Button type="submit" loading={busy} disabled={!ack}>{t('gate.create')}</Button></div>
    </form>
  );
}

function UnlockVault() {
  const { t, err: errText } = useI18n();
  const vault = useVault();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await vault.unlock(pass);
    } catch (err) {
      setError(err instanceof DecryptError ? t('gate.wrong') : errText(err));
      setBusy(false);
    }
  };

  return (
    <form className="panel form" onSubmit={submit} style={{ maxWidth: 480 }}>
      <div className="big-icon"><Icon icon={LockKeyIcon} size={28} /></div>
      <div>
        <h2>{t('gate.unlockTitle')}</h2>
        <p className="muted" style={{ marginTop: 6 }}>{t('gate.unlockBody')}</p>
      </div>
      <PasswordField label={t('gate.passphrase')} value={pass} onChange={(e) => setPass(e.target.value)} autoComplete="current-password" />
      {error && <Alert tone="error">{error}</Alert>}
      <div><Button type="submit" loading={busy} disabled={!pass}>{busy ? t('gate.unlocking') : t('gate.unlock')}</Button></div>
    </form>
  );
}

/** Renders children only once the vault exists and is unlocked. */
export default function VaultGate({ children }) {
  const { status } = useVault();
  if (status === 'none') return <SetupVault />;
  if (status === 'locked') return <UnlockVault />;
  return children;
}
