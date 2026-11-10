import { Link, useNavigate } from 'react-router';
import { Eye } from 'lucide-react';
import { useAuth, useMoney, formatDate } from '../auth.jsx';
import { ListToolbar, PageHeader, Pagination, Row, StatusBadge, Table, TableState } from '../components/ui.jsx';
import { useList } from '../components/useList.js';

export default function PurchaseOrders() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const list = useList('/purchase-orders', 'purchaseOrders');
  const headers = ['#', 'PO #', 'Vendor', 'Order Date', 'Items', 'Total (cost)', 'Status', 'Actions'];
  const actions = [{ label: 'View', icon: <Eye size={14} />, onClick: (x) => navigate(`/admin/purchase-orders/view/${x.id}`) }];
  return (
    <div className="space-y-4">
      <PageHeader
        title="Purchase Orders"
        actionLabel={can('receiving', 'create') && 'New Purchase Order'}
        onAction={() => navigate('/admin/purchase-orders/new')}
      />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search by PO # or vendor..." limit={list.limit} onLimit={list.setLimit} />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((x, i) => (
            <Row
              key={x.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={x}
              columns={[
                <Link to={`/admin/purchase-orders/view/${x.id}`} className="text-purple-600 font-semibold">{x.poNumber}</Link>,
                x.vendorId ? <Link to={`/admin/vendors/${x.vendorId}`} className="text-gray-700 hover:underline">{x.vendorName}</Link> : x.vendorName,
                formatDate(x.orderDate),
                x.itemCount,
                <span className="text-gray-950 font-semibold">{money(x.total)}</span>,
                <StatusBadge status={x.status} />,
              ]}
              actions={actions}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No purchase orders yet" />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />
    </div>
  );
}
