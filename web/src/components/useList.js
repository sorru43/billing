import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { toast } from 'react-toastify';
import { api } from '../api.js';
import { useDebounced } from './ui.jsx';

// Shared state for list pages: search/limit/page live in the URL like the original app.
// `filters` names extra URL params passed through to the API (e.g. ['vendorId']).
export function useList(endpoint, key, filters = []) {
  const [params, setParams] = useSearchParams();
  const search = params.get('search') || '';
  const limit = Number(params.get('limit') || 10);
  const page = Number(params.get('page') || 1);
  const debounced = useDebounced(search);
  const extra = filters.map((f) => [f, params.get(f) || '']).filter(([, v]) => v);
  const extraKey = JSON.stringify(extra);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({});
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(endpoint, { search: debounced, limit, page, ...Object.fromEntries(JSON.parse(extraKey)) });
      const { [key]: list, pagination: p, ...rest } = data;
      setRows(list || []);
      setPagination(p);
      setMeta(rest);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, key, debounced, limit, page, extraKey]);

  useEffect(() => {
    load();
  }, [load]);

  const set = (next) => setParams({ ...Object.fromEntries(extra), search, limit: String(limit), page: String(page), ...next });
  return {
    rows, meta, pagination, loading, reload: load, search, limit, page,
    setSearch: (v) => set({ search: v, page: '1' }),
    setLimit: (v) => set({ limit: String(v), page: '1' }),
    setPage: (v) => set({ page: String(v) }),
  };
}
