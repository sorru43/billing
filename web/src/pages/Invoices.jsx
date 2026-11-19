import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { Check, CircleCheckBig, Eye, KeyRound, Lock, Mail, Trash2, Undo2, X } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, formatDate } from '../auth.jsx';
import { Avatar, ListToolbar, PageHeader, Pagination, Row, StatusBadge, Table, TableState } from '../components/ui.jsx';
import { useList } from '../components/useList.js';
import EmailInvoiceModal from './EmailInvoiceModal.jsx';
import MarkPaidModal from '../components/MarkPaidModal.jsx';

const ACCESS_NOTE = { requested: 'Access requested', declined: 'Request declined' };

// Admin only: cashiers asking to open a locked invoice again.
function AccessRequests({ onChange }) {
  const money = useMoney();
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => {
    api.get('/invoices/access-requests').then((r) => setRequests(r.data)).catch(() => setRequests([]));
  }, []);
  useEffect(load, [load]);

  const decide = async (req, approve) => {
    setBusy(`${req.invoiceId}:${req.userId}`);
    try {
      const r = await api.post(`/invoices/${req.invoiceId}/access/${req.userId}`, { approve });
      toast.success(`${r.message}: ${req.invoiceNumber} for ${req.userName}`);
      load();
      onChange();
    } catch (e) {
      toast.error(e.message);
      load();
    } finally {
      setBusy('');
    }
  };

  if (!requests.length) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
      <h2 className="text-sm font-bold text-amber-900 flex items-center gap-1.5 mb-2">
        <KeyRound size={15} /> Invoice access requests ({requests.length})
      </h2>
      <p className="text-xs text-amber-800 mb-2">
        Approving lets that cashier open the invoice again until they print it, or for 30 minutes.
      </p>
      <div className="divide-y divide-amber-200">
        {requests.map((r) => {
          const key = `${r.invoiceId}:${r.userId}`;
          return (
            <div key={key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div>
                <span className="font-semibold text-gray-950">{r.userName}</span>
                <span className="text-gray-600"> wants to open </span>
                <Link to={`/admin/invoices/view/${r.invoiceId}`} className="text-purple-600 font-semibold">{r.invoiceNumber}</Link>
                <span className="text-gray-600"> · {r.customerName} · {money(r.total)} · </span>
                <span className="text-gray-500 text-xs">{new Date(r.requestedAt).toLocaleString()}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy === key}
                  onClick={() => decide(r, true)}
                  className="flex items-center gap-1 px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Check size={14} /> Approve
                </button>
                <button
                  type="button"
                  disabled={busy === key}
                  onClick={() => decide(r, false)}
                  className="flex items-center gap-1 px-3 py-1 rounded-md border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <X size={14} /> Decline
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Invoices() {
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const money = useMoney();
  const list = useList('/invoices', 'invoices');
  const [emailing, setEmailing] = useState(null);
  const [payingInvoice, setPayingInvoice] = useState(null);

  const isAdmin = user?.user_type === 1;

  const setStatus = async (inv, status) => {
    try {
      await api.patch(`/invoices/${inv.id}/status`, { status });
      toast.success(`Invoice marked ${status}`);
      list.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const deleteInvoice = async (inv) => {
    if (!window.confirm(`Delete invoice ${inv.invoiceNumber}? The invoice will be removed from active invoices, but its sale value will remain permanently recorded and saved in Reports.`)) {
      return;
    }
    try {
      await api.del(`/invoices/${inv.id}`);
      toast.success(`Invoice ${inv.invoiceNumber} deleted. Sale value preserved in Reports.`);
      list.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const requestAccess = async (inv) => {
    try {
      const r = await api.post(`/invoices/${inv.id}/access-request`);
      toast.success(r.message);
      list.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const actions = (inv) =>
    inv.locked
      ? [{ label: inv.accessRequest === 'requested' ? 'Ask again' : 'Request access', icon: <KeyRound size={14} />, onClick: () => requestAccess(inv) }]
      : [
          { label: 'View', icon: <Eye size={14} />, onClick: () => navigate(`/admin/invoices/view/${inv.id}`) },
          { label: 'Email to Customer', icon: <Mail size={14} />, onClick: () => setEmailing(inv) },
          can('invoices', 'edit') &&
            (inv.status === 'paid'
              ? (isAdmin && { label: 'Mark Unpaid (Admin)', icon: <Undo2 size={14} />, onClick: () => setStatus(inv, 'unpaid') })
              : { label: 'Mark Paid', icon: <CircleCheckBig size={14} />, onClick: () => setPayingInvoice(inv) }),
          (isAdmin || can('invoices', 'delete')) && {
            label: 'Delete Invoice',
            icon: <Trash2 size={14} className="text-red-500" />,
            onClick: () => deleteInvoice(inv),
          },
        ].filter(Boolean);

  const headers = ['#', 'Invoice ID', 'Customer', 'Amount', 'Status', 'Created On', 'Actions'];
  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" actionLabel={can('invoices', 'create') && 'New Invoice'} onAction={() => navigate('/admin/invoices/create-invoice')} />
      {isAdmin && <AccessRequests onChange={list.reload} />}
      {!can('invoice_history') && (
        <p className="text-xs text-gray-500 flex items-center gap-1">
          <Lock size={12} /> Invoices lock after you print, download or email them (or 30 minutes after saving). Use Request access to open one again.
        </p>
      )}
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search by invoice ID or customer..." limit={list.limit} onLimit={list.setLimit} />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((inv, i) => (
            <Row
              key={inv.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={inv}
              columns={
                inv.locked
                  ? [
                      <span className="font-semibold text-gray-700 flex items-center gap-1">
                        <Lock size={12} className="text-gray-400" /> {inv.invoiceNumber}
                      </span>,
                      <Avatar name={inv.customerName} />,
                      <span className="text-gray-400">—</span>,
                      <span>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-sm text-xs font-medium bg-gray-100 text-gray-600">
                          <Lock size={11} /> Locked
                        </span>
                        {ACCESS_NOTE[inv.accessRequest] && (
                          <span className={`block text-[11px] mt-0.5 ${inv.accessRequest === 'declined' ? 'text-red-600' : 'text-amber-700'}`}>
                            {ACCESS_NOTE[inv.accessRequest]}
                          </span>
                        )}
                      </span>,
                      formatDate(inv.createdAt),
                    ]
                  : [
                      <Link to={`/admin/invoices/view/${inv.id}`} className="text-purple-600 font-semibold">
                        {inv.invoiceNumber}
                      </Link>,
                      <Avatar name={inv.customerName} sub={inv.customerEmail} />,
                      <span className="text-gray-950">{money(inv.total)}</span>,
                      <StatusBadge status={inv.status} />,
                      formatDate(inv.createdAt),
                    ]
              }
              actions={actions(inv)}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No records found" />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />
      <EmailInvoiceModal invoice={emailing} onClose={() => setEmailing(null)} />
      <MarkPaidModal
        isOpen={Boolean(payingInvoice)}
        invoice={payingInvoice}
        onClose={() => setPayingInvoice(null)}
        onDone={list.reload}
      />
    </div>
  );
}
