import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Download04Icon,
  File01Icon,
  HeartCheckIcon,
  HeartHandshakeIcon,
  LockKeyholeOpenIcon,
} from '@hugeicons/core-free-icons';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import * as c from '../lib/crypto';
import { CATEGORY } from '../lib/categories';
import { downloadDocument } from '../lib/vault';
import { SecretValue } from './Vault';
import { Alert, Brand, Button, Icon, LangToggle, Spinner, ThemeToggle } from '../components/ui';

function PublicLayout({ children, wide }) {
  return (
    <div className="public">
      <header className="public-head">
        <Brand to="/" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}><LangToggle /><ThemeToggle /></div>
      </header>
      <main className="public-main">
        <div className={`public-card${wide ? ' wide' : ''}`}>{children}</div>
      </main>
    </div>
  );
}

function useToken(path) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  useEffect(() => {
    api.get(path, { auth: false })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((error) => setState({ loading: false, data: null, error }));
  }, [path]);
  return [state, (data) => setState({ loading: false, data, error: null })];
}

function Dead({ title, body }) {
  return (
    <div className="panel center-state">
      <div className="big-icon warn"><Icon icon={Alert02Icon} size={28} /></div>
      <h1 style={{ fontSize: 28 }}>{title}</h1>
      <p className="muted">{body}</p>
    </div>
  );
}

// ---- emailed check-in link ---------------------------------------------------

export function CheckInLink() {
  const { token } = useParams();
  const { t, date, err } = useI18n();
  const [{ loading, data, error }, setData] = useToken(`/public/checkin/${token}/`);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState('');

  const confirm = async () => {
    setBusy(true);
    try {
      setData(await api.post(`/public/checkin/${token}/`, {}, { auth: false }));
      setDone(true);
    } catch (e) { setFailure(err(e)); }
    setBusy(false);
  };

  return (
    <PublicLayout>
      {loading ? <div className="loading-screen"><Spinner /></div>
        : error ? <Dead title={t('public.linkDeadTitle')} body={t('public.checkinDead')} />
          : done ? (
            <div className="panel center-state">
              <div className="big-icon ok"><Icon icon={CheckmarkCircle02Icon} size={30} /></div>
              <h1 style={{ fontSize: 30 }}>{t('public.checkedInTitle', { name: data.name })}</h1>
              <p className="muted">{t('public.checkedInBody', { date: date(data.due_at) })}</p>
            </div>
          ) : (
            <div className="panel center-state">
              <div className="big-icon"><Icon icon={HeartCheckIcon} size={30} /></div>
              <h1 style={{ fontSize: 30 }}>{t('public.checkinTitle', { name: data.name })}</h1>
              <p className="muted">{t('public.checkinBody')}</p>
              {failure && <Alert tone="error">{failure}</Alert>}
              <Button onClick={confirm} loading={busy}>{t('public.checkinCta')}</Button>
            </div>
          )}
    </PublicLayout>
  );
}

// ---- nominee invitation ------------------------------------------------------

export function NomineeInvite() {
  const { token } = useParams();
  const { t, num, err } = useI18n();
  const [{ loading, data, error }, setData] = useToken(`/public/invite/${token}/`);
  const [busy, setBusy] = useState(null);
  const [failure, setFailure] = useState('');

  const decide = async (decision) => {
    setBusy(decision);
    try { setData(await api.post(`/public/invite/${token}/`, { decision }, { auth: false })); } catch (e) { setFailure(err(e)); }
    setBusy(null);
  };

  if (loading) return <PublicLayout><div className="loading-screen"><Spinner /></div></PublicLayout>;
  if (error) return <PublicLayout><Dead title={t('public.linkDeadTitle')} body={t('public.inviteDead')} /></PublicLayout>;

  const { owner, name, status } = data;
  return (
    <PublicLayout>
      {status === 'verified' ? (
        <div className="panel center-state">
          <div className="big-icon ok"><Icon icon={CheckmarkCircle02Icon} size={30} /></div>
          <h1 style={{ fontSize: 30 }}>{t('public.acceptedTitle')}</h1>
          <p className="muted">{t('public.acceptedBody', { owner })}</p>
        </div>
      ) : status === 'declined' ? (
        <div className="panel center-state">
          <h1 style={{ fontSize: 30 }}>{t('public.declinedTitle')}</h1>
          <p className="muted">{t('public.declinedBody', { owner })}</p>
          <Button className="secondary" loading={busy === 'accept'} onClick={() => decide('accept')}>{t('public.acceptAfterAll')}</Button>
        </div>
      ) : (
        <div className="panel" style={{ display: 'grid', gap: 18 }}>
          <div className="big-icon"><Icon icon={HeartHandshakeIcon} size={28} /></div>
          <h1>{t('public.inviteTitle', { owner, name })}</h1>
          <p className="muted">{t('public.inviteBody', { owner })}</p>
          <ol className="steps">
            {['now', 'later', 'card'].map((k, i) => (
              <li key={k} style={{ gridTemplateColumns: '32px 1fr' }}>
                <span className="step-n">{num(i + 1)}</span>
                <span>{t(`public.inviteSteps.${k}`, { owner })}</span>
              </li>
            ))}
          </ol>
          {failure && <Alert tone="error">{failure}</Alert>}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button loading={busy === 'accept'} onClick={() => decide('accept')}>{t('public.accept')}</Button>
            <Button className="secondary" loading={busy === 'decline'} onClick={() => decide('decline')}>{t('public.decline')}</Button>
          </div>
        </div>
      )}
    </PublicLayout>
  );
}

// ---- release: what the owner left -----------------------------------------------

function ReleasedAsset({ token, item }) {
  const { t, bytes, err } = useI18n();
  const [error, setError] = useState('');
  const d = item.data;
  const meta = CATEGORY[item.category];
  return (
    <article className="release-asset">
      <div className="release-asset-head">
        <span className="cat-icon"><Icon icon={meta.icon} /></span>
        <div>
          <h3 style={{ fontSize: 17 }}>{d.title || d.provider}</h3>
          <span className="faint small">{t(`categories.${item.category}`)}</span>
        </div>
      </div>
      <div className="detail-fields">
        {d.provider && d.title && <div className="detail-field"><span className="k">{t('assets.provider')}</span><span className="v">{d.provider}</span></div>}
        {d.identifier && <div className="detail-field"><span className="k">{t(`assets.identifier.${item.category}`)}</span><span className="v">{d.identifier}</span></div>}
        {d.secret && <div className="detail-field"><span className="k">{t(`assets.secret.${item.category}`)}</span><SecretValue value={d.secret} /></div>}
        {d.instructions && <div className="detail-field"><span className="k">{t('release.instructions')}</span><span className="v pre">{d.instructions}</span></div>}
        {item.documents.length > 0 && (
          <div className="detail-field">
            <span className="k">{t('assets.documents')}</span>
            <div className="file-list" style={{ marginTop: 6 }}>
              {item.documents.map((doc) => (
                <div className="file" key={doc.id}>
                  <Icon icon={File01Icon} />
                  <div className="grow"><div className="name">{doc.name}</div><div className="faint tiny">{bytes(doc.size)}</div></div>
                  <button className="icon-btn" aria-label={t('common.download')}
                    onClick={() => downloadDocument(item.ak, doc, `/public/release/${token}/documents/${doc.id}/`).catch((e) => setError(err(e)))}>
                    <Icon icon={Download04Icon} size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {error && <Alert tone="error">{error}</Alert>}
    </article>
  );
}

export function Release() {
  const { token } = useParams();
  const { t, date } = useI18n();
  const [{ loading, data, error }] = useToken(`/public/release/${token}/`);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const [opened, setOpened] = useState(null);

  const open = async (e) => {
    e.preventDefault();
    setBusy(true);
    setFailure('');
    let bytes;
    try {
      bytes = await c.parseCardCode(code);
    } catch {
      setFailure(t('release.typo'));
      setBusy(false);
      return;
    }
    try {
      const kn = await c.nomineeKey(c.fromB64(data.server_share), bytes);
      const items = await Promise.all(data.assets.map(async (a) => {
        const ak = await c.unwrapKey(kn, a.grant_key, a.grant_iv);
        const documents = await Promise.all(a.documents.map(async (doc) => ({ ...doc, name: (await c.decryptFileMeta(ak, doc)).name })));
        return { ...a, ak, documents, data: await c.decryptWithAssetKey(ak, a) };
      }));
      setOpened(items);
    } catch {
      setFailure(t('release.wrongCard', { owner: data.owner, hint: data.card_hint }));
    }
    setBusy(false);
  };

  if (loading) return <PublicLayout><div className="loading-screen"><Spinner /></div></PublicLayout>;
  if (error) return <PublicLayout><Dead title={t('public.linkDeadTitle')} body={t('release.dead')} /></PublicLayout>;

  return (
    <PublicLayout wide={!!opened}>
      {!opened ? (
        <form className="panel form" onSubmit={open}>
          <div className="big-icon"><Icon icon={LockKeyholeOpenIcon} size={28} /></div>
          <div>
            <h1>{t('release.title', { owner: data.owner })}</h1>
            <p className="muted" style={{ marginTop: 8 }}>{t('release.body', { nominee: data.nominee, owner: data.owner, date: date(data.released_at) })}</p>
          </div>
          <div className="field">
            <label htmlFor="card-code">{t('release.codeLabel')}</label>
            <input id="card-code" className="input code-input" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" autoComplete="off" spellCheck="false" autoCapitalize="characters" />
            <span className="hint">{t('release.codeHint', { hint: data.card_hint })}</span>
          </div>
          {failure && <Alert tone="error">{failure}</Alert>}
          <div><Button type="submit" loading={busy} disabled={c.normalizeCode(code).length < 28}>{t('release.open')}</Button></div>
          <p className="faint small">{t('release.privacy')}</p>
        </form>
      ) : (
        <>
          <div>
            <h1>{t('release.openedTitle', { owner: data.owner })}</h1>
            <p className="muted" style={{ marginTop: 8 }}>{t('release.openedBody', { n: opened.length })}</p>
          </div>
          {opened.length === 0 ? <p className="faint">{t('release.nothing')}</p> : opened.map((item) => (
            <ReleasedAsset key={item.id} token={token} item={item} />
          ))}
          <Alert tone="info">{t('release.advice')}</Alert>
        </>
      )}
    </PublicLayout>
  );
}
