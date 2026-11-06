import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { toast } from 'react-toastify';
import { CircleCheckBig, Eye, Undo2, X } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney, formatDate } from '../auth.jsx';
import { ListToolbar, PageHeader, Pagination, Row, StatusBadge, Table, TableState } from '../components/ui.jsx';
import { useList } from '../components/useList.js';
import PayVendorModal from '../components/PayVendorModal.jsx';

export default function Receivings() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const [params, setParams] = useSearchParams();
  const vendorId = params.get('vendorId') || '';
  const list = useList('/receivings', 'receivings', ['vendorId']);
  const [vendor, setVendor] = useState(null);
  const [payingReceiving, setPayingReceiving] = useState(null);
  useEffect(() => {
    if (!vendorId) return setVendor(null);
    api.get(`/vendors/${vendorId}`).then((r) => setVendor(r.data)).catch(() => setVendor(null));
  }, [vendorId]);

  const setStatus = async (x, status) => {
    try {
      await api.patch(`/receivings/${x.id}/status`, { status });
      toast.success(`Vendor invoice marked ${status}`);
      list.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const actions = (x) =>
    [
      { label: 'View', icon: <Eye size={14} />, onClick: () => navigate(`/admin/receiving/view/${x.id}`) },
      can('receiving', 'edit') &&
        (x.status === 'paid'
          ? { label: 'Mark Unpaid', icon: <Undo2 size={14} />, onClick: () => setStatus(x, 'unpaid') }
          : { label: 'Pay Portion / Mark Paid', icon: <CircleCheckBig size={14} />, onClick: () => setPayingReceiving(x) }),
    ].filter(Boolean);

  const headers = ['#', 'Receiving ID', 'Vendor', 'Received On', 'Total', 'Paid', 'Owed', 'Status', 'Actions'];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Receiving Inventory"
        actionLabel={can('receiving', 'create') && 'Receive Stock'}
        onAction={() => navigate(`/admin/receiving/new${vendorId ? `?vendorId=${vendorId}` : ''}`)}
      />
      {vendorId && (
        <div className="flex items-center gap-2 text-sm">
          <span className="bg-purple-100 text-purple-600 px-2 py-1 rounded-md">
            Vendor: <b>{vendor?.name || '…'}</b>
            {vendor && <> · owed {money(vendor.totals?.owed || 0)} · paid {money(vendor.totals?.paid || 0)}</>}
          </span>
          <button onClick={() => setParams({})} className="flex items-center gap-1 text-gray-500 hover:text-gray-900 cursor-pointer">
            <X size={14} /> Show all
          </button>
        </div>
      )}
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search by receiving ID, vendor or vendor invoice #..." limit={list.limit} onLimit={list.setLimit} />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((x, i) => (
            <Row
              key={x.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={x}
              columns={[
                <Link to={`/admin/receiving/view/${x.id}`} className="text-purple-600 font-semibold">{x.receivingNumber}</Link>,
                <span>
                  <span className="block text-gray-700">{x.vendorName}</span>
                  {x.vendorInvoiceNo && <span className="block text-xs text-gray-400">Inv # {x.vendorInvoiceNo}</span>}
                </span>,
                formatDate(x.receivedDate),
                <span className="text-gray-950 font-medium">{money(x.total)}</span>,
                <span className="text-emerald-600 font-semibold">{money(x.paidAmount || 0)}</span>,
                <span className={(x.balance ?? (x.total - (x.paidAmount || 0))) > 0 ? 'text-red-600 font-bold' : 'text-gray-500'}>
                  {money(x.balance ?? Math.max(0, x.total - (x.paidAmount || 0)))}
                </span>,
                <StatusBadge status={x.status} />,
              ]}
              actions={actions(x)}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="Nothing received yet" />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />

      <PayVendorModal
        isOpen={Boolean(payingReceiving)}
        receiving={payingReceiving}
        onClose={() => setPayingReceiving(null)}
        onDone={list.reload}
      />
    </div>
  );
}
