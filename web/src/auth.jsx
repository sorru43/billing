import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, permissions: {}, company: {} });
  // Logo versions are public (the login page needs them), so they're tracked outside the session state.
  const [logos, setLogos] = useState({ dashboard: null, invoice: null });
  const refreshLogos = useCallback(async () => {
    try {
      const { data } = await api.get('/branding');
      setLogos(data.logos);
    } catch {
      /* keep defaults */
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/auth/me');
      setState({ loading: false, user: data.user, permissions: data.permissions, company: data.company || {} });
    } catch {
      setState({ loading: false, user: null, permissions: {}, company: {} });
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setState((s) => (s.user ? { loading: false, user: null, permissions: {}, company: {} } : s)));
    refresh();
    refreshLogos();
  }, [refresh, refreshLogos]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setState({ loading: false, user: null, permissions: {}, company: {} });
    }
  }, []);

  // Mirrors the server check. The server is the real gate; this only hides UI.
  const can = useCallback(
    (slug, action = 'view') => state.user?.user_type === 1 || Boolean(state.permissions?.[slug]?.[action]),
    [state.user, state.permissions],
  );

  const value = useMemo(
    () => ({ ...state, refresh, logout, can, logos, refreshLogos }),
    [state, refresh, logout, can, logos, refreshLogos],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export function useMoney() {
  const { company } = useAuth();
  const sym = '$';
  return useCallback(
    (n, decimals = 2) =>
      `${sym}${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`,
    [sym],
  );
}

export const formatDate = (d) =>
  d ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

// Custom logo if one is uploaded, else the bundled Wise logo.
export const logoUrl = (kind, v) => (v ? `/api/branding/logo/${kind}?v=${v}` : '/static/wise-logo.svg');

export function Logo({ kind, className = 'w-32', alt = 'Logo' }) {
  const { logos } = useAuth();
  const v = logos?.[kind];
  // Custom logos keep their aspect ratio inside the same footprint as the default.
  return v ? (
    <img src={logoUrl(kind, v)} alt={alt} className={`${className} h-auto max-h-14 object-contain object-left`} />
  ) : (
    <img src={logoUrl(kind)} alt={alt} className={className} />
  );
}
