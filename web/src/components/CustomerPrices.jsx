import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { Grid3x3, Plus, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, formatDate } from '../auth.jsx';
import { ConfirmModal, Loader } from './ui.jsx';
import { ProductPicker } from '../pages/InvoiceCreate.jsx';

const LEVEL_LABELS = { selling: 'Selling', top_customer: 'Top Customer', jobber: 'Jobber' };
const th = 'text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase';
const td = 'px-3 py-2 text-sm text-gray-600';
const priceInput =
  'w-28 h-9 px-2 border border-gray-300 rounded-md text-sm text-gray-950 focus:outline-none focus:ring-1 focus:ring-purple-600';

// A customer's own prices. On their invoices these are used instead of their price level;
// a price on a matrix item covers every flavor of it. Prices typed on their invoices land here too,
// and each one follows the item's cost up by the same percentage (never below the price given).
export default function CustomerPrices({ customer }) {
  const { can } = useAuth();
  const money = useMoney();
  const canEdit = can('customers', 'edit');
  const level = customer.priceLevel || 'selling';
  const [rows, setRows] = useState(null);
  const [picked, setPicked] = useState(null);
  const [newPrice, setNewPrice] = useState('');
  const [drafts, setDrafts] = useState({}); // id -> edited price text
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);

  const load = useCallback(() => {
    api.get(`/customers/${customer.id}/prices`).then((r) => setRows(r.data)).catch((e) => toast.error(e.message));
  }, [customer.id]);
  useEffect(load, [load]);

  const levelPriceOf = (p) => {
    const field = { selling: 'selling_price', top_customer: 'top_customer_price', jobber: 'jobber_price' }[level];
    return Number(p[field] ?? p.sellingPrice ?? 0);
  };

  const pick = (p) => {
    setPicked(p);
    const existing = rows?.find((x) => (p.isMatrix ? x.matrixId === p.id : x.productId === p.id));
    setNewPrice(String(existing ? existing.price : p.isMatrix ? '' : levelPriceOf(p)));
    return false;
  };

  const save = async (body, done) => {
    setBusy(true);
    try {
      await api.put(`/customers/${customer.id}/prices`, body);
      toast.success('Customer price saved');
      done?.();
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const add = (e) => {
    e.preventDefault();
    if (!picked || newPrice === '') return;
    save({ [picked.isMatrix ? 'matrixId' : 'productId']: picked.id, price: newPrice }, () => {
      setPicked(null);
      setNewPrice('');
    });
  };

  const saveDraft = (x) => {
    const v = drafts[x.id];
    if (v === undefined || v === '' || Number(v) === x.price) return setDrafts((d) => ({ ...d, [x.id]: undefined }));
    save({ [x.isMatrix ? 'matrixId' : 'productId']: x.productId || x.matrixId, price: v }, () =>
      setDrafts((d) => ({ ...d, [x.id]: undefined })),
    );
  };

  const remove = async () => {
    try {
      await api.del(`/customers/${customer.id}/prices/${removing.id}`);
      toast.success('Customer price removed');
      setRemoving(null);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="p-3 space-y-3">
      <p className="text-xs text-gray-500">
        {customer.name}&apos;s own prices. On their invoices these are used instead of their price level (
        <b>{LEVEL_LABELS[level]}</b>). A price on a matrix item covers all its flavors; a price on one flavor beats it.
        A price typed on one of their invoices is kept here for next time. When an item&apos;s cost goes up, their price goes up
        by the same percentage; it never drops below the price you gave.
      </p>

      {canEdit && (
        <form onSubmit={add} className="flex flex-wrap items-start gap-2 bg-gray-50 border border-gray-200 rounded-md p-2">
          <div className="flex-1 min-w-60">
            <ProductPicker value={picked} onPick={pick} />
          </div>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            placeholder="Their price"
            aria-label="Customer price"
            value={newPrice}
            onChange={(e) => setNewPrice(e.target.value)}
            className={priceInput}
          />
          <button
            type="submit"
            disabled={!picked || newPrice === '' || busy}
            className="h-9 inline-flex items-center gap-1 px-3 rounded-md bg-purple-600 text-white text-sm font-medium cursor-pointer hover:bg-gray-950 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={15} /> Save price
          </button>
          {picked && !picked.isMatrix && (
            <p className="basis-full text-xs text-gray-500">
              Normal {LEVEL_LABELS[level]} price: {money(levelPriceOf(picked))}
            </p>
          )}
          {picked?.isMatrix && <p className="basis-full text-xs text-gray-500">Applies to all {picked.variantCount} flavors of {picked.name}.</p>}
        </form>
      )}

      {!rows ? (
        <Loader className="h-24" />
      ) : (
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className={th}>Item</th>
              <th className={`${th} text-right`}>{LEVEL_LABELS[level]} price</th>
              <th className={`${th} text-right`}>Their price</th>
              <th className={th}>Set</th>
              {canEdit && <th className={th} />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((x) => {
              const normal = x.levelPrices[level];
              const draft = drafts[x.id];
              const risen = x.price > x.givenPrice && x.costBasis > 0;
              return (
                <tr key={x.id}>
                  <td className={td}>
                    <span className="font-medium text-gray-950">{x.name}</span>
                    {x.isMatrix ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-purple-700">
                        <Grid3x3 size={12} /> all {x.variantCount} flavors
                      </span>
                    ) : (
                      x.barcode && <span className="ml-2 text-[11px] text-gray-400 font-mono">{x.barcode}</span>
                    )}
                  </td>
                  <td className={`${td} text-right`}>{money(normal)}</td>
                  <td className={`${td} text-right`}>
                    {canEdit ? (
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        aria-label={`Price for ${x.name}`}
                        value={draft ?? x.price}
                        onChange={(e) => setDrafts((d) => ({ ...d, [x.id]: e.target.value }))}
                        onBlur={() => saveDraft(x)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
                        className={`${priceInput} text-right`}
                      />
                    ) : (
                      <span className="font-semibold text-gray-950">{money(x.price)}</span>
                    )}
                    {risen && (
                      <p className="text-[11px] text-amber-700" title={`Cost was ${money(x.costBasis)} when this price was given; it is ${money(x.cost)} now`}>
                        Given {money(x.givenPrice)} · cost {money(x.costBasis)} → {money(x.cost)} (+{Math.round((x.cost / x.costBasis - 1) * 1000) / 10}%)
                      </p>
                    )}
                    {x.price < normal && <p className="text-[11px] text-emerald-700">{money(normal - x.price)} below normal</p>}
                  </td>
                  <td className={td}>
                    {formatDate(x.updatedAt)}
                    <p className="text-[11px] text-gray-400">{x.invoiceNumber ? `From ${x.invoiceNumber}` : 'Set here'}</p>
                  </td>
                  {canEdit && (
                    <td className={`${td} text-right`}>
                      <button
                        type="button"
                        onClick={() => setRemoving(x)}
                        aria-label={`Remove price for ${x.name}`}
                        className="text-red-600 cursor-pointer p-1"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="px-3 py-6 text-center text-sm text-gray-500">
                  No custom prices yet. {canEdit ? 'Pick a product or matrix item above to set one.' : ''}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      <ConfirmModal
        isOpen={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        title="Remove customer price"
        message={removing ? `Remove ${customer.name}'s price for ${removing.name}? Their invoices go back to the ${LEVEL_LABELS[level]} price.` : ''}
        confirmLabel="Remove"
      />
    </div>
  );
}
