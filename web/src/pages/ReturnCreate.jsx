import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { Search } from 'lucide-react';
import { api } from '../api.js';
import { useMoney, formatDate } from '../auth.jsx';
import { CancelButton, StatusBadge, SubmitButton } from '../components/ui.jsx';

const fieldCls = 'border border-gray-300 rounded-md px-3 py-2 w-full text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600';
const th = 'text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase';
const td = 'px-3 py-2 text-sm text-gray-600';
const round2 = (n) => Math.round(n * 100) / 100;

// Find the invoice, pick what comes back; each item is refunded at the price on that invoice.
export default function ReturnCreate() {
  const navigate = useNavigate();
  const money = useMoney();
  const [number, setNumber] = useState('');
  const [inv, setInv] = useState(null);
  const [qty, setQty] = useState({});
  const [restock, setRestock] = useState({});
  const [settlement, setSettlement] = useState('credit');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const find = async (e) => {
    e?.preventDefault();
    if (!number.trim()) return;
    setBusy(true);
    setErrors({});
    try {
      const { data } = await api.get('/returns/lookup', { number: number.trim() });
      setInv(data);
      setQty({});
      setRestock(Object.fromEntries(data.lines.map((l) => [l.productId, true])));
    } catch (err) {
      setInv(null);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const chosen = inv ? inv.lines.filter((l) => Number(qty[l.productId]) > 0) : [];
  const total = round2(chosen.reduce((a, l) => a + Number(qty[l.productId]) * l.price, 0));

  const save = async () => {
    if (!chosen.length) return setErrors({ items: 'Enter a quantity for at least one item' });
    setBusy(true);
    setErrors({});
    try {
      const { data } = await api.post('/returns', {
        invoiceId: inv.id,
        settlement,
        reason,
        items: chosen.map((l) => ({ productId: l.productId, quantity: Number(qty[l.productId]), restock: Boolean(restock[l.productId]) })),
      });
      toast.success(`${data.returnNumber} saved`);
      navigate(`/admin/returns/view/${data.id}`);
    } catch (err) {
      const mapped = {};
      for (const [k, v] of Object.entries(err.errors || {})) {
        const m = k.match(/^items\.(\d+)\.\w+$/);
        mapped[m && chosen[Number(m[1])] ? chosen[Number(m[1])].productId : k] = v;
      }
      setErrors(mapped);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl space-y-4 md:p-4 border border-gray-200 rounded">
      <h1 className="text-2xl font-bold text-gray-950">New Return</h1>
      <form onSubmit={find} className="flex gap-2 max-w-md">
        <input autoFocus value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Invoice number (type or scan), e.g. INV_000012" className={fieldCls} />
        <button type="submit" disabled={busy} className="bg-purple-600 hover:bg-gray-950 text-white px-3 rounded-md flex items-center gap-1 cursor-pointer disabled:opacity-60">
          <Search size={16} /> Find
        </button>
      </form>

      {inv && (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-3">
            <span>Invoice <b className="text-gray-950">{inv.invoiceNumber}</b></span>
            <span>{formatDate(inv.invoiceDate)}</span>
            <span>Customer <b className="text-gray-950">{inv.customerName}</b></span>
            <span>Total {money(inv.total)}</span>
            <StatusBadge status={inv.status} />
          </div>
          <div className="overflow-x-auto border border-gray-200 rounded-md">
            <table className="w-full min-w-[680px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className={th}>Item</th><th className={th}>Sold</th><th className={th}>Already Returned</th>
                  <th className={th}>Price Paid</th><th className={th}>Return Qty</th><th className={th}>Back to Stock</th>
                  <th className={`${th} text-right`}>Refund</th>
                </tr>
              </thead>
              <tbody>
                {inv.lines.map((l) => (
                  <tr key={l.productId} className="border-t border-gray-100">
                    <td className={td}><span className="text-gray-950">{l.name}</span>{l.barcode && <span className="block text-xs">{l.barcode}</span>}</td>
                    <td className={td}>{l.sold}</td>
                    <td className={td}>{l.returned}</td>
                    <td className={td}>{money(l.price)}</td>
                    <td className={td}>
                      <input
                        type="number" min={0} max={l.returnable} step={1} disabled={l.returnable <= 0}
                        value={qty[l.productId] ?? ''} placeholder={l.returnable > 0 ? `max ${l.returnable}` : 'none left'}
                        onChange={(e) => setQty((q) => ({ ...q, [l.productId]: e.target.value }))}
                        className="w-24 p-1.5 border border-gray-300 rounded text-sm disabled:bg-gray-100"
                      />
                      {errors[l.productId] && <p className="text-xs text-red-600 mt-1">{errors[l.productId]}</p>}
                    </td>
                    <td className={td}>
                      <input type="checkbox" checked={Boolean(restock[l.productId])} onChange={(e) => setRestock((r) => ({ ...r, [l.productId]: e.target.checked }))} />
                    </td>
                    <td className={`${td} text-right text-gray-950`}>{money(round2((Number(qty[l.productId]) || 0) * l.price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {errors.items && <p className="text-sm text-red-600">{errors.items}</p>}
          <div className="grid md:grid-cols-2 gap-4">
            <fieldset className="space-y-1 text-sm text-gray-700">
              <legend className="font-medium mb-1">How is the customer paid back?</legend>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={settlement === 'credit'} onChange={() => setSettlement('credit')} />
                Credit to their account (lowers what they owe)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={settlement === 'refund'} onChange={() => setSettlement('refund')} />
                Refund now (cash / Zelle / check)
              </label>
            </fieldset>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
              <textarea rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} className={fieldCls} />
            </div>
          </div>
          <div className="flex flex-wrap justify-end items-center gap-3">
            <p className="text-lg font-bold text-gray-950 mr-auto">Return total: {money(total)}</p>
            <CancelButton onClick={() => navigate('/admin/returns')} />
            <SubmitButton type="button" onClick={save} isLoading={busy} isDisabled={!chosen.length}>Save Return</SubmitButton>
          </div>
        </>
      )}
    </div>
  );
}
