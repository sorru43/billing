import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, ClipboardList, DollarSign, PackagePlus } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, formatDate } from '../auth.jsx';
import { Loader, StatusBadge } from '../components/ui.jsx';
import PayVendorModal from '../components/PayVendorModal.jsx';

const th = 'text-left px-3 py-2 text-xs font-semibold text-gray-600 uppercase';
const td = 'px-3 py-2 text-sm text-gray-600';
const round2 = (n) => Math.round(n * 100) / 100;

function Stat({ label, value, tone = 'text-gray-950', sub }) {
  return (
    <div className="border border-gray-200 rounded-md p-3 bg-white">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500">{sub}</p>}
    </div>
  );
}

// One vendor: totals and the Pay button on top, then open / paid receivings, payments and purchase orders.
export default function VendorView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const [data, setData] = useState(null);
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('open');
  const [payVendor, setPayVendor] = useState(false);
  const [payReceiving, setPayReceiving] = useState(null);

  const load = useCallback(() => {
    api.get(`/vendors/${id}/statement`).then((r) => setData(r.data)).catch((e) => setError(e.message));
    api.get('/purchase-orders', { vendorId: id, limit: 100 }).then((r) => setOrders(r.data.purchaseOrders)).catch(() => setOrders([]));
  }, [id]);
  useEffect(load, [load]);

  if (error)
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 font-semibold">{error}</p>
        <Link to="/admin/vendors" className="text-purple-600 text-sm mt-2 inline-block">← Back to vendors</Link>
      </div>
    );
  if (!data) return <Loader className="h-64" />;

  const { vendor: v } = data;
  const t = v.totals || {};
  const rcv = data.receivings.map((x) => ({
    id: x.id, receivingNumber: x.receiving_number, vendorInvoiceNo: x.vendor_invoice_no, receivedDate: x.received_date,
    total: Number(x.total), paidAmount: Number(x.paid_amount || 0), status: x.status, vendorId: v.id, vendorName: v.name,
    balance: Math.max(0, round2(Number(x.total) - Number(x.paid_amount || 0))),
  }));
  const open = rcv.filter((x) => x.status !== 'paid');
  const paid = rcv.filter((x) => x.status === 'paid');
  const canPay = can('receiving', 'edit');
  const tabs = [
    ['open', `Open Receivings (${open.length})`],
    ['paid', `Paid Receivings (${paid.length})`],
    ['payments', `Payments (${data.payments.length})`],
    ['orders', `Purchase Orders (${orders.length})`],
  ];
  const rows = tab === 'paid' ? paid : open;

  return (
    <div className="space-y-4 max-w-6xl">
      <button onClick={() => navigate('/admin/vendors')} className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md cursor-pointer text-gray-600 hover:bg-gray-100">
        <ArrowLeft size={16} /> Vendors
      </button>

      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">{v.name}</h1>
          <p className="text-sm text-gray-500">{[v.company, v.email, v.phone].filter(Boolean).join(' · ') || 'No contact details'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          {canPay && (
            <button
              onClick={() => setPayVendor(true)}
              className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-gray-950 text-white px-4 py-2 rounded-md shadow cursor-pointer text-sm font-semibold transition-colors"
            >
              <DollarSign size={16} /> Pay Vendor{t.owed > 0 ? ` (${money(t.owed)} owed)` : ''}
            </button>
          )}
          {can('receiving', 'create') && (
            <>
              <button
                onClick={() => navigate(`/admin/purchase-orders/new?vendorId=${v.id}`)}
                className="inline-flex items-center gap-1.5 border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 px-3 py-2 rounded-md shadow-sm cursor-pointer text-sm font-medium"
              >
                <ClipboardList size={15} /> New Purchase Order
              </button>
              <button
                onClick={() => navigate(`/admin/receiving/new?vendorId=${v.id}`)}
                className="inline-flex items-center gap-1.5 border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 px-3 py-2 rounded-md shadow-sm cursor-pointer text-sm font-medium"
              >
                <PackagePlus size={15} /> Receive Stock
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total Received" value={money(t.bought || 0)} sub={`${rcv.length} receivings`} />
        <Stat label="Paid" value={money(t.paid || 0)} tone="text-emerald-700" />
        <Stat label="Owed to Vendor" value={money(t.owed || 0)} tone={t.owed > 0 ? 'text-red-600' : 'text-gray-950'} sub={`${open.length} open`} />
        <Stat label="Credit with Vendor" value={money(t.creditBalance || 0)} tone="text-purple-700" sub="paid in advance" />
      </div>

      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm font-medium whitespace-nowrap cursor-pointer border-b-2 -mb-px ${
              tab === k ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-md bg-white">
        {tab === 'payments' ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>Payment #</th><th className={th}>Date</th><th className={th}>Method</th><th className={th}>Reference</th>
                <th className={th}>Notes</th><th className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.payments.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className={`${td} font-semibold text-gray-950`}>{p.payment_number}</td>
                  <td className={td}>{formatDate(p.payment_date)}</td>
                  <td className={`${td} capitalize`}>{String(p.payment_method || '').replace('_', ' ')}</td>
                  <td className={td}>{p.reference || '-'}</td>
                  <td className={td}>{p.notes || '-'}</td>
                  <td className={`${td} text-right font-semibold text-emerald-700`}>{money(p.amount)}</td>
                </tr>
              ))}
              {!data.payments.length && <tr><td colSpan={6} className="text-center text-sm text-gray-500 py-6">No payments yet.</td></tr>}
            </tbody>
          </table>
        ) : tab === 'orders' ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>PO #</th><th className={th}>Date</th><th className={th}>Items</th><th className={th}>Status</th>
                <th className={`${th} text-right`}>Total (cost)</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-gray-100">
                  <td className={td}><Link to={`/admin/purchase-orders/view/${o.id}`} className="text-purple-600 font-semibold">{o.poNumber}</Link></td>
                  <td className={td}>{formatDate(o.orderDate)}</td>
                  <td className={td}>{o.itemCount}</td>
                  <td className={td}><StatusBadge status={o.status} /></td>
                  <td className={`${td} text-right font-semibold text-gray-950`}>{money(o.total)}</td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan={5} className="text-center text-sm text-gray-500 py-6">No purchase orders yet.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>Receiving</th><th className={th}>Vendor Inv #</th><th className={th}>Received</th>
                <th className={`${th} text-right`}>Total</th><th className={`${th} text-right`}>Paid</th><th className={`${th} text-right`}>Owed</th>
                <th className={th}>Status</th>{tab === 'open' && canPay && <th className={th}>Pay</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.id} className="border-t border-gray-100">
                  <td className={td}><Link to={`/admin/receiving/view/${x.id}`} className="text-purple-600 font-semibold">{x.receivingNumber}</Link></td>
                  <td className={td}>{x.vendorInvoiceNo || '-'}</td>
                  <td className={td}>{formatDate(x.receivedDate)}</td>
                  <td className={`${td} text-right`}>{money(x.total)}</td>
                  <td className={`${td} text-right text-emerald-700`}>{money(x.paidAmount)}</td>
                  <td className={`${td} text-right font-semibold ${x.balance > 0 ? 'text-red-600' : ''}`}>{money(x.balance)}</td>
                  <td className={td}><StatusBadge status={x.status} /></td>
                  {tab === 'open' && canPay && (
                    <td className={td}>
                      <button
                        onClick={() => setPayReceiving(x)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                      >
                        <DollarSign size={13} /> Pay
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={8} className="text-center text-sm text-gray-500 py-6">{tab === 'open' ? 'Nothing owed to this vendor.' : 'No paid receivings yet.'}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <PayVendorModal isOpen={payVendor} vendor={v} onClose={() => setPayVendor(false)} onDone={load} />
      <PayVendorModal isOpen={Boolean(payReceiving)} receiving={payReceiving} vendor={v} onClose={() => setPayReceiving(null)} onDone={load} />
    </div>
  );
}
