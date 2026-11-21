import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import * as c from './crypto';
import { useVault } from '../context/VaultContext';

/** Load assets + nominees and decrypt asset payloads with the master key. */
export function useVaultData() {
  const { mk } = useVault();
  const [state, setState] = useState({ loading: true, assets: [], nominees: [], error: null });

  const load = useCallback(async () => {
    try {
      const [assets, nominees] = await Promise.all([api.get('/vault/assets/'), api.get('/nominees/')]);
      const decrypted = mk
        ? await Promise.all(assets.map(async (a) => {
          try {
            return { ...a, data: await c.decryptWithAssetKey(await c.assetKey(mk, a), a) };
          } catch {
            return { ...a, data: null };
          }
        }))
        : assets;
      setState({ loading: false, assets: decrypted, nominees, error: null });
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, [mk]);

  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load };
}

const nomineeKn = (mk, nominee) => c.unwrapKey(mk, nominee.wrapped_key, nominee.key_iv);

/** Create or update an asset, its documents and who receives it. */
export async function saveAsset(mk, { existing, category, data, nomineeIds, nominees, newFiles = [], removedDocIds = [] }) {
  const ak = existing ? await c.assetKey(mk, existing) : null;
  const { ak: key, fields } = await c.encryptAsset(mk, data, ak);
  const asset = existing
    ? await api.patch(`/vault/assets/${existing.id}/`, { category, ...fields })
    : await api.post('/vault/assets/', { category, ...fields });

  for (const id of removedDocIds) await api.del(`/vault/documents/${id}/`);
  for (const file of newFiles) {
    const enc = await c.encryptFile(key, file);
    const form = new FormData();
    form.append('blob', enc.blob, 'document.bin');
    form.append('file_iv', enc.file_iv);
    form.append('meta_ciphertext', enc.meta_ciphertext);
    form.append('meta_iv', enc.meta_iv);
    await api.post(`/vault/assets/${asset.id}/documents/`, form);
  }

  const chosen = nominees.filter((n) => nomineeIds.includes(n.id));
  const assignments = await Promise.all(chosen.map(async (n) => {
    const { wrapped, iv } = await c.wrapKey(await nomineeKn(mk, n), key);
    return { nominee: n.id, wrapped_key: wrapped, iv };
  }));
  await api.put(`/assets/${asset.id}/assignments/`, { assignments });
  return asset;
}

export async function deleteAsset(asset) {
  await api.del(`/vault/assets/${asset.id}/`);
}

/** New nominee: generate a key split, upload the server half, grant chosen assets. */
export async function createNominee(mk, form, assets) {
  const keys = await c.createNomineeKeys(mk);
  const nominee = await api.post('/nominees/', { ...form, ...keys.fields });
  if (assets.length) {
    await api.put(`/nominees/${nominee.id}/assignments/`, { assignments: await c.grantsFor(mk, keys.kn, assets) });
  }
  return { nominee, card: keys.card };
}

export async function setNomineeAssets(mk, nominee, assets) {
  const kn = await nomineeKn(mk, nominee);
  return api.put(`/nominees/${nominee.id}/assignments/`, { assignments: await c.grantsFor(mk, kn, assets) });
}

/** Replace a nominee's Legacy Card. The old card stops working. */
export async function reissueCard(mk, nominee, assets) {
  const keys = await c.createNomineeKeys(mk);
  const assignments = await c.grantsFor(mk, keys.kn, assets);
  const updated = await api.post(`/nominees/${nominee.id}/reissue/`, { ...keys.fields, assignments });
  return { nominee: updated, card: keys.card };
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function downloadDocument(ak, doc, path) {
  const buffer = await api.get(path, { raw: true, auth: !path.startsWith('/public/') });
  const file = await c.decryptFile(ak, doc, buffer);
  saveBlob(file.blob, file.name);
}
