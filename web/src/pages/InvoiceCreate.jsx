import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { CirclePlus, Grid3x3, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, Logo } from '../auth.jsx';
import { CancelButton, SubmitButton, useDebounced } from '../components/ui.jsx';
import MatrixGridModal from '../components/MatrixGridModal.jsx';

const LEVELS = [
  { value: 'selling', label: 'Selling Price', field: 'selling_price' },
  { value: 'top_customer', label: 'Top Customer Price', field: 'top_customer_price' },
  { value: 'jobber', label: 'Jobber Price', field: 'jobber_price' },
];
const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time
const newRow = () => ({ key: crypto.randomUUID(), product: null, description: '', quantity: 1, rate: 0 });
const round2 = (n) => Math.round(n * 100) / 100;

const fieldCls =
  'border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600';
const smallCls =
  'p-2 h-10 w-full border text-gray-700 text-sm border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600';

function ProductPicker({ value, onPick, error }) {
  const [q, setQ] = useState(value?.name || '');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const debounced = useDebounced(q, 200);
  const ref = useRef(null);
  const inputRef = useRef(null);
  const money = useMoney();
  // The list is position:fixed so the table's horizontal-scroll wrapper cannot clip it.
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = inputRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 4, left: r.left });
    };
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open]);

  useEffect(() => setQ(value?.name || ''), [value]);
  useEffect(() => {
    if (!open) return;
    api.get('/products/search', { q: debounced }).then((r) => setResults(r.data)).catch(() => setResults([]));
  }, [debounced, open]);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative w-full" ref={ref}>
      <input
        ref={inputRef}
        className={`${smallCls} ${error ? 'border-red-500' : ''}`}
        placeholder="Search name or scan barcode..."
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={async (e) => {
          // Barcode scanners type the code and press Enter: pick an exact match straight away.
          if (e.key === 'Enter') {
            e.preventDefault();
            const r = await api.get('/products/search', { q }).catch(() => null);
            const exact = r?.data.find((p) => p.barcode && p.barcode === q.trim()) || (r?.data.length === 1 ? r.data[0] : null);
            if (exact) {
              onPick(exact);
              setOpen(false);
            }
          }
        }}
      />
      {open && pos && (
        <div
          style={{ top: pos.top, left: pos.left }}
          className="fixed z-30 w-[min(28rem,90vw)] bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto"
        >
          {results.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">No products found</p>}
          {results.map((p) => (
            <button
              type="button"
              key={p.id}
              onClick={() => {
                onPick(p);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex justify-between gap-3 cursor-pointer"
            >
              <span>
                <span className="text-gray-950 font-medium">{p.name}</span>
                {p.isMatrix && <span className="block text-xs text-gray-500">Matrix · {p.attributes.join(' × ')}</span>}
                {p.barcode && <span className="block text-xs text-gray-500">{p.barcode}</span>}
              </span>
              {p.isMatrix ? (
                <span className="text-xs whitespace-nowrap text-purple-600 font-semibold flex items-center gap-1">
                  <Grid3x3 size={12} /> {p.variantCount} variants · {p.quantity} in stock
                </span>
              ) : (
                <span className={`text-xs whitespace-nowrap ${p.quantity <= 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {p.quantity} in stock · {money(p.selling_price)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

// Search saved customers and fill the Bill To block (and their default price level) in one click.
function CustomerPicker({ onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const debounced = useDebounced(q, 200);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    api.get('/customers/options', { search: debounced }).then((r) => setResults(r.data)).catch(() => setResults([]));
  }, [debounced, open]);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="relative sm:col-span-2" ref={ref}>
      <input
        className={smallCls}
        placeholder="Search saved customers by name, company, email or phone..."
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => (setQ(e.target.value), setOpen(true))}
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-64 overflow-y-auto">
          {results.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">No saved customers found — type the details below</p>}
          {results.map((c) => (
            <button
              type="button"
              key={c.id}
              onClick={() => (onPick(c), setQ(''), setOpen(false))}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
            >
              <span className="text-gray-950 font-medium">{c.name}</span>
              {c.company && <span className="text-gray-500"> · {c.company}</span>}
              {(c.email || c.phone) && <span className="block text-xs text-gray-500">{[c.email, c.phone].filter(Boolean).join(' · ')}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function InvoiceCreate() {
  const navigate = useNavigate();
  const { company, can } = useAuth();
  const money = useMoney();
  const [number, setNumber] = useState('');
  const [form, setForm] = useState({
    invoiceDate: today(),
    dueDate: '',
    customerName: '',
    customerEmail: '',
    customerPhone: '',
    customerAddress: '',
    priceLevel: 'selling',
    notes: '',
    status: 'unpaid',
  });
  const [rows, setRows] = useState([newRow()]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [grid, setGrid] = useState(null); // { matrixId, rowKey } while the matrix grid is open

  useEffect(() => {
    api.get('/invoices/next-number').then((r) => {
      setNumber(r.data.invoiceNumber);
    }).catch(() => {});
  }, []);

  const level = LEVELS.find((l) => l.value === form.priceLevel);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Changing the price level re-prices every line from the product's matching price.
  const changeLevel = (value) => {
    const field = LEVELS.find((l) => l.value === value).field;
    setForm((f) => ({ ...f, priceLevel: value }));
    setRows((rs) => rs.map((r) => (r.product ? { ...r, rate: Number(r.product[field]) } : r)));
  };

  const pickCustomer = (c) => {
    const address = [c.company, c.address, c.taxNumber && `Tax No: ${c.taxNumber}`].filter(Boolean).join('\n');
    setForm((f) => ({ ...f, customerName: c.name, customerEmail: c.email, customerPhone: c.phone, customerAddress: address }));
    if (c.priceLevel && c.priceLevel !== form.priceLevel) changeLevel(c.priceLevel);
  };

  // Picking a product fills the row; picking a matrix item opens its variant grid instead.
  const pickProduct = (key, p) => {
    if (p.isMatrix) setGrid({ matrixId: p.id, rowKey: key });
    else setRow(key, { product: p, rate: Number(p[level.field]), description: p.description || '' });
  };

  // Grid lines: a variant already on the invoice gets its quantity topped up, others become new rows
  // (the row the grid was opened from is reused if it is still empty).
  const addFromGrid = (picked) => {
    setRows((rs) => {
      let next = [...rs];
      const fresh = [];
      for (const { product, quantity } of picked) {
        const i = next.findIndex((r) => r.product?.id === product.id);
        if (i >= 0) next[i] = { ...next[i], quantity: (Number(next[i].quantity) || 0) + quantity };
        else fresh.push({ ...newRow(), product, quantity, rate: Number(product[level.field]), description: product.description || '' });
      }
      const at = next.findIndex((r) => r.key === grid.rowKey);
      if (at >= 0 && !next[at].product && fresh.length) next.splice(at, 1, ...fresh);
      else next = [...next.filter((r) => r.product), ...fresh];
      return next.length ? next : [newRow()];
    });
  };

  const lines = useMemo(
    () =>
      rows.map((r) => {
        return { ...r, amount: round2((Number(r.quantity) || 0) * (Number(r.rate) || 0)) };
      }),
    [rows],
  );
  const total = round2(lines.reduce((a, l) => a + l.amount, 0));

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    const filled = lines.filter((l) => l.product);
    if (!filled.length) {
      setErrors({ items: 'Add at least one product' });
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/invoices', {
        ...form,
        items: filled.map((l) => ({
          productId: l.product.id,
          description: l.description,
          quantity: Number(l.quantity),
          rate: Number(l.rate),
        })),
      });
      toast.success(`Invoice ${data.invoiceNumber} created`);
      navigate(`/admin/invoices/view/${data.id}`);
    } catch (err) {
      // Map server item indexes (of filled rows) back onto row keys.
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

  return (
    <div className="md:p-4 min-h-screen border border-gray-200 rounded">
      <form onSubmit={submit}>
        <div className="max-w-7xl mx-auto space-y-4 p-2">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-2xl font-bold text-gray-950 ">New Invoice</h1>
            <Logo kind="invoice" alt="" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 w-full">
            <div>
              <label className="block text-sm font-medium text-gray-900">Invoice Number</label>
              <input readOnly value={number} className={`${fieldCls} mt-1 bg-gray-50`} title="Assigned automatically when saved" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Invoice Date <span className="text-red-500">*</span>
              </label>
              <input type="date" required value={form.invoiceDate} onChange={set('invoiceDate')} className={`${fieldCls} mt-1`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Due Date</label>
              <input type="date" min={form.invoiceDate} value={form.dueDate} onChange={set('dueDate')} className={`${fieldCls} mt-1`} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Price Level <span className="text-red-500">*</span>
              </label>
              <select value={form.priceLevel} onChange={(e) => changeLevel(e.target.value)} className={`${fieldCls} mt-1 bg-white`}>
                {LEVELS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200 flex flex-wrap items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Payment Status</label>
            {['unpaid', 'paid'].map((s) => (
              <label key={s} className="flex items-center cursor-pointer">
                <input type="radio" name="status" value={s} checked={form.status === s} onChange={set('status')} className="h-4 w-4 accent-purple-600" />
                <span className="ml-2 text-sm text-gray-700 capitalize">{s}</span>
              </label>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="font-bold text-gray-950 ">Bill From</h3>
              <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700 space-y-0.5">
                <p className="font-semibold text-gray-950">{company.companyName || 'Your company'}</p>
                {company.address && <p className="whitespace-pre-line">{company.address}</p>}
                {company.email && <p>{company.email}</p>}
                {company.phone && <p>{company.phone}</p>}
              </div>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200">
              <h3 className="font-bold text-gray-950 ">
                Bill To <span className="text-red-500">*</span>
              </h3>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(can('customers', 'view') || can('invoices', 'create')) && <CustomerPicker onPick={pickCustomer} />}
                <div className="sm:col-span-2">
                  <input required maxLength={200} placeholder="Customer name *" value={form.customerName} onChange={set('customerName')} className={smallCls} />
                  {errors.customerName && <p className="text-xs text-red-600 mt-1">{errors.customerName}</p>}
                </div>
                <div>
                  <input type="email" maxLength={200} placeholder="Customer email" value={form.customerEmail} onChange={set('customerEmail')} className={smallCls} />
                  {errors.customerEmail && <p className="text-xs text-red-600 mt-1">{errors.customerEmail}</p>}
                </div>
                <input maxLength={30} placeholder="Phone" value={form.customerPhone} onChange={set('customerPhone')} className={smallCls} />
                <textarea
                  rows={2}
                  maxLength={1000}
                  placeholder="Address"
                  value={form.customerAddress}
                  onChange={set('customerAddress')}
                  className="sm:col-span-2 p-2 w-full border text-gray-700 text-sm border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600"
                />
              </div>
            </div>
          </div>

          <div className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead>
                  <tr className="bg-black text-white text-left">
                    <th className="px-3 py-3 rounded-l-md w-64">Item</th>
                    <th className="px-3 py-3">Description</th>
                    <th className="px-3 py-3 w-24">Quantity</th>
                    <th className="px-3 py-3 w-32">Price ($)</th>
                    <th className="px-3 py-3 w-32 text-right">Total</th>
                    <th className="px-3 py-3 w-16 rounded-r-md">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.key} className="align-top">
                      <td className="px-3 py-3">
                        <ProductPicker
                          value={l.product}
                          error={errors[`${l.key}.productId`]}
                          onPick={(p) => pickProduct(l.key, p)}
                        />
                        {l.product && <p className="text-xs text-gray-500 mt-1">{l.product.quantity} in stock</p>}
                      </td>
                      <td className="px-3 py-3">
                        <textarea
                          rows={1}
                          maxLength={1000}
                          placeholder="Description"
                          value={l.description}
                          onChange={(e) => setRow(l.key, { description: e.target.value })}
                          className="p-2 min-h-10 w-full border text-gray-700 text-sm border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600 focus:border-purple-600"
                        />
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          required
                          value={l.quantity}
                          onChange={(e) => setRow(l.key, { quantity: e.target.value })}
                          className={`${smallCls} ${errors[`${l.key}.quantity`] ? 'border-red-500' : ''}`}
                        />
                        {errors[`${l.key}.quantity`] && <p className="text-xs text-red-600 mt-1">{errors[`${l.key}.quantity`]}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <input type="number" min="0" step="0.01" value={l.rate} onChange={(e) => setRow(l.key, { rate: e.target.value })} className={smallCls} />
                      </td>
                      <td className="px-3 py-3 text-right font-bold text-gray-950 pt-5">{money(l.amount)}</td>
                      <td className="px-3 py-3 pt-5">
                        <button
                          type="button"
                          aria-label="Remove row"
                          onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== l.key) : [newRow()]))}
                          className="text-red-600 cursor-pointer"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {errors.items && <p className="text-xs text-red-600 px-3">{errors.items}</p>}
            <button type="button" onClick={() => setRows((rs) => [...rs, newRow()])} className="flex items-center gap-1 text-sm text-purple-600 font-semibold mt-3 px-3 cursor-pointer">
              <CirclePlus size={16} /> Add New Row
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <h2 className="text-xl font-bold text-gray-950 mb-2">Extra Information</h2>
              <label className="block text-sm font-medium text-gray-700">Additional Notes</label>
              <textarea
                rows={5}
                maxLength={5000}
                placeholder="Enter Notes"
                value={form.notes}
                onChange={set('notes')}
                className="mt-1 border border-gray-300 rounded-md px-4 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600"
              />
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200 space-y-2 text-sm self-start">
              <div className="flex justify-between text-lg font-bold text-gray-950">
                <span>Invoice Total</span>
                <span>{money(total)}</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <CancelButton onClick={() => navigate('/admin/invoices')} />
            <SubmitButton isLoading={saving}>{saving ? 'Saving...' : 'Save Invoice'}</SubmitButton>
          </div>
        </div>
      </form>
      <MatrixGridModal matrixId={grid?.matrixId} priceField={level.field} onClose={() => setGrid(null)} onAdd={addFromGrid} />
    </div>
  );
}
