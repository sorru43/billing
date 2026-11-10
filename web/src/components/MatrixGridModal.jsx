import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { api } from '../api.js';
import { useMoney } from '../auth.jsx';
import { Loader, Modal } from './ui.jsx';

const keyOf = (o1, o2) => `${o1.toLowerCase()}\u0000${(o2 || '').toLowerCase()}`;

// Grid of a matrix item's variants (rows = attribute 1, columns = attribute 2):
// type a quantity in each cell, then every non-zero cell becomes an invoice line.
export default function MatrixGridModal({ matrixId, priceField, onClose, onAdd, allowOversell = false }) {
  const money = useMoney();
  const [matrix, setMatrix] = useState(null);
  const [qty, setQty] = useState({});

  useEffect(() => {
    if (!matrixId) return;
    setMatrix(null);
    setQty({});
    api
      .get(`/matrices/${matrixId}/grid`)
      .then((r) => setMatrix(r.data))
      .catch((e) => {
        toast.error(e.message);
        onClose();
      });
  }, [matrixId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!matrixId) return null;

  const byKey = new Map((matrix?.variants || []).filter((v) => v.status).map((v) => [keyOf(v.option1, v.option2), v]));
  const cols = matrix?.attr2_name ? matrix.attr2_values : [''];
  const picked = [...byKey.values()].filter((v) => Number(qty[v.id]) > 0);
  const units = picked.reduce((a, v) => a + Number(qty[v.id]), 0);
  const amount = picked.reduce((a, v) => a + Number(qty[v.id]) * Number(v[priceField]), 0);
  const over = !allowOversell && picked.some((v) => Number(qty[v.id]) > v.quantity);

  const add = () => {
    onAdd(picked.map((v) => ({ product: { ...v, matrix: { id: matrix.id, name: matrix.name } }, quantity: Number(qty[v.id]) })));
    onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title={matrix ? matrix.name : 'Loading...'} size="3xl">
      {!matrix ? (
        <Loader className="h-40" />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Type a quantity in each cell you want. Grey cells are not carried.</p>
          <div className="overflow-auto max-h-[60vh]">
            <table className="text-sm border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-10 bg-black text-white px-3 py-2 text-left">
                    {matrix.attr1_name}
                    {matrix.attr2_name && ` \\ ${matrix.attr2_name}`}
                  </th>
                  {cols.map((c) => (
                    <th key={c || 'qty'} className="sticky top-0 bg-black text-white px-3 py-2 text-center min-w-28">
                      {c || 'Quantity'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matrix.attr1_values.map((r) => (
                  <tr key={r} className="border-b border-gray-100">
                    <th className="sticky left-0 bg-white px-3 py-2 text-left text-gray-950 font-medium whitespace-nowrap">{r}</th>
                    {cols.map((c) => {
                      const v = byKey.get(keyOf(r, c));
                      if (!v) return <td key={c} className="bg-gray-100 text-center text-gray-400 px-3 py-2">—</td>;
                      const q = qty[v.id] ?? '';
                      const bad = Number(q) > v.quantity;
                      return (
                        <td key={c} className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            min="0"
                            max={allowOversell ? undefined : v.quantity}
                            step="1"
                            value={q}
                            disabled={!allowOversell && v.quantity <= 0}
                            placeholder="0"
                            aria-label={`${r} ${c} quantity`}
                            onChange={(e) => setQty((s) => ({ ...s, [v.id]: e.target.value }))}
                            className={`w-20 h-9 p-1.5 text-center border rounded focus:outline-none focus:ring-1 focus:ring-purple-600 ${bad ? (allowOversell ? 'border-amber-500 text-amber-700' : 'border-red-500 text-red-600') : 'border-gray-200 text-gray-700'} disabled:bg-gray-50`}
                          />
                          <p className={`text-[11px] mt-0.5 ${v.quantity <= 0 ? 'text-red-600' : 'text-gray-500'}`}>
                            {v.quantity} in stock · {money(v[priceField])}
                          </p>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {over && <p className="text-xs text-red-600">Some quantities are more than what is in stock.</p>}
          {allowOversell && picked.some((v) => Number(qty[v.id]) > v.quantity) && (
            <p className="text-xs text-amber-700">Some quantities are more than what is in stock — allowed (out-of-stock selling is on); stock will go below zero.</p>
          )}
          <div className="flex flex-wrap justify-between items-center gap-3 border-t border-gray-200 pt-3">
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-gray-950">{picked.length}</span> variants · <span className="font-semibold text-gray-950">{units}</span> units ·{' '}
              <span className="font-semibold text-gray-950">{money(amount)}</span>
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                Cancel
              </button>
              <button
                type="button"
                disabled={!picked.length || over}
                onClick={add}
                className="px-4 py-2 bg-purple-600 hover:bg-gray-950 text-white rounded-md text-sm cursor-pointer disabled:opacity-50 disabled:cursor-default"
              >
                Add to Invoice
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
