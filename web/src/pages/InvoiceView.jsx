import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';
import { Archive, ArrowLeft, Download, Mail, Printer, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, formatDate } from '../auth.jsx';
import { ConfirmModal, Loader, StatusBadge } from '../components/ui.jsx';
import EmailInvoiceModal from './EmailInvoiceModal.jsx';
import { TimeLeft } from './Invoices.jsx';

const LEVEL = { selling: 'Selling Price (1)', top_customer: 'Top Customer Price (2)', jobber: 'Jobber Price (3)' };
const btn = 'flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md cursor-pointer';

export default function InvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, company } = useAuth();
  const money = useMoney();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');
  const [emailing, setEmailing] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/invoices/${id}`).then((r) => setInv(r.data)).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const setStatus = async (status) => {
    try {
      await api.patch(`/invoices/${id}/status`, { status });
      toast.success(`Invoice marked ${status}`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const run = async () => {
    setBusy(true);
    try {
      const r = confirm === 'archive' ? await api.post(`/invoices/${id}/archive`) : await api.del(`/invoices/${id}`);
      toast.success(r.message);
      navigate('/admin/invoices');
    } catch (e) {
      toast.error(e.message);
      setBusy(false);
    }
  };

  if (error)
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 font-semibold">{error}</p>
        <Link to="/admin/invoices" className="text-purple-600 text-sm mt-2 inline-block">
          ← Back to invoices
        </Link>
      </div>
    );
  if (!inv) return <Loader className="h-64" />;

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex flex-wrap justify-between items-center gap-2 no-print">
        <button onClick={() => navigate('/admin/invoices')} className={`${btn} text-gray-600 hover:bg-gray-100`}>
          <ArrowLeft size={16} /> Invoices
        </button>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/invoices/${id}/pdf`} target="_blank" rel="noopener" className={`${btn} bg-gray-200 text-gray-700 hover:bg-gray-300`}>
            <Download size={16} /> PDF
          </a>
          <button onClick={() => window.print()} className={`${btn} bg-gray-200 text-gray-700 hover:bg-gray-300`}>
            <Printer size={16} /> Print
          </button>
          <button onClick={() => setEmailing(true)} className={`${btn} bg-purple-600 text-white hover:bg-gray-950`}>
            <Mail size={16} /> Email
          </button>
          {can('invoices', 'edit') && (
            <button
              onClick={() => setStatus(inv.status === 'paid' ? 'unpaid' : 'paid')}
              className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}
            >
              Mark {inv.status === 'paid' ? 'Unpaid' : 'Paid'}
            </button>
          )}
          {can('invoices', 'delete') && (
            <>
              <button onClick={() => setConfirm('archive')} className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}>
                <Archive size={16} /> Archive & Delete
              </button>
              <button onClick={() => setConfirm('delete')} className={`${btn} bg-red-600 text-white hover:bg-red-700`}>
                <Trash2 size={16} /> Delete
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-3 text-sm bg-purple-50 border border-purple-200 rounded-md text-gray-700 no-print flex justify-between">
        <span>
          {inv.expiryAction === 'email'
            ? 'This invoice will be emailed to the private archive address and deleted from the app in:'
            : 'This invoice will be permanently deleted from the app (no copy kept) in:'}
        </span>
        <TimeLeft expiresAt={inv.expiresAt} error={inv.archiveError} />
      </div>
      {inv.archiveError && <div className="p-3 text-sm text-red-700 bg-red-100 border border-red-300 rounded-lg no-print">{inv.archiveError}</div>}

      <div className="bg-white border border-gray-200 rounded-lg p-6 md:p-8 space-y-6">
        <div className="flex justify-between items-start">
          <img src="/static/wise-logo.svg" alt="Logo" className="w-36" />
          <div className="text-right">
            <h1 className="text-2xl font-bold text-gray-950">INVOICE</h1>
            <p className="text-sm text-gray-600">{inv.invoiceNumber}</p>
            <div className="mt-1">
              <StatusBadge status={inv.status} />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <h3 className="font-bold text-purple-600 mb-1">Bill From</h3>
            <p className="font-semibold text-gray-950">{company.companyName}</p>
            <p className="text-gray-600 whitespace-pre-line">{[company.address, company.email, company.phone].filter(Boolean).join('\n')}</p>
          </div>
          <div>
            <h3 className="font-bold text-purple-600 mb-1">Bill To</h3>
            <p className="font-semibold text-gray-950">{inv.customerName}</p>
            <p className="text-gray-600 whitespace-pre-line">{[inv.customerAddress, inv.customerEmail, inv.customerPhone].filter(Boolean).join('\n')}</p>
          </div>
          <div className="md:text-right text-gray-600 space-y-0.5">
            <p>
              <span className="font-semibold text-gray-950">Invoice Date:</span> {formatDate(inv.invoiceDate)}
            </p>
            <p>
              <span className="font-semibold text-gray-950">Due Date:</span> {formatDate(inv.dueDate)}
            </p>
            <p>
              <span className="font-semibold text-gray-950">Price Level:</span> {LEVEL[inv.priceLevel]}
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black text-white text-left">
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Description</th>
                <th className="px-3 py-2 text-right">Quantity</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {inv.items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="px-3 py-2">
                    <p className="text-gray-950 font-medium">{it.name}</p>
                    {it.barcode && <p className="text-xs text-gray-500">{it.barcode}</p>}
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-pre-line">{it.description}</td>
                  <td className="px-3 py-2 text-right">{it.quantity}</td>
                  <td className="px-3 py-2 text-right">{money(it.rate)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-950">{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col md:flex-row justify-between gap-6">
          <div className="text-sm text-gray-600 md:max-w-md">
            {inv.notes && (
              <>
                <h3 className="font-bold text-gray-950 mb-1">Notes</h3>
                <p className="whitespace-pre-line">{inv.notes}</p>
              </>
            )}
          </div>
          <div className="w-full md:w-72 text-sm space-y-2">
            <div className="flex justify-between border-t-2 border-gray-950 pt-2 text-lg font-bold text-gray-950">
              <span>Invoice Total</span>
              <span>{money(inv.total)}</span>
            </div>
          </div>
        </div>
      </div>

      <EmailInvoiceModal invoice={emailing ? inv : null} onClose={() => setEmailing(false)} />
      <ConfirmModal
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={run}
        isDeleting={busy}
        title={confirm === 'archive' ? 'Email to Archive & Delete' : 'Delete Invoice Now'}
        confirmLabel={confirm === 'archive' ? 'Send & Delete' : 'Delete'}
        message={
          confirm === 'archive'
            ? 'The invoice will be emailed to your private archive address and then permanently deleted from the app.'
            : 'The invoice will be permanently deleted right away. No copy is kept or emailed.'
        }
      />
    </div>
  );
}
