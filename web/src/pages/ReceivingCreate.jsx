import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'react-toastify';
import { CirclePlus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useMoney } from '../auth.jsx';
import { CancelButton, SubmitButton, useDebounced } from '../components/ui.jsx';
import { ProductPicker } from './InvoiceCreate.jsx';

const today = () => new Date().toLocaleDateString('en-CA');
const round2 = (n) => Math.round(n * 100) / 100;
const newRow = () => ({ key: crypto.randomUUID(), product: null, quantity: 1, cost: '' });
const fieldCls = 'border border-gray-300 rounded-md px-3 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600';
const smallCls = 'p-2 h-10 w-full border text-gray-700 text-sm border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-purple-600';

export const PRICE_RULES = [
  { value: 'percent', label: 'Raise all 3 prices by the same % as the cost (keeps your markup)' },
  { value: 'amount', label: 'Raise all 3 prices by the same $ amount as the cost' },
  { value: 'none', label: "Don't change selling prices" },
];

// Same rule the server applies: prices only go up, and only when the cost went up.
function raised(price, oldCost, newCost, rule) {
  if (rule === 'none' || !(newCost > oldCost)) return price;
  if (rule === 'amount' || oldCost <= 0) return round2(price + (newCost - oldCost));
  return round2(price * (newCost / oldCost));
}

function VendorPicker({ vendor, onPick }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const debounced = useDebounced(q, 200);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    api.get('/vendors/options', { search: debounced }).then((r) => setResults(r.data)).catch(() => setResults([]));
  }, [debounced, open]);
  useEffect(() => {
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <input
        className={fieldCls}
        placeholder="Search vendors, or type a new vendor name"
        value={open ? q : vendor.name}
        onFocus={() => (setQ(vendor.name), setOpen(true))}
        onChange={(e) => {
          setQ(e.target.value);
          onPick({ id: '', name: e.target.value });
        }}
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {results.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">No saved vendors match — the typed name will be used</p>}
          {results.map((v) => (
            <button
              type="button"
              key={v.id}
              onClick={() => (onPick({ id: v.id, name: v.name }), setOpen(false))}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 cursor-pointer"
            >
              <span className="text-gray-950 font-medium">{v.name}</span>
              {v.company && <span className="text-gray-500"> · {v.company}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ReceivingCreate() {
  const navigate = useNavigate();
  const money = useMoney();
  const [params] = useSearchParams();
  const [vendor, setVendor] = useState({ id: '', name: '' });
  const [form, setForm] = useState({ vendorInvoiceNo: '', receivedDate: today(), status: 'unpaid', priceRule: 'percent', notes: '' });
  const [rows, setRows] = useState([newRow()]);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [po, setPo] = useState(null); // receiving a purchase order

  useEffect(() => {
    const id = params.get('vendorId');
    if (id) api.get(`/vendors/${id}`).then((r) => setVendor({ id: r.data.id, name: r.data.name })).catch(() => {});
    const poId = params.get('po');
    if (poId) {
      api
        .get(`/purchase-orders/${poId}`)
        .then(({ data }) => {
          if (data.status !== 'open') return toast.error(`${data.poNumber} is already ${data.status}`);
          setPo(data);
          setVendor({ id: data.vendorId || '', name: data.vendorName });
          const lines = data.items
            .filter((it) => it.product)
            .map((it) => ({ ...newRow(), product: it.product, quantity: it.quantity, cost: it.cost }));
          const missing = data.items.length - lines.length;
          if (missing) toast.warn(`${missing} product(s) on this PO no longer exist and were left out`);
          setRows([...lines, newRow()]);
        })
        .catch((e) => toast.error(e.message));
    }
  }, [params]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setRow = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // Scanning an item that is already on the list adds 1 to that line instead of a new row.
  const pickProduct = (key, p) => {
    const name = (p.name || '').trim().toLowerCase();
    const barcode = (p.barcode || '').trim();
    const same = rows.find(
      (r) =>
        r.key !== key &&
        r.product &&
        (r.product.id === p.id ||
          (name && (r.product.name || '').trim().toLowerCase() === name) ||
          (barcode && (r.product.barcode || '').trim() === barcode)),
    );
    if (same) {
      setRows((rs) => rs.map((r) => (r.key === same.key ? { ...r, quantity: (Number(r.quantity) || 0) + 1 } : r)));
      toast.info(`${same.product.name}: quantity +1`, { autoClose: 1200 });
      return true;
    }
    setRows((rs) => {
      const next = rs.map((r) => (r.key === key ? { ...r, product: p, cost: Number(p.cost) || 0 } : r));
      // Keep an empty line at the bottom so the next scan has somewhere to go.
      return next.some((r) => !r.product) ? next : [...next, newRow()];
    });
    return false;
  };

  const lines = useMemo(
    () =>
      rows.map((r) => {
        if (!r.product) return { ...r, amount: 0 };
        const oldCost = Number(r.product.cost) || 0;
        const cost = Number(r.cost) || 0;
        const p = (f) => raised(Number(r.product[f]) || 0, oldCost, cost, form.priceRule);
        return {
          ...r,
          oldCost,
          amount: round2((Number(r.quantity) || 0) * cost),
          prices: [
            ['Selling', Number(r.product.selling_price), p('selling_price')],
            ['Top Cust.', Number(r.product.top_customer_price), p('top_customer_price')],
            ['Jobber', Number(r.product.jobber_price), p('jobber_price')],
          ],
        };
      }),
    [rows, form.priceRule],
  );
  const total = round2(lines.reduce((a, l) => a + l.amount, 0));

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    const filled = lines.filter((l) => l.product);
    if (!vendor.name.trim()) return setErrors({ vendorName: 'Choose or type a vendor' });
    if (!filled.length) return setErrors({ items: 'Scan or add at least one product' });
    setSaving(true);
    try {
      const { data } = await api.post('/receivings', {
        ...form,
        vendorId: vendor.id,
        vendorName: vendor.name,
        purchaseOrderId: po?.id || null,
        items: filled.map((l) => ({ productId: l.product.id, quantity: Number(l.quantity), cost: Number(l.cost) })),
      });
      toast.success(`${data.receivingNumber} saved — stock updated`);
      navigate(`/admin/receiving/view/${data.id}`);
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

  return (
    <form onSubmit={submit} className="max-w-7xl space-y-4 md:p-4 border border-gray-200 rounded">
      <h1 className="text-2xl font-bold text-gray-950">Receive Stock</h1>
      {po && (
        <p className="text-sm bg-blue-50 border border-blue-200 text-blue-800 rounded-md px-3 py-2">
          Receiving purchase order <b>{po.poNumber}</b> ({po.vendorName}). Adjust quantities and costs to what actually arrived; saving closes the PO.
        </p>
      )}
      {errors.purchaseOrderId && <p className="text-sm text-red-600">{errors.purchaseOrderId}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vendor <span className="text-red-500">*</span></label>
          <VendorPicker vendor={vendor} onPick={setVendor} />
          {errors.vendorName && <p className="text-xs text-red-600 mt-1">{errors.vendorName}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Invoice #</label>
          <input maxLength={100} value={form.vendorInvoiceNo} onChange={set('vendorInvoiceNo')} className={fieldCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Received Date <span className="text-red-500">*</span></label>
          <input type="date" required value={form.receivedDate} onChange={set('receivedDate')} className={fieldCls} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Invoice Status</label>
          <select value={form.status} onChange={set('status')} className={`${fieldCls} bg-white h-[42px]`}>
            <option value="unpaid">Unpaid</option>
            <option value="paid">Paid</option>
          </select>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">When the new cost is higher than the old cost</label>
        <select value={form.priceRule} onChange={set('priceRule')} className={`${fieldCls} bg-white h-[42px] max-w-xl`}>
          {PRICE_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead>
            <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase">
              <th className="p-2 w-[30%]">Product (scan or search)</th>
              <th className="p-2 w-24">Qty</th>
              <th className="p-2 w-28">Old Cost</th>
              <th className="p-2 w-32">New Cost</th>
              <th className="p-2">Prices after receiving</th>
              <th className="p-2 text-right w-28">Total</th>
              <th className="p-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key} className="border-b border-gray-100 align-top">
                <td className="p-2">
                  <ProductPicker hideMatrix value={l.product} onPick={(p) => pickProduct(l.key, p)} error={errors[`${l.key}.productId`]} />
                  {l.product && <p className="text-xs text-gray-500 mt-1">{l.product.quantity} in stock now</p>}
                </td>
                <td className="p-2">
                  <input type="number" min={1} step={1} value={l.quantity} onChange={(e) => setRow(l.key, { quantity: e.target.value })} className={smallCls} />
                  {errors[`${l.key}.quantity`] && <p className="text-xs text-red-600 mt-1">{errors[`${l.key}.quantity`]}</p>}
                </td>
                <td className="p-2 text-sm text-gray-600 pt-4">{l.product ? money(l.oldCost) : '-'}</td>
                <td className="p-2">
                  <input
                    type="number" min={0} step="0.01" disabled={!l.product} value={l.cost}
                    onChange={(e) => setRow(l.key, { cost: e.target.value })}
                    className={`${smallCls} ${l.product && Number(l.cost) > l.oldCost ? 'border-amber-500 bg-amber-50' : ''}`}
                  />
                  {errors[`${l.key}.cost`] && <p className="text-xs text-red-600 mt-1">{errors[`${l.key}.cost`]}</p>}
                </td>
                <td className="p-2 text-xs text-gray-600">
                  {l.product &&
                    l.prices.map(([label, before, after]) => (
                      <span key={label} className="block">
                        {label}: {after !== before ? (
                          <><s className="text-gray-400">{money(before)}</s> <b className="text-amber-700">{money(after)}</b></>
                        ) : money(before)}
                      </span>
                    ))}
                </td>
                <td className="p-2 text-right text-sm text-gray-950 pt-4">{money(l.amount)}</td>
                <td className="p-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.key !== l.key) : [newRow()]))}
                    className="text-gray-400 hover:text-red-600 cursor-pointer"
                    aria-label="Remove line"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {errors.items && <p className="text-sm text-red-600">{errors.items}</p>}
      <button type="button" onClick={() => setRows((rs) => [...rs, newRow()])} className="flex items-center gap-1 text-sm text-purple-600 font-semibold cursor-pointer">
        <CirclePlus size={16} /> Add line
      </button>

      <div className="flex flex-wrap justify-between gap-4 items-end">
        <div className="w-full max-w-md">
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea rows={2} maxLength={5000} value={form.notes} onChange={set('notes')} className={fieldCls} />
        </div>
        <p className="text-lg font-bold text-gray-950">Total: {money(total)}</p>
      </div>
      <div className="flex justify-end gap-2">
        <CancelButton onClick={() => navigate('/admin/receiving')} />
        <SubmitButton isLoading={saving}>Save & Add to Stock</SubmitButton>
      </div>
    </form>
  );
}
