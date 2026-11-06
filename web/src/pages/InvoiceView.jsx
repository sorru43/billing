import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';
import { ArrowLeft, Download, Mail, Printer, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, formatDate, Logo } from '../auth.jsx';
import { Loader, StatusBadge } from '../components/ui.jsx';
import EmailInvoiceModal from './EmailInvoiceModal.jsx';
import MarkPaidModal from '../components/MarkPaidModal.jsx';

const btn = 'flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md cursor-pointer';
const round2 = (n) => Math.round(n * 100) / 100;

export default function InvoiceView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, company, user } = useAuth();
  const money = useMoney();
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');
  const [emailing, setEmailing] = useState(false);
  const [paying, setPaying] = useState(false);

  const isAdmin = user?.user_type === 1;

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

  const handleDelete = async () => {
    if (!window.confirm(`Delete invoice ${inv.invoiceNumber}? It will be removed from active invoices, but its total sale value will remain permanently recorded and saved in Reports.`)) {
      return;
    }
    try {
      await api.delete(`/invoices/${id}`);
      toast.success(`Invoice ${inv.invoiceNumber} deleted. Sale value preserved in Reports.`);
      navigate('/admin/invoices');
    } catch (e) {
      toast.error(e.message);
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
            inv.status === 'paid' ? (
              isAdmin && (
                <button
                  onClick={() => setStatus('unpaid')}
                  className={`${btn} border border-gray-300 text-gray-700 hover:bg-gray-50`}
                >
                  Mark Unpaid (Admin)
                </button>
              )
            ) : (
              <button
                onClick={() => setPaying(true)}
                className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
              >
                Mark as Paid
              </button>
            )
          )}
          {(isAdmin || can('invoices', 'delete')) && (
            <button
              onClick={handleDelete}
              className={`${btn} bg-red-50 text-red-600 border border-red-200 hover:bg-red-100`}
              title="Delete invoice (Sale value is preserved in reports)"
            >
              <Trash2 size={16} /> Delete
            </button>
          )}
        </div>
      </div>


      <div className="bg-white border border-gray-200 rounded-lg p-6 md:p-8 space-y-6">
        <div className="flex justify-between items-start">
          <Logo kind="invoice" className="w-36" />
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
            {Number(inv.paidAmount) > 0 && (
              <div className="flex justify-between text-sm font-semibold text-emerald-700">
                <span>Amount Paid</span>
                <span>{money(inv.paidAmount)}</span>
              </div>
            )}
            {Number(inv.total) > (Number(inv.paidAmount) || 0) && inv.status !== 'paid' && (
              <div className="flex justify-between text-sm font-bold text-red-600 border-t border-gray-200 pt-1">
                <span>Balance Due</span>
                <span>{money(round2(Number(inv.total) - (Number(inv.paidAmount) || 0)))}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <EmailInvoiceModal invoice={emailing ? inv : null} onClose={() => setEmailing(false)} />
      <MarkPaidModal
        isOpen={paying}
        invoice={inv}
        onClose={() => setPaying(false)}
        onDone={load}
      />
    </div>
  );
}
