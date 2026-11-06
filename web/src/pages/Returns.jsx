import { Link, useNavigate } from 'react-router';
import { Eye } from 'lucide-react';
import { useAuth, useMoney, formatDate } from '../auth.jsx';
import { Avatar, ListToolbar, PageHeader, Pagination, Row, Table, TableState } from '../components/ui.jsx';
import { useList } from '../components/useList.js';

export default function Returns() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const list = useList('/returns', 'returns');
  const headers = ['#', 'Return ID', 'Invoice', 'Customer', 'Amount', 'Settled As', 'Date', 'Actions'];
  return (
    <div className="space-y-4">
      <PageHeader title="Returns" actionLabel={can('returns', 'create') && 'New Return'} onAction={() => navigate('/admin/returns/new')} />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search by return ID, invoice ID or customer..." limit={list.limit} onLimit={list.setLimit} />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((x, i) => (
            <Row
              key={x.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={x}
              columns={[
                <Link to={`/admin/returns/view/${x.id}`} className="text-purple-600 font-semibold">{x.returnNumber}</Link>,
                x.invoiceNumber,
                <Avatar name={x.customerName} />,
                <span className="text-gray-950">{money(x.total)}</span>,
                x.settlement === 'credit' ? 'Credit to account' : 'Refunded',
                formatDate(x.createdAt),
              ]}
              actions={[{ label: 'View', icon: <Eye size={14} />, onClick: () => navigate(`/admin/returns/view/${x.id}`) }]}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No returns yet" />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />
    </div>
  );
}
