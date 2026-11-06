import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, formatDate } from '../auth.jsx';
import { Loader, StatusBadge } from '../components/ui.jsx';
import { PRICE_RULES } from './ReceivingCreate.jsx';

const btn = 'flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md cursor-pointer';
const th = 'text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase';
const td = 'px-3 py-2 text-sm text-gray-600 align-top';

export default function ReceivingView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const [x, setX] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.get(`/receivings/${id}`).then((r) => setX(r.data)).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const setStatus = async (status) => {
    try {
      await api.patch(`/receivings/${id}/status`, { status });
      toast.success(`Vendor invoice marked ${status}`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (error) return <p className="p-6 text-center text-red-600 font-semibold">{error} · <Link to="/admin/receiving" className="text-purple-600">Back</Link></p>;
  if (!x) return <Loader className="h-64" />;
  const price = (before, after) =>
    before !== after ? <><s className="text-gray-400">{money(before)}</s> <b className="text-amber-700">{money(after)}</b></> : money(after);

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="flex flex-wrap justify-between gap-2 no-print">
        <button onClick={() => navigate('/admin/receiving')} className={`${btn} text-gray-600 hover:bg-gray-100`}><ArrowLeft size={16} /> Receiving</button>
        <div className="flex gap-2">
          {can('receiving', 'edit') && (
            <button onClick={() => setStatus(x.status === 'paid' ? 'unpaid' : 'paid')} className={`${btn} bg-purple-600 text-white hover:bg-gray-950`}>
              Mark {x.status === 'paid' ? 'Unpaid' : 'Paid'}
            </button>
          )}
          <button onClick={() => window.print()} className={`${btn} bg-gray-200 text-gray-700 hover:bg-gray-300`}><Printer size={16} /> Print</button>
        </div>
      </div>
      <div className="border border-gray-200 rounded-md bg-white p-4 space-y-4">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-950">{x.receivingNumber}</h1>
            <p className="text-sm text-gray-600">Received {formatDate(x.receivedDate)} from <b>{x.vendorName}</b></p>
            {x.vendorInvoiceNo && <p className="text-sm text-gray-600">Vendor invoice # {x.vendorInvoiceNo}</p>}
            <p className="text-xs text-gray-500 mt-1">Price rule: {PRICE_RULES.find((r) => r.value === x.priceRule)?.label}</p>
          </div>
          <div className="text-right">
            <StatusBadge status={x.status} />
            <p className="text-2xl font-bold text-gray-950 mt-1">{money(x.total)}</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>Item</th><th className={th}>Qty</th><th className={th}>Cost</th>
                <th className={th}>Selling</th><th className={th}>Top Customer</th><th className={th}>Jobber</th>
                <th className={`${th} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {x.items.map((it) => (
                <tr key={it.productId} className="border-t border-gray-100">
                  <td className={td}><span className="text-gray-950">{it.name}</span>{it.barcode && <span className="block text-xs">{it.barcode}</span>}</td>
                  <td className={td}>{it.quantity}</td>
                  <td className={td}>{price(it.oldCost, it.cost)}</td>
                  <td className={td}>{price(it.oldPrices.selling, it.newPrices.selling)}</td>
                  <td className={td}>{price(it.oldPrices.topCustomer, it.newPrices.topCustomer)}</td>
                  <td className={td}>{price(it.oldPrices.jobber, it.newPrices.jobber)}</td>
                  <td className={`${td} text-right text-gray-950`}>{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {x.notes && <p className="text-sm text-gray-600 whitespace-pre-wrap"><b>Notes:</b> {x.notes}</p>}
      </div>
    </div>
  );
}
