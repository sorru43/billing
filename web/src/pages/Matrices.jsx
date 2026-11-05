import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { SquarePen, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney } from '../auth.jsx';
import { Avatar, ConfirmModal, ListToolbar, PageHeader, Pagination, Row, Table, TableState, Toggle } from '../components/ui.jsx';
import { useList } from '../components/useList.js';

export default function Matrices() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const list = useList('/matrices', 'matrices');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const actions = [
    can('products', 'edit') && { label: 'Edit', icon: <SquarePen size={14} />, onClick: (m) => navigate(`/admin/matrix/edit/${m.id}`) },
    can('products', 'delete') && { label: 'Delete', icon: <Trash2 size={14} />, onClick: setToDelete },
  ].filter(Boolean);
  const headers = ['#', 'Matrix Item', 'Category', 'Attributes', 'Variants', 'Total Qty', 'Selling', 'Status'];
  if (actions.length) headers.push('Actions');

  const toggleStatus = async (m, status) => {
    try {
      await api.patch(`/matrices/${m.id}/status`, { status });
      toast.success('Matrix item status updated');
      list.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/matrices/${toDelete.id}`);
      toast.success('Matrix item deleted');
      setToDelete(null);
      list.reload();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Matrix Items" actionLabel={can('products', 'create') && 'New Matrix Item'} onAction={() => navigate('/admin/matrix/new')} />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search by name, category, attribute..." limit={list.limit} onLimit={list.setLimit} />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((m, i) => (
            <Row
              key={m.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={m}
              columns={[
                <Avatar name={m.name} />,
                <p className="capitalize">{m.category?.name || 'N/A'}</p>,
                <span>
                  {m.attr1_name} ({m.attr1_values.length})
                  {m.attr2_name && ` × ${m.attr2_name} (${m.attr2_values.length})`}
                </span>,
                m.variantCount,
                <span className={m.totalQty <= 0 ? 'text-red-600 font-semibold' : ''}>{m.totalQty}</span>,
                money(m.selling_price),
                <Toggle name={`status-${m.id}`} checked={m.status} onChange={(v) => toggleStatus(m, v)} disabled={!can('products', 'edit')} />,
              ]}
              actions={actions}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No matrix items yet." />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />
      <ConfirmModal
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        message={`Delete "${toDelete?.name}" and all ${toDelete?.variantCount ?? ''} of its variants? Their stock is removed too. Past invoices are not affected.`}
        isDeleting={deleting}
      />
    </div>
  );
}
