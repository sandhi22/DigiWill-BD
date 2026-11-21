import { useState } from 'react';
import {
  Delete02Icon,
  Edit02Icon,
  HeartHandshakeIcon,
  PlusSignIcon,
  RefreshIcon,
  SendIcon,
} from '@hugeicons/core-free-icons';
import { useAuth } from '../context/AuthContext';
import { useVault } from '../context/VaultContext';
import { useI18n } from '../i18n';
import { api } from '../lib/api';
import { CATEGORY } from '../lib/categories';
import { createNominee, reissueCard, setNomineeAssets, useVaultData } from '../lib/vault';
import LegacyCardModal from '../components/LegacyCard';
import VaultGate from '../components/VaultGate';
import { Alert, Avatar, Button, Confirm, Icon, Modal, Spinner, TextField, useToast } from '../components/ui';

const RELATIONS = ['spouse', 'son', 'daughter', 'father', 'mother', 'brother', 'sister', 'friend', 'lawyer'];

function assetName(a) {
  return a.data ? a.data.title || a.data.provider : '—';
}

function NomineeEditor({ nominee, assets, onClose, onSaved }) {
  const { t, lang, err } = useI18n();
  const { mk } = useVault();
  const [form, setForm] = useState({
    name: nominee?.name || '',
    email: nominee?.email || '',
    phone: nominee?.phone || '',
    relation: nominee?.relation || '',
    language: nominee?.language || lang,
  });
  const [chosen, setChosen] = useState(nominee?.asset_ids || assets.map((a) => a.id));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const picked = assets.filter((a) => chosen.includes(a.id));
      if (nominee) {
        await api.patch(`/nominees/${nominee.id}/`, form);
        await setNomineeAssets(mk, nominee, picked);
        onSaved({ kind: 'updated' });
      } else {
        const { nominee: created, card } = await createNominee(mk, form, picked);
        onSaved({ kind: 'added', nominee: created, card });
      }
    } catch (e2) {
      setError(e2);
      setBusy(false);
    }
  };

  return (
    <Modal wide title={nominee ? t('nominees.editTitle') : t('nominees.addTitle')} onClose={onClose} footer={(
      <>
        <Button className="secondary" type="button" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" form="nominee-form" loading={busy}>{nominee ? t('nominees.save') : t('nominees.addAndCard')}</Button>
      </>
    )}>
      <form id="nominee-form" className="form" onSubmit={submit}>
        <div className="row-2">
          <TextField label={t('nominees.name')} required value={form.name} onChange={set('name')} error={error?.field?.('name')} />
          <TextField label={t('nominees.relation')} value={form.relation} onChange={set('relation')} list="relations" />
        </div>
        <datalist id="relations">{RELATIONS.map((r) => <option key={r} value={t(`nominees.relations.${r}`)} />)}</datalist>
        <div className="row-2">
          <TextField label={t('nominees.email')} type="email" required value={form.email} onChange={set('email')}
            error={error?.field?.('email')} hint={nominee ? t('nominees.emailChangeHint') : t('nominees.emailHint')} />
          <TextField label={t('nominees.phone')} type="tel" value={form.phone} onChange={set('phone')} placeholder="01XXXXXXXXX" />
        </div>
        <div className="field">
          <span className="label">{t('nominees.language')}</span>
          <div className="segmented">
            <button type="button" aria-pressed={form.language === 'bn'} onClick={() => setForm({ ...form, language: 'bn' })} lang="bn">বাংলা</button>
            <button type="button" aria-pressed={form.language === 'en'} onClick={() => setForm({ ...form, language: 'en' })} lang="en">English</button>
          </div>
        </div>
        <div className="field">
          <span className="label">{t('nominees.receives')}</span>
          {assets.length === 0 ? (
            <p className="faint small">{t('nominees.noAssetsYet')}</p>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {assets.map((a) => {
                const on = chosen.includes(a.id);
                return (
                  <label key={a.id} className={`check${on ? ' on' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => setChosen(on ? chosen.filter((x) => x !== a.id) : [...chosen, a.id])} />
                    <Icon icon={CATEGORY[a.category].icon} size={18} style={{ color: 'var(--ink-3)' }} />
                    <span style={{ flex: 1 }}>{assetName(a)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
        {error && !error.field?.('email') && !error.field?.('name') && <Alert tone="error">{err(error)}</Alert>}
      </form>
    </Modal>
  );
}

function NomineesInner() {
  const { t, date, err } = useI18n();
  const { user } = useAuth();
  const { mk } = useVault();
  const toast = useToast();
  const { loading, assets, nominees, error, reload } = useVaultData();
  const [editing, setEditing] = useState(null);
  const [card, setCard] = useState(null); // { nominee, card, reissued }
  const [removing, setRemoving] = useState(null);
  const [reissuing, setReissuing] = useState(null);
  const [actionError, setActionError] = useState('');

  const resend = async (n) => {
    try { await api.post(`/nominees/${n.id}/resend/`); toast(t('nominees.inviteSent', { name: n.name })); await reload(); } catch (e) { setActionError(err(e)); }
  };

  if (loading) return <div className="loading-screen"><Spinner /></div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('nominees.title')}</h1>
          <p className="muted">{t('nominees.subtitle')}</p>
        </div>
        {nominees.length > 0 && <Button onClick={() => setEditing('new')}><Icon icon={PlusSignIcon} size={18} />{t('nominees.add')}</Button>}
      </div>

      {(error || actionError) && <Alert tone="error">{actionError || err(error)}</Alert>}

      {nominees.length === 0 ? (
        <div className="empty">
          <div className="big-icon"><Icon icon={HeartHandshakeIcon} size={28} /></div>
          <h2>{t('nominees.emptyTitle')}</h2>
          <p>{t('nominees.emptyBody')}</p>
          <Button onClick={() => setEditing('new')}>{t('nominees.addFirst')}</Button>
        </div>
      ) : (
        <div className="people">
          {nominees.map((n) => {
            const theirs = assets.filter((a) => n.asset_ids.includes(a.id));
            return (
              <article className="person" key={n.id}>
                <Avatar name={n.name} lg />
                <div style={{ minWidth: 0 }}>
                  <div className="person-name">
                    <h3>{n.name}</h3>
                    <span className={`chip ${n.status === 'verified' ? 'ok' : n.status === 'declined' ? 'bad' : 'warn'}`}>
                      <span className="dot" />{t(`nominees.status.${n.status}`)}
                    </span>
                  </div>
                  <div className="person-meta">
                    {n.relation && <span>{n.relation}</span>}
                    <span>{n.email}</span>
                    {n.phone && <span>{n.phone}</span>}
                  </div>
                  <p className="faint small" style={{ marginTop: 6 }}>
                    {t('nominees.cardLine', { hint: n.card_hint, date: date(n.card_issued_at) })}
                  </p>
                  {n.status === 'invited' && <p className="small" style={{ color: 'var(--marigold)', marginTop: 4 }}>{t('nominees.waiting')}</p>}
                  {n.status === 'declined' && <p className="small" style={{ color: 'var(--brick)', marginTop: 4 }}>{t('nominees.declinedNote')}</p>}
                  {n.opened_at && <p className="small" style={{ color: 'var(--brick)', marginTop: 4 }}>{t('nominees.opened', { date: date(n.opened_at) })}</p>}
                  <div className="person-assets">
                    {theirs.length ? theirs.map((a) => (
                      <span className="chip" key={a.id}><Icon icon={CATEGORY[a.category].icon} size={14} />{assetName(a)}</span>
                    )) : <span className="faint small">{t('nominees.nothingAssigned')}</span>}
                  </div>
                </div>
                <div className="person-actions">
                  {n.status !== 'verified' && (
                    <button className="icon-btn" onClick={() => resend(n)} title={t('nominees.resend')} aria-label={t('nominees.resend')}><Icon icon={SendIcon} size={18} /></button>
                  )}
                  <button className="icon-btn" onClick={() => setReissuing(n)} title={t('nominees.reissue')} aria-label={t('nominees.reissue')}><Icon icon={RefreshIcon} size={18} /></button>
                  <button className="icon-btn" onClick={() => setEditing(n)} title={t('common.edit')} aria-label={t('common.edit')}><Icon icon={Edit02Icon} size={18} /></button>
                  <button className="icon-btn" onClick={() => setRemoving(n)} title={t('common.remove')} aria-label={t('common.remove')}><Icon icon={Delete02Icon} size={18} /></button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {editing && (
        <NomineeEditor nominee={editing === 'new' ? null : editing} assets={assets} onClose={() => setEditing(null)}
          onSaved={async (res) => {
            setEditing(null);
            await reload();
            if (res.card) setCard({ nominee: res.nominee, card: res.card });
            else toast(t('nominees.updated'));
          }} />
      )}
      {card && (
        <LegacyCardModal owner={user.full_name} nominee={card.nominee} card={card.card} reissued={card.reissued}
          onDone={() => { setCard(null); toast(card.reissued ? t('nominees.cardReissued') : t('nominees.added', { name: card.nominee.name })); }} />
      )}
      {reissuing && (
        <Confirm title={t('nominees.reissueTitle', { name: reissuing.name })} body={t('nominees.reissueBody')} confirmLabel={t('nominees.reissue')}
          tone="" onClose={() => setReissuing(null)}
          onConfirm={async () => {
            const theirs = assets.filter((a) => reissuing.asset_ids.includes(a.id));
            const res = await reissueCard(mk, reissuing, theirs);
            await reload();
            setCard({ nominee: res.nominee, card: res.card, reissued: true });
          }} />
      )}
      {removing && (
        <Confirm title={t('nominees.removeTitle', { name: removing.name })} body={t('nominees.removeBody')} confirmLabel={t('common.remove')}
          onClose={() => setRemoving(null)}
          onConfirm={async () => { await api.del(`/nominees/${removing.id}/`); await reload(); toast(t('nominees.removed')); }} />
      )}
    </>
  );
}

export default function Nominees() {
  return (
    <div className="page">
      <VaultGate><NomineesInner /></VaultGate>
    </div>
  );
}
