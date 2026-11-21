import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { Alert, Brand, Button, LangToggle, PasswordField, TextField, ThemeToggle } from '../components/ui';

function RingArt() {
  const n = 48;
  return (
    <svg className="ring-art" viewBox="0 0 300 300" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => {
        const step = 360 / n;
        const a1 = ((i * step + step * 0.2 - 90) * Math.PI) / 180;
        const a2 = ((i * step + step * 0.78 - 90) * Math.PI) / 180;
        const r = 136;
        return (
          <path key={i} d={`M${150 + r * Math.cos(a1)} ${150 + r * Math.sin(a1)} A${r} ${r} 0 0 1 ${150 + r * Math.cos(a2)} ${150 + r * Math.sin(a2)}`}
            stroke="currentColor" strokeOpacity={i < 34 ? 0.9 : 0.28} strokeWidth="5" strokeLinecap="round" fill="none" />
        );
      })}
      <circle cx="150" cy="150" r="108" fill="none" stroke="currentColor" strokeOpacity=".22" strokeWidth="2" strokeDasharray="5 7" />
    </svg>
  );
}

export function AuthLayout({ children }) {
  const { t } = useI18n();
  return (
    <div className="auth">
      <aside className="auth-side">
        <Brand to="/" />
        <RingArt />
        <div style={{ display: 'grid', gap: 16 }}>
          <blockquote>{t('auth.sideQuote')}</blockquote>
          <p>{t('auth.sideBody')}</p>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-top"><LangToggle /><ThemeToggle /></div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function Login() {
  const { t, err } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(form.email, form.password);
      navigate('/app');
    } catch (e2) {
      setError(e2.status === 401 ? t('auth.badLogin') : err(e2));
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div>
        <h1>{t('auth.loginTitle')}</h1>
        <p className="muted" style={{ marginTop: 8 }}>{t('auth.loginBody')}</p>
      </div>
      <form className="form" onSubmit={submit}>
        <TextField label={t('auth.email')} type="email" autoComplete="email" required value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <PasswordField label={t('auth.password')} autoComplete="current-password" required value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <div style={{ marginTop: -8, textAlign: 'right' }}><Link className="small" to="/forgot-password">{t('auth.forgot')}</Link></div>
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="block" loading={busy}>{t('auth.signIn')}</Button>
      </form>
      <p className="switch-link">{t('auth.noAccount')} <Link to="/register">{t('auth.createAccount')}</Link></p>
    </AuthLayout>
  );
}

export function Register() {
  const { t, lang, err } = useI18n();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ ...form, language: lang });
      navigate('/app');
    } catch (e2) {
      setError(e2);
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div>
        <h1>{t('auth.registerTitle')}</h1>
        <p className="muted" style={{ marginTop: 8 }}>{t('auth.registerBody')}</p>
      </div>
      <form className="form" onSubmit={submit}>
        <TextField label={t('auth.fullName')} autoComplete="name" required value={form.full_name} onChange={set('full_name')}
          error={error?.field?.('full_name')} />
        <TextField label={t('auth.email')} type="email" autoComplete="email" required value={form.email} onChange={set('email')}
          error={error?.field?.('email')} />
        <TextField label={t('auth.phone')} type="tel" autoComplete="tel" placeholder="01XXXXXXXXX" value={form.phone} onChange={set('phone')}
          hint={t('auth.phoneHint')} />
        <PasswordField label={t('auth.password')} autoComplete="new-password" required value={form.password} onChange={set('password')}
          error={error?.field?.('password') || error?.field?.('non_field_errors')} hint={t('auth.passwordHint')} />
        {error && !error.field?.('email') && !error.field?.('password') && !error.field?.('non_field_errors') && (
          <Alert tone="error">{err(error)}</Alert>
        )}
        <Button type="submit" className="block" loading={busy}>{t('auth.createAccount')}</Button>
      </form>
      <p className="switch-link">{t('auth.haveAccount')} <Link to="/login">{t('auth.signIn')}</Link></p>
    </AuthLayout>
  );
}

export function ForgotPassword() {
  const { t, err } = useI18n();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/password/reset/', { email }, { auth: false });
      setSent(true);
    } catch (e2) {
      setError(err(e2));
    }
    setBusy(false);
  };

  return (
    <AuthLayout>
      <div>
        <h1>{t('auth.forgotTitle')}</h1>
        <p className="muted" style={{ marginTop: 8 }}>{t('auth.forgotBody')}</p>
      </div>
      {sent ? (
        <Alert tone="ok">{t('auth.resetSent', { email })}</Alert>
      ) : (
        <form className="form" onSubmit={submit}>
          <TextField label={t('auth.email')} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="block" loading={busy}>{t('auth.sendLink')}</Button>
        </form>
      )}
      <p className="switch-link"><Link to="/login">{t('auth.backToSignIn')}</Link></p>
    </AuthLayout>
  );
}

export function ResetPassword() {
  const { t, err } = useI18n();
  const { uid, token } = useParams();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/auth/password/reset/confirm/', { uid, token, new_password: password }, { auth: false });
      setDone(true);
    } catch (e2) {
      setError(e2.status === 400 && !e2.field('new_password') ? t('auth.resetInvalid') : err(e2));
    }
    setBusy(false);
  };

  return (
    <AuthLayout>
      <div>
        <h1>{t('auth.resetTitle')}</h1>
        <p className="muted" style={{ marginTop: 8 }}>{t('auth.resetBody')}</p>
      </div>
      {done ? (
        <>
          <Alert tone="ok">{t('auth.resetDone')}</Alert>
          <Link className="btn block" to="/login">{t('auth.signIn')}</Link>
        </>
      ) : (
        <form className="form" onSubmit={submit}>
          <PasswordField label={t('auth.newPassword')} autoComplete="new-password" required value={password}
            onChange={(e) => setPassword(e.target.value)} hint={t('auth.passwordHint')} />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="block" loading={busy}>{t('auth.setPassword')}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
