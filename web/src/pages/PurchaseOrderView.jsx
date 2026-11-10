import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';
import { ArrowLeft, Ban, Mail, PackageCheck, Printer, RotateCcw, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, formatDate, Logo } from '../auth.jsx';
import { ConfirmModal, Loader, StatusBadge } from '../components/ui.jsx';
import EmailPoModal from '../components/EmailPoModal.jsx';

const btn = 'flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md cursor-pointer';

// A purchase order laid out like an invoice, priced at cost, printable to send to the vendor.
export default function PurchaseOrderView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const [po, setPo] = useState(null);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [emailing, setEmailing] = useState(false);

  const load = useCallback(() => {
    api.get(`/purchase-orders/${id}`).then((r) => setPo(r.data)).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const setStatus = async (status) => {
    try {
      await api.patch(`/purchase-orders/${id}/status`, { status });
      toast.success(status === 'cancelled' ? 'Purchase order cancelled' : 'Purchase order re-opened');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };
  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/purchase-orders/${id}`);
      toast.success('Purchase order deleted');
      navigate('/admin/purchase-orders');
    } catch (e) {
      toast.error(e.message);
      setDeleting(false);
    }
  };

  if (error)
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 font-semibold">{error}</p>
        <Link to="/admin/purchase-orders" className="text-purple-600 text-sm mt-2 inline-block">← Back to purchase orders</Link>
      </div>
    );
  if (!po) return <Loader className="h-64" />;

  const units = po.items.reduce((a, i) => a + i.quantity, 0);
  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap justify-between gap-2 no-print">
        <button onClick={() => navigate('/admin/purchase-orders')} className={`${btn} text-gray-600 hover:bg-gray-100`}><ArrowLeft size={16} /> Purchase Orders</button>
        <div className="flex flex-wrap gap-2">
          {po.status === 'open' && can('receiving', 'create') && (
            <button onClick={() => navigate(`/admin/receiving/new?po=${po.id}`)} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}>
              <PackageCheck size={16} /> Receive this PO
            </button>
          )}
          {po.status === 'open' && can('receiving', 'edit') && (
            <button onClick={() => setStatus('cancelled')} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}><Ban size={16} /> Cancel PO</button>
          )}
          {po.status === 'cancelled' && can('receiving', 'edit') && (
            <button onClick={() => setStatus('open')} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}><RotateCcw size={16} /> Re-open</button>
          )}
          {po.status !== 'received' && can('receiving', 'delete') && (
            <button onClick={() => setConfirmDelete(true)} className={`${btn} border border-red-200 text-red-600 hover:bg-red-50`}><Trash2 size={16} /> Delete</button>
          )}
          <button onClick={() => setEmailing(true)} className={`${btn} border border-purple-600 text-purple-600 hover:bg-purple-50`}><Mail size={16} /> Email to Vendor</button>
          <button onClick={() => window.print()} className={`${btn} bg-gray-200 text-gray-700 hover:bg-gray-300`}><Printer size={16} /> Print</button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 md:p-8 space-y-6">
        <div className="flex justify-between items-start gap-4">
          <Logo kind="invoice" className="w-36" />
          <div className="text-right">
            <h1 className="text-2xl font-bold text-gray-950">PURCHASE ORDER</h1>
            <p className="text-sm text-gray-600">{po.poNumber}</p>
            <div className="mt-1"><StatusBadge status={po.status} /></div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase text-gray-500">Vendor</p>
            <p className="font-semibold text-gray-950">
              {po.vendorId ? <Link to={`/admin/vendors/${po.vendorId}`} className="hover:underline">{po.vendorName}</Link> : po.vendorName}
            </p>
            {po.vendor.company && <p className="text-gray-600">{po.vendor.company}</p>}
            {po.vendor.address && <p className="text-gray-600 whitespace-pre-line">{po.vendor.address}</p>}
            {[po.vendor.phone, po.vendor.email].filter(Boolean).map((x) => <p key={x} className="text-gray-600">{x}</p>)}
          </div>
          <div className="sm:text-right">
            <p><span className="text-gray-500">Order Date:</span> <b className="text-gray-950">{formatDate(po.orderDate)}</b></p>
            {po.emailedAt && (
              <p className="no-print text-xs text-emerald-700">Emailed to {po.emailedTo} on {formatDate(po.emailedAt)}</p>
            )}
            {po.receivingNumber && (
              <p className="no-print"><span className="text-gray-500">Received as:</span>{' '}
                <Link to={`/admin/receiving/view/${po.receivingId}`} className="text-purple-600 font-semibold">{po.receivingNumber}</Link>
              </p>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr className="text-left text-xs font-semibold text-gray-600 uppercase">
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Barcode</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Cost</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((it, i) => (
                <tr key={it.productId} className="border-t border-gray-100">
                  <td className="px-3 py-2 text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2 text-gray-950">{it.name}</td>
                  <td className="px-3 py-2 text-gray-500">{it.barcode || '-'}</td>
                  <td className="px-3 py-2 text-right">{it.quantity}</td>
                  <td className="px-3 py-2 text-right">{money(it.cost)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300">
                <td colSpan={3} className="px-3 py-3 text-gray-500">{po.items.length} items · {units} units</td>
                <td colSpan={2} className="px-3 py-3 text-right font-semibold text-gray-700">Order Total</td>
                <td className="px-3 py-3 text-right text-lg font-bold text-gray-950">{money(po.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {po.notes && <p className="text-sm text-gray-600 whitespace-pre-line"><b>Notes:</b> {po.notes}</p>}
      </div>

      <EmailPoModal po={emailing ? { ...po, vendorEmail: po.vendor.email } : null} onClose={() => setEmailing(false)} onSent={load} />
      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        message={`Delete purchase order ${po.poNumber}?`}
        isDeleting={deleting}
      />
    </div>
  );
}
