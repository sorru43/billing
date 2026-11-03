import { useState } from 'react';
import { toast } from 'react-toastify';
import { SquarePen, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import { useAuth, formatDate } from '../auth.jsx';
import { CancelButton, ConfirmModal, Field, ListToolbar, Modal, PageHeader, Pagination, Row, SubmitButton, Table, TableState, Toggle, inputCls } from '../components/ui.jsx';
import { useList } from '../components/useList.js';

export default function Categories() {
  const { can } = useAuth();
  const list = useList('/categories', 'categories');
  const [editing, setEditing] = useState(null); // {} for new, row for edit
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const actions = [
    can('categories', 'edit') && { label: 'Edit', icon: <SquarePen size={14} />, onClick: (c) => (setErrors({}), setEditing(c)) },
    can('categories', 'delete') && { label: 'Delete', icon: <Trash2 size={14} />, onClick: setToDelete },
  ].filter(Boolean);
  const headers = ['#', 'Category Name', 'Slug', 'Products', 'Created On', 'Status'];
  if (actions.length) headers.push('Actions');

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const body = { name: editing.name || '', status: editing.status ?? true };
      if (editing.id) await api.put(`/categories/${editing.id}`, body);
      else await api.post('/categories', body);
      toast.success(editing.id ? 'Category updated successfully' : 'Category added successfully');
      setEditing(null);
      list.reload();
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (c, status) => {
    try {
      await api.put(`/categories/${c.id}`, { name: c.name, status });
      toast.success('Category status updated successfully');
      list.reload();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await api.del(`/categories/${toDelete.id}`);
      toast.success('Category deleted successfully');
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
      <PageHeader title="Categories" actionLabel={can('categories', 'create') && 'New Category'} onAction={() => (setErrors({}), setEditing({ status: true }))} />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search by category name..." limit={list.limit} onLimit={list.setLimit} />
      <Table headers={headers}>
        {!list.loading &&
          list.rows.map((c, i) => (
            <Row
              key={c.id}
              index={(list.pagination.page - 1) * list.pagination.limit + i + 1}
              row={c}
              columns={[
                <span className="text-gray-950 capitalize">{c.name}</span>,
                c.slug,
                c.productCount,
                formatDate(c.createdAt),
                <Toggle name={`cat-${c.id}`} checked={c.status} onChange={(v) => toggle(c, v)} disabled={!can('categories', 'edit')} />,
              ]}
              actions={actions}
            />
          ))}
        <TableState loading={list.loading} empty={!list.rows.length} colSpan={headers.length} emptyText="No categories found." />
      </Table>
      <Pagination pagination={list.pagination} onPage={list.setPage} />

      <Modal isOpen={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.id ? 'Edit Category' : 'Add Category'} size="md">
        <form onSubmit={save} className="space-y-4">
          <Field label="Category Name" required htmlFor="cat-name" error={errors.name}>
            <input
              id="cat-name"
              autoFocus
              required
              maxLength={100}
              value={editing?.name || ''}
              onChange={(e) => setEditing((c) => ({ ...c, name: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-gray-600">Status</span>
            <Toggle name="cat-status" checked={editing?.status ?? true} onChange={(v) => setEditing((c) => ({ ...c, status: v }))} />
          </div>
          <div className="flex justify-end gap-2">
            <CancelButton onClick={() => setEditing(null)} />
            <SubmitButton isLoading={saving} mode={editing?.id ? 'edit' : 'create'} />
          </div>
        </form>
      </Modal>
      <ConfirmModal
        isOpen={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        message={
          toDelete?.productCount
            ? `This category has ${toDelete.productCount} product(s). They will be kept but left without a category.`
            : 'Are you sure you want to delete this category?'
        }
        isDeleting={deleting}
      />
    </div>
  );
}
