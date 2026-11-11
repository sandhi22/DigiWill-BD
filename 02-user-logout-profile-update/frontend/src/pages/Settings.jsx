import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useVault } from '../context/VaultContext';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { DecryptError } from '../lib/crypto';
import { ScheduleModal } from './Overview';
import { Alert, Button, Confirm, PasswordField, TextField, useToast } from '../components/ui';

function Section({ title, body, children }) {
  return (
    <section className="panel" style={{ display: 'grid', gap: 18 }}>
      <div>
        <h2>{title}</h2>
        {body && <p className="muted small" style={{ marginTop: 4 }}>{body}</p>}
      </div>
      {children}
    </section>
  );
}

function Profile() {
  const { t, setLang, err } = useI18n();
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: user.full_name, phone: user.phone, language: user.language });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await updateProfile(form);
      setLang(form.language);
      toast(t('settings.saved'));
    } catch (e2) { setError(err(e2)); }
    setBusy(false);
  };
  return (
    <Section title={t('settings.profile')}>
      <form className="form" onSubmit={submit}>
        <div className="row-2">
          <TextField label={t('auth.fullName')} required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <TextField label={t('auth.phone')} type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <TextField label={t('auth.email')} value={user.email} disabled hint={t('settings.emailFixed')} />
        <div className="field">
          <span className="label">{t('settings.language')}</span>
          <div className="segmented">
            <button type="button" aria-pressed={form.language === 'bn'} onClick={() => setForm({ ...form, language: 'bn' })} lang="bn">বাংলা</button>
            <button type="button" aria-pressed={form.language === 'en'} onClick={() => setForm({ ...form, language: 'en' })} lang="en">English</button>
          </div>
          <span className="hint">{t('settings.languageHint')}</span>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div><Button type="submit" loading={busy}>{t('settings.saveProfile')}</Button></div>
      </form>
    </Section>
  );
}

function Schedule() {
  const { t } = useI18n();
  const [sw, setSw] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { api.get('/switch/').then(setSw).catch(() => {}); }, []);
  if (!sw) return null;
  return (
    <Section title={t('settings.schedule')} body={t('schedule.summary', { n: sw.interval_days, g: sw.grace_days, total: sw.interval_days + sw.grace_days })}>
      <div><Button className="secondary" onClick={() => setOpen(true)}>{t('pulse.changeSchedule')}</Button></div>
      {open && <ScheduleModal sw={sw} onClose={() => setOpen(false)} onSaved={setSw} />}
    </Section>
  );
}

function Password() {
  const { t, err } = useI18n();
  const toast = useToast();
  const [form, setForm] = useState({ current_password: '', new_password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/password/change/', form);
      setForm({ current_password: '', new_password: '' });
      toast(t('settings.passwordChanged'));
    } catch (e2) { setError(e2); }
    setBusy(false);
  };
  return (
    <Section title={t('settings.password')} body={t('settings.passwordBody')}>
      <form className="form" onSubmit={submit}>
        <div className="row-2">
          <PasswordField label={t('settings.currentPassword')} autoComplete="current-password" required value={form.current_password}
            onChange={(e) => setForm({ ...form, current_password: e.target.value })} error={error?.field?.('current_password')} />
          <PasswordField label={t('auth.newPassword')} autoComplete="new-password" required value={form.new_password}
            onChange={(e) => setForm({ ...form, new_password: e.target.value })} error={error?.field?.('new_password')} />
        </div>
        {error && !error.field?.('current_password') && !error.field?.('new_password') && <Alert tone="error">{err(error)}</Alert>}
        <div><Button type="submit" loading={busy}>{t('settings.changePassword')}</Button></div>
      </form>
    </Section>
  );
}

function Passphrase() {
  const { t, err } = useI18n();
  const vault = useVault();
  const toast = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (vault.status === 'none') return null;
  const submit = async (e) => {
    e.preventDefault();
    if (form.next.length < 10) return setError(t('gate.tooShort'));
    if (form.next !== form.confirm) return setError(t('gate.mismatch'));
    setBusy(true);
    setError('');
    try {
      await vault.changePassphrase(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      toast(t('settings.passphraseChanged'));
    } catch (e2) {
      setError(e2 instanceof DecryptError ? t('gate.wrong') : err(e2));
    }
    setBusy(false);
  };
  return (
    <Section title={t('settings.passphrase')} body={t('settings.passphraseBody')}>
      <form className="form" onSubmit={submit}>
        <PasswordField label={t('settings.currentPassphrase')} autoComplete="off" required value={form.current}
          onChange={(e) => setForm({ ...form, current: e.target.value })} />
        <div className="row-2">
          <PasswordField label={t('settings.newPassphrase')} autoComplete="new-password" required value={form.next}
            onChange={(e) => setForm({ ...form, next: e.target.value })} />
          <PasswordField label={t('gate.confirm')} autoComplete="new-password" required value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div><Button type="submit" loading={busy}>{t('settings.changePassphrase')}</Button></div>
      </form>
    </Section>
  );
}

function Danger() {
  const { t } = useI18n();
  const vault = useVault();
  const { clear } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [mode, setMode] = useState(null);
  const [password, setPassword] = useState('');
  const close = () => { setMode(null); setPassword(''); };
  return (
    <Section title={t('settings.danger')}>
      <div style={{ display: 'grid', gap: 14 }}>
        {vault.status !== 'none' && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ maxWidth: '52ch' }}><strong>{t('settings.resetVault')}</strong><p className="muted small">{t('settings.resetVaultBody')}</p></div>
            <Button className="secondary" onClick={() => setMode('reset')}>{t('settings.resetVault')}</Button>
          </div>
        )}
        <hr className="stitch" />
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ maxWidth: '52ch' }}><strong>{t('settings.deleteAccount')}</strong><p className="muted small">{t('settings.deleteAccountBody')}</p></div>
          <Button className="danger" onClick={() => setMode('delete')}>{t('settings.deleteAccount')}</Button>
        </div>
      </div>
      {mode && (
        <Confirm
          title={mode === 'reset' ? t('settings.resetVault') : t('settings.deleteAccount')}
          body={mode === 'reset' ? t('settings.resetConfirm') : t('settings.deleteConfirm')}
          confirmLabel={mode === 'reset' ? t('settings.resetVault') : t('settings.deleteAccount')}
          onClose={close}
          onConfirm={async () => {
            if (mode === 'reset') {
              await vault.reset(password);
              toast(t('settings.vaultReset'));
            } else {
              await api.post('/auth/delete/', { password });
              clear();
              navigate('/');
            }
          }}>
          <PasswordField label={t('settings.confirmWithPassword')} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Confirm>
      )}
    </Section>
  );
}

export default function Settings() {
  const { t } = useI18n();
  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <div className="page-head"><h1>{t('settings.title')}</h1></div>
      <Profile />
      <Schedule />
      <Password />
      <Passphrase />
      <Danger />
    </div>
  );
}
