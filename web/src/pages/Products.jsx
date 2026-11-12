import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'react-toastify';
import { Barcode, Bell, FileSpreadsheet, SquarePen, Trash2, Upload } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, useMoney } from '../auth.jsx';
import { Avatar, ConfirmModal, ListToolbar, PageHeader, Pagination, Row, Table, TableState, Toggle } from '../components/ui.jsx';
import { useList } from '../components/useList.js';
import ProductImportModal from '../components/ProductImportModal.jsx';
import BarcodeLookupModal from '../components/BarcodeLookupModal.jsx';

// Low stock alert level, editable in place (also works for matrix variants such as one flavor).
function AlertCell({ product, canEdit, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const custom = product.low_stock_alert != null;
  const save = async () => {
    setEditing(false);
    const v = value.trim();
    if (v === (custom ? String(product.low_stock_alert) : '')) return;
    try {
      const { data } = await api.patch(`/products/${product.id}/alert`, { lowStockAlert: v === '' ? null : Number(v) });
      toast.success(`${product.name}: alert at ${data.alertLevel}${v === '' ? ' (default)' : ''}`, { autoClose: 1500 });
      onSaved();
    } catch (e) {
      toast.error(e.message);
    }
  };
  if (editing)
    return (
      <input
        autoFocus
        type="number"
        min="0"
        step="1"
        placeholder="5"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="w-16 px-1.5 py-1 border border-purple-400 rounded text-sm focus:outline-none focus:ring-1 focus:ring-purple-600"
        aria-label={`Low stock alert for ${product.name}`}
      />
    );
  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={() => (setValue(custom ? String(product.low_stock_alert) : ''), setEditing(true))}
      title={canEdit ? 'Click to set this product\'s alert level (blank = default 5)' : undefined}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs ${
        custom ? 'bg-purple-50 text-purple-700 font-semibold' : 'text-gray-400'
      } ${canEdit ? 'cursor-pointer hover:ring-1 hover:ring-purple-300' : ''}`}
    >
      <Bell size={11} /> {product.alertLevel}
    </button>
  );
}

const btnCls =
  'border border-gray-300 bg-white hover:bg-gray-100 text-gray-700 px-2 py-1 rounded-md shadow-sm cursor-pointer flex items-center gap-2 text-sm';

export default function Products() {
  const navigate = useNavigate();
  const { can } = useAuth();
  const money = useMoney();
  const list = useList('/products', 'products');
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);

  const actions = [
    can('products', 'edit') && { label: 'Edit', icon: <SquarePen size={14} />, onClick: (p) => navigate(p.matrix ? `/admin/matrix/edit/${p.matrix.id}` : `/admin/products/edit/${p.id}`) },
    can('products', 'delete') && { label: 'Delete', icon: <Trash2 size={14} />, onClick: setToDelete },
  ].filter(Boolean);
  const headers = ['#', 'Product', 'Category', 'Brand', 'Cost', 'Selling', 'Top Customer', 'Jobber', 'Qty', 'Alert at', 'Status'];
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
      <PageHeader
        title="Products"
        actionLabel={can('products', 'create') && 'New Product'}
        onAction={() => navigate('/admin/products/new')}
      >
        {can('products', 'create') && (
          <button type="button" onClick={() => setLookupOpen(true)} className={btnCls} title="Scan or lookup barcode with BarcodeLookup API">
            <Barcode size={14} className="text-purple-600" /> Scan Barcode
          </button>
        )}
        {can('import_export') && (
          <a href="/api/products/export" download className={btnCls}>
          <FileSpreadsheet size={14} /> Export
        </a>
        )}
        {can('products', 'create') && can('import_export', 'create') && (
          <button type="button" onClick={() => setImporting(true)} className={btnCls}>
            <Upload size={14} /> Import
          </button>
        )}
      </PageHeader>
      <ListToolbar
        search={list.search}
        onSearch={list.setSearch}
        placeholder="Search by name, barcode, category, brand..."
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
                <div>
                  <Avatar name={p.name} sub={p.barcode} />
                  {p.matrix && <span className="ml-11 text-[11px] font-semibold text-purple-600">Matrix variant</span>}
                </div>,
                <p className="capitalize">{p.category?.name || 'N/A'}</p>,
                <p>{p.brand?.name || '-'}</p>,
                money(p.cost),
                money(p.selling_price),
                money(p.top_customer_price),
                money(p.jobber_price),
                <span className={p.quantity <= 0 ? 'text-red-600 font-semibold' : p.quantity <= p.alertLevel ? 'text-yellow-700 font-semibold' : ''}>{p.quantity}</span>,
                <AlertCell product={p} canEdit={can('products', 'edit')} onSaved={list.reload} />,
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
      <ProductImportModal isOpen={importing} onClose={() => setImporting(false)} onDone={list.reload} />
      <BarcodeLookupModal isOpen={lookupOpen} onClose={() => setLookupOpen(false)} />
    </div>
  );
}
