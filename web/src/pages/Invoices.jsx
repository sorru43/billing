import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { Archive, CircleCheckBig, Clock, Eye, Mail, Trash2, Undo2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, formatDate } from '../auth.jsx';
import { Avatar, ConfirmModal, ListToolbar, PageHeader, Pagination, Row, StatusBadge, Table, TableState } from '../components/ui.jsx';
import { useList } from '../components/useList.js';
import EmailInvoiceModal from './EmailInvoiceModal.jsx';

export function TimeLeft({ expiresAt, error }) {
  const ms = new Date(expiresAt) - Date.now();
  const h = Math.floor(ms / 36e5);
  const m = Math.max(0, Math.floor((ms % 36e5) / 6e4));
  if (ms <= 0)
    return (
      <span className="text-red-600 text-xs font-semibold" title={error || ''}>
        {error ? 'Archive failed – retrying' : 'Archiving…'}
      </span>
    );
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${h < 6 ? 'text-red-600' : 'text-gray-600'}`}>
      <Clock size={12} /> {h}h {m}m
    </span>
  );
}

export default function Invoices() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const list = useList('/invoices', 'invoices');
  const [confirm, setConfirm] = useState(null); // { inv, mode: 'delete' | 'archive' }
  const [busy, setBusy] = useState(false);
  const [emailing, setEmailing] = useState(null);
  const hours = list.meta.retentionHours || 48;

  const setStatus = async (inv, status) => {
    try {
      await api.patch(`/invoices/${inv.id}/status`, { status });
      toast.success(`Invoice marked ${status}`);
      list.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const actions = (inv) =>
    [
      { label: 'View', icon: <Eye size={14} />, onClick: () => navigate(`/admin/invoices/view/${inv.id}`) },
      { label: 'Email to Customer', icon: <Mail size={14} />, onClick: () => setEmailing(inv) },
      can('invoices', 'edit') &&
        (inv.status === 'paid'
          ? { label: 'Mark Unpaid', icon: <Undo2 size={14} />, onClick: () => setStatus(inv, 'unpaid') }
          : { label: 'Mark Paid', icon: <CircleCheckBig size={14} />, onClick: () => setStatus(inv, 'paid') }),
      can('invoices', 'delete') && { label: 'Email to Archive & Delete', icon: <Archive size={14} />, onClick: () => setConfirm({ inv, mode: 'archive' }) },
      can('invoices', 'delete') && { label: 'Delete Now', icon: <Trash2 size={14} />, onClick: () => setConfirm({ inv, mode: 'delete' }) },
    ].filter(Boolean);

  const run = async () => {
    setBusy(true);
    try {
      const { inv, mode } = confirm;
      const r = mode === 'archive' ? await api.post(`/invoices/${inv.id}/archive`) : await api.del(`/invoices/${inv.id}`);
      toast.success(r.message);
      setConfirm(null);
      list.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const headers = ['#', 'Invoice ID', 'Customer', 'Amount', 'Status', 'Created On', 'Deleted In', 'Actions'];
  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" actionLabel={can('invoices', 'create') && 'New Invoice'} onAction={() => navigate('/admin/invoices/create-invoice')} />
      <div className="p-3 text-sm bg-purple-50 border border-purple-200 rounded-md text-gray-700">
        {list.meta.expiryAction === 'email'
          ? `Invoices are not kept. ${hours} hours after creation each invoice is emailed automatically to your private archive address and then permanently deleted from the app.`
          : `Invoices are not kept. ${hours} hours after creation each invoice is permanently deleted from the app (no copy is saved).`}{' '}
        You can also delete one right away.
        {list.meta.expiryAction === 'email' && list.meta.archiveEmailSet === false && (
          <span className="block mt-1 text-red-700 font-semibold">
            No private archive email is set, so expired invoices cannot be archived yet.{' '}
            {can('settings', 'edit') && (
              <Link to="/admin/settings/email-settings" className="underline">
                Set it in Email Settings
              </Link>
            )}
          </span>
        )}
      </div>
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search by invoice ID or customer..." limit={list.limit} onLimit={list.setLimit} />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((inv, i) => (
            <Row
              key={inv.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={inv}
              columns={[
                <Link to={`/admin/invoices/view/${inv.id}`} className="text-purple-600 font-semibold">
                  {inv.invoiceNumber}
                </Link>,
                <Avatar name={inv.customerName} sub={inv.customerEmail} />,
                <span className="text-gray-950">{money(inv.total)}</span>,
                <StatusBadge status={inv.status} />,
                formatDate(inv.createdAt),
                <TimeLeft expiresAt={inv.expiresAt} error={inv.archiveError} />,
              ]}
              actions={actions(inv)}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No records found" />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />
      <ConfirmModal
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={run}
        isDeleting={busy}
        title={confirm?.mode === 'archive' ? 'Email to Archive & Delete' : 'Delete Invoice Now'}
        confirmLabel={confirm?.mode === 'archive' ? 'Send & Delete' : 'Delete'}
        message={
          confirm?.mode === 'archive'
            ? `${confirm?.inv.invoiceNumber} will be emailed to your private archive address and then permanently deleted from the app.`
            : `${confirm?.inv.invoiceNumber} will be permanently deleted right away. No copy is kept or emailed.`
        }
      />
      <EmailInvoiceModal invoice={emailing} onClose={() => setEmailing(null)} />
    </div>
  );
}
