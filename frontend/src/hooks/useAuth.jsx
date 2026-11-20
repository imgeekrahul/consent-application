import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as api from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('checking'); // checking | authenticated | anonymous

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await api.getSession();
      setUser(u);
      setStatus('authenticated');
    } catch {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Any 401 from an admin endpoint means the session expired.
  useEffect(() => {
    const id = api.default.interceptors.response.use(
      (r) => r,
      (err) => {
        const url = err?.config?.url || '';
        if (err?.response?.status === 401 && url.startsWith('/admin/') && !url.startsWith('/admin/login') && !url.startsWith('/admin/me')) {
          setUser(null);
          setStatus('anonymous');
        }
        return Promise.reject(err);
      },
    );
    return () => api.default.interceptors.response.eject(id);
  }, []);

  const login = useCallback(async (username, password) => {
    const { user: u } = await api.login(username, password);
    setUser(u);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  const value = useMemo(() => ({ user, status, login, logout, refresh }), [user, status, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
