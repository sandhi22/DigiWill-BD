import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock01Icon, HeartCheckIcon, RefreshIcon, Tick02Icon } from '@hugeicons/core-free-icons';
import { api } from '../lib/api';
import { CATEGORIES } from '../lib/categories';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import PulseRing, { switchTiming } from '../components/PulseRing';
import { Alert, Button, Icon, Modal, Spinner, useToast } from '../components/ui';

const TONE = {
  check_in: 'ok', release_revoked: 'ok', nominee_verified: 'ok',
  heads_up_sent: 'warn', reminder_sent: 'warn', nominees_alerted: 'warn', nominee_declined: 'warn',
  released: 'bad', release_opened: 'bad', vault_reset: 'bad',
};

export function ScheduleModal({ sw, onClose, onSaved }) {
  const { t, num, err } = useI18n();
  const [every, setEvery] = useState(sw.interval_days);
  const [grace, setGrace] = useState(sw.grace_days);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true);
    try {
      onSaved(await api.patch('/switch/', { interval_days: every, grace_days: grace }));
      onClose();
    } catch (e) {
      setError(err(e));
      setBusy(false);
    }
  };
  return (
    <Modal title={t('schedule.title')} onClose={onClose} footer={(
      <>
        <Button className="secondary" onClick={onClose}>{t('common.cancel')}</Button>
        <Button loading={busy} onClick={save}>{t('schedule.save')}</Button>
      </>
    )}>
      <div className="field">
        <span className="label">{t('schedule.interval')}</span>
        <div className="segmented">
          {[30, 60, 90, 180].map((d) => (
            <button key={d} type="button" aria-pressed={every === d} onClick={() => setEvery(d)}>{t('schedule.days', { n: d })}</button>
          ))}
        </div>
        <span className="hint">{t('schedule.intervalHint')}</span>
      </div>
      <div className="field">
        <span className="label">{t('schedule.grace')}</span>
        <div className="segmented">
          {[7, 14, 30].map((d) => (
            <button key={d} type="button" aria-pressed={grace === d} onClick={() => setGrace(d)}>{t('schedule.days', { n: d })}</button>
          ))}
        </div>
        <span className="hint">{t('schedule.graceHint')}</span>
      </div>
      <Alert tone="info">{t('schedule.summary', { n: every, g: grace, total: every + grace })}</Alert>
      <p className="faint small">{t('schedule.note', { n: num(every) })}</p>
      {error && <Alert tone="error">{error}</Alert>}
    </Modal>
  );
}

export default function Overview() {
  const { t, num, date, relative, err } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [sewing, setSewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sw, activity, assets, nominees] = await Promise.all([
        api.get('/switch/'), api.get('/activity/'), api.get('/vault/assets/'), api.get('/nominees/'),
      ]);
      setData({ sw, activity, assets, nominees });
    } catch (e) {
      setError(err(e));
    }
  }, [err]);

  useEffect(() => { load(); }, [load]);

  const checkIn = async () => {
    setBusy(true);
    try {
      const sw = await api.post('/switch/checkin/');
      setData((d) => ({ ...d, sw }));
      setSewing(true);
      setTimeout(() => setSewing(false), 1400);
      toast(t('pulse.checkedIn'));
      api.get('/activity/').then((activity) => setData((d) => ({ ...d, activity })));
    } catch (e) {
      setError(err(e));
    }
    setBusy(false);
  };

  if (error && !data) return <div className="page"><Alert tone="error">{error}</Alert></div>;
  if (!data) return <div className="loading-screen"><Spinner /></div>;

  const { sw, activity, assets, nominees } = data;
  const { overdue } = switchTiming(sw);
  const released = sw.state === 'released';
  const verified = nominees.filter((n) => n.status === 'verified');
  const assigned = nominees.some((n) => n.asset_ids.length > 0);

  const steps = [
    { key: 'vault', done: user.has_vault, to: '/app/vault' },
    { key: 'asset', done: assets.length > 0, to: '/app/vault' },
    { key: 'nominee', done: nominees.length > 0, to: '/app/nominees' },
    { key: 'assign', done: assigned, to: '/app/nominees' },
    { key: 'accepted', done: verified.length > 0, to: '/app/nominees' },
  ];
  const ready = steps.every((s) => s.done);
  const counts = CATEGORIES.map((c) => ({ ...c, n: assets.filter((a) => a.category === c.key).length })).filter((c) => c.n);

  const lead = released
    ? t('pulse.leadReleased', { date: date(sw.released_at) })
    : overdue
      ? t('pulse.leadOverdue', { date: date(sw.release_at) })
      : t('pulse.leadActive', { date: date(sw.due_at) });

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{t('overview.hello', { name: user.full_name.split(' ')[0] })}</h1>
          <p className="muted">{released || overdue ? t('overview.attention') : ready ? t('overview.ready') : t('overview.notReady')}</p>
        </div>
      </div>

      <section className="pulse" aria-label={t('pulse.label')}>
        <PulseRing sw={sw} sewing={sewing} />
        <div className="pulse-copy">
          <p className="lead">{lead}</p>
          <div className="pulse-meta">
            <span><Icon icon={RefreshIcon} size={16} />{t('pulse.every', { n: sw.interval_days })}</span>
            <span><Icon icon={Clock01Icon} size={16} />{t('pulse.grace', { n: sw.grace_days })}</span>
            <span><Icon icon={Tick02Icon} size={16} />{t('pulse.last', { when: relative(sw.last_check_in) })}</span>
          </div>
          {(overdue || released) && verified.length > 0 && (
            <Alert tone={released ? 'error' : 'warn'}>{released ? t('pulse.releasedNote') : t('pulse.overdueNote')}</Alert>
          )}
          <div className="pulse-actions">
            <Button onClick={checkIn} loading={busy}><Icon icon={HeartCheckIcon} />{t('pulse.checkIn')}</Button>
            <Button className="secondary" onClick={() => setEditing(true)}>{t('pulse.changeSchedule')}</Button>
          </div>
        </div>
      </section>

      <div className="grid-2">
        <div style={{ display: 'grid', gap: 20 }}>
          {!ready && (
            <section className="panel">
              <div className="panel-head">
                <h2>{t('overview.stepsTitle')}</h2>
                <span className="faint small">{t('overview.stepsCount', { done: steps.filter((s) => s.done).length, total: steps.length })}</span>
              </div>
              <ol className="steps">
                {steps.map((s, i) => (
                  <li key={s.key} className={s.done ? 'done' : ''}>
                    <span className="step-n">{s.done ? <Icon icon={Tick02Icon} size={15} /> : num(i + 1)}</span>
                    <div>
                      <div className="step-title">{t(`overview.steps.${s.key}.title`)}</div>
                      {!s.done && <div className="faint small">{t(`overview.steps.${s.key}.body`)}</div>}
                    </div>
                    {!s.done && <Link className="btn ghost sm" to={s.to}>{t(`overview.steps.${s.key}.cta`)}</Link>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="panel">
            <div className="panel-head"><h2>{t('overview.activity')}</h2></div>
            {activity.length === 0 ? (
              <p className="faint">{t('overview.noActivity')}</p>
            ) : (
              <ol className="timeline">
                {activity.slice(0, 8).map((a) => (
                  <li key={a.id} className={TONE[a.kind] || ''}>
                    {t(`activity.${a.kind}`, { name: a.detail?.name || '', source: t(`activity.source.${a.detail?.source || 'button'}`) })}
                    <time dateTime={a.created_at}>{relative(a.created_at)}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div style={{ display: 'grid', gap: 20 }}>
          <section className="panel">
            <div className="panel-head">
              <h2>{t('overview.inVault')}</h2>
              <Link className="btn ghost sm" to="/app/vault">{t('overview.open')}</Link>
            </div>
            {counts.length === 0 ? (
              <p className="faint">{t('overview.vaultEmpty')}</p>
            ) : (
              <div className="summary">
                {counts.map((c) => (
                  <div className="summary-row" key={c.key}>
                    <span className="cat-icon"><Icon icon={c.icon} /></span>
                    <span className="grow">{t(`categories.${c.key}`)}</span>
                    <span className="num muted">{num(c.n)}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h2>{t('overview.nominees')}</h2>
              <Link className="btn ghost sm" to="/app/nominees">{t('overview.manage')}</Link>
            </div>
            {nominees.length === 0 ? (
              <p className="faint">{t('overview.noNominees')}</p>
            ) : (
              <div className="summary">
                {nominees.map((n) => (
                  <div className="summary-row" key={n.id}>
                    <span className="grow">
                      <strong style={{ fontWeight: 600 }}>{n.name}</strong>
                      <span className="faint small" style={{ display: 'block' }}>{t('overview.receives', { n: n.asset_ids.length })}</span>
                    </span>
                    <span className={`chip ${n.status === 'verified' ? 'ok' : n.status === 'declined' ? 'bad' : 'warn'}`}>
                      <span className="dot" />{t(`nominees.status.${n.status}`)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {editing && <ScheduleModal sw={sw} onClose={() => setEditing(false)} onSaved={(s) => { setData((d) => ({ ...d, sw: s })); load(); }} />}
    </div>
  );
}
