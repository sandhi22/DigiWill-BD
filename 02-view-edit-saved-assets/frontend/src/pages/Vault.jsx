import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy01Icon,
  Delete02Icon,
  Download04Icon,
  Edit02Icon,
  File01Icon,
  FileAttachmentIcon,
  PlusSignIcon,
  Search01Icon,
  Upload04Icon,
  ViewIcon,
  ViewOffIcon,
} from '@hugeicons/core-free-icons';
import { useVault } from '../context/VaultContext';
import { useI18n } from '../i18n';
import * as c from '../lib/crypto';
import { CATEGORIES, CATEGORY, EMPTY_ASSET, maskIdentifier } from '../lib/categories';
import { deleteAsset, downloadDocument, saveAsset, useVaultData } from '../lib/vault';
import VaultGate from '../components/VaultGate';
import { Alert, Avatar, Button, Confirm, Icon, Modal, Spinner, TextField, useToast } from '../components/ui';

const MAX_BYTES = 10 * 1024 * 1024;

function useDocNames(mk, asset) {
  const [names, setNames] = useState({});
  useEffect(() => {
    let live = true;
    if (!asset?.documents?.length) { setNames({}); return undefined; }
    (async () => {
      const ak = await c.assetKey(mk, asset);
      const entries = await Promise.all(asset.documents.map(async (d) => {
        try { return [d.id, (await c.decryptFileMeta(ak, d)).name]; } catch { return [d.id, '—']; }
      }));
      if (live) setNames(Object.fromEntries(entries));
    })();
    return () => { live = false; };
  }, [mk, asset]);
  return names;
}

function NomineeChoice({ nominees, chosen, setChosen }) {
  const { t } = useI18n();
  if (!nominees.length) return <p className="faint small">{t('assets.noNomineesYet')}</p>;
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {nominees.map((n) => {
        const on = chosen.includes(n.id);
        return (
          <label key={n.id} className={`check${on ? ' on' : ''}`}>
            <input type="checkbox" checked={on}
              onChange={() => setChosen(on ? chosen.filter((x) => x !== n.id) : [...chosen, n.id])} />
            <span style={{ flex: 1 }}>{n.name}{n.relation && <span className="faint small"> ({n.relation})</span>}</span>
            {n.status !== 'verified' && <span className="chip warn">{t(`nominees.status.${n.status}`)}</span>}
          </label>
        );
      })}
    </div>
  );
}

function AssetEditor({ asset, nominees, onClose, onSaved }) {
  const { t, bytes, err } = useI18n();
  const { mk } = useVault();
  const [category, setCategory] = useState(asset?.category || 'mobile_banking');
  const [data, setData] = useState({ ...EMPTY_ASSET, ...(asset?.data || {}) });
  const [chosen, setChosen] = useState(asset?.nominee_ids || []);
  const [files, setFiles] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const names = useDocNames(mk, asset);
  const meta = CATEGORY[category];
  const set = (k) => (e) => setData({ ...data, [k]: e.target.value });

  const addFiles = (list) => {
    const ok = [...list].filter((f) => f.size <= MAX_BYTES);
    if (ok.length < list.length) setError(t('assets.tooBig'));
    setFiles((fs) => [...fs, ...ok]);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!data.title.trim() && !data.provider.trim()) return setError(t('assets.needName'));
    setBusy(true);
    setError('');
    try {
      await saveAsset(mk, { existing: asset, category, data, nomineeIds: chosen, nominees, newFiles: files, removedDocIds: removed });
      onSaved(asset ? 'updated' : 'added');
    } catch (e2) {
      setError(err(e2));
      setBusy(false);
    }
  };

  return (
    <Modal wide title={asset ? t('assets.editTitle') : t('assets.addTitle')} onClose={onClose} footer={(
      <>
        <Button className="secondary" type="button" onClick={onClose}>{t('common.cancel')}</Button>
        <Button type="submit" form="asset-form" loading={busy}>{busy ? t('assets.encrypting') : t('assets.save')}</Button>
      </>
    )}>
      <form id="asset-form" className="form" onSubmit={submit}>
        <div className="field">
          <span className="label">{t('assets.category')}</span>
          <div className="segmented">
            {CATEGORIES.map((cat) => (
              <button key={cat.key} type="button" aria-pressed={category === cat.key} onClick={() => setCategory(cat.key)}>
                <Icon icon={cat.icon} size={17} />{t(`categories.${cat.key}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="row-2">
          <TextField label={t('assets.provider')} value={data.provider} onChange={set('provider')} list={`providers-${category}`}
            placeholder={meta.providers[0] || ''} />
          <TextField label={t('assets.titleLabel')} value={data.title} onChange={set('title')} placeholder={t(`assets.titlePh.${category}`)} />
        </div>
        <datalist id={`providers-${category}`}>{meta.providers.map((p) => <option key={p} value={p} />)}</datalist>

        <div className="row-2">
          <TextField label={t(`assets.identifier.${category}`)} value={data.identifier} onChange={set('identifier')} autoComplete="off" />
          <TextField label={t(`assets.secret.${category}`)} value={data.secret} onChange={set('secret')} autoComplete="off"
            type="password" hint={t('assets.secretHint')} />
        </div>

        <TextField textarea label={t('assets.instructions')} value={data.instructions} onChange={set('instructions')}
          placeholder={t(`assets.instructionsPh.${category}`)} hint={t('assets.instructionsHint')} />

        <div className="field">
          <span className="label">{t('assets.documents')}</span>
          <div className="file-list">
            {(asset?.documents || []).filter((d) => !removed.includes(d.id)).map((d) => (
              <div className="file" key={d.id}>
                <Icon icon={File01Icon} />
                <div className="grow"><div className="name">{names[d.id] || '…'}</div><div className="faint tiny">{bytes(d.size)}</div></div>
                <button type="button" className="icon-btn" onClick={() => setRemoved([...removed, d.id])} aria-label={t('common.remove')}>
                  <Icon icon={Delete02Icon} size={18} />
                </button>
              </div>
            ))}
            {files.map((f, i) => (
              <div className="file" key={`${f.name}-${i}`}>
                <Icon icon={Upload04Icon} />
                <div className="grow"><div className="name">{f.name}</div><div className="faint tiny">{t('assets.willEncrypt', { size: bytes(f.size) })}</div></div>
                <button type="button" className="icon-btn" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label={t('common.remove')}>
                  <Icon icon={Delete02Icon} size={18} />
                </button>
              </div>
            ))}
            <div className={`dropzone${over ? ' over' : ''}`} role="button" tabIndex={0}
              onClick={() => fileInput.current?.click()}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
              <Icon icon={FileAttachmentIcon} />
              <span>{t('assets.dropFiles')}</span>
              <span className="faint tiny">{t('assets.fileLimit')}</span>
            </div>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>
        </div>

        <div className="field">
          <span className="label">{t('assets.releaseTo')}</span>
          <span className="hint" style={{ marginTop: -2 }}>{t('assets.releaseToHint')}</span>
          <NomineeChoice nominees={nominees} chosen={chosen} setChosen={setChosen} />
        </div>

        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Modal>
  );
}

function CopyButton({ value }) {
  const { t } = useI18n();
  const toast = useToast();
  return (
    <button className="icon-btn" onClick={async () => { await navigator.clipboard.writeText(value); toast(t('common.copied')); }}
      aria-label={t('common.copy')}>
      <Icon icon={Copy01Icon} size={17} />
    </button>
  );
}

export function SecretValue({ value }) {
  const { t } = useI18n();
  const [shown, setShown] = useState(false);
  return (
    <span className="v">
      <span className="secret">{shown ? value : '••••••••'}</span>
      <button className="icon-btn" onClick={() => setShown(!shown)} aria-label={shown ? t('common.hide') : t('common.show')}>
        <Icon icon={shown ? ViewOffIcon : ViewIcon} size={17} />
      </button>
      <CopyButton value={value} />
    </span>
  );
}

function AssetDetail({ asset, nominees, onClose, onEdit, onDeleted }) {
  const { t, bytes, date, err } = useI18n();
  const { mk } = useVault();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const names = useDocNames(mk, asset);
  const d = asset.data || {};
  const receivers = nominees.filter((n) => asset.nominee_ids.includes(n.id));

  const download = async (doc) => {
    try { await downloadDocument(await c.assetKey(mk, asset), doc, `/vault/documents/${doc.id}/`); } catch (e) { setError(err(e)); }
  };

  return (
    <Modal drawer title={d.title || d.provider || t(`categories.${asset.category}`)} onClose={onClose} footer={(
      <>
        <Button className="ghost" onClick={() => setConfirming(true)} style={{ marginRight: 'auto', color: 'var(--brick)' }}>
          <Icon icon={Delete02Icon} size={18} />{t('common.delete')}
        </Button>
        <Button onClick={onEdit}><Icon icon={Edit02Icon} size={18} />{t('common.edit')}</Button>
      </>
    )}>
      <span className="chip" style={{ justifySelf: 'start' }}>{t(`categories.${asset.category}`)}</span>
      <div className="detail-fields">
        {d.provider && <div className="detail-field"><span className="k">{t('assets.provider')}</span><span className="v">{d.provider}</span></div>}
        {d.identifier && (
          <div className="detail-field">
            <span className="k">{t(`assets.identifier.${asset.category}`)}</span>
            <span className="v">{d.identifier}<CopyButton value={d.identifier} /></span>
          </div>
        )}
        {d.secret && <div className="detail-field"><span className="k">{t(`assets.secret.${asset.category}`)}</span><SecretValue value={d.secret} /></div>}
        <div className="detail-field">
          <span className="k">{t('assets.instructions')}</span>
          <span className="v pre">{d.instructions || <span className="faint">{t('assets.noInstructions')}</span>}</span>
        </div>
        {asset.documents.length > 0 && (
          <div className="detail-field">
            <span className="k">{t('assets.documents')}</span>
            <div className="file-list" style={{ marginTop: 6 }}>
              {asset.documents.map((doc) => (
                <div className="file" key={doc.id}>
                  <Icon icon={File01Icon} />
                  <div className="grow"><div className="name">{names[doc.id] || '…'}</div><div className="faint tiny">{bytes(doc.size)}</div></div>
                  <button className="icon-btn" onClick={() => download(doc)} aria-label={t('common.download')}><Icon icon={Download04Icon} size={18} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="detail-field">
          <span className="k">{t('assets.receivedBy')}</span>
          {receivers.length ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
              {receivers.map((n) => <span className="chip" key={n.id}>{n.name}</span>)}
            </div>
          ) : <span className="v faint">{t('assets.noReceivers')}</span>}
        </div>
      </div>
      <p className="faint tiny">{t('assets.updated', { date: date(asset.updated_at) })}</p>
      {error && <Alert tone="error">{error}</Alert>}
      {confirming && (
        <Confirm title={t('assets.deleteTitle')} body={t('assets.deleteBody')} confirmLabel={t('common.delete')}
          onClose={() => setConfirming(false)} onConfirm={async () => { await deleteAsset(asset); onDeleted(); }} />
      )}
    </Modal>
  );
}

function VaultInner() {
  const { t, num, err } = useI18n();
  const toast = useToast();
  const { loading, assets, nominees, error, reload } = useVaultData();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null); // null | 'new' | asset
  const [viewing, setViewing] = useState(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assets.filter((a) => (filter === 'all' || a.category === filter)
      && (!q || [a.data?.title, a.data?.provider, a.data?.identifier].some((v) => v?.toLowerCase().includes(q))));
  }, [assets, filter, query]);

  const present = CATEGORIES.filter((cat) => assets.some((a) => a.category === cat.key));
  const groups = filter === 'all'
    ? present.map((cat) => ({ cat, items: shown.filter((a) => a.category === cat.key) })).filter((g) => g.items.length)
    : [{ cat: CATEGORY[filter], items: shown }];

  const nomineeName = (id) => nominees.find((n) => n.id === id)?.name || '';

  if (loading) return <div className="loading-screen"><Spinner /></div>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('assets.title')}</h1>
          <p className="muted">{t('assets.subtitle')}</p>
        </div>
        {assets.length > 0 && <Button onClick={() => setEditing('new')}><Icon icon={PlusSignIcon} size={18} />{t('assets.add')}</Button>}
      </div>

      {error && <Alert tone="error">{err(error)}</Alert>}

      {assets.length === 0 ? (
        <div className="empty">
          <div className="big-icon"><Icon icon={PlusSignIcon} size={26} /></div>
          <h2>{t('assets.emptyTitle')}</h2>
          <p>{t('assets.emptyBody')}</p>
          <Button onClick={() => setEditing('new')}>{t('assets.addFirst')}</Button>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <label className="search">
              <span className="sr-only">{t('assets.search')}</span>
              <Icon icon={Search01Icon} size={18} />
              <input className="input" type="search" placeholder={t('assets.search')} value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {present.length > 1 && (
              <div className="segmented">
                <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>{t('assets.all')} <span className="faint">{num(assets.length)}</span></button>
                {present.map((cat) => (
                  <button key={cat.key} aria-pressed={filter === cat.key} onClick={() => setFilter(cat.key)}>
                    <Icon icon={cat.icon} size={16} />{t(`categories.${cat.key}`)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {shown.length === 0 ? (
            <p className="faint">{t('assets.noMatch')}</p>
          ) : (
            <div className="asset-list">
              {groups.map(({ cat, items }) => (
                <div key={cat.key} role="group" aria-label={t(`categories.${cat.key}`)}>
                  {filter === 'all' && <div className="group-label">{t(`categories.${cat.key}`)}</div>}
                  {items.map((a) => (
                    <button key={a.id} className="asset-row" onClick={() => setViewing(a)}>
                      <span className="cat-icon"><Icon icon={cat.icon} /></span>
                      <span style={{ minWidth: 0 }}>
                        <span className="title" style={{ display: 'block' }}>{a.data ? a.data.title || a.data.provider : t('assets.unreadable')}</span>
                        <span className="sub" style={{ display: 'block' }}>
                          {[a.data?.title && a.data?.provider, maskIdentifier(a.data?.identifier)].filter(Boolean).join('\u2003')}
                        </span>
                      </span>
                      <span className="meta">
                        {a.documents.length > 0 && <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Icon icon={FileAttachmentIcon} size={16} />{num(a.documents.length)}</span>}
                        {a.nominee_ids.length > 0 ? (
                          <span className="avatars">{a.nominee_ids.slice(0, 3).map((id) => <Avatar key={id} name={nomineeName(id)} />)}</span>
                        ) : <span className="chip">{t('assets.noOne')}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <AssetEditor asset={editing === 'new' ? null : editing} nominees={nominees} onClose={() => setEditing(null)}
          onSaved={async (kind) => { setEditing(null); setViewing(null); await reload(); toast(t(`assets.saved_${kind}`)); }} />
      )}
      {viewing && !editing && (
        <AssetDetail asset={viewing} nominees={nominees} onClose={() => setViewing(null)}
          onEdit={() => setEditing(viewing)}
          onDeleted={async () => { setViewing(null); await reload(); toast(t('assets.deleted')); }} />
      )}
    </>
  );
}

export default function Vault() {
  return (
    <div className="page">
      <VaultGate><VaultInner /></VaultGate>
    </div>
  );
}
