import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler, tokens } from '../lib/api';
import { useI18n } from '../i18n';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const { setLang } = useI18n();

  // The language picked on this device wins; the profile's language is only
  // used on a device that has never chosen one.
  const adopt = useCallback((u) => {
    setUser(u);
    let chosen = null;
    try { chosen = localStorage.getItem('dw.lang'); } catch { /* storage blocked */ }
    if (u?.language && !chosen) setLang(u.language);
  }, [setLang]);

  const clear = useCallback(() => {
    tokens.set(null);
    setUser(null);
  }, []);

  // Language toggled anywhere in the app is saved to the profile, so emails follow it too.
  const { lang } = useI18n();
  useEffect(() => {
    if (!user || user.language === lang) return;
    setUser((u) => ({ ...u, language: lang }));
    api.patch('/auth/me/', { language: lang }).catch(() => {});
  }, [lang, user]);

  useEffect(() => {
    setUnauthorizedHandler(clear);
    if (!tokens.get()) { setReady(true); return; }
    api.get('/auth/me/')
      .then(adopt)
      .catch(clear)
      .finally(() => setReady(true));
  }, [adopt, clear]);

  const value = useMemo(() => ({
    user,
    ready,
    async login(email, password) {
      const data = await api.post('/auth/login/', { email, password }, { auth: false });
      tokens.set({ access: data.access, refresh: data.refresh });
      adopt(data.user);
      return data.user;
    },
    async register(form) {
      const data = await api.post('/auth/register/', form, { auth: false });
      tokens.set({ access: data.access, refresh: data.refresh });
      adopt(data.user);
      return data.user;
    },
    async logout() {
      const t = tokens.get();
      try { await api.post('/auth/logout/', { refresh: t?.refresh }); } catch { /* already gone */ }
      clear();
    },
    async refreshUser() {
      adopt(await api.get('/auth/me/'));
    },
    async updateProfile(patch) {
      const u = await api.patch('/auth/me/', patch);
      adopt(u);
      return u;
    },
    clear,
  }), [user, ready, adopt, clear]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
