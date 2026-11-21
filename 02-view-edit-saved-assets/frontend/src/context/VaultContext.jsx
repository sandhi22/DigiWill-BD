import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import * as c from '../lib/crypto';
import { useAuth } from './AuthContext';

/**
 * Holds the decrypted master key in memory only. It is never written to
 * storage: a reload, sign-out or 10 idle minutes locks the vault again.
 */
const VaultContext = createContext(null);
const IDLE_MS = 10 * 60 * 1000;

export function VaultProvider({ children }) {
  const { user, refreshUser } = useAuth();
  const [mk, setMk] = useState(null);
  const timer = useRef(null);

  const lock = useCallback(() => setMk(null), []);

  useEffect(() => { if (!user) lock(); }, [user, lock]);

  useEffect(() => {
    if (!mk) return undefined;
    const bump = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(lock, IDLE_MS);
    };
    const events = ['pointerdown', 'keydown', 'scroll'];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    bump();
    return () => {
      clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
  }, [mk, lock]);

  const value = useMemo(() => ({
    mk,
    status: !user?.has_vault ? 'none' : mk ? 'unlocked' : 'locked',
    lock,
    async create(passphrase) {
      const { mk: key, record } = await c.createVault(passphrase);
      await api.post('/vault/key/', record);
      await refreshUser();
      setMk(key);
    },
    async unlock(passphrase) {
      const record = await api.get('/vault/key/');
      setMk(await c.unlockVault(passphrase, record));
    },
    async changePassphrase(current, next) {
      const record = await api.get('/vault/key/');
      const key = await c.unlockVault(current, record);
      await api.put('/vault/key/', await c.rewrapVault(key, next));
      setMk(key);
    },
    async reset(password) {
      await api.del('/vault/key/', { password });
      setMk(null);
      await refreshUser();
    },
  }), [mk, user, lock, refreshUser]);

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export const useVault = () => useContext(VaultContext);
