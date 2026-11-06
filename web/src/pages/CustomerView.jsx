import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'react-toastify';
import { ArrowLeft, CircleCheckBig, CreditCard, Undo2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, formatDate } from '../auth.jsx';
import { Loader, StatusBadge } from '../components/ui.jsx';
import { UpdateBalanceModal } from './Customers.jsx';
import MarkPaidModal from '../components/MarkPaidModal.jsx';

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

// One customer: combined invoice totals, then their unpaid and paid invoices and returns.
export default function CustomerView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const money = useMoney();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('unpaid');
  const [paying, setPaying] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState(null);

  const isAdmin = user?.user_type === 1;

  const load = useCallback(() => {
    api.get(`/customers/${id}/statement`).then((r) => setData(r.data)).catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  const setStatus = async (inv, status) => {
    try {
      await api.patch(`/invoices/${inv.id}/status`, { status });
      toast.success(`Invoice ${inv.invoiceNumber} marked ${status}`);
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  if (error)
    return (
      <div className="p-6 text-center">
        <p className="text-red-600 font-semibold">{error}</p>
        <Link to="/admin/customers" className="text-purple-600 text-sm mt-2 inline-block">← Back to customers</Link>
      </div>
    );
  if (!data) return <Loader className="h-64" />;

  const { customer: c, totals: t } = data;
  const tabs = [
    ['unpaid', `Unpaid Invoices (${data.unpaid.length})`],
    ['paid', `Paid Invoices (${data.paid.length})`],
    ['returns', `Returns (${data.returns.length})`],
    ['payments', `Payment History (${data.payments?.length || 0})`],
  ];
  const invoices = tab === 'paid' ? data.paid : data.unpaid;
  const invLink = (inv) =>
    can('invoices', 'view') ? (
      <Link to={`/admin/invoices/view/${inv.id}`} className="text-purple-600 font-semibold">{inv.invoiceNumber}</Link>
    ) : (
      <span className="font-semibold text-gray-950">{inv.invoiceNumber}</span>
    );

  return (
    <div className="space-y-4 max-w-6xl">
      <button onClick={() => navigate('/admin/customers')} className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md cursor-pointer text-gray-600 hover:bg-gray-100">
        <ArrowLeft size={16} /> Customers
      </button>

      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-950">{c.name}</h1>
          <p className="text-sm text-gray-500">{[c.company, c.email, c.phone].filter(Boolean).join(' · ') || 'No contact details'}</p>
        </div>
        <div className="flex items-center gap-2 self-start">
          <button
            onClick={() => setPaying(true)}
            className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-gray-950 text-white px-3 py-1.5 rounded-md shadow cursor-pointer text-sm font-medium transition-colors"
          >
            <CreditCard size={15} /> Update Balance
          </button>
          {can('invoices', 'create') && (
            <button
              onClick={() => navigate('/admin/invoices/create-invoice')}
              className="border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 px-3 py-1.5 rounded-md shadow-sm cursor-pointer text-sm font-medium transition-colors"
            >
              New Invoice
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Invoices Total" value={money(t.total)} sub={`${t.invoiceCount} invoices`} />
        <Stat label="Paid" value={money(t.paid)} tone="text-emerald-700" sub={`${data.paid.length} invoices`} />
        <Stat label="Unpaid" value={money(t.unpaid)} tone="text-yellow-700" sub={`${data.unpaid.length} invoices`} />
        <Stat
          label="Balance Owed"
          value={money(t.balance)}
          tone={t.balance > 0 ? 'text-red-600' : 'text-gray-950'}
          sub={t.credits > 0 ? `after ${money(t.credits)} return credit` : undefined}
        />
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
                <th className={th}>Payment #</th>
                <th className={th}>Date</th>
                <th className={th}>Method</th>
                <th className={th}>Notes</th>
                <th className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {(data.payments || []).map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className={`${td} font-semibold text-gray-900`}>{p.paymentNumber}</td>
                  <td className={td}>{formatDate(p.paymentDate)}</td>
                  <td className={`${td} capitalize`}>{p.paymentMethod.replace('_', ' ')}</td>
                  <td className={`${td} text-gray-500`}>{p.notes || '-'}</td>
                  <td className={`${td} text-right font-semibold text-emerald-700`}>{money(p.amount)}</td>
                </tr>
              ))}
              {(!data.payments || !data.payments.length) && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">No payment history recorded</td></tr>
              )}
            </tbody>
            {data.payments && data.payments.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={4} className={`${td} font-semibold text-gray-700`}>Total Payments Collected</td>
                  <td className={`${td} text-right font-bold text-emerald-700`}>
                    {money(data.payments.reduce((sum, p) => sum + Number(p.amount), 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        ) : tab !== 'returns' ? (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>Invoice</th>
                <th className={th}>Date</th>
                <th className={th}>Due</th>
                <th className={`${th} text-right`}>Amount</th>
                <th className={th}>Status</th>
                {can('invoices', 'edit') && <th className={th}>Action</th>}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-gray-100">
                  <td className={td}>{invLink(inv)}</td>
                  <td className={td}>{formatDate(inv.invoiceDate)}</td>
                  <td className={td}>{formatDate(inv.dueDate)}</td>
                  <td className={`${td} text-right text-gray-950`}>
                    <div>{money(inv.total)}</div>
                    {inv.paidAmount > 0 && inv.status !== 'paid' && (
                      <div className="text-xs text-emerald-600 font-medium">Paid: {money(inv.paidAmount)}</div>
                    )}
                  </td>
                  <td className={td}><StatusBadge status={inv.status} /></td>
                  {can('invoices', 'edit') && (
                    <td className={td}>
                      {inv.status === 'unpaid' || inv.status === 'partial' ? (
                        <button onClick={() => setPayingInvoice(inv)} className="flex items-center gap-1 text-emerald-700 hover:underline cursor-pointer">
                          <CircleCheckBig size={14} /> Mark Paid
                        </button>
                      ) : (
                        isAdmin && (
                          <button onClick={() => setStatus(inv, 'unpaid')} className="flex items-center gap-1 text-gray-600 hover:underline cursor-pointer">
                            <Undo2 size={14} /> Mark Unpaid (Admin)
                          </button>
                        )
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {!invoices.length && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-sm text-gray-500">No {tab} invoices</td></tr>
              )}
            </tbody>
            {invoices.length > 0 && (
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={3} className={`${td} font-semibold text-gray-700`}>Total {tab}</td>
                  <td className={`${td} text-right font-bold text-gray-950`}>{money(tab === 'paid' ? t.paid : t.unpaid)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className={th}>Return</th>
                <th className={th}>Invoice</th>
                <th className={th}>Date</th>
                <th className={th}>Settled As</th>
                <th className={`${th} text-right`}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.returns.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className={td}>
                    {can('returns', 'view') ? (
                      <Link to={`/admin/returns/view/${r.id}`} className="text-purple-600 font-semibold">{r.returnNumber}</Link>
                    ) : r.returnNumber}
                  </td>
                  <td className={td}>{r.invoiceNumber}</td>
                  <td className={td}>{formatDate(r.createdAt)}</td>
                  <td className={td}>{r.settlement === 'credit' ? 'Credit to account' : 'Refunded'}</td>
                  <td className={`${td} text-right text-gray-950`}>{money(r.total)}</td>
                </tr>
              ))}
              {!data.returns.length && (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-500">No returns</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <UpdateBalanceModal
        isOpen={paying}
        customer={c ? { ...c, totals: t } : null}
        onClose={() => setPaying(false)}
        onDone={load}
      />
      <MarkPaidModal
        isOpen={Boolean(payingInvoice)}
        invoice={payingInvoice}
        onClose={() => setPayingInvoice(null)}
        onDone={load}
      />
    </div>
  );
}
