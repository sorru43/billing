import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { CircleCheckBig, Eye, Mail, Undo2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, formatDate } from '../auth.jsx';
import { Avatar, ListToolbar, PageHeader, Pagination, Row, StatusBadge, Table, TableState } from '../components/ui.jsx';
import { useList } from '../components/useList.js';
import EmailInvoiceModal from './EmailInvoiceModal.jsx';

export default function Invoices() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const list = useList('/invoices', 'invoices');
  const [emailing, setEmailing] = useState(null);

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
    ].filter(Boolean);

  const headers = ['#', 'Invoice ID', 'Customer', 'Amount', 'Status', 'Created On', 'Actions'];
  return (
    <div className="space-y-4">
      <PageHeader title="Invoices" actionLabel={can('invoices', 'create') && 'New Invoice'} onAction={() => navigate('/admin/invoices/create-invoice')} />
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
              ]}
              actions={actions(inv)}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No records found" />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />
      <EmailInvoiceModal invoice={emailing} onClose={() => setEmailing(null)} />
    </div>
  );
}
