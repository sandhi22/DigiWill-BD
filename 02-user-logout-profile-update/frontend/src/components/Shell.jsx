import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  HeartHandshakeIcon,
  Home01Icon,
  LockKeyholeOpenIcon,
  LockKeyIcon,
  Logout01Icon,
  Settings02Icon,
  SquareLock02Icon,
} from '@hugeicons/core-free-icons';
import { useAuth } from '../context/AuthContext';
import { useVault } from '../context/VaultContext';
import { useI18n } from '../i18n';
import { Brand, Icon, LangToggle, ThemeToggle } from './ui';

const LINKS = [
  { to: '/app', end: true, icon: Home01Icon, key: 'nav.overview' },
  { to: '/app/vault', icon: SquareLock02Icon, key: 'nav.vault' },
  { to: '/app/nominees', icon: HeartHandshakeIcon, key: 'nav.nominees' },
  { to: '/app/settings', icon: Settings02Icon, key: 'nav.settings' },
];

export default function Shell() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const vault = useVault();
  const navigate = useNavigate();

  const signOut = async () => {
    vault.lock();
    await logout();
    navigate('/login');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand to="/app" />
        <nav className="nav" aria-label={t('nav.label')}>
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              <Icon icon={l.icon} />
              {t(l.key)}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          {vault.status !== 'none' && (
            <div className="vault-state">
              <Icon icon={vault.status === 'unlocked' ? LockKeyholeOpenIcon : LockKeyIcon}
                style={{ color: vault.status === 'unlocked' ? 'var(--sage)' : 'var(--ink-3)' }} />
              <div className="grow">
                <strong>{t(vault.status === 'unlocked' ? 'vault.unlocked' : 'vault.locked')}</strong>
                <span className="faint tiny">{t(vault.status === 'unlocked' ? 'vault.autoLock' : 'vault.lockedHint')}</span>
              </div>
              {vault.status === 'unlocked' && (
                <button className="icon-btn" onClick={vault.lock} aria-label={t('vault.lock')} title={t('vault.lock')}>
                  <Icon icon={LockKeyIcon} size={18} />
                </button>
              )}
            </div>
          )}
          <div className="sidebar-tools">
            <LangToggle />
            <span className="grow" />
            <ThemeToggle />
            <button className="icon-btn" onClick={signOut} aria-label={t('nav.signOut')} title={t('nav.signOut')}>
              <Icon icon={Logout01Icon} size={19} />
            </button>
          </div>
          <p className="faint tiny" style={{ padding: '0 4px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</p>
        </div>
      </aside>

      <header className="topbar">
        <Brand to="/app" sub={false} />
        <div className="topbar-tools">
          {vault.status === 'unlocked' && (
            <button className="icon-btn" onClick={vault.lock} aria-label={t('vault.lock')}>
              <Icon icon={LockKeyholeOpenIcon} size={19} style={{ color: 'var(--sage)' }} />
            </button>
          )}
          <LangToggle />
          <ThemeToggle />
          <button className="icon-btn" onClick={signOut} aria-label={t('nav.signOut')}>
            <Icon icon={Logout01Icon} size={19} />
          </button>
        </div>
      </header>

      <main className="main" id="main">
        <Outlet />
      </main>

      <nav className="bottom-nav" aria-label={t('nav.label')}>
        {LINKS.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}>
            <Icon icon={l.icon} size={22} />
            {t(l.key)}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
