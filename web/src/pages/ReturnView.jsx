import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { api } from '../api.js';
import { useMoney, formatDate } from '../auth.jsx';
import { Loader } from '../components/ui.jsx';

const btn = 'flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md cursor-pointer';
const th = 'text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase';
const td = 'px-3 py-2 text-sm text-gray-600';

export default function ReturnView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const money = useMoney();
  const [x, setX] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/returns/${id}`).then((r) => setX(r.data)).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="p-6 text-center text-red-600 font-semibold">{error} · <Link to="/admin/returns" className="text-purple-600">Back</Link></p>;
  if (!x) return <Loader className="h-64" />;
  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex justify-between no-print">
        <button onClick={() => navigate('/admin/returns')} className={`${btn} text-gray-600 hover:bg-gray-100`}><ArrowLeft size={16} /> Returns</button>
        <button onClick={() => window.print()} className={`${btn} bg-gray-200 text-gray-700 hover:bg-gray-300`}><Printer size={16} /> Print</button>
      </div>
      <div className="border border-gray-200 rounded-md bg-white p-4 space-y-4">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-950">{x.returnNumber}</h1>
            <p className="text-sm text-gray-600">{formatDate(x.createdAt)} · Invoice {x.invoiceNumber}</p>
            <p className="text-sm text-gray-600">
              Customer:{' '}
              {x.customerId ? <Link to={`/admin/customers/${x.customerId}`} className="text-purple-600 font-semibold">{x.customerName}</Link> : <b>{x.customerName}</b>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-600">{x.settlement === 'credit' ? 'Credited to account' : 'Refunded'}</p>
            <p className="text-2xl font-bold text-gray-950">{money(x.total)}</p>
          </div>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr><th className={th}>Item</th><th className={th}>Qty</th><th className={th}>Price Paid</th><th className={th}>Back to Stock</th><th className={`${th} text-right`}>Amount</th></tr>
          </thead>
          <tbody>
            {x.items.map((it) => (
              <tr key={it.productId} className="border-t border-gray-100">
                <td className={td}><span className="text-gray-950">{it.name}</span>{it.barcode && <span className="block text-xs">{it.barcode}</span>}</td>
                <td className={td}>{it.quantity}</td>
                <td className={td}>{money(it.price)}</td>
                <td className={td}>{it.restocked ? 'Yes' : 'No'}</td>
                <td className={`${td} text-right text-gray-950`}>{money(it.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {x.reason && <p className="text-sm text-gray-600 whitespace-pre-wrap"><b>Reason:</b> {x.reason}</p>}
      </div>
    </div>
  );
}
