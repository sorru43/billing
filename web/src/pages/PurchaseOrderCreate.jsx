import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'react-toastify';
import { Check, CirclePlus, Mail, RotateCcw, Send, Split, TriangleAlert, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useMoney, formatDate } from '../auth.jsx';
import EmailPoModal from '../components/EmailPoModal.jsx';
import { CancelButton, Field, Modal, SubmitButton, inputCls, useDebounced } from '../components/ui.jsx';
import { ProductPicker } from './InvoiceCreate.jsx';

const today = () => new Date().toLocaleDateString('en-CA');
const round2 = (n) => Math.round(n * 100) / 100;
const newRow = () => ({ key: crypto.randomUUID(), product: null, quantity: 1, cost: '', vendorId: null, manual: false });
const smallCls = 'p-2 h-10 w-full border text-gray-700 text-sm border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600';

// Saved vendors only: a purchase order must belong to a real vendor.
function VendorSelect({ vendor, onPick, error }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const debounced = useDebounced(q, 200);
  useEffect(() => {
    if (!open) return;
    api.get('/vendors/options', { search: debounced }).then((r) => setResults(r.data)).catch(() => setResults([]));
  }, [debounced, open]);
  return (
    <div className="relative">
      <input
        value={open ? q : vendor?.name || ''}
        onFocus={() => (setQ(''), setOpen(true))}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search saved vendors..."
        className={`${inputCls} ${error ? 'border-red-500' : ''}`}
        aria-label="Vendor"
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-auto">
          {results.map((v) => (
            <button
              type="button"
              key={v.id}
              onMouseDown={() => (onPick(v), setOpen(false))}
              className="block w-full text-left px-3 py-2 text-sm hover:bg-purple-50 cursor-pointer"
            >
              <span className="font-medium text-gray-950">{v.name}</span>
              {v.company && <span className="text-gray-500"> · {v.company}</span>}
            </button>
          ))}
          {!results.length && <p className="px-3 py-2 text-sm text-gray-500">No vendors found. Add one under Vendors first.</p>}
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

// Pop-up list of products to reorder. Filter by category (catalogue) and brand (company), and choose
// which stock levels to show: at/below each product's alert level, every quantity, or less than a typed number.
// Quantities typed survive filter changes, so you can build one order across several filters.
const SHOW_OPTIONS = [
  ['alert', 'Low stock (at or below alert level)'],
  ['all', 'All quantities'],
  ['below', 'Less than…'],
];
function LowStockModal({ isOpen, onClose, onAdd }) {
  const money = useMoney();
  const [items, setItems] = useState(null);
  const [qty, setQty] = useState({});
  const [seen, setSeen] = useState({}); // every product shown so far, so picks from other filters are kept
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [show, setShow] = useState('alert');
  const [below, setBelow] = useState('');
  const belowDebounced = useDebounced(below, 300);

  useEffect(() => {
    if (!isOpen) return;
    setQty({});
    setSeen({});
    api.get('/categories/options').then((r) => setCategories(r.data)).catch(() => {});
    api.get('/brands/options').then((r) => setBrands(r.data)).catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (show === 'below' && !/^\d+$/.test(String(belowDebounced).trim())) return setItems([]);
    setItems(null);
    api
      .get('/products/low-stock', { show, below: show === 'below' ? belowDebounced : undefined, category: category || undefined, brand: brand || undefined })
      .then((r) => {
        setItems(r.data.products);
        setSeen((s) => ({ ...s, ...Object.fromEntries(r.data.products.map((p) => [p.id, p])) }));
      })
      .catch((e) => (toast.error(e.message), setItems([])));
  }, [isOpen, show, belowDebounced, category, brand]);

  const chosen = Object.entries(qty).filter(([id, q]) => Number(q) > 0 && seen[id]).map(([id, q]) => ({ product: seen[id], quantity: Number(q) }));
  const hidden = chosen.filter((c) => !(items || []).some((p) => p.id === c.product.id)).length;
  const total = round2(chosen.reduce((a, c) => a + c.quantity * c.product.cost, 0));
  // Quick fill: order enough to bring every listed product back up to its alert level (at least 1).
  const fillToAlert = () =>
    setQty((q) => ({ ...q, ...Object.fromEntries((items || []).map((p) => [p.id, String(Math.max(1, p.alertLevel - p.quantity))])) }));
  const selCls = `${inputCls} bg-white h-[38px] !mt-0`;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Low Inventory" size="5xl">
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1.6fr] gap-3">
          <label className="text-xs font-semibold text-gray-600">
            Catalogue (category)
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={selCls}>
              <option value="">All categories</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-semibold text-gray-600">
            Company (brand)
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className={selCls}>
              <option value="">All brands</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <div className="text-xs font-semibold text-gray-600">
            Show
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {SHOW_OPTIONS.map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setShow(v)}
                  className={`px-2.5 py-1.5 rounded-md border text-xs cursor-pointer ${show === v ? 'bg-purple-600 border-purple-600 text-white' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  {label}
                </button>
              ))}
              {show === 'below' && (
                <input
                  type="number"
                  min="0"
                  step="1"
                  autoFocus
                  value={below}
                  onChange={(e) => setBelow(e.target.value)}
                  placeholder="e.g. 10"
                  className="w-24 px-2 py-1.5 border border-gray-300 rounded-md text-sm font-normal focus:outline-none focus:ring-1 focus:ring-purple-600"
                  aria-label="Show items with quantity less than"
                />
              )}
            </div>
          </div>
        </div>

        {!items ? (
          <p className="text-sm text-gray-500 py-6 text-center">Loading…</p>
        ) : !items.length ? (
          <p className="text-sm text-gray-500 py-6 text-center">
            {show === 'below' && !String(below).trim() ? 'Type a number to list items with less than that quantity.' : 'No products match these filters.'}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap justify-between items-center gap-2">
              <p className="text-xs text-gray-500">{items.length} product{items.length === 1 ? '' : 's'}. Type how many to order next to each one you want; leave the rest blank.</p>
              <button type="button" onClick={fillToAlert} className="text-xs text-purple-600 font-semibold cursor-pointer">
                Fill quantities up to alert level
              </button>
            </div>
            <div className="max-h-[50vh] overflow-auto border border-gray-200 rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr className="text-left text-xs uppercase text-gray-600">
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Brand</th>
                    <th className="px-3 py-2 text-right">In Stock</th>
                    <th className="px-3 py-2 text-right">Alert at</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2 w-28">Order Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-3 py-1.5">
                        <span className="block text-gray-950">{p.name}</span>
                        {p.barcode && <span className="block text-xs text-gray-400">{p.barcode}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-gray-600">{p.category || '-'}</td>
                      <td className="px-3 py-1.5 text-gray-600">{p.brand || '-'}</td>
                      <td className={`px-3 py-1.5 text-right font-semibold ${p.quantity <= 0 ? 'text-red-600' : p.quantity <= p.alertLevel ? 'text-yellow-700' : 'text-gray-700'}`}>{p.quantity}</td>
                      <td className="px-3 py-1.5 text-right text-gray-500">{p.alertLevel}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600">{money(p.cost)}</td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={qty[p.id] ?? ''}
                          onChange={(e) => setQty((q) => ({ ...q, [p.id]: e.target.value }))}
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-600"
                          aria-label={`Order quantity for ${p.name}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex flex-wrap justify-between items-center gap-2">
          <p className="text-sm text-gray-600">
            {chosen.length} product{chosen.length === 1 ? '' : 's'} · <b className="text-gray-950">{money(total)}</b> at cost
            {hidden > 0 && <span className="text-xs text-gray-500"> (incl. {hidden} picked under other filters)</span>}
          </p>
          <div className="flex gap-2">
            <CancelButton onClick={onClose} />
            <button
              type="button"
              disabled={!chosen.length}
              onClick={() => (onAdd(chosen), onClose())}
              className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-gray-950 rounded-md shadow-sm cursor-pointer disabled:opacity-50"
            >
              Add to Order
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// After a split order: one PO per vendor, each can be emailed to its vendor.
function CreatedModal({ pos, onDone, onSent }) {
  const money = useMoney();
  const [emailing, setEmailing] = useState(null);
  const [busy, setBusy] = useState(false);
  const withEmail = (pos || []).filter((p) => p.vendorEmail && !p.emailedAt);
  const emailAll = async () => {
    setBusy(true);
    for (const po of withEmail) {
      try {
        const r = await api.post(`/purchase-orders/${po.id}/email`, { to: po.vendorEmail });
        onSent(po, r.data);
      } catch (e) {
        toast.error(`${po.poNumber}: ${e.message}`);
      }
    }
    setBusy(false);
    toast.success('Done sending');
  };
  return (
    <Modal isOpen={Boolean(pos)} onClose={onDone} title={`${pos?.length || 0} purchase order${pos?.length === 1 ? '' : 's'} created`} size="3xl">
      <div className="space-y-3">
        <p className="text-sm text-gray-600">One purchase order per vendor. Send each one to its vendor by email now, or later from the purchase order page.</p>
        <div className="border border-gray-200 rounded-md divide-y divide-gray-100">
          {(pos || []).map((po) => (
            <div key={po.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <div>
                <Link to={`/admin/purchase-orders/view/${po.id}`} className="font-semibold text-purple-600 hover:underline">{po.poNumber}</Link>
                <span className="text-gray-950"> · {po.vendorName}</span>
                <span className="block text-xs text-gray-500">{po.itemCount} items · {money(po.total)} · {po.vendorEmail || 'no email saved for this vendor'}</span>
              </div>
              {po.emailedAt ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><Check size={14} /> Emailed to {po.emailedTo}</span>
              ) : (
                <button type="button" onClick={() => setEmailing(po)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-md border border-purple-600 text-purple-600 hover:bg-purple-50 cursor-pointer">
                  <Mail size={14} /> Email to vendor
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {withEmail.length > 1 && (
            <button type="button" disabled={busy} onClick={emailAll} className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-gray-950 rounded-md cursor-pointer disabled:opacity-50">
              <Send size={16} /> {busy ? 'Sending…' : `Email all ${withEmail.length} to their vendors`}
            </button>
          )}
          <button type="button" onClick={onDone} className="px-4 py-2 text-sm font-medium rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer">Done</button>
        </div>
      </div>
      <EmailPoModal po={emailing} onClose={() => setEmailing(null)} onSent={onSent} />
    </Modal>
  );
}

export default function PurchaseOrderCreate() {
  const navigate = useNavigate();
  const money = useMoney();
  const [params] = useSearchParams();
  const [mode, setMode] = useState('single'); // single = one vendor | split = one PO per vendor, picked from purchase history
  const [vendor, setVendor] = useState(null);
  const [orderDate, setOrderDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState([newRow()]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [lowOpen, setLowOpen] = useState(params.get('lowStock') === '1');
  const [prices, setPrices] = useState({}); // productId -> [{vendorId, vendorName, vendorEmail, cost, lastDate, times}] cheapest first
  const [vendors, setVendors] = useState([]); // all active vendors, for "move to"
  const [created, setCreated] = useState(null);
  const asked = useRef(new Set());

  useEffect(() => {
    const id = params.get('vendorId');
    if (id) api.get(`/vendors/${id}`).then((r) => setVendor(r.data)).catch(() => {});
  }, [params]);

  const split = mode === 'split';
  useEffect(() => {
    if (split && !vendors.length) api.get('/vendors/options', { all: '1' }).then((r) => setVendors(r.data)).catch(() => {});
  }, [split, vendors.length]);

  // Fetch who sold each product before (once per product).
  useEffect(() => {
    if (!split) return;
    const missing = [...new Set(rows.filter((r) => r.product && !asked.current.has(r.product.id)).map((r) => r.product.id))];
    if (!missing.length) return;
    missing.forEach((id) => asked.current.add(id));
    api
      .post('/purchase-orders/vendor-prices', { productIds: missing })
      .then((r) => setPrices((p) => ({ ...p, ...Object.fromEntries(missing.map((id) => [id, r.data[id] || []])) })))
      .catch((e) => (missing.forEach((id) => asked.current.delete(id)), toast.error(e.message)));
  }, [split, rows]);

  // Lines not moved by hand go to the cheapest vendor that sold them before, at that vendor's last cost.
  useEffect(() => {
    if (!split) return;
    setRows((rs) => {
      let changed = false;
      const next = rs.map((r) => {
        if (!r.product || r.manual || r.vendorId) return r;
        const best = prices[r.product.id]?.[0];
        if (!best) return r;
        changed = true;
        return { ...r, vendorId: best.vendorId, cost: best.cost };
      });
      return changed ? next : rs;
    });
  }, [split, prices, rows]);

  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const withBlank = (rs) => (split ? rs : rs.some((r) => !r.product) ? rs : [...rs, newRow()]);

  // Picking a product that is already on the order adds to that line.
  const addProducts = (picks) =>
    setRows((rs) => {
      let next = [...rs];
      for (const { product, quantity } of picks) {
        const same = next.find((r) => r.product?.id === product.id);
        if (same) next = next.map((r) => (r === same ? { ...r, quantity: (Number(r.quantity) || 0) + quantity } : r));
        else {
          const blank = next.findIndex((r) => !r.product);
          const row = { ...newRow(), product, quantity, cost: Number(product.cost) || 0 };
          if (blank >= 0) next[blank] = { ...row, key: next[blank].key };
          else next.push(row);
        }
      }
      return withBlank(next);
    });

  const pickProduct = (key, p) => {
    const same = rows.find((r) => r.key !== key && r.product?.id === p.id);
    if (same) {
      setRow(same.key, { quantity: (Number(same.quantity) || 0) + 1 });
      toast.info(`${p.name}: quantity +1`, { autoClose: 1200 });
      return true;
    }
    setRows((rs) => withBlank(rs.map((r) => (r.key === key ? { ...r, product: p, cost: Number(p.cost) || 0, vendorId: null, manual: false } : r))));
    return false;
  };
  // Split mode adder: always a new line (or +1 on an existing one); the picker clears itself.
  const addOne = (p) => {
    const same = rows.find((r) => r.product?.id === p.id);
    if (same) {
      setRow(same.key, { quantity: (Number(same.quantity) || 0) + 1 });
      toast.info(`${p.name}: quantity +1`, { autoClose: 1200 });
    } else addProducts([{ product: p, quantity: 1 }]);
    return true;
  };

  const moveRow = (row, vendorId) => {
    const hist = prices[row.product.id]?.find((v) => v.vendorId === vendorId);
    setRow(row.key, { vendorId: vendorId || null, manual: Boolean(vendorId), cost: hist ? hist.cost : row.cost });
  };
  const repickAll = () => {
    setRows((rs) => rs.map((r) => ({ ...r, vendorId: null, manual: false })));
    toast.info('Every line moved back to its cheapest vendor');
  };

  const lines = useMemo(() => rows.map((r) => ({ ...r, amount: r.product ? round2((Number(r.quantity) || 0) * (Number(r.cost) || 0)) : 0 })), [rows]);
  const filled = lines.filter((l) => l.product);
  const total = round2(filled.reduce((a, l) => a + l.amount, 0));

  const vendorName = (id) => vendors.find((v) => v.id === id)?.name || Object.values(prices).flat().find((v) => v.vendorId === id)?.vendorName || 'Vendor';
  const vendorEmail = (id) => vendors.find((v) => v.id === id)?.email || '';
  const groups = useMemo(() => {
    const m = new Map();
    for (const l of filled) {
      const k = l.vendorId || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(l);
    }
    return [...m.entries()]
      .map(([vendorId, ls]) => ({ vendorId, lines: ls, total: round2(ls.reduce((a, l) => a + l.amount, 0)) }))
      .sort((a, b) => (!a.vendorId ? -1 : !b.vendorId ? 1 : vendorName(a.vendorId).localeCompare(vendorName(b.vendorId))));
  }, [filled, vendors, prices]); // eslint-disable-line react-hooks/exhaustive-deps
  const unassigned = filled.filter((l) => !l.vendorId).length;
  const vendorGroups = groups.filter((g) => g.vendorId);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    if (!filled.length) return setErrors({ items: 'Add at least one product' });
    if (filled.some((l) => !(Number(l.quantity) >= 1))) return setErrors({ items: 'Every line needs an order quantity of at least 1' });
    const item = (l) => ({ productId: l.product.id, quantity: Number(l.quantity), cost: Number(l.cost) });
    if (split) {
      if (unassigned) return setErrors({ items: `Choose a vendor for ${unassigned} product${unassigned === 1 ? '' : 's'} with no purchase history` });
      setSaving(true);
      try {
        const { data, message } = await api.post('/purchase-orders/batch', {
          orderDate,
          notes,
          orders: vendorGroups.map((g) => ({ vendorId: g.vendorId, items: g.lines.map(item) })),
        });
        toast.success(message);
        setCreated(data);
      } catch (err) {
        setErrors(err.errors?.items ? { items: err.errors.items } : {});
        toast.error(err.message);
      } finally {
        setSaving(false);
      }
      return;
    }
    if (!vendor?.id) return setErrors({ vendorId: 'Choose the vendor you are ordering from' });
    setSaving(true);
    try {
      const { data } = await api.post('/purchase-orders', { vendorId: vendor.id, orderDate, notes, items: filled.map(item) });
      toast.success(`${data.poNumber} created · ${money(data.total)}`);
      navigate(`/admin/purchase-orders/view/${data.id}`);
    } catch (err) {
      const mapped = {};
      for (const [k, v] of Object.entries(err.errors || {})) {
        const m = k.match(/^items\.(\d+)\.(\w+)$/);
        if (m && filled[Number(m[1])]) mapped[`${filled[Number(m[1])].key}.${m[2]}`] = v;
        else mapped[k] = v;
      }
      setErrors(mapped);
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const switchMode = (m) => {
    setErrors({});
    setMode(m);
    setRows((rs) => {
      const kept = rs.filter((r) => r.product);
      return m === 'split' ? kept : [...kept, newRow()];
    });
  };

  const qtyInput = (l) => (
    <input type="number" min={1} step={1} value={l.quantity} onChange={(e) => setRow(l.key, { quantity: e.target.value })} className={smallCls} aria-label="Order quantity" />
  );
  const costInput = (l) => (
    <input type="number" min={0} step="0.01" value={l.cost} onChange={(e) => setRow(l.key, { cost: e.target.value })} className={smallCls} aria-label="Cost" />
  );
  const removeBtn = (l) => (
    <button type="button" onClick={() => setRows((rs) => withBlank(rs.filter((r) => r.key !== l.key)))} className="text-gray-400 hover:text-red-600 cursor-pointer" aria-label="Remove line">
      <Trash2 size={16} />
    </button>
  );
  const stockCell = (l) => (
    <td className={`p-2 pt-4 text-right text-sm ${l.product && l.product.quantity <= 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{l.product ? l.product.quantity : '-'}</td>
  );
  const moveSelect = (l) => {
    const hist = prices[l.product.id];
    const histIds = new Set((hist || []).map((v) => v.vendorId));
    return (
      <select
        value={l.vendorId || ''}
        onChange={(e) => moveRow(l, e.target.value)}
        className={`${smallCls} bg-white ${!l.vendorId ? 'border-red-400' : ''}`}
        aria-label={`Vendor for ${l.product.name}`}
      >
        <option value="">{hist === undefined ? 'Checking history…' : 'Choose vendor…'}</option>
        {hist?.length > 0 && (
          <optgroup label="Bought from before (last cost)">
            {hist.map((v, i) => (
              <option key={v.vendorId} value={v.vendorId}>
                {i === 0 ? '★ ' : ''}{v.vendorName} — {money(v.cost)} ({formatDate(v.lastDate)})
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={hist?.length ? 'Other vendors' : 'Vendors'}>
          {vendors.filter((v) => !histIds.has(v.id)).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </optgroup>
      </select>
    );
  };

  return (
    <form onSubmit={submit} className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap justify-between items-center gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">New Purchase Order</h1>
          <p className="text-sm text-gray-500">Priced at cost so you know the total before ordering. Stock changes only when you receive it.</p>
        </div>
        <button
          type="button"
          onClick={() => setLowOpen(true)}
          className="inline-flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 rounded-md shadow cursor-pointer text-sm font-semibold"
        >
          <TriangleAlert size={16} /> Low Inventory
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-md p-4 space-y-3">
        <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-sm font-medium">
          {[['single', 'One vendor'], ['split', 'Split by vendor (automatic)']].map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => mode !== m && switchMode(m)}
              className={`px-4 py-2 cursor-pointer ${mode === m ? 'bg-purple-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              {m === 'split' && <Split size={14} className="inline mr-1 -mt-0.5" />}
              {label}
            </button>
          ))}
        </div>
        {split && (
          <p className="text-xs text-gray-500">
            Each product goes to the vendor you bought it from before at the <b>lowest last cost</b> (★; same price → the one you bought from most recently).
            Use <b>Move to</b> to put a line on another vendor’s order. Saving creates one purchase order per vendor, ready to email.
          </p>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {!split && (
            <Field label="Vendor" required error={undefined}>
              <VendorSelect vendor={vendor} onPick={setVendor} error={errors.vendorId} />
            </Field>
          )}
          <Field label="Order Date" required htmlFor="po-date">
            <input id="po-date" type="date" required value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Notes" htmlFor="po-notes">
            <input id="po-notes" maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputCls} placeholder="Delivery date, terms..." />
          </Field>
        </div>
      </div>

      {!split ? (
        <>
          <div className="overflow-x-auto border border-gray-200 rounded-md bg-white">
            <table className="w-full min-w-[720px]">
              <thead className="bg-gray-50">
                <tr className="text-left text-xs font-semibold text-gray-600 uppercase">
                  <th className="p-2">Product</th>
                  <th className="p-2 w-24 text-right">In Stock</th>
                  <th className="p-2 w-28">Order Qty</th>
                  <th className="p-2 w-32">Cost</th>
                  <th className="p-2 w-32 text-right">Total</th>
                  <th className="p-2 w-10" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.key} className="border-t border-gray-100 align-top">
                    <td className="p-2">
                      <ProductPicker hideMatrix value={l.product} onPick={(p) => pickProduct(l.key, p)} error={errors[`${l.key}.productId`]} />
                    </td>
                    {stockCell(l)}
                    <td className="p-2">
                      {qtyInput(l)}
                      {errors[`${l.key}.quantity`] && <p className="text-xs text-red-600 mt-1">{errors[`${l.key}.quantity`]}</p>}
                    </td>
                    <td className="p-2">{costInput(l)}</td>
                    <td className="p-2 pt-4 text-right text-sm font-semibold text-gray-950">{l.product ? money(l.amount) : '-'}</td>
                    <td className="p-2 pt-3">{l.product && removeBtn(l)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={4} className="p-3 text-right text-sm font-semibold text-gray-700">
                    Order Total ({filled.length} item{filled.length === 1 ? '' : 's'}, at cost)
                  </td>
                  <td className="p-3 text-right text-lg font-bold text-gray-950">{money(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <button type="button" onClick={() => setRows((rs) => [...rs, newRow()])} className="inline-flex items-center gap-1 text-sm text-purple-600 font-medium cursor-pointer">
            <CirclePlus size={16} /> Add line
          </button>
        </>
      ) : (
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-md p-3 flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-[16rem]">
              <p className="text-xs font-semibold text-gray-600 mb-1">Add product (search or scan)</p>
              <ProductPicker hideMatrix value={null} onPick={addOne} />
            </div>
            {filled.length > 0 && (
              <button type="button" onClick={repickAll} className="mt-5 inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 cursor-pointer">
                <RotateCcw size={14} /> Re-pick cheapest for all
              </button>
            )}
          </div>

          {!filled.length && (
            <p className="text-sm text-gray-500 bg-white border border-dashed border-gray-300 rounded-md p-6 text-center">
              Add products above or use <b>Low Inventory</b>. They are sorted into one order per vendor automatically.
            </p>
          )}

          {groups.map((g) => (
            <div key={g.vendorId || 'none'} className={`bg-white border rounded-md overflow-x-auto ${g.vendorId ? 'border-gray-200' : 'border-red-300'}`}>
              <div className={`flex flex-wrap justify-between items-center gap-2 px-3 py-2 ${g.vendorId ? 'bg-gray-50' : 'bg-red-50'}`}>
                <div>
                  {g.vendorId ? (
                    <>
                      <span className="font-bold text-gray-950">{vendorName(g.vendorId)}</span>
                      <span className="text-xs text-gray-500"> · {vendorEmail(g.vendorId) || 'no email saved'}</span>
                    </>
                  ) : (
                    <span className="font-bold text-red-700">No purchase history: choose a vendor for these</span>
                  )}
                </div>
                <span className="text-sm text-gray-700">
                  {g.lines.length} item{g.lines.length === 1 ? '' : 's'} · <b className="text-gray-950">{money(g.total)}</b>
                </span>
              </div>
              <table className="w-full min-w-[860px]">
                <thead>
                  <tr className="text-left text-xs font-semibold text-gray-600 uppercase border-t border-gray-100">
                    <th className="p-2">Product</th>
                    <th className="p-2 w-20 text-right">In Stock</th>
                    <th className="p-2 w-24">Order Qty</th>
                    <th className="p-2 w-28">Cost</th>
                    <th className="p-2 w-28 text-right">Total</th>
                    <th className="p-2 w-72">{g.vendorId ? 'Move to' : 'Vendor'}</th>
                    <th className="p-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {g.lines.map((l) => (
                    <tr key={l.key} className="border-t border-gray-100 align-top">
                      <td className="p-2 pt-3 text-sm">
                        <span className="block text-gray-950">{l.product.name}</span>
                        {l.product.barcode && <span className="block text-xs text-gray-400">{l.product.barcode}</span>}
                      </td>
                      {stockCell(l)}
                      <td className="p-2">{qtyInput(l)}</td>
                      <td className="p-2">{costInput(l)}</td>
                      <td className="p-2 pt-4 text-right text-sm font-semibold text-gray-950">{money(l.amount)}</td>
                      <td className="p-2">{moveSelect(l)}</td>
                      <td className="p-2 pt-3">{removeBtn(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          {filled.length > 0 && (
            <div className="flex justify-end text-sm text-gray-700">
              <span>
                {vendorGroups.length} purchase order{vendorGroups.length === 1 ? '' : 's'} · {filled.length} item{filled.length === 1 ? '' : 's'} · Total{' '}
                <b className="text-lg text-gray-950">{money(total)}</b>
              </span>
            </div>
          )}
        </div>
      )}
      {errors.items && <p className="text-sm text-red-600">{errors.items}</p>}

      <div className="flex justify-end gap-2">
        <CancelButton onClick={() => navigate(-1)} />
        {split ? (
          <SubmitButton isLoading={saving} isDisabled={!filled.length}>
            {saving ? 'Creating…' : `Create ${vendorGroups.length || ''} Purchase Order${vendorGroups.length === 1 ? '' : 's'}`}
          </SubmitButton>
        ) : (
          <SubmitButton isLoading={saving} mode="create" />
        )}
      </div>

      <LowStockModal isOpen={lowOpen} onClose={() => setLowOpen(false)} onAdd={addProducts} />
      <CreatedModal
        pos={created}
        onDone={() => navigate('/admin/purchase-orders')}
        onSent={(po, info) => setCreated((list) => list.map((p) => (p.id === po.id ? { ...p, ...info } : p)))}
      />
    </form>
  );
}
