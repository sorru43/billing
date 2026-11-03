import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { SquarePen, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney } from '../auth.jsx';
import { Avatar, ConfirmModal, ListToolbar, PageHeader, Pagination, Row, Table, TableState, Toggle } from '../components/ui.jsx';
import { useList } from '../components/useList.js';

export default function Products() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const list = useList('/products', 'products');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const actions = [
    can('products', 'edit') && { label: 'Edit', icon: <SquarePen size={14} />, onClick: (p) => navigate(`/admin/products/edit/${p.id}`) },
    can('products', 'delete') && { label: 'Delete', icon: <Trash2 size={14} />, onClick: setToDelete },
  ].filter(Boolean);
  const headers = ['#', 'Product', 'Category', 'Cost', 'Selling', 'Top Customer', 'Jobber', 'Qty', 'Status'];
  if (actions.length) headers.push('Actions');

  const toggleStatus = async (p, status) => {
    try {
      await api.patch(`/products/${p.id}/status`, { status });
      toast.success('Product status updated successfully');
      list.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/products/${toDelete.id}`);
      toast.success('Product deleted successfully');
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
      <PageHeader title="Products" actionLabel={can('products', 'create') && 'New Product'} onAction={() => navigate('/admin/products/new')} />
      <ListToolbar
        search={list.search}
        onSearch={list.setSearch}
        placeholder="Search by name, barcode, category..."
        limit={list.limit}
        onLimit={list.setLimit}
      />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((p, i) => (
            <Row
              key={p.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={p}
              columns={[
                <Avatar name={p.name} sub={p.barcode} />,
                <p className="capitalize">{p.category?.name || 'N/A'}</p>,
                money(p.cost),
                money(p.selling_price),
                money(p.top_customer_price),
                money(p.jobber_price),
                <span className={p.quantity <= 0 ? 'text-red-600 font-semibold' : p.quantity <= 5 ? 'text-yellow-700 font-semibold' : ''}>{p.quantity}</span>,
                <Toggle name={`status-${p.id}`} checked={p.status} onChange={(v) => toggleStatus(p, v)} disabled={!can('products', 'edit')} />,
              ]}
              actions={actions}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No products found." />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />
      <ConfirmModal
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        message="Are you sure you want to delete this product?"
        isDeleting={deleting}
      />
    </div>
  );
}
