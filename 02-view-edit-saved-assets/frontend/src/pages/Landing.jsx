import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import PulseRing from '../components/PulseRing';
import { Brand, LangToggle, ThemeToggle } from '../components/ui';

const DAY = 86_400_000;
const demo = {
  interval_days: 60,
  grace_days: 14,
  state: 'active',
  due_at: new Date(Date.now() + 41 * DAY).toISOString(),
  release_at: new Date(Date.now() + 55 * DAY).toISOString(),
};

export default function Landing() {
  const { t, num } = useI18n();
  return (
    <div className="landing">
      <header className="landing-head">
        <Brand to="/" />
        <nav>
          <LangToggle />
          <ThemeToggle />
          <Link className="btn ghost" to="/login">{t('auth.signIn')}</Link>
        </nav>
      </header>

      <main>
        <section className="hero">
          <div>
            <h1>{t('landing.title')}</h1>
            <p className="lede">{t('landing.lede')}</p>
            <div className="cta">
              <Link className="btn" to="/register">{t('landing.cta')}</Link>
              <Link className="btn secondary" to="/login">{t('auth.signIn')}</Link>
            </div>
          </div>
          <div className="hero-art"><PulseRing sw={demo} /></div>
        </section>

        <section className="how" aria-labelledby="how-title">
          <hr className="stitch" />
          <h2 id="how-title">{t('landing.howTitle')}</h2>
          <ol>
            {['store', 'checkin', 'pass'].map((k, i) => (
              <li key={k}>
                <span className="n" aria-hidden="true">{num(i + 1)}</span>
                <h3>{t(`landing.steps.${k}.title`)}</h3>
                <p>{t(`landing.steps.${k}.body`)}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="landing-foot">
        <span>{t('landing.foot')}</span>
        <span>© {num(new Date().getFullYear())} DigiWill BD</span>
      </footer>
    </div>
  );
}
